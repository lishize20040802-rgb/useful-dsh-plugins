window.__ModuleLoader__.load({ id: "dsh-plugin-manager", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "locale", "remote", "remote.pluginInventory"];
var NS = "settings.pluginManager";
var STYLE_TAG = "dsh-plugin-manager/style.css";
var zh = {
  tab: "\u7BA1\u7406",
  loading: "\u8BFB\u53D6\u63D2\u4EF6\u2026",
  loadFailed: "\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  retry: "\u91CD\u8BD5",
  restartBanner: "\u6539\u52A8\u4F1A\u5728\u91CD\u542F dsh web \u540E\u751F\u6548\u3002",
  restarting: "\u66F4\u65B0\u6210\u529F\uFF0C\u8BF7\u91CD\u542F dsh web \u751F\u6548\u3002",
  disable: "\u505C\u7528",
  enable: "\u542F\u7528",
  check: "\u68C0\u6D4B\u66F4\u65B0",
  checkAll: "\u5168\u90E8\u68C0\u6D4B",
  updating: "\u66F4\u65B0",
  repair: "\u4FEE\u590D",
  repaired: "\u5DF2\u6062\u590D\u539F\u7248\u6587\u4EF6\uFF0C\u91CD\u542F dsh web \u751F\u6548\u3002",
  repairFailed: "\u4FEE\u590D\u5931\u8D25\uFF1A",
  restore: "\u6062\u590D\u5168\u90E8",
  official: "Harness \u81EA\u5E26",
  uptodate: "\u5DF2\u662F\u6700\u65B0",
  outdated: "\u53EF\u66F4\u65B0",
  unreachable: "\u65E0\u6CD5\u8FDE\u63A5 registry",
  unknown: "\u672A\u77E5",
  yes: "\u662F",
  no: "\u5426"
};
var en = {
  tab: "Manage",
  loading: "Reading plugins\u2026",
  loadFailed: "Failed to load. Retry?",
  retry: "Retry",
  restartBanner: "Changes take effect after restarting dsh web.",
  restarting: "Updated \u2014 restart dsh web to apply.",
  disable: "Disable",
  enable: "Enable",
  check: "Check",
  checkAll: "Check all",
  updating: "Update",
  repair: "Repair",
  repaired: "Pristine files restored \u2014 restart dsh web to apply.",
  repairFailed: "Repair failed: ",
  restore: "Restore all",
  official: "Provided by Harness",
  uptodate: "Up to date",
  outdated: "Update available",
  unreachable: "registry unreachable",
  unknown: "unknown",
  yes: "yes",
  no: "no"
};
function injectCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-plugin-manager";
  tag.dataset.pluginCss = STYLE_TAG;
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
`;
  document.head.appendChild(tag);
}
function ManageTab({ list, t }) {
  const [entries, setEntries] = (0, import_react.useState)(null);
  const [managed, setManaged] = (0, import_react.useState)([]);
  const [checks, setChecks] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(null);
  const [banner, setBanner] = (0, import_react.useState)("");
  const [failed, setFailed] = (0, import_react.useState)(false);
  const tt = (key) => t !== void 0 ? t(key) : key;
  const call = async (path, body) => {
    const res = await fetch(`/api/plugin-manager${path}`, {
      method: body !== void 0 ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    return data;
  };
  const load = async () => {
    setFailed(false);
    try {
      const [inv, st] = await Promise.all([
        list?.() ?? Promise.resolve([]),
        call("/state")
      ]);
      setEntries(inv);
      setManaged(st.managed ?? []);
    } catch {
      setFailed(true);
    }
  };
  (0, import_react.useEffect)(() => {
    void load();
  }, []);
  const setEnable = async (id, enabled) => {
    setBusy(id);
    try {
      await call(enabled ? "/enable" : "/disable", { id });
      setManaged((prev) => enabled ? prev.filter((x) => x !== id) : [...prev, id]);
      setBanner(tt("restartBanner"));
    } catch (err) {
      setBanner(`${enabled ? "enable" : "disable"} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  const checkAll = async () => {
    setBusy("__check__");
    try {
      const data = await call("/check-all");
      setChecks(data.packages ?? []);
    } catch (err) {
      setBanner(`${tt("check")} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  const updateOne = async (name) => {
    setBusy(name);
    try {
      await call("/update", { name });
      setBanner(tt("restarting"));
      setChecks((prev) => prev?.filter((x) => x.name !== name) ?? null);
    } catch (err) {
      setBanner(`update failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  const restoreAll = async () => {
    setBusy("__restore__");
    try {
      await call("/restore");
      setManaged([]);
      setBanner(tt("restartBanner"));
    } catch (err) {
      setBanner(`restore failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  const repairOne = async (name) => {
    setBusy(`__repair__${name}`);
    try {
      const data = await call("/repair", { name });
      setBanner(data?.ok ? tt("repaired") : `${tt("repairFailed")}${data?.note ?? "unknown"}`);
    } catch (err) {
      setBanner(`${tt("repairFailed")}${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  if (failed) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-root", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-banner", children: tt("loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", onClick: () => void load(), children: tt("retry") })
    ] });
  }
  if (entries === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-root", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-banner", children: tt("loading") }) });
  const checkByName = (module2) => checks?.find((c) => c.name === module2);
  const isOfficial = (module2) => module2 !== void 0 && module2.startsWith("@deepseek-ai/");
  const isDisabled = (entry) => {
    const id = entry.id ?? "";
    return managed.includes(id) || entry.enabled === false;
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
      banner !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-banner", style: { flex: 1 }, children: banner }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy === "__check__", onClick: () => void checkAll(), children: tt("checkAll") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy === "__restore__", onClick: () => void restoreAll(), children: tt("restore") })
    ] }),
    entries.map((entry) => {
      const id = entry.id ?? entry.module ?? "?";
      const check = checkByName(entry.module);
      const official = isOfficial(entry.module);
      const disabled = isDisabled(entry);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-pm-id", title: id, children: id }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-pm-module", title: entry.module, children: entry.module }),
        official ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-pm-tag", children: tt("official") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-pm-btn",
              disabled: busy === `__repair__${entry.module}`,
              onClick: () => void repairOne(entry.module),
              children: busy === `__repair__${entry.module}` ? "\u2026" : tt("repair")
            }
          )
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-pm-btn",
              disabled: busy === `__repair__${entry.module}`,
              onClick: () => void repairOne(entry.module),
              children: busy === `__repair__${entry.module}` ? "\u2026" : tt("repair")
            }
          ),
          check !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dsh-pm-status ${check.upToDate === true ? "dsh-pm-ok" : check.latest === null ? "dsh-pm-warn" : "dsh-pm-warn"}`, children: check.upToDate === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCheckOutline16, { size: 12 }) : check.latest === null ? tt("unreachable") : `${tt("outdated")}: ${check.latest}` }),
          check !== void 0 && check.upToDate === false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy === entry.module, onClick: () => void updateOne(entry.module), children: busy === entry.module ? "\u2026" : tt("updating") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-pm-btn",
              disabled: busy === id,
              onClick: () => void setEnable(id, disabled),
              children: busy === id ? "\u2026" : disabled ? tt("enable") : tt("disable")
            }
          )
        ] })
      ] }, id);
    })
  ] });
}
function apply(ctx) {
  injectCss();
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-plugin-manager: dictionaries");
  const t = ctx.locale.bind(NS);
  const list = async () => {
    const result = await ctx.remote.pluginInventory.list();
    if (!result.ok) throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`);
    return result.value;
  };
  try {
    ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
      name: "settings.plugins.tab",
      id: "manage",
      order: 20,
      label: () => t("tab"),
      locale: NS,
      inject: () => ({ list })
    }, ManageTab));
  } catch (err) {
    console.warn("[dsh-plugin-manager] settings tab registration failed; the manager tab stays absent:", err);
  }
}
return module.exports; } });
//# sourceMappingURL=client.js.map
