import { useEffect, useState } from 'react'

export const inject = ['slots', 'locale']
const NS = 'settings.pluginManager'
const zh = {
  tab: '管理', loading: '读取插件…', retry: '刷新', check: '检查插件更新', restore: '恢复管理器停用项',
  enable: '启用', disable: '停用', update: '更新', repair: '重装同一版本', protected: '管理器自身受保护',
  local: '本地或非 registry 来源：请通过原安装方式更新；本套插件使用 npx useful-dsh-plugins@0.5.1 setup', owner: '由聚合包管理', current: '当前', latest: '最新',
  restart: '已保存；需要重启 DSH 后生效。当前任务不会被自动停止。', live: '已在当前 Loader 中确认生效。',
  saved: '操作完成。', noRows: '当前没有可管理的第三方插件行。', failed: '操作失败',
  scope: '第三方插件', packages: '已安装包', paths: '数据位置（相对 DSH_HOME）',
  liveReady: '此 profile 支持 live patch；每次操作仍以实际 Loader 状态验证。',
  startup: '当前未检测到 live patch 能力；启停保存后需重启。',
  host: 'DSH 本体更新', hostCheck: '检查 DSH 更新', hostUnavailable: '此安装方式不能在这里更新，请使用原安装方式。',
  confirm: '确认将 DSH 本体更新到显示的精确版本；完成后由我重启。',
  hostUpdate: '更新 DSH 本体', upToDate: '无需更新', unknown: '暂时无法获取',
  hostNote: '这是独立的整套 DSH 更新入口。普通插件列表不管理官方插件。'
}
const en = {
  tab: 'Manage', loading: 'Reading plugins…', retry: 'Refresh', check: 'Check plugin updates', restore: 'Restore manager disables',
  enable: 'Enable', disable: 'Disable', update: 'Update', repair: 'Reinstall same version', protected: 'Manager itself is protected',
  local: 'Local/non-registry source: use its original installer; for this suite run npx useful-dsh-plugins@0.5.1 setup', owner: 'Managed by bundle', current: 'Current', latest: 'Latest',
  restart: 'Saved; restart DSH to apply. Running tasks are not stopped automatically.', live: 'Applied state observed in the current Loader.',
  saved: 'Operation complete.', noRows: 'No manageable third-party rows in this profile.', failed: 'Operation failed',
  scope: 'Third-party plugins', packages: 'Installed packages', paths: 'Data locations (relative to DSH_HOME)',
  liveReady: 'This profile supports live patches; each change is checked against actual Loader state.',
  startup: 'Live patch support was not detected; saved toggles require a restart.',
  host: 'DSH host update', hostCheck: 'Check DSH update', hostUnavailable: 'This installation cannot be updated here; use its original installation method.',
  confirm: 'Update the DSH host to the exact version shown; I will restart it afterwards.',
  hostUpdate: 'Update DSH host', upToDate: 'No update needed', unknown: 'Currently unavailable',
  hostNote: 'This is a separate whole-host update. Official plugins are not managed in the plugin list.'
}

function css() {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'useful-dsh-plugin-manager'
  tag.textContent = `.dsh-pm-root{display:flex;flex-direction:column;gap:16px}.dsh-pm-section{display:flex;flex-direction:column;gap:10px}.dsh-pm-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#8885);border-radius:8px}.dsh-pm-label{flex:1;min-width:160px;overflow-wrap:anywhere}.dsh-pm-detail{font-size:12px;opacity:.8}.dsh-pm-actions{display:flex;gap:6px;flex-wrap:wrap}.dsh-pm-btn{padding:5px 10px;border:1px solid #8886;border-radius:6px;background:transparent;color:inherit;cursor:pointer}.dsh-pm-btn:disabled{opacity:.45;cursor:default}.dsh-pm-banner{padding:10px;background:#8881;border-radius:8px;overflow-wrap:anywhere}.dsh-pm-root h3{margin:0;font-size:15px}.dsh-pm-root code{overflow-wrap:anywhere}.dsh-pm-host{border-top:1px solid #8885;padding-top:16px}.dsh-pm-confirm{display:flex;gap:8px;align-items:flex-start}`
  document.head.appendChild(tag)
  return () => tag.remove()
}

export function ManageTab({ t }: { t?: (key: string) => string }) {
  const tt = (key: string) => t?.(key) ?? en[key] ?? key
  const [state, setState] = useState<any>(null), [checks, setChecks] = useState<any[]>([])
  const [host, setHost] = useState<any>(null), [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(''), [confirmed, setConfirmed] = useState(false)
  const request = async (route: string, data?: object) => {
    const response = await fetch(`/api/plugin-manager${route}`, { method: data === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), credentials: 'same-origin' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
    return result
  }
  const load = async () => setState(await request('/state'))
  const hostCheck = async () => { setHost(await request('/host')); setConfirmed(false) }
  const perform = async (fn: () => Promise<any>, reload = true) => {
    setBusy(true)
    try {
      const result = await fn()
      if (result?.needsRestart) setBanner(tt('restart'))
      else if (result?.reload === 'observed') setBanner(tt('live'))
      else setBanner(tt('saved'))
      if (reload) await load()
    } catch (error) { setBanner(`${tt('failed')}: ${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  useEffect(() => { void perform(load, false) }, [])
  const pkgRows = checks.length ? checks : state?.packages ?? []
  return <div className="dsh-pm-root">
    {banner && <div className="dsh-pm-banner" role="status" aria-live="polite">{banner}</div>}
    <div className="dsh-pm-actions">
      <button type="button" className="dsh-pm-btn" disabled={busy} onClick={() => void perform(load, false)}>{tt('retry')}</button>
      <button type="button" className="dsh-pm-btn" disabled={busy || !state} onClick={() => void perform(async () => { const result = await request('/check-all', {}); setChecks(result.packages) }, false)}>{tt('check')}</button>
      <button type="button" className="dsh-pm-btn" disabled={busy || !state?.managed?.length} onClick={() => void perform(() => request('/restore', {}))}>{tt('restore')}</button>
    </div>
    {!state ? <div>{tt('loading')}</div> : <>
      <section className="dsh-pm-section"><h3>{tt('scope')}</h3>
        <div className="dsh-pm-detail">{tt(state.live ? 'liveReady' : 'startup')}</div>
        {!state.rows.length && <div>{tt('noRows')}</div>}
        {state.rows.map(row => {
          const disabled = state.managed.includes(row.id) || !row.enabled
          return <div className="dsh-pm-row" key={row.id}>
            <div className="dsh-pm-label"><code>{row.id}</code><div className="dsh-pm-detail">{row.module} · {row.phase ?? 'inactive'}</div>
              {!row.direct && <div className="dsh-pm-detail">{tt('owner')}: {row.owner}</div>}</div>
            {row.protected ? <span className="dsh-pm-detail">{tt('protected')}</span> :
              <button type="button" className="dsh-pm-btn" disabled={busy} onClick={() => void perform(() => request(disabled ? '/enable' : '/disable', { id: row.id, module: row.module }))}>{tt(disabled ? 'enable' : 'disable')}</button>}
          </div>
        })}
      </section>
      <section className="dsh-pm-section"><h3>{tt('packages')}</h3>
        {pkgRows.map(pkg => <div className="dsh-pm-row" key={pkg.name}>
          <div className="dsh-pm-label"><code>{pkg.name}</code><div className="dsh-pm-detail">{tt('current')}: {pkg.installed}{pkg.latest ? ` · ${tt('latest')}: ${pkg.latest}` : ''}</div>
            {!pkg.direct ? <div className="dsh-pm-detail">{tt('owner')}: {pkg.owners?.join(', ') ?? pkg.owner}</div> : pkg.local ? <div className="dsh-pm-detail">{tt('local')}</div> : null}</div>
          {pkg.direct && !pkg.local && !pkg.self && <div className="dsh-pm-actions">
            {pkg.canUpdate && <button type="button" className="dsh-pm-btn" disabled={busy} onClick={() => void perform(async () => { const result = await request('/update', { name: pkg.name }); setChecks([]); return result })}>{tt('update')}</button>}
            <button type="button" className="dsh-pm-btn" disabled={busy} onClick={() => void perform(() => request('/repair', { name: pkg.name }))}>{tt('repair')}</button>
          </div>}
        </div>)}
      </section>
      <section className="dsh-pm-section"><h3>{tt('paths')}</h3>
        {Object.entries(state.paths ?? {}).filter(([key]) => key !== 'base').map(([key, value]) => <div className="dsh-pm-detail" key={key}>{key}: <code>{state.paths.base}/{String(value)}</code></div>)}
      </section>
    </>}
    <section className="dsh-pm-section dsh-pm-host"><h3>{tt('host')}</h3><div className="dsh-pm-detail">{tt('hostNote')}</div>
      <button type="button" className="dsh-pm-btn" disabled={busy} onClick={() => void perform(hostCheck, false)}>{tt('hostCheck')}</button>
      {host && <>
        <div>{tt('current')}: <code>{host.current ?? tt('unknown')}</code> · {tt('latest')}: <code>{host.latest ?? tt('unknown')}</code></div>
        {!host.supported && <div className="dsh-pm-detail">{tt('hostUnavailable')} {host.reason}</div>}
        {host.supported && !host.updateAvailable && <div className="dsh-pm-detail">{host.registryAvailable ? tt('upToDate') : tt('unknown')}</div>}
        {host.supported && host.updateAvailable && <>
          <label className="dsh-pm-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>{tt('confirm')} <code>{host.latest}</code></span></label>
          <button type="button" className="dsh-pm-btn" disabled={busy || !confirmed} onClick={() => void perform(async () => { const result = await request('/host/update', { version: host.latest, confirm: true }); setConfirmed(false); setHost({ ...host, updateAvailable: false }); return result }, false)}>{tt('hostUpdate')} {host.latest}</button>
        </>}
      </>}
    </section>
  </div>
}

export function apply(ctx: any) {
  ctx.effect(css, 'useful-dsh-plugin-manager: styles')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'useful-dsh-plugin-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  try {
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({ name: 'settings.plugins.tab', id: 'manage', order: 20,
      label: () => t('tab'), locale: NS, inject: () => ({ t }) }, ManageTab))
  } catch { console.warn('[useful-dsh-plugin-manager] settings tab registration failed.') }
}
