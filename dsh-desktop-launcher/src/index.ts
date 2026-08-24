// dsh-desktop-launcher — node half (host side).
//
// Owns the desktop app's configuration as a settings namespace
// (`desktop-launcher`), so the Electron shell and the web UI share one
// source of truth in `$DSH_HOME/settings.yaml`. The host registers the
// namespace with live applies: edits from the web settings page take effect
// without a restart, and the Electron launcher reads the same document at
// startup (it does not depend on this plugin being mounted — it parses the
// YAML section directly, so the desktop shell works even before first boot).
//
// The plugin itself adds no server behavior: the namespace is the contract.
// Keeping it this small is deliberate — the launcher is a configuration
// owner, not a runtime service.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only load activating the `ctx.settings` declaration merge.
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-settings'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'desktop-launcher'

/** Services required by the node half (settings is optional-lazy). */
export const inject: string[] = []

/** The settings namespace id the desktop shell reads at launch. */
export const NAMESPACE = 'desktop-launcher' as SettingsNamespace

/** Default bind host the desktop shell serves on. */
export const DEFAULT_HOST = '127.0.0.1'
/** Default port the desktop shell serves on. */
export const DEFAULT_PORT = 3080

/** Validated configuration shape (schema output contract). */
export interface DesktopLauncherConfig {
  /** Bind host for the desktop-served web UI (loopback only). */
  host: string
  /** Listen port for the desktop-served web UI. */
  port: number
  /** Open the web UI in the default browser when started from the shell. */
  autoOpen: boolean
}

export const Config = z.object({
  host: z.string().default(DEFAULT_HOST),
  port: z.natural().min(1).max(65535).default(DEFAULT_PORT),
  autoOpen: z.boolean().default(false)
})

/** Normalize and validate raw plugin configuration (exported for tests). */
export function normalizeConfig(raw: unknown): DesktopLauncherConfig {
  const config = (raw ?? {}) as Partial<DesktopLauncherConfig>
  return {
    host: typeof config.host === 'string' && config.host.trim() ? config.host.trim() : DEFAULT_HOST,
    port: typeof config.port === 'number' && Number.isInteger(config.port) && config.port >= 1 && config.port <= 65535
      ? config.port
      : DEFAULT_PORT,
    autoOpen: config.autoOpen === true,
  }
}

export function apply(ctx: Context, rawConfig: unknown): void {
  // The composition entry is the base layer; the settings provider layers the
  // user's stored section over it. No settings service mounted → the plugin
  // simply keeps the composition entry (the launcher still works).
  ctx.inject(['settings'], (sctx: Context) => {
    const scope = sctx.settings.register(NAMESPACE, Config, {
      base: (rawConfig ?? {}) as never,
      applies: 'live'
    })
    // Re-validate: an invalid stored section fails the registration loudly.
    scope.get()
    sctx.effect(() => {
      const log = (entry: DesktopLauncherConfig): void => {
        console.log(`[dsh-desktop-launcher] serving on http://${entry.host}:${entry.port}`)
      }
      log(scope.get() as unknown as DesktopLauncherConfig)
      const off = scope.watch(() => log(scope.get() as unknown as DesktopLauncherConfig))
      return () => off()
    }, 'desktop-launcher: launch log')
  })
}
