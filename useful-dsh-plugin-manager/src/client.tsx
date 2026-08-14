// useful-dsh-plugin-manager — browser half.
//
// A "管理" tab in Web Settings → Plugins. It lists every Loader entry via the
// official `remote.pluginInventory.list()` face and offers, per row:
//   - enable/disable for out-of-tree plugins (writes marked entries into the
//     active profile's cordis.patch.yml through the host half; changes take
//     effect on the next dsh web restart);
//   - version check and one-click update (npm registry) for packages that are
//     actually installed in the profile's node_modules.
// Harness-provided rows (`@deepseek-ai/*`) are shown read-only — this plugin
// deliberately avoids touching the official installation.
import { useEffect, useState } from 'react'
import { IconCheckOutline16, IconCloseOutline16, IconRefreshOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

/** Browser cordis services this client plugin needs. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

const NS = 'settings.pluginManager'
const STYLE_TAG = 'useful-dsh-plugin-manager/style.css'

const zh = {
  tab: '管理',
  loading: '读取插件…',
  loadFailed: '读取失败，请重试。',
  retry: '重试',
  restartBanner: '改动会在重启 dsh web 后生效。',
  restarting: '更新成功，请重启 dsh web 生效。',
  disable: '停用',
  enable: '启用',
  check: '检测更新',
  checkAll: '全部检测',
  updating: '更新',
  repair: '修复',
  repaired: '已恢复原版文件，重启 dsh web 生效。',
  repairFailed: '修复失败：',
  restore: '恢复全部',
  official: 'Harness 自带',
  uptodate: '已是最新',
  outdated: '可更新',
  unreachable: '无法连接 registry',
  unknown: '未知',
  yes: '是',
  no: '否'
}

const en = {
  tab: 'Manage',
  loading: 'Reading plugins…',
  loadFailed: 'Failed to load. Retry?',
  retry: 'Retry',
  restartBanner: 'Changes take effect after restarting dsh web.',
  restarting: 'Updated — restart dsh web to apply.',
  disable: 'Disable',
  enable: 'Enable',
  check: 'Check',
  checkAll: 'Check all',
  updating: 'Update',
  repair: 'Repair',
  repaired: 'Pristine files restored — restart dsh web to apply.',
  repairFailed: 'Repair failed: ',
  restore: 'Restore all',
  official: 'Provided by Harness',
  uptodate: 'Up to date',
  outdated: 'Update available',
  unreachable: 'registry unreachable',
  unknown: 'unknown',
  yes: 'yes',
  no: 'no'
}

interface InventoryEntry {
  id?: string
  module?: string
  enabled?: boolean
  phase?: string | null
}

interface TabProps {
  list?: () => Promise<InventoryEntry[]>
  t?: (key: string) => string
}

interface CheckRow {
  name: string
  installed: string
  latest: string | null
  upToDate: boolean | null
}

function injectCss() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'useful-dsh-plugin-manager'
  tag.dataset.pluginCss = STYLE_TAG
  tag.textContent = `
.dsh-pm-root{display:flex;flex-direction:column;gap:10px}
.dsh-pm-banner{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));border-radius:10px;padding:8px 12px;font-size:12.5px;color:var(--dsw-alias-label-secondary,inherit)}
.dsh-pm-row{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-specific-input-major,transparent);border-radius:10px;padding:8px 12px}
.dsh-pm-id{font-family:var(--ds-font-family-code,monospace);font-size:12.5px;color:var(--dsw-alias-label-primary,inherit);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-pm-module{font-size:11.5px;color:var(--dsw-alias-label-tertiary,inherit);flex:2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-pm-tag{font-size:11px;color:var(--dsw-alias-label-tertiary,inherit);flex:none}
.dsh-pm-btn{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.25));background:transparent;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;border-radius:6px;padding:3px 10px;font-size:12px;flex:none}
.dsh-pm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-pm-btn:disabled{opacity:.45;cursor:default}
.dsh-pm-status{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;flex:none}
.dsh-pm-ok{color:var(--dsw-alias-state-success-primary,#3fa66a)}
.dsh-pm-warn{color:var(--dsw-alias-state-warning-primary,#c98a2d)}
.dsh-pm-bad{color:var(--dsw-alias-state-error-primary,#d86161)}
`
  document.head.appendChild(tag)
}

function ManageTab({ list, t }: TabProps) {
  const [entries, setEntries] = useState<InventoryEntry[] | null>(null)
  const [managed, setManaged] = useState<string[]>([])
  const [checks, setChecks] = useState<CheckRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [banner, setBanner] = useState('')
  const [failed, setFailed] = useState(false)

  const tt = (key: string) => (t !== undefined ? t(key) : key)

  const call = async (path: string, body?: object) => {
    const res = await fetch(`/api/plugin-manager${path}`, {
      method: body !== undefined ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
    return data
  }

  const load = async () => {
    setFailed(false)
    try {
      const [inv, st] = await Promise.all([
        list?.() ?? Promise.resolve([]),
        call('/state')
      ])
      setEntries(inv)
      setManaged(st.managed ?? [])
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setEnable = async (id: string, enabled: boolean) => {
    setBusy(id)
    try {
      await call(enabled ? '/enable' : '/disable', { id })
      setManaged(prev => enabled ? prev.filter(x => x !== id) : [...prev, id])
      setBanner(tt('restartBanner'))
    } catch (err) {
      setBanner(`${enabled ? 'enable' : 'disable'} failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const checkAll = async () => {
    setBusy('__check__')
    try {
      // POST: the host registers /check-all and /restore as write routes.
      const data = await call('/check-all', {})
      setChecks(data.packages ?? [])
    } catch (err) {
      setBanner(`${tt('check')} failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const updateOne = async (name: string) => {
    setBusy(name)
    try {
      await call('/update', { name })
      setBanner(tt('restarting'))
      setChecks(prev => prev?.filter(x => x.name !== name) ?? null)
    } catch (err) {
      setBanner(`update failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const restoreAll = async () => {
    setBusy('__restore__')
    try {
      await call('/restore', {})
      setManaged([])
      setBanner(tt('restartBanner'))
    } catch (err) {
      setBanner(`restore failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const repairOne = async (name: string) => {
    setBusy(`__repair__${name}`)
    try {
      const data = await call('/repair', { name })
      setBanner(data?.ok ? tt('repaired') : `${tt('repairFailed')}${data?.note ?? 'unknown'}`)
    } catch (err) {
      setBanner(`${tt('repairFailed')}${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  if (failed) {
    return (
      <div className="dsh-pm-root">
        <div className="dsh-pm-banner">{tt('loadFailed')}</div>
        <button type="button" className="dsh-pm-btn" onClick={() => void load()}>{tt('retry')}</button>
      </div>
    )
  }

  if (entries === null) return <div className="dsh-pm-root"><div className="dsh-pm-banner">{tt('loading')}</div></div>

  const checkByName = (module: string | undefined) => checks?.find(c => c.name === module)
  const isOfficial = (module: string | undefined) => module !== undefined && module.startsWith('@deepseek-ai/')
  const isDisabled = (entry: InventoryEntry) => {
    const id = entry.id ?? ''
    return managed.includes(id) || entry.enabled === false
  }

  return (
    <div className="dsh-pm-root">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {banner !== '' && <div className="dsh-pm-banner" style={{ flex: 1 }}>{banner}</div>}
        <button type="button" className="dsh-pm-btn" disabled={busy === '__check__'} onClick={() => void checkAll()}>
          {tt('checkAll')}
        </button>
        <button type="button" className="dsh-pm-btn" disabled={busy === '__restore__'} onClick={() => void restoreAll()}>
          {tt('restore')}
        </button>
      </div>
      {entries.map(entry => {
        const id = entry.id ?? entry.module ?? '?'
        const moduleName = typeof entry.module === 'string' ? entry.module : undefined
        const check = checkByName(moduleName)
        const official = isOfficial(moduleName)
        const disabled = isDisabled(entry)
        return (
          <div key={id} className="dsh-pm-row">
            <span className="dsh-pm-id" title={id}>{id}</span>
            <span className="dsh-pm-module" title={entry.module}>{entry.module}</span>
            {official
              ? <>
                <span className="dsh-pm-tag">{tt('official')}</span>
                {moduleName !== undefined && (
                  <button
                    type="button"
                    className="dsh-pm-btn"
                    disabled={busy === `__repair__${moduleName}`}
                    onClick={() => void repairOne(moduleName)}
                  >
                    {busy === `__repair__${moduleName}` ? '…' : tt('repair')}
                  </button>
                )}
              </>
              : <>
                {moduleName !== undefined && (
                  <button
                    type="button"
                    className="dsh-pm-btn"
                    disabled={busy === `__repair__${moduleName}`}
                    onClick={() => void repairOne(moduleName)}
                  >
                    {busy === `__repair__${moduleName}` ? '…' : tt('repair')}
                  </button>
                )}
                {check !== undefined && (
                  <span className={`dsh-pm-status ${check.upToDate === true ? 'dsh-pm-ok' : check.latest === null ? 'dsh-pm-warn' : 'dsh-pm-warn'}`}>
                    {check.upToDate === true
                      ? <IconCheckOutline16 size={12} />
                      : check.latest === null
                        ? tt('unreachable')
                        : `${tt('outdated')}: ${check.latest}`}
                  </span>
                )}
                {check !== undefined && check.upToDate === false && moduleName !== undefined && (
                  <button type="button" className="dsh-pm-btn" disabled={busy === moduleName} onClick={() => void updateOne(moduleName)}>
                    {busy === moduleName ? '…' : tt('updating')}
                  </button>
                )}
                {entry.id !== undefined && (
                  <button
                    type="button"
                    className="dsh-pm-btn"
                    disabled={busy === id}
                    onClick={() => void setEnable(id, disabled)}
                  >
                    {busy === id ? '…' : disabled ? tt('enable') : tt('disable')}
                  </button>
                )}
              </>}
          </div>
        )
      })}
    </div>
  )
}

/** Normalize the Host inventory face to the manager's row shape. The current
 *  pluginInventory.list() returns `{ entries: [{ entryId, moduleName, enabled,
 *  fiberPhase }] }`; older harness generations returned a bare array of
 *  `{ id, module, … }` — accept both so one bundle serves every deployment. */
function normalizeInventory(value: unknown): InventoryEntry[] {
  const raw = Array.isArray(value) ? value : Array.isArray((value as { entries?: unknown[] })?.entries) ? (value as { entries: unknown[] }).entries : []
  return raw.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>
    return {
      id: typeof e.entryId === 'string' ? e.entryId : typeof e.id === 'string' ? e.id : undefined,
      module: typeof e.moduleName === 'string' ? e.moduleName : typeof e.module === 'string' ? e.module : undefined,
      enabled: typeof e.enabled === 'boolean' ? e.enabled : undefined,
      phase: typeof e.fiberPhase === 'string' ? e.fiberPhase : typeof e.phase === 'string' ? e.phase : null
    }
  })
}

export function apply(ctx: any) {
  injectCss()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'useful-dsh-plugin-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  const list = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    return normalizeInventory(result.value)
  }
  try {
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'manage',
      order: 20,
      label: () => t('tab'),
      locale: NS,
      inject: () => ({ list })
    }, ManageTab))
  } catch (err) {
    console.warn('[useful-dsh-plugin-manager] settings tab registration failed; the manager tab stays absent:', err)
  }
}
