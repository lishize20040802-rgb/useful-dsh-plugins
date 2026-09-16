# dsh-plugin-vision-reader

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 社区插件：粘贴图片保存到本地，同时保留发给主模型的原图；另提供 `vision` 工具，用已配置的多模态模型做独立读图。

## 安装和卸载

从仓库 Release 下载发布包，或在本目录构建后运行 `npm pack --ignore-scripts`：

```sh
dsh plugin --profile web add ./dsh-plugin-vision-reader-0.2.2.tgz --ignore-scripts
# 重启 DSH 并刷新网页。
dsh plugin --profile web remove dsh-plugin-vision-reader
```

依赖和 bundle 注册由官方 DSH/pnpm 管理。卸载保留已保存图片；若用户 patch 另有 `vision-reader` 覆盖，卸载时一并删除那条覆盖。

## 配置

`vision-reader` 行支持 `provider`、`model`、`instruction`、`inboxDir`。图片目录留空时使用官方 DSH home 下的 `vision-inbox`；显式目录继续使用原位置。

默认独立读图路由为 `deepseek-official / deepseek-v4-flash-vision-exp`，可改为宿主和账号支持的模型。调用复用宿主已有凭据，可能产生对应提供商费用；仓库不携带密钥。主对话模型需要支持图片输入。

## 模型体验与 KV Cache

原图留在用户消息中，插件补充保存路径和 vision 工具定义。图片与工具结果按宿主、提供商规则占用上下文；保存文件不会自动减少图片 token，也不保证缓存命中。

## 兼容性与限制

已核对 SDK **0.1.5-rc.2**。SDK 使用 external peer 依赖，允许版本范围内更新；`testedDSHVersions` 单独记录实际测试版本。升级其他版本前应重新构建和测试。浏览器侧使用官方 locale、slot 服务；完整卸载仍以重启 DSH 并刷新网页为准。

支持 PNG、JPEG、WebP、GIF，每次最多 10 张图片。保存失败时仍保留对话中的原图。远程默认模型的可用性可能变化，插件不保证未来仍能调用该模型。

## 开发

先安装仓库公共开发依赖，再安装本包开发依赖，运行 `npm run build`、`npm test`。构建包含类型检查、宿主和浏览器 bundle、类型声明，并排除 source map。测试使用合成图片及模型替身，不调用真实模型。

## 许可

[MIT](LICENSE)。

## 数据路径

`inboxDir` 留空时固定到官方 DSH home 下的 `vision-inbox`。显式相对路径（例如 `data/vision-inbox`）也相对 `DSH_HOME` 解析，`~/` 相对系统用户目录；已有绝对路径保留，不搬动数据。加载插件时确定绝对锚点，之后改变启动工作目录不会改写保存位置。包内静态资源仍通过模块位置解析；文档或附件的用户输入路径继续按会话工作区处理。
