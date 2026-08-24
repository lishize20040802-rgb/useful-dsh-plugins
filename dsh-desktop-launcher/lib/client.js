window.__ModuleLoader__.load({ id: "dsh-desktop-config", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
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
  DesktopLauncherCard: () => DesktopLauncherCard,
  NS: () => NS,
  apply: () => apply,
  dicts: () => dicts,
  en: () => en,
  inject: () => inject,
  zh: () => zh
});
module.exports = __toCommonJS(client_exports);
var import_jsx_runtime = require("react/jsx-runtime");
var NS = "desktop-launcher";
var zh = {
  "plugin.title": "\u684C\u9762\u7AEF\u542F\u52A8\u5668",
  "plugin.description": "\u7BA1\u7406\u684C\u9762\u5E94\u7528\u7684\u542F\u52A8\u914D\u7F6E\uFF08\u7AEF\u53E3\u3001\u7ED1\u5B9A\u5730\u5740\u3001\u81EA\u52A8\u6253\u5F00\uFF09\u3002\u684C\u9762\u7AEF\uFF08Electron\uFF09\u542F\u52A8\u65F6\u4ECE\u8FD9\u91CC\u8BFB\u53D6\u914D\u7F6E\uFF0C\u4E0E Web \u8BBE\u7F6E\u9875\u5171\u4EAB\u540C\u4E00\u4EFD\u914D\u7F6E\u3002",
  "plugin.port": "\u7AEF\u53E3",
  "plugin.host": "\u7ED1\u5B9A\u5730\u5740",
  "plugin.autoOpen": "\u81EA\u52A8\u6253\u5F00\u6D4F\u89C8\u5668",
  "plugin.hint": "\u914D\u7F6E\u4F4D\u4E8E\u8BBE\u7F6E\u9875\u7684 desktop-launcher \u547D\u540D\u7A7A\u95F4\uFF0C\u6216 profile \u7684 cordis.patch.yml\uFF08id: desktop-launcher\uFF09\u3002\u4FEE\u6539\u540E\u91CD\u542F\u684C\u9762\u7AEF\u751F\u6548\u3002"
};
var en = {
  "plugin.title": "Desktop Launcher",
  "plugin.description": "Owns the desktop app's launch configuration (port, bind host, auto-open). The Electron shell reads this at startup, sharing one source of truth with the web settings page.",
  "plugin.port": "Port",
  "plugin.host": "Bind host",
  "plugin.autoOpen": "Open browser automatically",
  "plugin.hint": "Configuration lives in the desktop-launcher settings namespace or the profile's cordis.patch.yml (id: desktop-launcher). Restart the desktop app after editing."
};
var dicts = {
  zh,
  en
};
function DesktopLauncherCard(props) {
  const { t } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_desktopLauncher_card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_desktopLauncher_head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_desktopLauncher_title", children: t("plugin.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_desktopLauncher_badge", children: "Electron" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh_desktopLauncher_desc", children: t("plugin.description") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh_desktopLauncher_hint", children: t("plugin.hint") })
  ] });
}
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`);
  const guarded = (label, register) => {
    try {
      return register();
    } catch (err) {
      console.warn(`[dsh-desktop-config] slot "${label}" registration failed; that UI seat stays absent:`, err);
      return () => {
      };
    }
  };
  ctx.slots.inject("settings.plugin.item", () => guarded(
    "settings.plugin.item",
    () => ctx.slots.register({
      name: "settings.plugin.item",
      key: NS,
      id: NS,
      order: 31,
      locale: NS,
      inject: () => ({
        t: (key) => ctx.locale.bind(NS)(key)
      })
    }, DesktopLauncherCard)
  ));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
