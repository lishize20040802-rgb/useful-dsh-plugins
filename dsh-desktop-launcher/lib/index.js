// src/index.ts
import z from "@deepseek-ai/schemastery";
var name = "desktop-launcher";
var inject = [];
var NAMESPACE = "desktop-launcher";
var DEFAULT_HOST = "127.0.0.1";
var DEFAULT_PORT = 3080;
var Config = z.object({
  host: z.string().default(DEFAULT_HOST),
  port: z.natural().min(1).max(65535).default(DEFAULT_PORT),
  autoOpen: z.boolean().default(false)
});
function normalizeConfig(raw) {
  const config = raw ?? {};
  return {
    host: typeof config.host === "string" && config.host.trim() ? config.host.trim() : DEFAULT_HOST,
    port: typeof config.port === "number" && Number.isInteger(config.port) && config.port >= 1 && config.port <= 65535 ? config.port : DEFAULT_PORT,
    autoOpen: config.autoOpen === true
  };
}
function apply(ctx, rawConfig) {
  ctx.inject(["settings"], (sctx) => {
    const scope = sctx.settings.register(NAMESPACE, Config, {
      base: rawConfig ?? {},
      applies: "live"
    });
    scope.get();
    sctx.effect(() => {
      const log = (entry) => {
        console.log(`[dsh-desktop-launcher] serving on http://${entry.host}:${entry.port}`);
      };
      log(scope.get());
      const off = scope.watch(() => log(scope.get()));
      return () => off();
    }, "desktop-launcher: launch log");
  });
}
export {
  Config,
  DEFAULT_HOST,
  DEFAULT_PORT,
  NAMESPACE,
  apply,
  inject,
  name,
  normalizeConfig
};
