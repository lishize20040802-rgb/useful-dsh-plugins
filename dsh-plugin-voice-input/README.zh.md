# dsh-plugin-voice-input

DeepSeek Harness 输入框的「按住说话」语音输入插件，识别由火山引擎**豆包流式语音识别**
（大模型流式语音识别，`bigmodel_nostream` 模式）完成——豆包 App 同款识别技术。

按住输入框工具栏的麦克风按钮说完一句话松开（或在应用内任意位置**按住 Alt，再按
`` ` `` 和 `1`**），识别文字自动填进输入框，你审阅后再发送。草稿永远不会被
自动发送，说话时鼠标可以自由滚动上下文；没按 Alt 时 `` ` `` 和 `1` 照常输入，
不会被禁用。

## 功能

- **浏览器半边** —— 输入框工具栏的按住说话按钮（`conversation.input.left`，位于上传按钮
  之后）加应用级「按键说话」快捷键（默认**按住 Alt 再按 `` ` `` 和 `1`**）。录制 16 kHz
  单声道 PCM，在浏览器端编码为 WAV，POST 到宿主机的 `/api/asr` 路由，通过官方
  `inputActions.setDraft` 通道把识别文字追加到草稿。
- **Node 半边** —— 在宿主 webserver 上注册 `/api/asr`（与官方上传路由相同的
  loopback/同源信任围栏），把音频经 openspeech 二进制 WebSocket 协议流式上传
  （gzip 压缩的 full request → 带序号的音频帧 → 负包），并把错误映射为友好提示。

## 安装

1. 确保语音技术控制台已开通**流式语音识别大模型**（资源 ID
   `volc.bigasr.sauc.duration`，即 1.0 小时版）。
2. 把插件加入 web profile。本地开发目录方式，编辑
   `~/.dsh/profiles/web/package.json`：

   ```json
   "dependencies": {
     "dsh-plugin-voice-input": "link:D:/harness/dsh-plugin-voice-input"
   },
   "dsh": { "profile": { "bundles": [ ..., "dsh-plugin-voice-input" ] } }
   ```

   然后在 profile 目录执行 `pnpm install`，重启应用。

## 配置

把凭证（语音技术控制台服务详情页的 **API ID + Access Token**）写在 profile 的
patch 层——密钥只留在本地配置里，绝不进入代码：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: voice-input
  config:
    appId: '<你的 API ID>'
    accessToken: '<你的 Access Token>'
```

也可以设置 `VOLC_APP_ID` / `VOLC_ACCESS_TOKEN` 环境变量。patch 层还支持
`resourceId`（默认 `volc.bigasr.sauc.duration`）、`wsUrl`、`language`（默认
`zh`）、`maxBytes`（默认 64 MB）、`timeoutMs`（默认 120 秒），以及
`maxSeconds`——客户端录音的安全上限（秒），默认 600（10 分钟），`0` 表示
不限。豆包流式识别上游没有文档化的时长上限，`maxSeconds` 只是防止忘记
松手导致一直录音。

`hotkey` 设置按键说话手势：OS 修饰键武装组合键——`Modifier+Key…`
（`AltLeft+Backquote+Digit1`，默认：**按住 Alt，再按 `` ` `` 和 `1`**）。
修饰键未按下时触发键照常输入，任何键都不会被禁用。也支持普通键/组合
（`F8`、`Backquote+Digit1`，此时第一个键充当永不输出的修饰键）。
`''`/`'none'`/`'off'` 关闭快捷键（麦克风按钮仍可用）。`Alt`/`Ctrl`/`Shift`/
`Win` 简写会映射到左手边按键。防漏字三层防线：keydown 拦截 + beforeinput
拦截 + 武装期间对焦点编辑器临时 `readOnly` 硬锁——这是因为微软拼音等输入法
会经 OS 文本框架直接提交字符（`` ` `` → "·"），绕开页面按键事件。

## 安全说明

- 凭证只在服务端读取，绝不回传浏览器。
- 路由只接受 loopback 同源请求并强制字节上限；音频不进入草稿，识别文字也不会上传
  到任何其他服务。
- 把凭证当密码对待：一旦出现在聊天记录或截图中，请到控制台重置 Access Token，
  然后更新 patch 文件。

## 开发

```bash
npm install
npm run build     # tsc 类型检查 + esbuild（node / 浏览器双 bundle）
npm test          # 针对构建后的 node 半边跑 node --test
```

真实接口联调（需要环境变量凭证 + 一段 WAV）：

```bash
VOLC_APP_ID=... VOLC_ACCESS_TOKEN=... node scripts/live.mjs test/sample-zh.wav
```

## License

MIT
