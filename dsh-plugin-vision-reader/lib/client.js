window.__ModuleLoader__.load({ id: "dsh-plugin-vision-reader", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
  NS: () => NS,
  VisionReaderCard: () => VisionReaderCard,
  apply: () => apply,
  dicts: () => dicts,
  en: () => en,
  inject: () => inject,
  zh: () => zh
});
module.exports = __toCommonJS(client_exports);
var import_jsx_runtime = require("react/jsx-runtime");
var NS = "vision-reader";
var zh = {
  "plugin.title": "\u89C6\u89C9\u8BFB\u56FE\u63D2\u4EF6",
  "plugin.description": "\u56FE\u7247\u76F4\u63A5\u4EA4\u7ED9\u4E3B\u6A21\u578B\u81EA\u5DF1\u770B\uFF0C\u4E0D\u505A\u4EFB\u4F55\u4E2D\u95F4\u8F6C\u8FF0\uFF1B\u7C98\u8D34\u7684\u56FE\u7247\u53E6\u5B58\u4E3A\u672C\u5730\u6587\u4EF6\uFF0C\u4FBF\u4E8E\u4E4B\u540E\u53CD\u590D\u56DE\u770B\u3002\u65E0\u9700\u989D\u5916 API Key\u3002",
  "plugin.route": "\u5907\u7528\u89C6\u89C9\u8DEF\u7531",
  "plugin.routeValue": "deepseek-official / deepseek-v4-flash-vision-exp",
  "plugin.features": "\u529F\u80FD",
  "plugin.featurePassthrough": "\u56FE\u7247\u539F\u6837\u76F4\u901A\u4E3B\u6A21\u578B\uFF08\u5168\u4FDD\u771F\uFF09\uFF0C\u4E0D\u7ECF\u8FC7\u4EFB\u4F55\u8F6C\u8FF0",
  "plugin.featurePersist": "\u7C98\u8D34\u56FE\u7247\u81EA\u52A8\u843D\u76D8\uFF0C\u6D88\u606F\u91CC\u7ED9\u51FA\u8DEF\u5F84\uFF0C\u53EF\u968F\u65F6\u53CD\u590D\u770B\u540C\u4E00\u5F20\u56FE",
  "plugin.featureVision": "vision \u5DE5\u5177\uFF1A\u8BA9\u5907\u7528\u89C6\u89C9\u6A21\u578B\u5BF9\u540C\u4E00\u5F20\u56FE\u505A\u72EC\u7ACB\u590D\u6838",
  "plugin.hint": "\u914D\u7F6E\u4F4D\u4E8E profile \u7684 cordis.patch.yml\uFF08id: vision-reader\uFF09\u3002\u4FEE\u6539\u540E\u91CD\u542F dsh \u751F\u6548\u3002"
};
var en = {
  "plugin.title": "Vision Reader",
  "plugin.description": "Images go straight to the main model \u2014 no second-hand description in between. Pasted images are also saved to local files so the same picture can be re-read at any later point. No extra API key required.",
  "plugin.route": "Fallback vision route",
  "plugin.routeValue": "deepseek-official / deepseek-v4-flash-vision-exp",
  "plugin.features": "Features",
  "plugin.featurePassthrough": "Images reach the main model verbatim (full fidelity), never transcribed",
  "plugin.featurePersist": "Pasted images are persisted and the message carries the path, so any picture can be re-read at will",
  "plugin.featureVision": "vision tool: an independent second opinion from the fallback vision model",
  "plugin.hint": "Configuration lives in the profile's cordis.patch.yml (id: vision-reader). Restart dsh after editing."
};
var dicts = {
  zh,
  en
};
function VisionReaderCard(props) {
  const { t } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_visionReader_card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_visionReader_head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_visionReader_title", children: t("plugin.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_visionReader_badge", children: "deepseek-v4-flash-vision-exp" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh_visionReader_desc", children: t("plugin.description") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_visionReader_route", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_visionReader_routeLabel", children: t("plugin.route") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: "dsh_visionReader_routeValue", children: t("plugin.routeValue") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", { className: "dsh_visionReader_features", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("plugin.featurePassthrough") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("plugin.featurePersist") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("plugin.featureVision") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh_visionReader_hint", children: t("plugin.hint") })
  ] });
}
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`);
  const guarded = (label, register) => {
    try {
      return register();
    } catch (err) {
      console.warn(`[dsh-plugin-vision-reader] slot "${label}" registration failed; that UI seat stays absent:`, err);
      return () => {
      };
    }
  };
  ctx.slots.inject("settings.plugin.item", () => guarded(
    "settings.plugin.item",
    () => (
      // `settings.plugin.item` is a keyed slot: the dispatch key is the settings
      // namespace, and `order` is a list-slot option (0.1.5 keys it away).
      ctx.slots.register({
        name: "settings.plugin.item",
        key: NS,
        locale: NS
      }, VisionReaderCard)
    )
  ));
}
return module.exports; } });
