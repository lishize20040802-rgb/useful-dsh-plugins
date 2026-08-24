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
  "plugin.description": "\u8BA9\u7EAF\u6587\u672C\u4E3B\u6A21\u578B\u4E5F\u80FD\u770B\u56FE\uFF1A\u9047\u5230\u56FE\u7247\u65F6\u81EA\u52A8\u8C03\u7528 DeepSeek \u5185\u7F6E\u591A\u6A21\u6001\u6A21\u578B\u8BC6\u522B\uFF0C\u8BC6\u522B\u7ED3\u679C\u4EE5\u7EAF\u6587\u672C\u8FD4\u56DE\u3002\u65E0\u9700\u989D\u5916 API Key\u3002",
  "plugin.route": "\u89C6\u89C9\u8DEF\u7531",
  "plugin.routeValue": "deepseek-official / deepseek-v4-flash-vision-exp",
  "plugin.features": "\u529F\u80FD",
  "plugin.featureVision": "vision \u5DE5\u5177\uFF1A\u6A21\u578B\u53EF\u8BFB\u53D6\u56FE\u7247\u8DEF\u5F84\u5E76\u8FD4\u56DE\u8BC6\u522B\u6587\u672C",
  "plugin.featureTranscribe": "\u7C98\u8D34\u56FE\u7247\u81EA\u52A8\u8F6C\u8FF0\u4E3A\u6587\u5B57\uFF0C\u4E0D\u8FDB\u5165\u4E3B\u6A21\u578B\u4E0A\u4E0B\u6587",
  "plugin.featureHide": "\u7EAF\u6587\u672C\u4E3B\u6A21\u578B\u4F1A\u8BDD\u81EA\u52A8\u9690\u85CF read_image\uFF0C\u907F\u514D\u5FC5\u5931\u8D25\u7684\u8C03\u7528",
  "plugin.hint": "\u914D\u7F6E\u4F4D\u4E8E profile \u7684 cordis.patch.yml\uFF08id: vision-reader\uFF09\u3002\u4FEE\u6539\u540E\u91CD\u542F dsh \u751F\u6548\u3002"
};
var en = {
  "plugin.title": "Vision Reader",
  "plugin.description": "Lets text-only main models read images: image content is routed through DeepSeek's built-in multimodal model and returned as plain text. No extra API key required.",
  "plugin.route": "Vision route",
  "plugin.routeValue": "deepseek-official / deepseek-v4-flash-vision-exp",
  "plugin.features": "Features",
  "plugin.featureVision": "vision tool: the model reads image paths and returns recognized text",
  "plugin.featureTranscribe": "Pasted images are auto-transcribed to text and never enter the main model context",
  "plugin.featureHide": "read_image is hidden in text-only main-model sessions to avoid guaranteed failures",
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("plugin.featureVision") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("plugin.featureTranscribe") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("plugin.featureHide") })
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
    () => ctx.slots.register({
      name: "settings.plugin.item",
      key: NS,
      id: NS,
      order: 30,
      locale: NS,
      inject: () => ({
        t: (key) => ctx.locale.bind(NS)(key)
      })
    }, VisionReaderCard)
  ));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
