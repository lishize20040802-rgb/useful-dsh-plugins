window.__ModuleLoader__.load({ id: "useful-dsh-plugin-manager", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
  ManageTab: () => ManageTab,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "locale"];
var NS = "settings.pluginManager";
var zh = {
  tab: "\u7BA1\u7406",
  loading: "\u8BFB\u53D6\u63D2\u4EF6\u2026",
  retry: "\u5237\u65B0",
  check: "\u68C0\u67E5\u63D2\u4EF6\u66F4\u65B0",
  restore: "\u6062\u590D\u7BA1\u7406\u5668\u505C\u7528\u9879",
  enable: "\u542F\u7528",
  disable: "\u505C\u7528",
  update: "\u66F4\u65B0",
  repair: "\u91CD\u88C5\u540C\u4E00\u7248\u672C",
  protected: "\u7BA1\u7406\u5668\u81EA\u8EAB\u53D7\u4FDD\u62A4",
  local: "\u672C\u5730\u6216\u975E registry \u6765\u6E90\uFF1A\u8BF7\u901A\u8FC7\u539F\u5B89\u88C5\u65B9\u5F0F\u66F4\u65B0\uFF1B\u672C\u5957\u63D2\u4EF6\u4F7F\u7528 npx useful-dsh-plugins@0.5.0 setup",
  owner: "\u7531\u805A\u5408\u5305\u7BA1\u7406",
  current: "\u5F53\u524D",
  latest: "\u6700\u65B0",
  restart: "\u5DF2\u4FDD\u5B58\uFF1B\u9700\u8981\u91CD\u542F DSH \u540E\u751F\u6548\u3002\u5F53\u524D\u4EFB\u52A1\u4E0D\u4F1A\u88AB\u81EA\u52A8\u505C\u6B62\u3002",
  live: "\u5DF2\u5728\u5F53\u524D Loader \u4E2D\u786E\u8BA4\u751F\u6548\u3002",
  saved: "\u64CD\u4F5C\u5B8C\u6210\u3002",
  noRows: "\u5F53\u524D\u6CA1\u6709\u53EF\u7BA1\u7406\u7684\u7B2C\u4E09\u65B9\u63D2\u4EF6\u884C\u3002",
  failed: "\u64CD\u4F5C\u5931\u8D25",
  scope: "\u7B2C\u4E09\u65B9\u63D2\u4EF6",
  packages: "\u5DF2\u5B89\u88C5\u5305",
  paths: "\u6570\u636E\u4F4D\u7F6E\uFF08\u76F8\u5BF9 DSH_HOME\uFF09",
  liveReady: "\u6B64 profile \u652F\u6301 live patch\uFF1B\u6BCF\u6B21\u64CD\u4F5C\u4ECD\u4EE5\u5B9E\u9645 Loader \u72B6\u6001\u9A8C\u8BC1\u3002",
  startup: "\u5F53\u524D\u672A\u68C0\u6D4B\u5230 live patch \u80FD\u529B\uFF1B\u542F\u505C\u4FDD\u5B58\u540E\u9700\u91CD\u542F\u3002",
  host: "DSH \u672C\u4F53\u66F4\u65B0",
  hostCheck: "\u68C0\u67E5 DSH \u66F4\u65B0",
  hostUnavailable: "\u6B64\u5B89\u88C5\u65B9\u5F0F\u4E0D\u80FD\u5728\u8FD9\u91CC\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u539F\u5B89\u88C5\u65B9\u5F0F\u3002",
  confirm: "\u786E\u8BA4\u5C06 DSH \u672C\u4F53\u66F4\u65B0\u5230\u663E\u793A\u7684\u7CBE\u786E\u7248\u672C\uFF1B\u5B8C\u6210\u540E\u7531\u6211\u91CD\u542F\u3002",
  hostUpdate: "\u66F4\u65B0 DSH \u672C\u4F53",
  upToDate: "\u65E0\u9700\u66F4\u65B0",
  unknown: "\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6",
  hostNote: "\u8FD9\u662F\u72EC\u7ACB\u7684\u6574\u5957 DSH \u66F4\u65B0\u5165\u53E3\u3002\u666E\u901A\u63D2\u4EF6\u5217\u8868\u4E0D\u7BA1\u7406\u5B98\u65B9\u63D2\u4EF6\u3002"
};
var en = {
  tab: "Manage",
  loading: "Reading plugins\u2026",
  retry: "Refresh",
  check: "Check plugin updates",
  restore: "Restore manager disables",
  enable: "Enable",
  disable: "Disable",
  update: "Update",
  repair: "Reinstall same version",
  protected: "Manager itself is protected",
  local: "Local/non-registry source: use its original installer; for this suite run npx useful-dsh-plugins@0.5.0 setup",
  owner: "Managed by bundle",
  current: "Current",
  latest: "Latest",
  restart: "Saved; restart DSH to apply. Running tasks are not stopped automatically.",
  live: "Applied state observed in the current Loader.",
  saved: "Operation complete.",
  noRows: "No manageable third-party rows in this profile.",
  failed: "Operation failed",
  scope: "Third-party plugins",
  packages: "Installed packages",
  paths: "Data locations (relative to DSH_HOME)",
  liveReady: "This profile supports live patches; each change is checked against actual Loader state.",
  startup: "Live patch support was not detected; saved toggles require a restart.",
  host: "DSH host update",
  hostCheck: "Check DSH update",
  hostUnavailable: "This installation cannot be updated here; use its original installation method.",
  confirm: "Update the DSH host to the exact version shown; I will restart it afterwards.",
  hostUpdate: "Update DSH host",
  upToDate: "No update needed",
  unknown: "Currently unavailable",
  hostNote: "This is a separate whole-host update. Official plugins are not managed in the plugin list."
};
function css() {
  const tag = document.createElement("style");
  tag.dataset.plugin = "useful-dsh-plugin-manager";
  tag.textContent = `.dsh-pm-root{display:flex;flex-direction:column;gap:16px}.dsh-pm-section{display:flex;flex-direction:column;gap:10px}.dsh-pm-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#8885);border-radius:8px}.dsh-pm-label{flex:1;min-width:160px;overflow-wrap:anywhere}.dsh-pm-detail{font-size:12px;opacity:.8}.dsh-pm-actions{display:flex;gap:6px;flex-wrap:wrap}.dsh-pm-btn{padding:5px 10px;border:1px solid #8886;border-radius:6px;background:transparent;color:inherit;cursor:pointer}.dsh-pm-btn:disabled{opacity:.45;cursor:default}.dsh-pm-banner{padding:10px;background:#8881;border-radius:8px;overflow-wrap:anywhere}.dsh-pm-root h3{margin:0;font-size:15px}.dsh-pm-root code{overflow-wrap:anywhere}.dsh-pm-host{border-top:1px solid #8885;padding-top:16px}.dsh-pm-confirm{display:flex;gap:8px;align-items:flex-start}`;
  document.head.appendChild(tag);
  return () => tag.remove();
}
function ManageTab({ t }) {
  const tt = (key) => t?.(key) ?? en[key] ?? key;
  const [state, setState] = (0, import_react.useState)(null), [checks, setChecks] = (0, import_react.useState)([]);
  const [host, setHost] = (0, import_react.useState)(null), [busy, setBusy] = (0, import_react.useState)(false);
  const [banner, setBanner] = (0, import_react.useState)(""), [confirmed, setConfirmed] = (0, import_react.useState)(false);
  const request = async (route, data) => {
    const response = await fetch(`/api/plugin-manager${route}`, {
      method: data === void 0 ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: data === void 0 ? void 0 : JSON.stringify(data),
      credentials: "same-origin"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result;
  };
  const load = async () => setState(await request("/state"));
  const hostCheck = async () => {
    setHost(await request("/host"));
    setConfirmed(false);
  };
  const perform = async (fn, reload = true) => {
    setBusy(true);
    try {
      const result = await fn();
      if (result?.needsRestart) setBanner(tt("restart"));
      else if (result?.reload === "observed") setBanner(tt("live"));
      else setBanner(tt("saved"));
      if (reload) await load();
    } catch (error) {
      setBanner(`${tt("failed")}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  (0, import_react.useEffect)(() => {
    void perform(load, false);
  }, []);
  const pkgRows = checks.length ? checks : state?.packages ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-root", children: [
    banner && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-banner", role: "status", "aria-live": "polite", children: banner }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy, onClick: () => void perform(load, false), children: tt("retry") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy || !state, onClick: () => void perform(async () => {
        const result = await request("/check-all", {});
        setChecks(result.packages);
      }, false), children: tt("check") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy || !state?.managed?.length, onClick: () => void perform(() => request("/restore", {})), children: tt("restore") })
    ] }),
    !state ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: tt("loading") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-pm-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: tt("scope") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-detail", children: tt(state.live ? "liveReady" : "startup") }),
        !state.rows.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: tt("noRows") }),
        state.rows.map((row) => {
          const disabled = state.managed.includes(row.id) || !row.enabled;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: row.id }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-detail", children: [
                row.module,
                " \xB7 ",
                row.phase ?? "inactive"
              ] }),
              !row.direct && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-detail", children: [
                tt("owner"),
                ": ",
                row.owner
              ] })
            ] }),
            row.protected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-pm-detail", children: tt("protected") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy, onClick: () => void perform(() => request(disabled ? "/enable" : "/disable", { id: row.id, module: row.module })), children: tt(disabled ? "enable" : "disable") })
          ] }, row.id);
        })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-pm-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: tt("packages") }),
        pkgRows.map((pkg) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-label", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: pkg.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-detail", children: [
              tt("current"),
              ": ",
              pkg.installed,
              pkg.latest ? ` \xB7 ${tt("latest")}: ${pkg.latest}` : ""
            ] }),
            !pkg.direct ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-detail", children: [
              tt("owner"),
              ": ",
              pkg.owners?.join(", ") ?? pkg.owner
            ] }) : pkg.local ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-detail", children: tt("local") }) : null
          ] }),
          pkg.direct && !pkg.local && !pkg.self && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-actions", children: [
            pkg.canUpdate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy, onClick: () => void perform(async () => {
              const result = await request("/update", { name: pkg.name });
              setChecks([]);
              return result;
            }), children: tt("update") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy, onClick: () => void perform(() => request("/repair", { name: pkg.name })), children: tt("repair") })
          ] })
        ] }, pkg.name))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-pm-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: tt("paths") }),
        Object.entries(state.paths ?? {}).filter(([key]) => key !== "base").map(([key, value]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-detail", children: [
          key,
          ": ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("code", { children: [
            state.paths.base,
            "/",
            String(value)
          ] })
        ] }, key))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-pm-section dsh-pm-host", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: tt("host") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-detail", children: tt("hostNote") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pm-btn", disabled: busy, onClick: () => void perform(hostCheck, false), children: tt("hostCheck") }),
      host && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          tt("current"),
          ": ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: host.current ?? tt("unknown") }),
          " \xB7 ",
          tt("latest"),
          ": ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: host.latest ?? tt("unknown") })
        ] }),
        !host.supported && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pm-detail", children: [
          tt("hostUnavailable"),
          " ",
          host.reason
        ] }),
        host.supported && !host.updateAvailable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pm-detail", children: host.registryAvailable ? tt("upToDate") : tt("unknown") }),
        host.supported && host.updateAvailable && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsh-pm-confirm", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: confirmed, disabled: busy, onChange: (event) => setConfirmed(event.target.checked) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              tt("confirm"),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: host.latest })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "dsh-pm-btn", disabled: busy || !confirmed, onClick: () => void perform(async () => {
            const result = await request("/host/update", { version: host.latest, confirm: true });
            setConfirmed(false);
            setHost({ ...host, updateAvailable: false });
            return result;
          }, false), children: [
            tt("hostUpdate"),
            " ",
            host.latest
          ] })
        ] })
      ] })
    ] })
  ] });
}
function apply(ctx) {
  ctx.effect(css, "useful-dsh-plugin-manager: styles");
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "useful-dsh-plugin-manager: dictionaries");
  const t = ctx.locale.bind(NS);
  try {
    ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
      name: "settings.plugins.tab",
      id: "manage",
      order: 20,
      label: () => t("tab"),
      locale: NS,
      inject: () => ({ t })
    }, ManageTab));
  } catch {
    console.warn("[useful-dsh-plugin-manager] settings tab registration failed.");
  }
}
return module.exports; } });
