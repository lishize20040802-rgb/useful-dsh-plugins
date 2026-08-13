# DeepSeek Harness Web UI 插件体系调研报告：给 composer「+」按钮旁增加上传文件按钮的实现设计

调研对象：`@deepseek-ai/dsh@0.1.0-rc.6`（已编译产物，`lib/*.js` 可读）
安装根：`C:\Users\13987\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`
运行服务：`http://127.0.0.1:3080`（页面 HTML 已抓取到 `D:\Dquant 1.0\_dsh_boot_page.html`）

> 结论速览：**composer 的扩展点就是 slot 系统**（`conversation.input.left` / `.right` 列表 slot），不需要 hook composer 组件。加一个上传按钮 = 一个**双面（dual-face）cordis 插件包**：node 半边注册一个接收文件的 HTTP 路由，browser 半边把一个按钮组件 `register` 进 `conversation.input.left`，上传成功后用标准 kit 的 `inputActions.setDraft(path)` 把文件路径写进输入框。

---

## A. 输入框（composer）结构与扩展点

### A1. composer 组件、加号按钮、附件挂载位置

**结论**：composer 的默认主体是 `InputBar`，它注册在 `conversation.composer.bar`（single）slot 上。工具栏最左侧的「+」按钮是 **Command launcher（斜杠命令菜单），不是附件面**；附件（图片）通过「粘贴 + 整页拖拽」进入 `draftImages/addImages` 通道，`AttachmentRail`/`DropOverlay` 是 `dsh-client-ui-attachment` 提供的纯 React 原子组件，被 InputBar 消费。

- 文件：`dsh-client-ui-conversation/lib/types/client/skeleton/InputBar.d.ts`
  ```ts
  export declare function InputBar({ ..., addImages, removeImage, draftImages,
      resolveSubmitMode, toggleCommandMenu, stop, command, t, renderSlot, ...,
      leftItems, rightItems, footer }: InputBarProps): JSX.Element;
  ```

- 文件：`dsh-client-ui-conversation/lib/client.js`（第 3826–3926 行）——工具栏真实渲染顺序：
  ```jsx
  <div className={row}>
    <div className={tools}>
      <Tooltip label={t("input.commands")}>
        <button className="add" aria-label={t("input.commands")} aria-haspopup="listbox"
                onClick={onToggleCommandMenu}>
          <IconPlusOutline16 size={14} />   {/* ← 这就是「+」按钮 */}
        </button>
      </Tooltip>
      <div className="modes">
        {accessSelect}
        {renderSlot("conversation.input.plan", { locked })}   {/* 计划座位 */}
      </div>
      {leftItems}     {/* ← conversation.input.left 列表 slot 渲染点 */}
    </div>
    <div className="trailing">
      {rightItems}    {/* ← conversation.input.right 列表 slot 渲染点 */}
      {renderSlot("conversation.input.model", { locked: modelSeatLocked })}
      <ContextMeter ... />
      {/* stop / send 主按钮 */}
    </div>
  </div>
  ```

- 「+」按钮行为：`onClick → onToggleCommandMenu → toggleCommandMenu?.(selectionOf(el))`，即调用 `InputTriggerController` 只打开 `/` 触发器的 `command` 源（见 README 第 41 行）。**没有 file input、没有上传协议**。

- `AttachmentRail` / `DropOverlay` / `ImageLightbox` / `MessageImage` 都在 `dsh-client-ui-attachment/lib/index.js`（纯 React，零 cordis）。InputBar 里用 `DropOverlay`（整页拖拽时）、`ImageLightbox`（点预览图时）：
  ```jsx
  {preview !== null && <ImageLightbox src={preview.previewUrl} ... />}
  ```
  图片 intake 的 `addImages` 来自 composer-bar 注入面（`ComposerBarInjected.addImages`，见 `slots.d.ts` 第 533 行）。

### A2. slots 机制：全部 slot 名与 composer 附近的扩展点

**结论**：slot 系统**同时覆盖页面级布局和 composer 内部**。`SlotMap` 完整声明在 `dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`（`declare module '@deepseek-ai/dsh-client-ui-slots' { interface SlotMap {...} }`，各包通过声明合并贡献自己的 key）。composer 附近有**专门的输入扩展 slot**：

| slot 名 | kind | scope | owner 货币 | 用途 |
|---|---|---|---|---|
| `conversation.input.left` | list | session | `InputZone` | **工具栏左端**（紧邻「+」/访问模式/plan 常驻 chrome 之后）——放小按钮的最佳位置 |
| `conversation.input.right` | list | session | `InputZone` | 工具栏右端（send 按钮之前） |
| `conversation.input.dock` | list | session | `InputZone` | 卡片上方独立一行（TodoDock/QueueDock/GoalBar） |
| `conversation.composer.dock` | list | session | `InputZone` | 卡片下方带宽内的环境读条（stats line） |
| `conversation.input.plan` | single | session | `InputControlOwnerProps` | 命名座位：plan 控制 |
| `conversation.input.model` | single | session | `InputControlOwnerProps` | 命名座位：模型选择 |
| `conversation.input.overlay` | list | session | — | 悬浮菜单（MenuView 渲染于此） |
| `conversation.composer` | chain | session | `ComposerChainProps` | composer 接管（ApprovalPanel） |
| `conversation.composer.bar` | single | session-maybe | `ComposerBarOwnerProps` | 默认 composer 主体（InputBar 注册于此） |

关键 owner 类型（`slots.d.ts` 第 326–329 行）：
```ts
/** input-region slot currency: dock/left/right 条目读取 conversation snapshot + 实时 input state */
export interface InputZone {
  readonly session: ConversationSnapshot;
  readonly input: InputState;
}
```

标准 kit 声明合并（`slots.d.ts` 第 285–295 行）——**每个 session-scope slot 组件都会拿到输入机的两个公共动作**：
```ts
interface SessionStandardProps {
  useInput: SnapshotSelectorHook<InputState>;
  inputActions: InputActions;   // ← setDraft / addImages / removeImage / submit
}
interface SessionMaybeStandardProps { useInput: ...; inputActions: InputActions | undefined; }
```

注册 API（`dsh-client-ui-slots/lib/index.js` 的 `SlotCore.register(options, component)`；服务层 `dsh-client-runtime/lib/types/client/slots.d.ts` 的 `SlotRegistry`）：
```ts
ctx.slots.register({
  name: "conversation.input.left",  // 已声明的 slot key
  id: "my-upload",                  // list slot 必填，唯一 cell id
  order: 0,                         // 列表内升序
  // 可选：inject(业务面工厂)、store、locale、priority、registrant
}, MyButtonComponent);
// 声明注入（不关心 ui-conversation 是否先加载）：ctx.slots.inject(key, () => ctx.slots.register(...))
```

### A3. input-trigger 能否用于注入动作按钮

**结论**：不能。`dsh-client-ui-input-trigger` 是 `/`、`@` 检测 + 候选菜单 + 选中路由的「输入触发器管道」，`ctx.inputTriggers` 服务只维护「触发源（slash command / @引用）roster」，`InputTriggerController` 的 `toggleSource` 是给 chrome launcher 打开某个 slash 源用的。它**不提供** composer 工具栏持久按钮注入点。README 明确：「MenuView 把菜单渲染进 `conversation.input.overlay` slot」。它适合做「上传」斜杠命令的补全，不适合做常驻按钮。

### A4. 结论：最干净的扩展方式

**注册进 `conversation.input.left`（list / session）slot**，组件在 props 里直接拿到 `inputActions.setDraft()` 写文本。证据链：
1. InputBar 源码把 `leftItems = renderSlot("conversation.input.left", zone)` 渲染在「+」按钮与 access/plan chrome 之后（`client.js` 第 3851 行）。
2. slot 声明文档明确这是「工具栏内、常驻 chrome 之后、放一个小控件」的座位（`slots.d.ts` 第 208–220 行注释）。
3. session-scope slot 组件通过标准 kit 获得 `inputActions`（`slots.d.ts` 第 285–290 行）。
4. `ctx.slots.inject()` 解决了与 ui-conversation 的加载顺序（声明注入，声明晚到也能注册）。

**不需要** hook/替换 `InputBar`；不需要 patch React 树；不需要 fork 官方包。

---

## B. client 插件契约与构建

### B5. `window.__DSH_BOOT__` 完整结构（已从 http://127.0.0.1:3080/ 抓取）

页面 `index.html` 的 `<head>` 里第一段脚本就是 boot manifest。完整 JSON 已解出（`rev: dcccb8324e44`，**38 个 entries**）。结构：

```jsonc
{
  "rev": "dcccb8324e44",                 // 全表 sha1 前 12 位
  "entries": [
    {
      "id": "@deepseek-ai/dsh-typert-registry",   // 包名
      "url": "/plugins/@deepseek-ai/dsh-typert-registry/client.js?rev=f41d56e0b747",
      "rev": "f41d56e0b747",                        // bundle 内容 sha1 前 12 位（缓存破号）
      "inject": [],                                 // 该 client bundle 依赖的其他 client 插件包名（可选）
      "immediately": true                           // 立即预取 tier（可选）
    }
    // ... 共 38 行
  ]
}
```

完整 38 行（id / rev / immediately / inject）已在上文抓取，摘录关键几行：
- `@deepseek-ai/dsh-client-modules` — `inject:[]`, `immediately:true`（模块表自身，由 shell kernel 静态 adopt，不 fetch）
- `@deepseek-ai/dsh-client-connection` — `inject:[]`, `immediately:true`
- `@deepseek-ai/dsh-client-runtime` — `inject:[...connection, ...typert-registry, ...api-remotes]`, `immediately:true`
- `@deepseek-ai/dsh-client-ui-conversation` — `inject:[...connection, ...locale, ...runtime, ...ui-settings, ...api-remotes, ...ui-layout]`
- `@deepseek-ai/dsh-client-ui-input-trigger` — `inject:[...runtime, ...locale]`
- …（其余为 ui-tool / ui-cordis / ui-workflow-run / ui-deliverables / ui-workspace / ui-commands / ui-skill / ui-subagent / ui-jobs / ui-goal / ui-message-feedback / ui-model-selection / ui-permission-presets / ui-agent-preset / ui-settings-plugins / ui-plan / ui-user-questions / ui-trajectory / ui-directory-picker-native 等）

**外部依赖叶（react 等）不在 boot graph 里** —— 它们是 shell 内核的「platform seed words / staticModules」，由 shell 一次性共享：

- 文件：`dsh-client-web/lib/index.js` 第 165–178 行 `getStaticModules()` + 第 423–434 行 `PLATFORM_MODULES`：

```js
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-web-react",
  "@deepseek-ai/dsh-client-ui-primitives",   // 图标 IconPaperclipOutline16 / IconPlusOutline16 在这里
  "@deepseek-ai/dsh-client-ui-attachment",
  "@deepseek-ai/dsh-client-schema-form"
];
```
另有 `@deepseek-ai/dsh-client-modules`（`MODULES_ID`）和 `@deepseek-ai/dsh-client-app-shell`（`APP_SHELL_ID`）作为 static 注册。**这 10 个 specifier 就是每个 client bundle 里 `require()` 的「平台种子词」**；其余 `@deepseek-ai/dsh-*` 全是 graph 里的插件 bundle，跨插件值导入经 `require()` 递归物化。

### B6. dsh-client-modules：发现 / 伺服 / 注册契约

**结论**：client 插件的「登记」是零配置的 —— node 半边扫描 Loader entries，凡 `package.json` 声明 `dsh.client`（`platform:"web"`）且 `exports["./client"]` 存在的包，就被自动编入 `__DSH_BOOT__` 并伺服 `/plugins/<id>/client.js`。browser 半边是懒 CJS 模块表，`window.__ModuleLoader__.load({id, factory})` 是唯一注册入口。

- 文件：`dsh-client-modules/lib/index.js`（node 半边）
  ```js
  // resolveMeta: 判定一个包是否是 client 包
  const decl = parseDshClient(pkgName, pkg.dsh?.client);   // { platform, inject?, immediately? }
  if (decl === undefined || decl.platform !== "web") return null;
  const clientRel = clientExportOf(pkgName, pkg.exports);   // 读 exports["./client"]
  const meta = { clientPath: join(dirname(pkgPath), clientRel), ... };
  // graphRow： url = `/plugins/${id}/client.js?rev=${rev}`
  // serveBundle：GET/HEAD，读 clientPath（或 +".map"）→ text/javascript
  // constructor 里：ctx.effect(() => ctx.webServer.register({kind:"prefix", path:"/plugins", handler: this.serveBundle}))
  //                 ctx.effect(() => ctx.webServer.tapIndex((html) => injectBootManifest(html, this.composed)))
  ```

- 文件：`dsh-client-modules/lib/client.js`（browser 半边）——模块表契约（`ClientModuleSystem`）：
  ```js
  win.__ModuleLoader__ = { load: (handoff) => {
    if (this.factories.has(handoff.id)) throw ...;   // 重复注册即抛
    this.factories.set(handoff.id, handoff.factory);
  } };
  // materialize(id): record.exports = registered(this.makeRequire(edges));  ← factory(require) 的返回值就是模块导出
  // makeRequire: (spec) => seed → statics → stripClientSuffix(spec) → 已物化 record → 递归 materialize
  const stripClientSuffix = (spec) => spec.endsWith("/client") ? spec.slice(0, -7) : spec;
  ```

**注册契约（硬约束）**：
1. bundle 是经典 `<script>`，加载后顶层调用 `window.__ModuleLoader__.load({ id, factory })`。
2. `id` 必须是**包名**（如 `@scope/dsh-upload-button`），且与 graph row 的 `id` 一致。
3. `factory: (require) => exports`，`require(spec)` 按 `seed 词 → 其他插件 bundle` 解析；`factory` 的返回值就是该插件模块的导出。
4. **factory 导出就是 cordis 插件契约 `{ inject, apply }`**（`inject` 是浏览器 cordis 服务名数组；`apply(ctx)` 是插件体）。**不需要** `name` 字段（Loader 用 entry 的 `name` = 包名），**不需要** `default`。

### B7. 最小 client 插件的两侧契约（以 dsh-client-ui-theme 为例）

- browser 半边 `dsh-client-ui-theme/lib/client.js`（首尾）：
  ```js
  window.__ModuleLoader__.load({
    id: "@deepseek-ai/dsh-client-ui-theme",
    factory: (require) => {
      var module = { exports: {} };
      var exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
      let react_jsx_runtime = require("react/jsx-runtime");
      let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
      let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
      // ... 组件 + store + 样式注入 ...
      const inject = ["slots", "locale", "connection", "remote", "settingsScope"];  // 浏览器 cordis 服务名
      function apply(ctx) {
        ctx.provide("theme", theme);
        ctx.slots.inject("settings.general.item", () => ctx.slots.register({
          name: "settings.general.item", id: "appearance", order: 10, store, locale: SETTINGS_NS, inject: injected
        }, AppearanceRow));
      }
      exports.apply = apply;
      exports.inject = inject;
      return module.exports;
    }
  });
  ```

- node 半边（host 侧）`dsh-client-ui-conversation/lib/index.js`（`main`/`exports["."]`）：同一包在 host composition 里也是一个 cordis 插件，可注册 host 服务/设置：
  ```js
  function apply(ctx) {
    ctx.inject(["settings"], (settingsCtx) => {
      settingsCtx.settings.register(settingsNamespace("ui-conversation"), ConversationSettingsSchema);
    });
  }
  export { ..., apply };
  ```

**关键认识**：`dsh.client` 包是**双面（dual-face）**的 —— `exports["."]` = node 半边（跑在 host cordis 里，可注册 webServer 路由/settings/服务），`exports["./client"]` = browser 半边（跑在浏览器 cordis 里，注册 UI）。**一个包名在 cordis.patch.yml 里只登记一行，两个半边都被激活**（node 半边由 Loader 加载；browser 半边由 dsh-client-modules 扫描同名包发现）。

### B8. 构建方案（不用 monorepo，单独 esbuild）

**结论**：安装目录（npx 缓存）里**没有 esbuild**（`node_modules/esbuild` 与 `@deepseek-ai/../esbuild` 均不存在）。方案：新建独立 npm 包，esbuild 作为 devDependency（`npm i -D esbuild typescript`），产出 `lib/index.js`（node 半边，可手写）与 `lib/client.js`（browser 半边，esbuild 打包）。

- **入口**：`src/client.tsx`（浏览器半边，TS/JSX）。
- **external 列表**（必须在 bundle 里保持 `require()` 形式、映射到模块表）：10 个平台种子词 + 本插件要跨包值导入的 graph 插件。最小上传按钮只需：
  ```
  react, react/jsx-runtime, react-dom, react-dom/client,
  @deepseek-ai/cordis,
  @deepseek-ai/dsh-client-ui-slots,
  @deepseek-ai/dsh-client-web-react,
  @deepseek-ai/dsh-client-ui-primitives,
  @deepseek-ai/dsh-client-ui-attachment,
  @deepseek-ai/dsh-client-schema-form
  ```
  （若要跨包值导入 runtime 的类型/`defineStore`，追加 `@deepseek-ai/dsh-client-runtime/client` 等，并把其包名写进 `package.json` 的 `dsh.client.inject`。）
- **产物格式**：`--format=cjs`（esbuild 把 ESM 转成 `require(...)` 调用），再用 `banner`/`footer` 包上工厂信封。**这与官方包（tsdown 产物）逐字节同构**：
  ```js
  // build.mjs
  import { build } from "esbuild";
  await build({
    entryPoints: ["src/client.tsx"],
    bundle: true,
    format: "cjs",
    platform: "browser",
    jsx: "automatic",           // 产出 require("react/jsx-runtime")
    outfile: "lib/client.js",
    external: EXTERNALS,
    banner: { js: `window.__ModuleLoader__.load({ id: "@yourscope/dsh-upload-button", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });` },
    footer: { js: `return module.exports; } });` },
    sourcemap: true,            // 产物旁生成 lib/client.js.map，由 /plugins/<id>/client.js.map 伺服
    minify: false,
  });
  ```
- **bundle 大小**：仅 react 图标 + 一个按钮组件，几 KB（~5–15KB 未压缩）；`react`/`react-dom`/`primitives` 都 external，不打进 bundle。
- **sourcemap 要求**：`lib/client.js.map` 必须与 `lib/client.js` 同目录（`serveBundle` 用 `clientPath + ".map"` 伺服，`//# sourceMappingURL=client.js.map` 引用）。

---

## C. 上传后端

### C9. host 插件如何注册 HTTP 路由（dsh-host-webserver）

**结论**：`ctx.webServer` 服务提供路由注册；路径前缀无强制 `/api/`；鉴权/信任由**注册者自己**负责（webserver 只做路由分发，不鉴权、不限制 body）。`/api` 前缀的信任围栏和 body 上限在 `dsh-client-connection` 里。

- 文件：`dsh-host-webserver/lib/index.js`
  ```js
  var WebServer = class extends Service {
    static Config = z.object({ host: z.union([z.const("127.0.0.1"), z.const("0.0.0.0")]), port: z.natural().max(65535) });
    register(route) {        // route = { kind: "exact"|"prefix", path, handler(req,res) }
      const table = route.kind === "exact" ? this.exact : this.prefixes;
      if (table.has(route.path)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
      table.set(route.path, route);
      return () => { table.delete(route.path); };
    }
    registerUpgrade(route) {...}   // WebSocket 升级
    registerFallback(handler) {...} // SPA dist（仅一个）
    tapIndex(transform) {...}      // index.html 变换
    match(pathname) { /* exact 表先命中，否则 longest-prefix-wins 遍历 prefixes */ }
  };
  ```
- 匹配顺序：**exact 表 > 最长前缀**。所以注册 `{ kind:"prefix", path:"/api/upload" }` 会覆盖 `/api` 前缀（`/api` 由 client-connection 注册），把上传请求从「JSON-only RPC 桥」里分流出来。

- 信任模型（`dsh-client-connection/lib/index.js` + `types/api-request-trust.d.ts`）：
  - `isTrustedApiRequest(req, trustedHosts)`：防 DNS-rebinding（校验 Host）+ 防跨站（校验 Origin/Fetch-Metadata 同源）；`trustedHosts` 配置默认 `[]`（即 loopback-only）。
  - `PRIVILEGED_METHODS`（settings/credentials/host.pickDirectory 等）额外强制「空信任列表」= 只许 loopback。
  - 请求体：`maxRequestBodyBytes` 默认 **167772160**（160MB）；`assertImageBodyCapacity` 会按 `maxMessageImageBytes*4/3 + 1MB` 校验。这些**只在 client-connection 的 `/api` 桥里生效**；你自己的路由要自己实现 body 上限。
  - `/api` 桥只收 `Content-Type: application/json`（`fetch/handler.js` 第 208–211 行，415 拒绝），作为跨站写围栏。

**因此**：自定义上传路由必须 (a) 自己校验信任（至少 loopback Host + 拒绝跨站 Origin），(b) 自己限制 body 字节数，(c) 若允许任意文件则不能用现有 `session.prompt` 的「仅图片 base64」通道，需新端点。

### C10. 现有图片上传走什么端点 / 客户端调用

**结论**：**没有独立的上传 HTTP 端点**。图片随 `session.prompt` RPC 一起以 **base64 内联**上传，host 在 `durablePromptContent` 里解码 → 校验 → 存 `attachments.saveImage` → 把 `{type:"image", attachment:<ref>}` 写入持久化事件。`dsh-attachment-local` 只是存储后端（`AttachmentStore` 子类），不注册任何路由。

- host 半边（`dsh-host-apiproxy/lib/types/api-proxy.js` 第 62–107 行）：
  ```js
  function decodeBase64(data) { const decoded = Buffer.from(data, "base64");
    if (decoded.toString("base64") !== data) throw new AttachmentError(..., "INVALID_IMAGE_BASE64"); ... }
  async function durablePromptContent(ctx, content) {
    const limits = ctx.attachments.imageLimits;                     // 来自 attachment store 配置
    // 数量/总字节/单图像素校验
    for (const image of images) await ctx.attachments.validateImage({ data, mediaType, name? });
    for (const item of prepared) {
      const attachment = await ctx.attachments.saveImage({ data, mediaType, name? });
      blocks.push({ type: "image", attachment });
    }
  }
  ```
- 客户端编码（`dsh-client-ui-conversation/lib/client.js` 第 270–294 行）：
  ```js
  serializeImages(images) { return Promise.all(images.map(async (file) => ({
    type: "image", mediaType: imageMediaType(file.type),       // 仅 png/jpeg/webp/gif
    data: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    ...(file.name === "" ? {} : { name: file.name })
  }))); }
  ```
- 读取回显：`session.attachment` RPC（`{sessionId, attachmentId}` → 校验会话是否引用过该附件 → 返回 bytes）。
- 限制默认值（`dsh-attachment-local/lib/index.js`）：`maxImageBytes=5MB`、`maxImagesPerMessage=20`、`maxMessageImageBytes=100MB`、`maxImagePixels=4e7`。

### C11. browser 侧如何发 /api；往会话发消息 / 写 composer 的 API

**结论**：存在两条通知链路，都可直接用。

- **发 /api**：`ctx.connection` 服务（`dsh-client-connection/lib/client.js` 第 10165–10200 行）：
  ```js
  const handle = {
    api,               // WebApiClient（extends AbstractApiClient：sessions.prompt / attachment / ...）
    isLoopback, hostDescription, rpc,
    start(sinks, config) {...}
  };
  ctx.provide("connection", handle);
  ```
  `AbstractApiClient.callUnary(method, payload)` → `postJson("/api/<method>", {type:"client-request", rpcId, method, payload})`，`Content-Type: application/json`，无显式 session 头（**会话身份在 payload 里**，如 `session.prompt` 的 `{sessionId, content, mode}`）。`rpc.call(channel, endpoint, payload)` 也是 JSON。自定义上传若用二进制，最直接是 `globalThis.fetch(url, {method:"POST", body: ...})`（同源）。

- **往当前会话插入一条用户消息（直接发送）**：`ctx.sessions` 服务 → `SessionFace.prompt`。
  - 文件：`dsh-client-runtime/lib/types/client/contract/session.d.ts`
    ```ts
    export interface ISession {
      readonly sessionId: SessionId;
      prompt(content: PromptContentPart[], mode: "queue" | "steer"): Promise<RpcResult<{accepted:true}>>;
      command(line: string): Promise<RemoteResult<{matched:boolean}>>;
      cancel(): ...; readAttachment(id): ...; updateQueue(...): ...; rename(...): ...; loadOlder(): ...;
    }
    export type SessionFace = ISession & ObservableSnapshot<ConversationSnapshot>;
    ```
  - `ctx.sessions`（`ISessions`）提供 `scopeOf(ctx)` / `sessionOf(ctx)` / `binding(sessionId)` / `scope(sessionId)`。在 session-scope 组件里用 `useSession` 拿 `sessionId`，再 `ctx.sessions.binding(sessionId).session.prompt([{type:"text", text}], "queue")`。

- **向 composer 写入文本（不自动发送，推荐）**：标准 kit 的 `inputActions.setDraft(text)`（+ 可选 `submit()`）。
  - 文件：`dsh-client-ui-conversation/lib/types/client/input/contract.d.ts`
    ```ts
    export interface InputActions {
      setDraft(text: string): void;      // 单一公开草稿写路径（全量覆盖）
      addImages(ids): boolean; removeImage(id): void; pruneImages(ids): void;
      submit(): void;
    }
    ```
  - 另有 `SessionInput.notify(level, text)`（在 composer 上方弹 notice）。

---

## 推荐实现设计（可直接照做）

### 目标
在 composer「+」按钮旁新增一个「上传文件」按钮：点按 → 系统文件选择器 → 上传到 host → 落盘 → 把保存后的**绝对路径**写入 composer 草稿（用户确认后发送给 agent）。

### 需要的包：**一个双面 cordis 插件包**（host 半边 + client 半边）

```
dsh-upload-button/
├── package.json
├── src/
│   ├── index.ts        # node 半边（host）：注册 HTTP 上传路由
│   └── client.tsx      # browser 半边：上传按钮组件 + slot 注册
├── build.mjs           # esbuild 打包 browser 半边
└── lib/                # 构建产物（client.js / client.js.map / index.js 由 tsc 或手写）
```

#### `package.json` 关键字段
```jsonc
{
  "name": "@yourscope/dsh-upload-button",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/client.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": [],            // browser 半边跨包值导入的 client 包名（最小为 []）
      "platform": "web"
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-invariants": "^0.1.0-rc.6",
    "react": "^18.2.0"
  },
  "devDependencies": { "esbuild": "*", "typescript": "*", "@types/react": "~18.3.1" }
}
```

#### node 半边 `src/index.ts`（host 上传路由）
```ts
import { Context } from "@deepseek-ai/cordis";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const inject = ["webServer"];
export const name = "upload-button";

const MAX_BYTES = 64 * 1024 * 1024;   // 自己的 body 上限

export function apply(ctx: Context) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/api/upload",            // 覆盖 client-connection 的 /api 前缀（longest-prefix-wins）
    handler: async (req, res) => {
      // 1) 最小信任围栏：仅 loopback + 同源（客户端-connection 的 isTrustedApiRequest 是包内私有，需自行实现）
      const host = req.headers.host ?? "";
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) { res.writeHead(403); res.end("forbidden"); return; }
      const origin = req.headers.origin;
      if (origin !== undefined) { /* 校验 origin === 本服务 origin，否则 403 */ }
      if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
      // 2) 读流 + 限长
      const chunks: Buffer[] = []; let total = 0;
      for await (const c of req) { total += c.length; if (total > MAX_BYTES) { res.writeHead(413); res.end(); return; } chunks.push(c); }
      const buf = Buffer.concat(chunks);
      const name = sanitize(decodeURIComponent(req.headers["x-file-name"] ?? "upload.bin"));
      // 3) 落盘到 DSH_HOME/uploads（或当前 workspace cwd）
      const dir = join(resolveDshHome(ctx.get("dshHomePath")?.()), "uploads");
      await mkdir(dir, { recursive: true });
      const digest = createHash("sha256").update(buf).digest("hex").slice(0, 12);
      const dest = join(dir, `${digest}-${name}`);
      await writeFile(dest, buf);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ path: dest }));
    },
  }), "upload-button: upload route");
}
```

> 说明：若只想复用现有图片通道、不写新路由，可改用 `session.prompt` 的 base64 图片 + `readAttachment` 回显；但那**只支持 4 种图片格式**，不能满足「任意文件上传」。通用文件必须走自建路由。

#### browser 半边 `src/client.tsx`（上传按钮）
```tsx
import { jsx } from "react/jsx-runtime";
import { IconPaperclipOutline16, Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState } from "react";

export const inject = ["slots"];          // 浏览器 cordis 服务名

function UploadButton({ inputActions, disabled }: any) {
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file"; input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      setBusy(true);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "x-file-name": encodeURIComponent(file.name) },
          body: file,                       // 直接传 File（同源 fetch）
        });
        const { path } = await res.json();
        inputActions?.setDraft(path);       // ← 上传成功：把路径写进 composer 草稿
      } finally { setBusy(false); }
    };
    input.click();
  };
  return jsx(Tooltip, { label: "上传文件", side: "top", children:
    jsx("button", { type: "button", className: "", disabled: disabled || busy,
      onClick: pick, children: jsx(IconPaperclipOutline16, { size: 14 }) }) });
}

export function apply(ctx: any) {
  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
    name: "conversation.input.left",
    id: "upload-file-button",
    order: 0,                                // 排最前，紧邻「+」按钮与 access/plan 组之后
  }, UploadButton));
}
```

#### 构建命令 `build.mjs`
```js
import { build } from "esbuild";
const EXTERNALS = ["react","react/jsx-runtime","react-dom","react-dom/client",
  "@deepseek-ai/cordis","@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-web-react","@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-attachment","@deepseek-ai/dsh-client-schema-form"];
await build({
  entryPoints: ["src/client.tsx"], bundle: true, format: "cjs", platform: "browser",
  jsx: "automatic", outfile: "lib/client.js", external: EXTERNALS, sourcemap: true,
  banner: { js: `window.__ModuleLoader__.load({ id: "@yourscope/dsh-upload-button", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });` },
  footer: { js: `return module.exports; } });` },
});
```
node 半边：`npx tsc src/index.ts --outDir lib`（或手写 `lib/index.js`）。然后 `node build.mjs`。

### profile 登记方式
`dsh` 用 profile = `$DSH_HOME/profiles/<name>/`（`web` profile 模板 bundles = `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]`），合成方式 = 按 `dsh.profile.bundles` 顺序叠加每个 bundle 的 `cordis.patch.yml`，再加 profile 自己的 `cordis.patch.yml`（热重载）。条目格式（`dsh-web-app/cordis.patch.yml` 为证）：

```yaml
# $DSH_HOME/profiles/web/cordis.patch.yml（或 --patch 覆盖层）
- insert:
    - id: upload-button
      name: '@yourscope/dsh-upload-button'     # 一行同时激活 node 半边 + browser 半边
```

- node 半边由 Loader 按 `name` 加载（`apply` 注册 `/api/upload` 路由）。
- browser 半边被 `dsh-client-modules` 扫描到（`dsh.client` + `exports["./client"]`），自动编入 `__DSH_BOOT__` 并伺服 `/plugins/@yourscope/dsh-upload-button/client.js`，**无需再改 boot graph**。
- 若插件不是 bundle 而是普通 out-of-tree 包，需保证 `$DSH_HOME/profiles/<name>/node_modules` 或安装锚点能解析到它（`dsh plugin --profile web install` / pnpm）。

### 上传成功后的通知链路（推荐）
1. 用户点按钮 → 文件选择器 → `fetch("/api/upload", {method:"POST", body: file, headers:{"x-file-name": name}})`。
2. host 落盘并返回 `{ path }`。
3. 组件拿 `inputActions.setDraft(path)` 把绝对路径写进 composer（**不自动发送**，让用户确认）。
4. （可选）更激进：用 `ctx.sessions.binding(sessionId).session.prompt([{type:"text", text: path}], "queue")` 直接发送一条用户消息。
5. （可选）失败时 `SessionInput.notify("error", ...)` 在 composer 上方弹 notice。

### 风险与未知点
1. **信任围栏要自己实现**：`isTrustedApiRequest` 是 `dsh-client-connection` 包内私有（`api-request-trust` 未从公共 exports 导出），新路由绕过了 `/api` 桥的 DNS-rebinding/跨站防护，必须自实现（至少 loopback Host 校验 + Origin 同源校验 + `Content-Type` 白名单）。
2. **body 上限要自己实现**：`maxRequestBodyBytes`（160MB）只在 client-connection 的 `bridge()` 生效，自建路由无默认限制。
3. **上传目标目录语义**：`dsh-attachment-local` 只存图片、内容寻址；通用文件应落到 `DSH_HOME/uploads` 或当前 session 的 `cwd`（workspace）。后者需从 `ctx.sessions` 或请求参数拿到 `sessionId`/`cwd`，否则路径对 agent 不可见（agent 的 cwd 是 workspace）。
4. **文件对 agent 的可见性**：agent 运行在 sandbox/workspace 里，`DSH_HOME/uploads` 可能不在其可读根内。推荐落盘到 workspace（`cwd`）或其可读目录，或返回路径后由 agent 的 fs 工具读取。
5. **`conversation.input.left` 的位置**：在 access-mode + plan 组**之后**，不在「+」按钮正右方；若必须紧贴「+」，需要更高的扩展方式（当前无 slot 插在「+」与 modes 之间——这是唯一的布局空隙，需 patch InputBar 才能做到，属于「hook composer」的兜底）。
6. **`dsh.client.inject` 与 bundle 的 `require` 一致性**：browser 半边若要跨包值导入（如 `@deepseek-ai/dsh-client-runtime/client`），其包名必须同时出现在 `package.json` 的 `dsh.client.inject` 与 esbuild 的 `external` 列表，否则运行时 `require()` 会「missed the module table」抛错。
7. **esbuild cjs 互操作**：esbuild `--format=cjs` 的 `__toCommonJS` 会额外生成 `default` 导出；cordis Loader 读 `apply`/`inject` 命名导出即可，但为 100% 对齐官方产物，建议 export 命名 `apply`/`inject` 并确认 Loader 端无 `default` 依赖（已观察到官方 bundle 均无 `default`）。
8. **改 bundle 后需重启/重刷**：`dsh-client-modules` 的包元数据按名缓存不失效（「plugin-set changes take effect on restart」）；bundle 内容变更需经 `ClientModuleRegistry.rebuilt()`（HMR watcher）或重启 host 才会进 graph；Web 端刷新页面即可拿到新 rev（URL 带 `?rev=` 缓存破号）。
9. **未知：`apply` 里拿到当前 session 的时机**——slot 组件的 `inputActions` 是 per-session 标准 kit（自动绑定当前会话），最稳妥；用 `ctx.sessions.binding()` 需自己处理「无当前会话」态（`sessionId` undefined）。

---

## D. 补充深挖：输入机 occurrence 管线（2026-08 实测，dsh-upload-button 最终采用的方案）

> 结论：**要让"文件以图形化芯片出现在输入框里、按原有发送键自动附带、发送后自动消失"，
> 唯一完全官方的机制是输入机的 occurrence（占位符）管线**——@引用和斜杠命令芯片走的就是它。
> 零发送拦截、零 hook composer、零自定义 store。

### D1. 数据模型（`dsh-client-ui-conversation/lib/types/client/input/contract.d.ts`）

- `InputState`（输入机发布的会话级状态，通过 `SessionInput.state`（SnapshotStore）或 slot 组件的 `useInput` 读取）：
  `{ draft, imageIds, draftRev, phase, claim?, occurrences, paste?, queue }`
- **`Occurrence`**：`{ occurrenceId, source, ref, offset, label, clipboardText, invalid? }` ——
  草稿中每个 `U+FFFC` 占位符对应一条；`offset` 是占位符在草稿中的位置（占恰好 1 字符）；
  `label` 是芯片显示文本（**插入时缓存**）；`clipboardText` 是复制/剪贴板投影；
  **`source` 是序列化路由键**——提交时按 source 名找 codec 产出"模型文本"。
- 发生器的 diff 扫描：`setDraft(text)` 是"完整下一份草稿"，机器用前缀/后缀 diff 推算 occurrence 增删
  （占位符消失 → occurrence 被丢弃）。**删除芯片 = 退格删除占位符，原生文本编辑语义。**

### D2. 插入芯片（官方事件）

`InputTriggerSource` 定义在 `dsh-client-ui-input-trigger/lib/types/types.d.ts`：

- `ReferenceInsert = { source, ref, label, clipboardText }`
- `TokenSpan = { start, end, draftRev }`（draftRev CAS：草稿被改过则整个插入 no-op）
- 官方作用域事件（`declare module '@deepseek-ai/cordis' { interface Events }`，bail 模式，
  "带 session 作用域载体，由该会话的输入监听器返回 true 表示已应用"）：
  `'slash/input-insert-reference'(request: { reference, span }): true | undefined`
- 用法（来自 dsh-upload-button 实测）：
  ```ts
  const actx = ctx.sessions.scope(sessionId)          // 会话作用域 ctx
  const conversation = actx.get('conversation')       // ui-conversation 的会话服务
  const input = conversation.input.for(actx)          // 完整 SessionInput 门面
  const state = input.state.getSnapshot()             // { draft, draftRev, occurrences, ... }
  actx.emit('slash/input-insert-reference', {
    reference: { source, ref, label, clipboardText },
    span: { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev }
  })
  // 验证：重读 state，检查 occurrences 里是否出现了本 source+ref
  ```

### D3. 提交时序列化（codec）

- 输入机提交时（`sinkSerialized`，ui-conversation client.js）：对每条 occurrence 调用
  `inputTriggers.serializeReference(o.source, o.ref, signal)` → 逐段替换草稿中的占位符 →
  `defaultSink(展开后的文本, imageIds, mode)`。**owner 缺失/序列化失败会阻断发送并弹 notice，
  绝不静默降级为 clipboardText。**
- 服务：`ctx.inputTriggers`（服务名 `inputTriggers`，`InputTriggerService`）。
- 注册：`ctx.inputTriggers.registerSource(src: InputTriggerSource): () => void`（(trigger, name) 唯一；
  返回 disposer，应包在 `ctx.effect` 里）。
- `InputTriggerSource` 必需字段：`trigger`（'/'|'@'）、`name`、`candidates()`、`onPick()`；
  可选 `codec: ReferenceCodec = { clipboardText(ref), serialize(ref, signal): Promise<string> }`。
  **只做 codec、不参与菜单**的最小源：`candidates: async () => []`（空候选组）、`onPick: () => undefined`。
- 序列化查表：`serializeReference` 按 **name**（不看 trigger）在 roster 中找 owner → `owner.codec.serialize(ref, signal)`。

### D4. 芯片渲染

- `deriveDecorations(state, lexicon)`：`chips = occurrences.map(o => ({ occurrenceId, offset, label, invalid }))`
  ——**任何 source 的 occurrence 都会渲染**（label 显示、invalid 加样式、`title`=label），
  由 InputBar 的 mirror 层渲染在 textarea 后景（`data-decoration="chip"`）。
- 芯片无内建移除按钮：删除靠退格（原生）。若要做 ✕ 按钮需自建 UI（官方无此扩展点）。
- 图片附件不走 occurrence（走 `imageIds` + AttachmentRail），不要混用。

### D5. 与最初设计（A/B/C 节）的差异

- 废弃了 `conversation.input.dock` 文件卡片 + 自定义 defineStore 共享状态的方案：
  芯片直接进入草稿后，dock 冗余（状态已在输入机里）、不需要 store（无跨组件共享状态）、
  不需要"发送"拦截（occurrence 序列化天然完成"发送时附带"）。
- `inputActions.setDraft(path)` 裸写路径的方案也被替代：草稿里是芯片（图形化），
  只有提交后的消息里才是路径文本。

### D6. 遗留风险

- 我们的源注册在 `@` trigger 下且零候选：若菜单不隐藏空组，`@` 菜单会出现一个空分组头（上游行为待确认）。
- occurrence 删除后服务器文件不清理（内容寻址存储，无 GC）；DELETE 端点保留给程序化清理。
- `dsh.client.inject` 是 bundle 加载序依赖（如 sessions 服务的提供包），与 esbuild external 列表
  是两回事：只有"值导入"才必须两者一致。
