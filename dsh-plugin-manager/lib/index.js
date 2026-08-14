// src/index.ts
import z from "@deepseek-ai/schemastery";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
var name = "plugin-manager";
var inject = ["webServer"];
var MANAGED_MARKER = "# dsh-plugin-manager managed entry";
var LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
var DEFAULT_MAX_BODY = 64 * 1024;
var execFileAsync = promisify(execFile);
var Config = z.object({
  profileDir: z.string(),
  maxBodyBytes: z.number().default(DEFAULT_MAX_BODY)
});
function isValidId(id) {
  return typeof id === "string" && /^[A-Za-z0-9@._/-]+$/.test(id) && id.length <= 200;
}
function addManagedDisable(content, id) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i] === MANAGED_MARKER && lines[i + 1] === `- id: ${id}` && lines[i + 2] === "  disabled: true") {
      return { content, changed: false };
    }
  }
  let base = content;
  if (base !== "" && !base.endsWith("\n")) base += "\n";
  return { content: `${base}
${MANAGED_MARKER}
- id: ${id}
  disabled: true
`, changed: true };
}
function removeManagedDisable(content, id) {
  const lines = content.split("\n");
  const kept = [];
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === MANAGED_MARKER && lines[i + 1] === `- id: ${id}` && lines[i + 2] === "  disabled: true") {
      changed = true;
      i += 2;
      continue;
    }
    kept.push(lines[i]);
  }
  return { content: kept.join("\n"), changed };
}
function listManaged(content) {
  const lines = content.split("\n");
  const ids = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === MANAGED_MARKER) {
      const match = /^- id: (.+)$/.exec(lines[i + 1] ?? "");
      if (match !== null) ids.push(match[1]);
    }
  }
  return ids;
}
function removeAllManaged(content) {
  const lines = content.split("\n");
  const kept = [];
  let removed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === MANAGED_MARKER) {
      removed++;
      i += 2;
      continue;
    }
    kept.push(lines[i]);
  }
  return { content: kept.join("\n"), removed };
}
async function resolveProfileDir(preferred) {
  if (preferred !== void 0 && preferred !== "") return preferred;
  const home = resolveDshHome();
  const profilesRoot = join(home, "profiles");
  const names = await readdir(profilesRoot).catch(() => []);
  const candidates = [];
  for (const name2 of names) {
    try {
      const manifest = JSON.parse(await readFile(join(profilesRoot, name2, "package.json"), "utf8"));
      const bundles = manifest?.dsh?.profile?.bundles ?? [];
      if (bundles.includes("dsh-plugin-manager") || bundles.includes("useful-dsh-plugins")) {
        candidates.push(join(profilesRoot, name2));
      }
    } catch {
    }
  }
  if (candidates.length === 1) return candidates[0];
  for (const candidate of candidates) {
    try {
      await readFile(join(candidate, "node_modules", "dsh-plugin-manager", "package.json"), "utf8");
      return candidate;
    } catch {
    }
  }
  if (candidates.length > 0) return candidates[0];
  throw new Error(`cannot locate the active profile under ${profilesRoot}; configure "profileDir" explicitly`);
}
async function readPkgVersion(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    return typeof pkg?.version === "string" ? pkg.version : void 0;
  } catch {
    return void 0;
  }
}
async function profilePackages(profileDir) {
  const root = join(profileDir, "node_modules");
  const entries = await readdir(root).catch(() => []);
  const out = [];
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "pnpm") continue;
    if (entry.startsWith("@")) {
      const subs = await readdir(join(root, entry)).catch(() => []);
      for (const sub of subs) {
        const version = await readPkgVersion(join(root, entry, sub));
        if (version !== void 0) out.push({ name: `${entry}/${sub}`, installed: version });
      }
    } else {
      const version = await readPkgVersion(join(root, entry));
      if (version !== void 0) out.push({ name: entry, installed: version });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
async function npmLatest(name2) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name2)}/latest`, {
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.version === "string" ? json.version : null;
  } catch {
    return null;
  }
}
async function npmMetadata(name2, version) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name2)}/${encodeURIComponent(version)}`, {
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json?.dist?.tarball !== "string") return null;
    return { version: json.version, tarball: json.dist.tarball };
  } catch {
    return null;
  }
}
var requireFromHere = createRequire(import.meta.url);
async function installedPackageDir(name2) {
  try {
    return dirname(requireFromHere.resolve(`${name2}/package.json`));
  } catch {
  }
  const fallback = join(resolveDshHome(), "profiles", "node_modules");
  const scope = name2.startsWith("@") ? name2.slice(0, name2.indexOf("/")) : void 0;
  const base = scope !== void 0 ? name2.slice(name2.indexOf("/") + 1) : name2;
  const entries = await readdir(scope !== void 0 ? join(fallback, scope) : fallback).catch(() => []);
  for (const entry of entries) {
    if (scope !== void 0 ? entry !== base : entry !== name2) continue;
    const linkPath = scope !== void 0 ? join(fallback, scope, entry) : join(fallback, entry);
    try {
      const target = await readlink(linkPath);
      const resolved = resolveRelative(linkPath, target);
      try {
        await readFile(join(resolved, "package.json"), "utf8");
        return resolved;
      } catch {
      }
    } catch {
    }
  }
  throw new Error(`cannot locate installed package "${name2}"`);
}
function resolveRelative(linkPath, target) {
  if (target.startsWith("\\\\?\\") || /^[A-Za-z]:[\\/]/.test(target) || target.startsWith("/")) return target;
  return join(dirname(linkPath), target);
}
async function repairPackage(name2, version) {
  const meta = await npmMetadata(name2, version);
  if (meta === null) throw new Error(`cannot fetch registry metadata for ${name2}@${version}`);
  const targetDir = await installedPackageDir(name2);
  const staging = join(targetDir, `..`, `.dsh-repair-${Date.now()}`);
  const tarballPath = `${staging}.tgz`;
  try {
    await mkdir(staging, { recursive: true });
    const res = await fetch(meta.tarball, { signal: AbortSignal.timeout(12e4) });
    if (!res.ok) throw new Error(`tarball download failed: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeFile(tarballPath, bytes);
    try {
      await execFileAsync("tar", ["-xzf", tarballPath, "-C", staging], { timeout: 12e4, windowsHide: true });
    } catch (err) {
      throw new Error(`tar extraction failed (is tar available on PATH?): ${err?.message ?? String(err)}`);
    }
    const extracted = join(staging, "package");
    try {
      await readFile(join(extracted, "package.json"), "utf8");
    } catch {
      throw new Error("tarball did not contain a package/ directory");
    }
    await rm(targetDir, { recursive: true, force: true });
    await rename(extracted, targetDir);
    return { ok: true, replaced: true, version: meta.version };
  } catch (err) {
    const message = err?.message ?? String(err);
    if (/EBUSY|EPERM|ENOTEMPTY/.test(message)) {
      return { ok: false, replaced: false, version: meta.version, note: "package files are in use \u2014 close dsh web, restart, then click \u4FEE\u590D again" };
    }
    return { ok: false, replaced: false, version: meta.version, note: message };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {
    });
    await rm(tarballPath, { force: true }).catch(() => {
    });
  }
}
function createHandler(options) {
  const { profileDir, maxBodyBytes } = options;
  const patchFile = join(profileDir, "cordis.patch.yml");
  const json = (res, status, payload) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  const readPatch = async () => {
    const content = await readFile(patchFile, "utf8").catch(() => "[]\n");
    return content;
  };
  const writePatch = async (mutate) => {
    const before = await readPatch();
    const result = mutate(before);
    const content = result?.content ?? result;
    await mkdir(dirname(patchFile), { recursive: true });
    const tmp = `${patchFile}.tmp`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, patchFile);
    return result;
  };
  const readBody = async (req) => {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBodyBytes) throw { status: 413, message: "payload too large" };
      chunks.push(chunk);
    }
    if (total === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw { status: 400, message: "invalid JSON body" };
    }
  };
  return async (req, res) => {
    try {
      const host = String(req.headers?.host ?? "");
      if (!LOOPBACK_HOST.test(host)) return json(res, 403, { error: "forbidden: non-loopback host" });
      const origin = req.headers?.origin;
      if (origin !== void 0) {
        const scheme = req.socket?.encrypted ? "https" : "http";
        if (origin !== `${scheme}://${host}`) return json(res, 403, { error: "forbidden: cross-origin" });
      }
      const secFetchSite = req.headers?.["sec-fetch-site"];
      if (secFetchSite !== void 0 && secFetchSite !== "same-origin" && secFetchSite !== "none") {
        return json(res, 403, { error: "forbidden: cross-site" });
      }
      const path = new URL(req.url ?? "", "http://localhost").pathname;
      if (path === "/api/plugin-manager/state") {
        const content = await readPatch();
        return json(res, 200, { profileDir, managed: listManaged(content) });
      }
      if (path === "/api/plugin-manager/disable" && req.method === "POST") {
        const body = await readBody(req);
        if (!isValidId(body?.id)) return json(res, 400, { error: "invalid plugin id" });
        const { changed } = await writePatch((content) => addManagedDisable(content, body.id));
        return json(res, 200, { ok: true, changed, needsRestart: true });
      }
      if (path === "/api/plugin-manager/enable" && req.method === "POST") {
        const body = await readBody(req);
        if (!isValidId(body?.id)) return json(res, 400, { error: "invalid plugin id" });
        const { changed } = await writePatch((content) => removeManagedDisable(content, body.id));
        return json(res, 200, { ok: true, changed, needsRestart: true });
      }
      if (path === "/api/plugin-manager/restore" && req.method === "POST") {
        const { removed } = await writePatch((content) => removeAllManaged(content));
        return json(res, 200, { ok: true, removed, needsRestart: true });
      }
      if (path === "/api/plugin-manager/check-all" && req.method === "POST") {
        const packages = await profilePackages(profileDir);
        const rows = await Promise.all(packages.map(async (pkg) => {
          const latest = await npmLatest(pkg.name);
          return { name: pkg.name, installed: pkg.installed, latest, upToDate: latest === null ? null : latest === pkg.installed };
        }));
        return json(res, 200, { packages: rows });
      }
      if (path === "/api/plugin-manager/update" && req.method === "POST") {
        const body = await readBody(req);
        if (typeof body?.name !== "string" || !/^(@[^/]+\/)?[^/]+$/.test(body.name) || body.name.length > 200) {
          return json(res, 400, { error: "invalid package name" });
        }
        try {
          await execFileAsync("pnpm", ["add", `${body.name}@latest`], {
            cwd: profileDir,
            shell: process.platform === "win32",
            timeout: 3e5,
            maxBuffer: 1024 * 1024,
            windowsHide: true
          });
          return json(res, 200, { ok: true, needsRestart: true });
        } catch (err) {
          return json(res, 500, { ok: false, error: `update failed: ${err?.message ?? String(err)}` });
        }
      }
      if (path === "/api/plugin-manager/repair" && req.method === "POST") {
        const body = await readBody(req);
        if (typeof body?.name !== "string" || !/^(@[^/]+\/)?[^/]+$/.test(body.name) || body.name.length > 200) {
          return json(res, 400, { error: "invalid package name" });
        }
        let version;
        try {
          if (body.name.startsWith("@deepseek-ai/")) {
            const suiteDir = await installedPackageDir("@deepseek-ai/dsh");
            const suite = JSON.parse(await readFile(join(suiteDir, "package.json"), "utf8"));
            version = typeof suite?.version === "string" ? suite.version : void 0;
            if (version === void 0) throw new Error("installed dsh suite version unknown");
          } else {
            const dir = await installedPackageDir(body.name);
            const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
            version = typeof pkg?.version === "string" ? pkg.version : void 0;
            if (version === void 0) throw new Error("installed package version unknown");
          }
        } catch (err) {
          return json(res, 500, { ok: false, error: `cannot resolve repair version: ${err?.message ?? String(err)}` });
        }
        const result = await repairPackage(body.name, version);
        return json(res, result.ok ? 200 : 500, result);
      }
      return json(res, 404, { error: "unknown plugin-manager route" });
    } catch (err) {
      if (err?.status !== void 0) return json(res, err.status, { error: err.message });
      console.error("[dsh-plugin-manager] handler error:", err);
      return json(res, 500, { error: "internal error" });
    }
  };
}
function apply(ctx, config) {
  const dir = config.profileDir ?? void 0;
  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: "prefix",
        path: "/api/plugin-manager",
        handler: createHandler({ profileDir: dir, maxBodyBytes: config.maxBodyBytes })
      });
    } catch (err) {
      console.error("[dsh-plugin-manager] /api/plugin-manager route registration failed:", err);
      return void 0;
    }
  });
}
export {
  Config,
  addManagedDisable,
  apply,
  createHandler,
  inject,
  installedPackageDir,
  isValidId,
  listManaged,
  name,
  npmLatest,
  npmMetadata,
  profilePackages,
  removeAllManaged,
  removeManagedDisable,
  repairPackage,
  resolveProfileDir
};
