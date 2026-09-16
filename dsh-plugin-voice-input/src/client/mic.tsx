// dsh-plugin-voice-input — browser-half composer mic button.
//
// Push-to-talk in the composer tool row:
// - Mouse / touch: hold the button to record, release to transcribe.
//   Pointer capture keeps the gesture alive even when the cursor leaves the
//   button mid-hold.
// - Hold-to-talk hotkey (default `` ` ``, configurable): hold the key
//   anywhere in the app to record, release to transcribe — the mouse stays
//   free to scroll context or click around while talking. The hotkey is
//   intercepted in the capture phase so it never types into the composer.
// - Button keyboard activation (Enter / Space on the focused button):
//   toggles record.
// - A clip is transcribed by the host's LOCAL engine through /api/asr
//   (sherpa-onnx + SenseVoice, offline, on this machine); the recognized text
//   is appended to the draft via the session's input actions, so the user
//   reviews it before sending — the draft is never sent automatically.
//
// Status surfaces inline next to the button: listening seconds, a
// processing state, and friendly errors (mic permission, silence, short
// utterance, bridge offline, upstream rejection).
import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createRecorder, type RecorderHandle } from './recorder'
import { fetchStatus, requestTranscription, waitUntilReady } from './bridge'
import type { NS } from './locales'

/**
 * Default safety-net cap per utterance in seconds. The local engine has no
 * duration limit; this only prevents a forgotten hold from recording forever.
 * 0 disables the cap entirely. Configurable via the profile patch
 * (`voice-input` → `maxSeconds`).
 */
const DEFAULT_MAX_SECONDS = 600

/**
 * Default hold-to-talk hotkey, configurable via the profile patch. Formats:
 * - `Modifier+Key` / `Modifier+Key1+Key2` — an OS modifier (Alt/Ctrl/Shift/
 *   Win) arms the gesture; the chord keys only become "non-typing" and start
 *   recording while the modifier is held, so plain keys stay fully usable
 *   (e.g. `` ` `` and `1` type normally until Alt is down).
 * - `Key` / `Key1+Key2` — a plain key or chord without an OS modifier; the
 *   first key then acts as a modifier that never types.
 * Default: `AltLeft+Backquote+Digit1` (hold Alt, then `` ` `` and `1`).
 */
export const DEFAULT_HOTKEY = 'AltLeft+Backquote+Digit1'

/** OS modifier code → the KeyboardEvent boolean it sets. */
const OS_MODIFIER_PROP: Record<string, 'altKey' | 'ctrlKey' | 'shiftKey' | 'metaKey'> = {
  AltLeft: 'altKey',
  AltRight: 'altKey',
  ControlLeft: 'ctrlKey',
  ControlRight: 'ctrlKey',
  ShiftLeft: 'shiftKey',
  ShiftRight: 'shiftKey',
  MetaLeft: 'metaKey',
  MetaRight: 'metaKey'
}

/** Friendly spellings for common modifier keys. */
const MODIFIER_ALIASES: Record<string, string> = {
  Alt: 'AltLeft',
  Ctrl: 'ControlLeft',
  Control: 'ControlLeft',
  Shift: 'ShiftLeft',
  Win: 'MetaLeft',
  Meta: 'MetaLeft'
}

/**
 * Normalize a configured hotkey into a canonical spec (`A`, `A+B`,
 * `Mod+A+B`), or `null` to disable. `''` / `'none'` / `'off'` / `'false'`
 * disable the hotkey; `` '`' ``/`'~'` map to `Backquote`; `Alt`/`Ctrl`/
 * `Shift`/`Win` map to their left-hand codes; anything else is taken as a
 * `KeyboardEvent.code` verbatim (e.g. `F8`, `Digit1`).
 */
export function normalizeHotkey(raw: string | undefined): string | null {
  if (raw === undefined) return DEFAULT_HOTKEY
  const trimmed = raw.trim()
  const lowered = trimmed.toLowerCase()
  if (trimmed === '' || lowered === 'none' || lowered === 'off' || lowered === 'false' || lowered === 'disable' || lowered === 'disabled') {
    return null
  }
  const parts = trimmed.split('+').map((part) => part.trim()).filter((part) => part !== '')
  if (parts.length === 0) return null
  const mapped = parts.map((part) => {
    if (part === '`' || part === '~') return 'Backquote'
    return MODIFIER_ALIASES[part] ?? part
  })
  return mapped.join('+')
}

/** Short display labels for one hotkey code (used in the tooltip). */
const CODE_LABELS: Record<string, string> = {
  Backquote: '`',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  MetaLeft: 'Win',
  MetaRight: 'Win'
}

/** Human-readable label for one hotkey spec (used in the tooltip). */
export function hotkeyLabel(spec: string): string {
  return spec.split('+').map((code) => CODE_LABELS[code] ?? code).join(' + ')
}

/** Characters a hotkey code can produce — used to suppress IME text input.
 * 微软拼音等输入法在 TSF 底层直接提交字符（如按 `` ` `` 直接上屏 "·"），
 * keydown 的 preventDefault 拦不住它；beforeinput 是字符进入输入框前的
 * 最后一关（输入法提交也走这里），按字符拦截才能真正堵住漏字。 */
const CHARS_BY_CODE: Record<string, readonly string[]> = {
  Backquote: ['`', '~', '·'],
  Digit1: ['1', '!'],
  Digit2: ['2', '@'],
  Digit3: ['3', '#'],
  Digit4: ['4', '$'],
  Digit5: ['5', '%'],
  Digit6: ['6', '^'],
  Digit7: ['7', '&'],
  Digit8: ['8', '*'],
  Digit9: ['9', '('],
  Digit0: ['0', ')'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  Space: [' ']
}

/** Below this duration an utterance is treated as an accidental tap. */
const MIN_SECONDS = 0.4

/**
 * How long a first-run preparation may take before the clip is dropped: the
 * host downloads ~19 MB of engine and ~228 MB of model, which is minutes on a
 * slow link, so the wait is generous and the progress is always visible.
 */
const PREPARE_TIMEOUT_MS = 30 * 60 * 1000

type Phase = 'idle' | 'recording' | 'processing'

/** Framework props: standard session kit (inputActions/useInput/sessionId) + locale seat. */
export type MicButtonProps = PropsRuntime<'conversation.input.left'> & PropsLocale<typeof NS> & {
  /** Recording safety-net duration in seconds (0 = unlimited). */
  maxSeconds?: number
  /** Hold-to-talk `KeyboardEvent.code`; `null` disables the hotkey. */
  hotkey?: string | null
}

/** Append a transcript to the draft, inserting a single space between blocks. */
function mergeDraft(current: string, text: string): string {
  if (current === '') return text
  return current + (current.endsWith(' ') ? '' : ' ') + text
}

/** Borderless 16 px mic glyph; the recording state is conveyed by color + pulse. */
function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}

export function MicButton({ inputActions, useInput, t, maxSeconds, hotkey }: MicButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // First-run progress (the host is fetching the local runtime) and whether
  // that runtime is ready at all — both drive the tooltip and status line.
  const [status, setStatus] = useState<{ percent: number; label: string } | null>(null)
  const [ready, setReady] = useState(true)
  const draft = useInput((s) => s.draft)

  useEffect(() => {
    let live = true
    void fetchStatus().then((state) => {
      if (live && state !== null) setReady(state.ready)
    })
    return () => {
      live = false
    }
  }, [])

  // Safety-net cap: explicit config wins; 0 means unlimited.
  const capSeconds = typeof maxSeconds === 'number' && Number.isFinite(maxSeconds)
    ? Math.max(0, Math.floor(maxSeconds))
    : DEFAULT_MAX_SECONDS

  // Hold-to-talk spec: explicit config wins; `null` disables the hotkey.
  // Parts: [modifier?] + trigger key(s). An OS-modifier first part (Alt/Ctrl/
  // Shift/Win) arms the gesture without disabling the trigger keys; a plain
  // first part acts as a "never types" modifier instead.
  const hotkeySpec = hotkey !== undefined ? hotkey : DEFAULT_HOTKEY
  const specParts = hotkeySpec === null
    ? []
    : hotkeySpec.split('+').map((code) => code.trim()).filter((code) => code !== '')
  const osModifierProp = specParts.length > 1 ? OS_MODIFIER_PROP[specParts[0] ?? ''] : undefined
  // Trigger keys that carry the recording gesture (single-key spec = the key).
  const triggerCodes = specParts.length === 1 || osModifierProp === undefined
    ? specParts
    : specParts.slice(1)
  const isOsChord = osModifierProp !== undefined && specParts.length > 1
  const hotkeyCodes = specParts

  // Latest draft for async code (re-renders refresh this every time).
  const draftRef = useRef(draft)
  draftRef.current = draft
  const recorderRef = useRef<RecorderHandle | null>(null)
  const pressIdRef = useRef(0)
  const releasedRef = useRef(false)
  const pointerHandledRef = useRef(false)
  // Latest phase + press actions, so document-level listeners never go stale.
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase
  const hotkeyHeldRef = useRef(false)
  const mountedRef = useRef(true)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      ++pressIdRef.current
      releasedRef.current = true
      requestRef.current?.abort()
      void recorderRef.current?.stop()
      recorderRef.current = null
    }
  }, [])

  const fail = (message: string) => {
    if (!mountedRef.current) return
    phaseRef.current = 'idle'
    setPhase('idle')
    setSeconds(0)
    setError(message)
  }

  // Function declarations (hoisted) so the hotkey effect below can bind the
  // latest press actions through a ref, regardless of render order.
  function beginPress() {
    if (phaseRef.current !== 'idle') return
    phaseRef.current = 'recording'
    setError(null)
    const pressId = ++pressIdRef.current
    releasedRef.current = false
    setPhase('recording')
    setSeconds(0)
    void createRecorder({ maxSeconds: capSeconds, onDuration: setSeconds })
      .then((recorder) => {
        if (pressIdRef.current !== pressId || releasedRef.current) {
          // The gesture ended before the mic stream came up: discard silently.
          void recorder.stop().then(() => {})
          if (pressIdRef.current === pressId) setPhase('idle')
          return
        }
        recorderRef.current = recorder
        void recorder.done.then((result) => {
          if (!mountedRef.current || pressIdRef.current !== pressId) return
          recorderRef.current = null
          settle(result.blob, result.seconds)
        })
      })
      .catch(() => {
        if (pressIdRef.current === pressId) fail(t('voice.error.mic'))
      })
  }

  function endPress() {
    const recorder = recorderRef.current
    releasedRef.current = true
    if (recorder === null) return // still acquiring the mic; beginPress discards it
    recorderRef.current = null
    void recorder.stop()
  }

  const settle = (blob: Blob, resultSeconds: number) => {
    if (!mountedRef.current) return
    if (resultSeconds < MIN_SECONDS) {
      fail(t('voice.error.short'))
      return
    }
    setPhase('processing')
    phaseRef.current = 'processing'
    const controller = new AbortController()
    requestRef.current = controller
    setStatus(null)
    void (async () => {
      try {
        let result = await requestTranscription(blob, controller.signal)
        if (!result.ok && result.provisioning) {
          // First use: the host is fetching the local engine and model and
          // answers "not ready" instead of holding the request. Show the
          // download, wait for it, then continue by itself — the first press
          // is enough, and no clip is lost.
          setStatus({ percent: 0, label: '' })
          const becameReady = await waitUntilReady(
            (percent, label) => setStatus({ percent, label }),
            PREPARE_TIMEOUT_MS,
            controller.signal
          )
          setStatus(null)
          if (!becameReady) {
            fail(t('voice.error.bridge'))
            return
          }
          setReady(true)
          result = await requestTranscription(blob, controller.signal)
        }
        if (!result.ok) {
          fail(result.message !== '' ? t('voice.error.engine', { message: result.message }) : t('voice.error.bridge'))
          return
        }
        const text = result.text.trim()
        if (text === '') {
          fail(t('voice.silent'))
          return
        }
        if (!mountedRef.current || controller.signal.aborted) return
        inputActions.setDraft(mergeDraft(draftRef.current, text))
        phaseRef.current = 'idle'
        setPhase('idle')
        setSeconds(0)
      } catch {
        fail(t('voice.error.bridge'))
      }
    })()
  }

  const pressActionsRef = useRef({ begin: beginPress, end: endPress })
  pressActionsRef.current = { begin: beginPress, end: endPress }

  // Hold-to-talk hotkey: press anywhere in the app to record, release to
  // transcribe. Supported forms:
  // - `Modifier+Trigger…` (e.g. `AltLeft+Backquote+Digit1`, the default):
  //   the OS modifier arms the gesture; trigger keys type normally whenever
  //   the modifier is NOT held, so no key is ever "disabled".
  // - `Trigger` / `Trigger1+Trigger2` without an OS modifier: the first key
  //   acts as a never-typing modifier (backwards compatible).
  // Leak defenses (微软拼音 submits `` ` `` as "·" via TSF, bypassing keydown
  // and even beforeinput):
  // - keydown (capture) prevents the plain path;
  // - beforeinput (capture) drops IME/TSF commits while armed;
  // - hard lock: while armed, the focused editable is temporarily readOnly —
  //   read-only fields refuse IME input at the browser level.
  useEffect(() => {
    if (hotkeyCodes.length === 0 || triggerCodes.length === 0) return
    const modifierProp = osModifierProp
    const usable = (event: KeyboardEvent) => {
      if (event.isComposing) return false
      if (modifierProp !== undefined) {
        // Only the declared modifier may be down.
        if (modifierProp !== 'altKey' && event.altKey) return false
        if (modifierProp !== 'ctrlKey' && event.ctrlKey) return false
        if (modifierProp !== 'shiftKey' && event.shiftKey) return false
        if (modifierProp !== 'metaKey' && event.metaKey) return false
      } else if (event.altKey || event.ctrlKey || event.metaKey) {
        return false
      }
      return true
    }
    const held = new Set<string>()
    let active = false
    let osModDown = false

    /** The arming modifier is currently down. */
    const modDown = () => (modifierProp !== undefined ? osModDown : held.has(hotkeyCodes[0] ?? ''))
    /** Every trigger key of the gesture is down (and the modifier is down). */
    const gestureComplete = () => triggerCodes.every((code) => held.has(code)) && modDown()

    // ── Input hard-lock ────────────────────────────────────────────────────
    // 微软拼音等 IME 在 TSF 底层直接向输入框提交字符，keydown/beforeinput
    // 都拦不住；手势进行中（modifier 按下或录音中）把当前可编辑元素临时设
    // 为 readOnly —— 只读输入框连输入法都无法写入，这是浏览器底层行为。
    let lockedElement: HTMLElement | null = null
    let lockedPrevious: boolean | string | null = null // readOnly or contentEditable

    const isEditable = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === 'TEXTAREA' || tag === 'INPUT' || el.isContentEditable
    }
    const applyLock = () => {
      const el = document.activeElement
      if (lockedElement === el) return
      releaseLock()
      if (!isEditable(el)) return
      lockedElement = el
      const tag = el.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        const field = el as HTMLTextAreaElement | HTMLInputElement
        lockedPrevious = field.readOnly
        field.readOnly = true
      } else {
        lockedPrevious = el.contentEditable
        el.contentEditable = 'false'
      }
    }
    const releaseLock = () => {
      const el = lockedElement
      lockedElement = null
      if (el === null) return
      try {
        const tag = el.tagName
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          (el as HTMLTextAreaElement | HTMLInputElement).readOnly = lockedPrevious === true
        } else {
          el.contentEditable = typeof lockedPrevious === 'string' ? lockedPrevious : 'true'
        }
      } catch {
        // element detached while locked — nothing to restore
      }
      lockedPrevious = null
    }
    /** Gesture armed: the gesture owns the keyboard (typing must be blocked). */
    const armed = () => active || modDown()

    const activate = () => {
      if (active || phaseRef.current !== 'idle') return
      active = true
      hotkeyHeldRef.current = true
      applyLock()
      pressActionsRef.current.begin()
    }
    const deactivate = (event?: KeyboardEvent) => {
      if (!active) return
      active = false
      hotkeyHeldRef.current = false
      event?.preventDefault()
      pressActionsRef.current.end()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!hotkeyCodes.includes(event.code) || !usable(event)) return
      if (phaseRef.current === 'processing') return
      if (modifierProp !== undefined && event[modifierProp]) osModDown = true
      const isOsModifierKey = modifierProp !== undefined && event.code === hotkeyCodes[0]
      if (isOsModifierKey) {
        // The OS modifier key itself (e.g. Alt): arms the gesture and types
        // nothing anyway; repeats and re-presses while recording are no-ops.
        return
      }
      if (event.repeat) {
        // Repeats are part of a gesture only while armed; a lone held trigger
        // key (typing "1111…" without the modifier) must keep working.
        if (armed()) event.preventDefault()
        return
      }
      if (hotkeyCodes.length > 1 && !modifierProp && event.code === hotkeyCodes[0]) {
        // Plain-key modifier form (`Backquote+Digit1`): first key never types.
        held.add(event.code)
        event.preventDefault()
        applyLock()
        if (gestureComplete()) activate()
        return
      }
      if (armed()) {
        // Trigger key down while armed: swallow it; start when all triggers
        // are down.
        held.add(event.code)
        event.preventDefault()
        applyLock()
        if (gestureComplete()) activate()
        return
      }
      // Not armed: a plain keypress.
      if (hotkeyCodes.length === 1) {
        // Single-key spec: the key itself IS the hotkey — never types.
        held.add(event.code)
        event.preventDefault()
        applyLock()
        if (!event.repeat) activate()
      }
      // Multi-key chord without the modifier: types normally.
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (!hotkeyCodes.includes(event.code)) return
      if (modifierProp !== undefined && !event[modifierProp]) osModDown = false
      held.delete(event.code)
      if (event.code === hotkeyCodes[0] && hotkeyCodes.length > 1) {
        // The modifier (or plain-key modifier) was released.
        if (active) deactivate(event)
      } else if (active) {
        // A trigger key was released: the chord is broken.
        deactivate(event)
      }
      if (held.size === 0 && !osModDown) releaseLock()
    }
    const onBlur = () => {
      deactivate()
      releaseLock()
      osModDown = false
      held.clear()
    }
    // Focus changes mid-gesture: lock the newly focused editable too.
    const onFocusIn = () => {
      if (armed()) applyLock()
    }

    // IME gate (defense in depth — see the hard lock above): while armed,
    // drop any text the hotkey keys would produce, whatever path it takes.
    const onBeforeInput = (event: InputEvent) => {
      if (!armed()) return
      const inputType = event.inputType ?? ''
      const isComposition =
        inputType.startsWith('insertComposition') || inputType === 'insertFromComposition'
      const data = event.data
      if (typeof data !== 'string' || data === '') return
      const blocked = new Set<string>()
      for (const code of triggerCodes) {
        for (const char of CHARS_BY_CODE[code] ?? []) blocked.add(char)
      }
      const match = isComposition
        ? ['·', '`', '~'].some((char) => data.includes(char))
        : data.split('').some((char) => blocked.has(char))
      if (match) event.preventDefault()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('beforeinput', onBeforeInput, true)
    document.addEventListener('focusin', onFocusIn, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
      document.removeEventListener('beforeinput', onBeforeInput, true)
      document.removeEventListener('focusin', onFocusIn, true)
      window.removeEventListener('blur', onBlur)
      releaseLock()
    }
  }, [hotkeyCodes.join('+'), triggerCodes.join('+'), osModifierProp])

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phase !== 'idle') return
    pointerHandledRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    beginPress()
  }

  const onPointerUp = () => {
    pointerHandledRef.current = true
    endPress()
  }

  // Keyboard activation (Enter / Space): toggle record. A click that follows
  // a real pointer gesture is swallowed — the pointer path already handled it.
  const onClick = () => {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false
      return
    }
    if (phase === 'recording') endPress()
    else if (phase === 'idle') beginPress()
  }

  const recording = phase === 'recording'
  const idleLabel = ready
    ? hotkeyCodes.length > 0
      ? `${t('voice.button')}${t('voice.hotkey', { key: hotkeyLabel(hotkeyCodes.join('+')) })}`
      : t('voice.button')
    : t('voice.notReady')

  return (
    <>
      <Tooltip label={recording ? t('voice.recording') : phase === 'processing' ? t('voice.processing') : idleLabel} side="top">
        <button
          type="button"
          className="dsh-vi-button"
          data-recording={recording || undefined}
          aria-label={recording ? t('voice.recording') : t('voice.button')}
          aria-pressed={recording}
          disabled={phase === 'processing'}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onClick}
        >
          <MicIcon />
        </button>
      </Tooltip>
      {recording && (
        <span className="dsh-vi-status" data-tone="recording" aria-live="polite">
          {t('voice.listening', { seconds: Math.round(seconds) })}
        </span>
      )}
      {phase === 'processing' && (
        <span
          className="dsh-vi-status"
          data-tone="processing"
          aria-live="polite"
          title={status !== null && status.label !== '' ? status.label : undefined}
        >
          {status === null ? t('voice.processing') : t('voice.preparing', { percent: status.percent })}
        </span>
      )}
      {phase === 'idle' && error !== null && (
        <span className="dsh-vi-status" data-tone="error" title={error} role="alert">
          {error}
        </span>
      )}
    </>
  )
}
