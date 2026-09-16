// src/index.ts
import z from "@deepseek-ai/schemastery";
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { lstat as lstat2, open as open3, readFile as readFile3, rename, rm as rm2 } from "node:fs/promises";
import { basename, dirname as dirname3, join as join3 } from "node:path";
import { randomUUID } from "node:crypto";
import semver3 from "semver";

// src/patch.ts
import { parseDocument, isMap, isSeq } from "yaml";
var MARKER = " useful-dsh-plugin-manager managed entry";
function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}
function isValidId(value) {
  return typeof value === "string" && /^[A-Za-z0-9@._/:-]{1,200}$/.test(value) && !value.includes("..");
}
function isPackageName(value) {
  return typeof value === "string" && value.length <= 200 && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
}
function patchDocument(content) {
  const doc = parseDocument(content, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }], uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length || !isSeq(doc.contents) || doc.contents.items.some((item) => !isMap(item))) {
    fail(409, "INVALID_PATCH", "The profile patch must be a valid YAML array of mappings; it was left unchanged.");
  }
  return doc;
}
function managedNode(node) {
  if (!isMap(node) || !node.commentBefore?.split("\n").includes(MARKER)) return null;
  const keys = node.items.map((pair) => String(pair.key));
  if (keys.length < 2 || keys.length > 3 || keys.some((key) => !["id", "name", "disabled"].includes(key))) return null;
  const id = node.get("id"), module = node.get("name");
  if (!isValidId(id) || node.get("disabled") !== true || module !== void 0 && !isPackageName(module)) return null;
  return { id, module };
}
function listManaged(content) {
  return patchDocument(content).contents.items.map(managedNode).filter(Boolean).map((row) => row.id);
}
function removeNodes(doc, shouldRemove) {
  const seq = doc.contents, kept = [], comments = [];
  let removed = 0;
  for (const node of seq.items) {
    if (shouldRemove(node)) {
      removed++;
      const before = node.commentBefore?.split("\n").filter((line) => line !== MARKER).join("\n");
      if (before) comments.push(before);
      if (node.comment) comments.push(node.comment);
      for (const pair of node.items) for (const scalar of [pair.key, pair.value]) {
        if (scalar?.commentBefore) comments.push(scalar.commentBefore);
        if (scalar?.comment) comments.push(scalar.comment);
      }
    } else {
      if (comments.length) {
        node.commentBefore = [...comments, node.commentBefore].filter(Boolean).join("\n");
        comments.length = 0;
      }
      kept.push(node);
    }
  }
  if (comments.length) doc.comment = [doc.comment, ...comments].filter(Boolean).join("\n");
  seq.items = kept;
  return removed;
}
function addManagedDisable(content, id, module) {
  if (!isValidId(id) || module !== void 0 && !isPackageName(module)) fail(400, "INVALID_ID", "Invalid plugin identity.");
  const doc = patchDocument(content), seq = doc.contents;
  for (const node2 of seq.items) {
    const managed = managedNode(node2);
    if (managed?.id === id) {
      if (managed.module !== module) fail(409, "PATCH_IDENTITY_CHANGED", "A managed patch belongs to a different module identity; review it manually.");
      return { content, changed: false };
    }
  }
  const node = doc.createNode({ id, ...module === void 0 ? {} : { name: module }, disabled: true });
  node.commentBefore = MARKER;
  seq.flow = false;
  seq.items.push(node);
  const after = doc.toString({ lineWidth: 0 });
  patchDocument(after);
  return { content: after, changed: true };
}
function removeManagedDisable(content, id, module) {
  const doc = patchDocument(content);
  const removed = removeNodes(doc, (node) => {
    const managed = managedNode(node);
    return managed?.id === id && (module === void 0 || managed.module === void 0 || managed.module === module);
  });
  return { content: removed ? doc.toString({ lineWidth: 0 }) : content, changed: removed > 0 };
}
function removeAllManaged(content, allowed) {
  const doc = patchDocument(content);
  const removed = removeNodes(doc, (node) => {
    const managed = managedNode(node);
    if (!managed) return false;
    if (allowed === void 0) return true;
    return allowed.has(managed.id) && (managed.module === void 0 || managed.module === allowed.get(managed.id));
  });
  return { content: removed ? doc.toString({ lineWidth: 0 }) : content, removed };
}

// src/profile.ts
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { open, readFile, readdir, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { parseDocument as parseDocument2 } from "yaml";
import semver from "semver";
var PACKAGE = "useful-dsh-plugin-manager";
var OFFICIAL = "@deepseek-ai/";
var queues = /* @__PURE__ */ new Map();
async function readManifest(dir) {
  const manifest2 = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  if (!manifest2 || typeof manifest2 !== "object" || !Array.isArray(manifest2.dsh?.profile?.bundles)) fail(409, "INVALID_PROFILE", "The selected directory is not a DSH profile.");
  return manifest2;
}
async function resolveProfileDir(preferred, profileBaseUrl) {
  if (preferred || profileBaseUrl) {
    const dir = await realpath(preferred ? isAbsolute(preferred) ? preferred : resolve(resolveDshHome(), preferred) : fileURLToPath(profileBaseUrl));
    await readManifest(dir);
    return dir;
  }
  const root = join(resolveDshHome(), "profiles"), candidates = [];
  for (const item of await readdir(root)) {
    const dir = join(root, item);
    try {
      if ((await readManifest(dir)).dsh.profile.bundles.includes(PACKAGE)) candidates.push(dir);
    } catch {
    }
  }
  if (candidates.length !== 1) fail(409, "PROFILE_AMBIGUOUS", "An unambiguous active Loader profile or explicit profileDir is required.");
  return realpath(candidates[0]);
}
async function profileStoreDir(profileDir) {
  let text;
  try {
    text = await readFile(join(profileDir, "node_modules", ".modules.yaml"), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return void 0;
    throw err;
  }
  const doc = parseDocument2(text);
  if (doc.errors.length) fail(409, "INVALID_STORE_METADATA", "pnpm store metadata is invalid; package changes were stopped.");
  const store = doc.get("storeDir");
  if (store === void 0) return void 0;
  if (typeof store !== "string" || !store.trim() || /[\r\n\0]/.test(store)) fail(409, "INVALID_STORE_METADATA", "pnpm store metadata is invalid.");
  return /[\\/]v\d+[\\/]?$/.test(store) ? dirname(store.replace(/[\\/]$/, "")) : store;
}
function nativeStoreArgument(store, platform = process.platform) {
  if (/[\r\n\0]/.test(store) || platform === "win32" && /["%!]/.test(store)) {
    fail(409, "UNSUPPORTED_STORE_PATH", "The pnpm store path contains unsupported shell expansion characters; use a store path without quotes, percent or exclamation marks.");
  }
  if (platform !== "win32") return store;
  const value = store.replaceAll("\\", "/");
  return /[\s&|<>^()]/.test(value) ? `"${value}"` : value;
}
async function profilePackages(profileDir) {
  const manifest2 = await readManifest(profileDir);
  const direct = { ...manifest2.devDependencies, ...manifest2.optionalDependencies, ...manifest2.dependencies };
  const rows = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set();
  let visited = 0;
  const visit = async (name2, spec, parent, owner, depth) => {
    if (!isPackageName(name2) || name2.startsWith(OFFICIAL) || typeof spec !== "string") return;
    if (depth > 8 || ++visited > 256) fail(409, "BUNDLE_TREE_LIMIT", "The installed bundle dependency tree exceeds the manager limit.");
    try {
      const location = depth === 0 ? join(parent, "node_modules", name2, "package.json") : createRequire(join(parent, "package.json")).resolve(`${name2}/package.json`);
      const canonical = await realpath(location);
      if (seen.has(`${owner}:${canonical}`)) return;
      seen.add(`${owner}:${canonical}`);
      const pkg = JSON.parse(await readFile(canonical, "utf8"));
      if (typeof pkg.name !== "string" || pkg.name.startsWith(OFFICIAL) || pkg.name !== name2 || !semver.valid(pkg.version)) return;
      const previous = rows.get(name2);
      if (!previous || depth === 0) rows.set(name2, { name: name2, installed: pkg.version, bundle: typeof pkg.dsh?.bundle?.patch === "string", local: /^(?:file:|link:|workspace:|npm:|git[+:]|github:|https?:|[./\\])/i.test(spec), self: name2 === PACKAGE, direct: depth === 0, owner, owners: [owner] });
      else if (!previous.owners.includes(owner)) previous.owners.push(owner);
      if (typeof pkg.dsh?.bundle?.patch === "string") {
        for (const [child, childSpec] of Object.entries(pkg.dependencies ?? {})) await visit(child, childSpec, dirname(canonical), owner, depth + 1);
      }
    } catch (error) {
      if (error.status) throw error;
    }
  };
  for (const [name2, spec] of Object.entries(direct)) await visit(name2, spec, profileDir, name2, 0);
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
async function npmLatest(name2) {
  if (!isPackageName(name2) || name2.startsWith(OFFICIAL)) return null;
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name2)}/latest`, { signal: AbortSignal.timeout(15e3) });
    if (!response.ok) return null;
    const result = await response.json();
    return semver.valid(result.version) ? result.version : null;
  } catch {
    return null;
  }
}
async function withProfileLock(dir, task) {
  const previous = queues.get(dir) ?? Promise.resolve();
  const current = previous.catch(() => {
  }).then(async () => {
    const lock = join(dir, ".plugin-manager.lock");
    let handle;
    try {
      handle = await open(lock, "wx", 384);
    } catch (err) {
      if (err.code === "EEXIST") fail(409, "PROFILE_BUSY", "Another manager operation holds the profile lock.");
      throw err;
    }
    try {
      return await task();
    } finally {
      await handle.close();
      await rm(lock, { force: true });
    }
  });
  queues.set(dir, current);
  try {
    return await current;
  } finally {
    if (queues.get(dir) === current) queues.delete(dir);
  }
}
function hostCli() {
  try {
    const anchor = createRequire(process.argv[1]), pkgPath = anchor.resolve("@deepseek-ai/dsh/package.json"), pkg = anchor(pkgPath);
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.dsh;
    return pkg.name === "@deepseek-ai/dsh" && typeof bin === "string" ? resolve(dirname(pkgPath), bin) : void 0;
  } catch {
    return void 0;
  }
}

// src/host-update.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile as readFile2, realpath as realpath2, mkdir, open as open2, writeFile, lstat } from "node:fs/promises";
import { dirname as dirname2, join as join2, isAbsolute as isAbsolute2, normalize } from "node:path";
import { resolveDshHome as resolveDshHome2 } from "@deepseek-ai/dsh-home-paths";
import semver2 from "semver";
var execute = promisify(execFile);
var REGISTRY = "https://registry.npmjs.org";
var PACKAGE2 = "@deepseek-ai/dsh";
function fail2(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
function validVersion(value) {
  return typeof value === "string" && value.length < 80 && semver2.valid(value) === value;
}
async function command(npmCli, args) {
  return execute(process.execPath, [npmCli, ...args], {
    shell: false,
    windowsHide: true,
    timeout: 6e5,
    maxBuffer: 2 * 1024 * 1024
  });
}
async function manifest(path) {
  return JSON.parse(await readFile2(path, "utf8"));
}
async function inspectHostInstallation(options = {}) {
  const unsupported = (reason, current = null) => ({ supported: false, reason, current });
  const entry = options.entry ?? process.argv[1];
  const execPath = options.execPath ?? process.execPath;
  const env = options.env ?? process.env;
  const run = options.run ?? command;
  const platform = options.platform ?? process.platform;
  if (!entry) return unsupported("The running DSH entry point could not be identified.");
  const actualEntry = await realpath2(entry).catch(() => null);
  if (!actualEntry) return unsupported("The running DSH entry point no longer exists.");
  let pkgDir = dirname2(actualEntry);
  let pkg;
  for (let depth = 0; depth < 7; depth++) {
    pkg = await manifest(join2(pkgDir, "package.json")).catch(() => null);
    if (pkg?.name === PACKAGE2) break;
    const parent = dirname2(pkgDir);
    if (parent === pkgDir) break;
    pkgDir = parent;
  }
  if (pkg?.name !== PACKAGE2 || !validVersion(pkg.version)) return unsupported("This process is not a recognized DSH CLI installation.");
  const candidates = [
    env.npm_execpath,
    join2(dirname2(execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join2(dirname2(dirname2(execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join2(dirname2(dirname2(pkgDir)), "npm", "bin", "npm-cli.js")
  ].filter(Boolean);
  let npmCli;
  for (const candidate of candidates) {
    const actual = await realpath2(candidate).catch(() => null);
    if (!actual) continue;
    const npmPackage = await manifest(join2(dirname2(dirname2(actual)), "package.json")).catch(() => null);
    if (npmPackage?.name === "npm") {
      npmCli = actual;
      break;
    }
  }
  if (!npmCli) return unsupported("A local npm CLI could not be identified. Update through your installation manager.", pkg.version);
  let rootResult, prefixResult;
  try {
    rootResult = await run(npmCli, ["root", "--global"]);
    prefixResult = await run(npmCli, ["prefix", "--global"]);
  } catch {
    return unsupported("npm global installation paths could not be inspected.", pkg.version);
  }
  const root = rootResult.stdout.trim();
  const prefix = prefixResult.stdout.trim();
  if (!isAbsolute2(root) || !isAbsolute2(prefix) || /[\r\n\0]/.test(root + prefix)) return unsupported("npm returned an invalid global path.", pkg.version);
  const samePath = (a, b) => a && b && (platform === "win32" ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b));
  const expectedRoot = await realpath2(join2(prefix, ...platform === "win32" ? [] : ["lib"], "node_modules")).catch(() => null);
  const actualRoot = await realpath2(root).catch(() => null);
  if (!samePath(expectedRoot, actualRoot)) return unsupported("npm global root and prefix do not describe one installation.", pkg.version);
  const packagePath = join2(root, "@deepseek-ai", "dsh");
  const packageStat = await lstat(packagePath).catch(() => null);
  if (!packageStat?.isDirectory() || packageStat.isSymbolicLink()) return unsupported("Linked or development DSH installations must be updated through their original installation manager.", pkg.version);
  const expected = await realpath2(packagePath).catch(() => null);
  if (!samePath(expected, await realpath2(pkgDir))) return unsupported("The running DSH is not the current npm global installation. Update through the tool that installed it.", pkg.version);
  return { supported: true, reason: "", current: pkg.version, npmCli, prefix, pkgDir };
}
async function fetchHostMetadata() {
  const response = await fetch(`${REGISTRY}/%40deepseek-ai%2Fdsh`, { signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw fail2(502, "REGISTRY_UNAVAILABLE", "The official npm registry could not be reached.");
  return response.json();
}
async function hostStatus(options = {}) {
  const installed = await (options.inspect ?? inspectHostInstallation)();
  let metadata;
  try {
    metadata = await (options.fetchMetadata ?? fetchHostMetadata)();
  } catch {
    return { current: installed.current, latest: null, supported: installed.supported, reason: installed.reason, updateAvailable: false, registryAvailable: false };
  }
  const tag = metadata?.["dist-tags"]?.latest;
  const latest = validVersion(tag) && metadata.versions?.[tag] ? tag : null;
  return {
    current: installed.current,
    latest,
    supported: installed.supported,
    reason: installed.reason,
    registryAvailable: Boolean(latest),
    updateAvailable: Boolean(latest && installed.current && semver2.gt(latest, installed.current)),
    channel: "latest",
    needsRestart: false
  };
}
async function updateHost(body, options = {}) {
  if (body?.confirm !== true) throw fail2(400, "CONFIRM_REQUIRED", "Confirm the DSH host update and the required restart.");
  if (!validVersion(body.version)) throw fail2(400, "INVALID_VERSION", "An exact published semantic version is required.");
  const installed = await (options.inspect ?? inspectHostInstallation)();
  if (!installed.supported) throw fail2(409, "UNSUPPORTED_INSTALLATION", installed.reason);
  const metadata = await (options.fetchMetadata ?? fetchHostMetadata)();
  const target = metadata?.["dist-tags"]?.latest;
  if (target !== body.version || !metadata.versions?.[body.version]) throw fail2(409, "VERSION_CHANGED", "The latest npm release changed. Check again before updating.");
  if (!semver2.gt(body.version, installed.current)) throw fail2(409, "NO_UPGRADE", "The selected release is not newer than the running DSH version.");
  const nodeRange = metadata.versions[body.version]?.engines?.node;
  if (nodeRange && !semver2.satisfies(process.versions.node, nodeRange)) throw fail2(409, "NODE_VERSION", `This DSH release requires Node.js ${nodeRange}.`);
  const dataHome = resolveDshHome2(options.home);
  const updates = join2(dataHome, "third-party", "data", "plugin-manager", "host-updates");
  await mkdir(updates, { recursive: true, mode: 448 });
  let lock;
  try {
    lock = await open2(join2(updates, "update.lock"), "wx");
  } catch (error) {
    if (error.code === "EEXIST") throw fail2(409, "UPDATE_BUSY", "A host update is running or needs recovery. Inspect the local host-updates record before retrying.");
    throw error;
  }
  const run = options.run ?? ((args) => command(installed.npmCli, args));
  const journalDir = join2(updates, `${Date.now()}-${body.version}`);
  const journal = { previous: installed.current, target: body.version, status: "preparing", prefix: installed.prefix, startedAt: (/* @__PURE__ */ new Date()).toISOString() };
  const readInstalled = options.readInstalled ?? (() => manifest(join2(installed.pkgDir, "package.json")));
  let installAttempted = false;
  const save = () => writeFile(join2(journalDir, "update.json"), JSON.stringify(journal, null, 2) + "\n", { mode: 384 });
  try {
    await mkdir(journalDir, { recursive: true, mode: 448 });
    await lock.writeFile(JSON.stringify({ pid: process.pid, journal: journalDir }));
    await save();
    const packed = await run(["pack", `${PACKAGE2}@${installed.current}`, "--ignore-scripts", "--json", "--pack-destination", journalDir, `--registry=${REGISTRY}`]);
    const result = JSON.parse(packed.stdout);
    if (!Array.isArray(result) || !/^[A-Za-z0-9_.-]+\.tgz$/.test(result[0]?.filename ?? "")) throw fail2(502, "BACKUP_FAILED", "The previous DSH release could not be saved; no upgrade was attempted.");
    journal.rollbackArchive = result[0].filename;
    journal.status = "installing";
    await save();
    installAttempted = true;
    await run(["install", "--global", "--prefix", installed.prefix, `${PACKAGE2}@${body.version}`, `--registry=${REGISTRY}`, "--no-fund", "--no-audit"]);
    if ((await readInstalled()).version !== body.version) throw fail2(500, "VERSION_MISMATCH", "npm completed but the installed version did not match. Inspect the recovery record.");
    journal.status = "installed-awaiting-restart";
    journal.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    await save();
    return { ok: true, previous: installed.current, version: body.version, needsRestart: true };
  } catch (error) {
    journal.status = "failed";
    journal.failureCode = error.code ?? "NPM_FAILED";
    if (installAttempted && journal.rollbackArchive && !error.killed) {
      journal.status = "restoring-previous-release";
      await save().catch(() => {
      });
      try {
        await run(["install", "--global", "--prefix", installed.prefix, join2(journalDir, journal.rollbackArchive), `--registry=${REGISTRY}`, "--no-fund", "--no-audit"]);
        if ((await readInstalled()).version !== installed.current) throw new Error("rollback version mismatch");
        journal.status = "previous-release-restored";
        journal.rollback = "root-package-version-verified; dependencies-not-snapshotted";
      } catch {
        journal.status = "rollback-failed";
        journal.rollback = "manual-recovery-required";
      }
    } else if (installAttempted) {
      journal.status = "recovery-required";
    }
    await save().catch(() => {
    });
    if (installAttempted) {
      const restored = journal.status === "previous-release-restored";
      throw fail2(500, restored ? "HOST_UPDATE_RESTORED" : "HOST_UPDATE_RECOVERY_REQUIRED", restored ? "DSH update failed. The previous root package version was restored; dependencies were not snapshotted. Restart and verify the host before continuing." : "DSH update failed and installation recovery is required. Do not restart until the local host-updates recovery record has been checked.");
    }
    if (error.status) throw error;
    throw fail2(500, "HOST_UPDATE_FAILED", "DSH update failed. The local host-updates record contains the previous version and recovery archive; no running session was deliberately stopped.");
  } finally {
    await lock.close();
    const { unlink } = await import("node:fs/promises");
    await unlink(join2(updates, "update.lock")).catch(() => {
    });
  }
}

// src/index.ts
var name = "plugin-manager";
var inject = ["webServer"];
var Config = z.object({ profileDir: z.string(), maxBodyBytes: z.number().default(65536) });
var execAsync = promisify2(execFile2);
var phases = ["pending", "loading", "active", "failed", null, "unloading"];
function createHandler(options = {}) {
  const maxBytes = Math.max(1024, Math.min(1024 * 1024, Number(options.maxBodyBytes) || 65536));
  const listRows = options.listRows ?? (() => []);
  const runCli = options.runCli ?? execAsync;
  const latestVersion = options.latestVersion ?? npmLatest;
  let profilePromise;
  const profile = () => profilePromise ??= resolveProfileDir(options.profileDir, options.profileBaseUrl);
  const send = (res, status, data) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(data));
  };
  const patch = async (dir) => {
    const path = join3(dir, "cordis.patch.yml");
    try {
      if ((await lstat2(path)).isSymbolicLink()) fail(409, "PATCH_SYMLINK", "The manager does not edit a linked patch file.");
      return await readFile3(path, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return "[]\n";
      throw err;
    }
  };
  const snapshot = async (dir) => {
    const installed = await profilePackages(dir), direct = new Map(installed.map((pkg) => [pkg.name, pkg]));
    const allRows = await listRows();
    if (!Array.isArray(allRows)) fail(503, "INVENTORY_UNAVAILABLE", "The current Loader inventory is unavailable.");
    const counts = /* @__PURE__ */ new Map();
    for (const row of allRows) counts.set(row.patchId ?? row.id, (counts.get(row.patchId ?? row.id) ?? 0) + 1);
    const rows = allRows.filter((row) => !row.group && isValidId(row.id) && isValidId(row.patchId ?? row.id) && isPackageName(row.module) && !row.module.startsWith(OFFICIAL) && direct.has(row.module) && counts.get(row.patchId ?? row.id) === 1).map((row) => ({
      ...row,
      patchId: row.patchId ?? row.id,
      protected: direct.get(row.module).self || row.id === "plugin-manager" || row.patchId === "plugin-manager",
      owner: direct.get(row.module).owner,
      direct: direct.get(row.module).direct
    }));
    const manifest2 = await readManifest(dir);
    const live = (manifest2.dsh.profile.patchReload ?? "live") === "live" && options.hasLiveReload?.() === true;
    const packages = installed.filter((pkg) => pkg.bundle || rows.some((row) => row.module === pkg.name));
    return { rows, packages, live };
  };
  const writePatch = async (dir, mutate) => {
    const before = await patch(dir), result = mutate(before);
    if (result.content === before) return result;
    patchDocument(result.content);
    const file = join3(dir, "cordis.patch.yml"), tmp = `${file}.manager-${randomUUID()}.tmp`;
    const output = await open3(tmp, "wx", 384);
    try {
      await output.writeFile(result.content, "utf8");
      await output.sync();
      await output.close();
      if (await patch(dir) !== before) fail(409, "PATCH_CONFLICT", "The profile patch changed during this operation; review it and retry.");
      await rename(tmp, file);
    } finally {
      await output.close().catch(() => {
      });
      await rm2(tmp, { force: true });
    }
    return result;
  };
  const body = async (req) => {
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers["content-type"] ?? ""))) fail(415, "JSON_REQUIRED", "Use application/json for manager writes.");
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) fail(413, "BODY_TOO_LARGE", "Request body too large.");
      chunks.push(bytes);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      return value;
    } catch {
      fail(400, "INVALID_JSON", "Invalid JSON object.");
    }
  };
  const observed = async (dir, targets, live) => {
    if (!targets.length) return { applied: true, needsRestart: false, reload: "unchanged" };
    if (!live) return { applied: false, needsRestart: true, reload: "startup" };
    const deadline = Date.now() + (options.observeTimeoutMs ?? 2500);
    do {
      const current = await snapshot(dir);
      if (targets.every((target) => {
        const row = current.rows.find((item) => item.id === target.id && item.module === target.module);
        return row && row.enabled === target.enabled && (target.enabled ? row.phase === "active" : row.phase === null);
      })) return { applied: true, needsRestart: false, reload: "observed" };
      if (Date.now() >= deadline) break;
      await new Promise((resolve2) => setTimeout(resolve2, 100));
    } while (true);
    return { applied: false, needsRestart: true, reload: "not-observed" };
  };
  return async (req, res) => {
    try {
      const host = String(req.headers?.host ?? ""), remote = req.socket?.remoteAddress;
      if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host) || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) fail(403, "LOCAL_ONLY", "Manager access requires a loopback connection.");
      const origin = req.headers.origin;
      if (origin !== void 0 && origin !== `${req.socket?.encrypted ? "https" : "http"}://${host}`) fail(403, "SAME_ORIGIN", "Cross-origin access is forbidden.");
      const site = req.headers["sec-fetch-site"];
      if (site !== void 0 && !["same-origin", "none"].includes(site)) fail(403, "SAME_ORIGIN", "Cross-site access is forbidden.");
      const route = new URL(req.url ?? "", "http://localhost").pathname.replace(/^\/api\/plugin-manager/, "");
      if (!["/state", "/disable", "/enable", "/restore", "/check-all", "/update", "/repair", "/host", "/host/update"].includes(route)) return send(res, 404, { error: "Unknown manager route." });
      if (req.method !== (["/state", "/host"].includes(route) ? "GET" : "POST")) return send(res, 405, { error: "Method not allowed." });
      if (route === "/host") return send(res, 200, await (options.hostStatus ?? hostStatus)(options.hostOptions));
      if (route === "/host/update") return send(res, 200, await (options.updateHost ?? updateHost)(await body(req), options.hostOptions));
      const dir = await profile();
      if (route === "/state") {
        const current = await snapshot(dir), managedIds = listManaged(await patch(dir));
        return send(res, 200, { ...current, paths: { base: "$DSH_HOME", profile: `profiles/${basename(dir)}`, packages: "third-party/packages", archives: "third-party/archives", data: "third-party/data", voiceRuntime: "third-party/data/voice-input" }, managed: current.rows.filter((row) => !row.protected && managedIds.includes(row.patchId)).map((row) => row.id) });
      }
      const data = await body(req);
      if (route === "/check-all") {
        const current = await snapshot(dir), packages = [];
        for (const pkg of current.packages) {
          const latest = pkg.local ? null : await latestVersion(pkg.name);
          packages.push({ ...pkg, latest, upToDate: latest === null ? null : !semver3.gt(latest, pkg.installed), canUpdate: pkg.direct && !pkg.local && !pkg.self && latest !== null && semver3.gt(latest, pkg.installed) });
        }
        return send(res, 200, { packages });
      }
      const result = await withProfileLock(dir, async () => {
        const current = await snapshot(dir);
        if (["/disable", "/enable", "/restore"].includes(route)) {
          let targets = [], change;
          if (route === "/restore") {
            const allowed = new Map(current.rows.filter((row) => !row.protected).map((row) => [row.patchId, row.module]));
            const ids = listManaged(await patch(dir));
            targets = current.rows.filter((row) => allowed.has(row.patchId) && ids.includes(row.patchId)).map((row) => ({ ...row, enabled: true }));
            change = await writePatch(dir, (text) => removeAllManaged(text, allowed));
          } else {
            if (!isValidId(data.id)) fail(400, "INVALID_ID", "Invalid plugin id.");
            const row = current.rows.find((item) => item.id === data.id);
            if (!row || row.protected) fail(403, "PLUGIN_PROTECTED", "Only current third-party rows in this profile tree can be toggled; manager and official rows are protected.");
            if (data.module !== void 0 && data.module !== row.module) fail(409, "STALE_ROW", "The selected row changed. Refresh the manager.");
            if (route === "/enable") {
              change = await writePatch(dir, (text) => removeManagedDisable(text, row.patchId, row.module));
              if (!change.changed && !row.enabled) fail(409, "USER_DISABLED", "Another configuration layer disables this row. The manager will not overwrite it.");
            } else change = await writePatch(dir, (text) => addManagedDisable(text, row.patchId, row.module));
            if (change.changed) targets = [{ ...row, enabled: route === "/enable" }];
          }
          return { ok: true, ...route === "/restore" ? { removed: change.removed } : { changed: change.changed }, ...await observed(dir, targets, current.live) };
        }
        if (!isPackageName(data.name)) fail(400, "INVALID_PACKAGE", "Invalid package name.");
        const pkg = current.packages.find((item) => item.name === data.name);
        if (!pkg || pkg.self || data.name.startsWith(OFFICIAL)) fail(403, "PACKAGE_PROTECTED", "Only installed direct third-party profile packages may be changed; update the manager with the native CLI.");
        if (!pkg.direct) fail(409, "BUNDLE_OWNED_PACKAGE", `This package is managed by its bundle owner (${pkg.owners.join(", ")}). Update or reinstall that owner; it will not be promoted to a direct dependency.`);
        if (pkg.local) fail(409, "LOCAL_PLUGIN_SOURCE", "This plugin uses a local or non-registry source. Rebuild, repack and install it locally with DSH; registry repair would replace that source.");
        const version = route === "/repair" ? pkg.installed : await latestVersion(pkg.name);
        if (!semver3.valid(version)) fail(502, "REGISTRY_UNAVAILABLE", "Cannot resolve a valid package version.");
        if (route === "/update" && !semver3.gt(version, pkg.installed)) return { ok: true, changed: false, needsRestart: false };
        const cli = options.cliPath ?? hostCli();
        if (!cli) fail(409, "CLI_UNAVAILABLE", "Cannot locate the active official DSH CLI. Use dsh plugin from a terminal.");
        const profileName = basename(dir), home = dirname3(dirname3(dir));
        if (!/^[A-Za-z0-9_-]+$/.test(profileName) || basename(dirname3(dir)) !== "profiles") fail(409, "PROFILE_CLI_UNSUPPORTED", "Native package operations require a named DSH_HOME/profiles profile.");
        const storeDir = await profileStoreDir(dir);
        const args = [cli, "plugin", "--profile", profileName, "add", `${pkg.name}@${version}`];
        if (storeDir !== void 0) args.push("--store-dir", nativeStoreArgument(storeDir));
        if (route === "/repair") args.push("--force");
        try {
          await runCli(process.execPath, args, {
            cwd: dir,
            shell: false,
            timeout: 3e5,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
            env: { ...process.env, DSH_HOME: home, ...storeDir === void 0 ? {} : { npm_config_store_dir: storeDir } }
          });
        } catch {
          fail(500, "CLI_FAILED", "The native DSH plugin command failed. It may have partly changed the profile; inspect package and bundle state before retrying.");
        }
        const after = (await profilePackages(dir)).find((item) => item.name === pkg.name);
        if (after?.installed !== version) fail(409, "INSTALL_NOT_VERIFIED", "DSH completed but the requested version was not observed. Inspect the profile before retrying.");
        return { ok: true, changed: true, version, needsRestart: true };
      });
      return send(res, 200, result);
    } catch (err) {
      return send(res, err.status ?? 500, { ok: false, code: err.code ?? "MANAGER_ERROR", error: err.status ? err.message : "Manager operation failed; no successful result is claimed." });
    }
  };
}
function apply(ctx, config = {}) {
  let profileBaseUrl = ctx.root?.baseUrl;
  if (!profileBaseUrl) {
    try {
      profileBaseUrl = ctx.get("loader")?.ctx?.root?.baseUrl;
    } catch {
    }
  }
  const listRows = () => {
    const loader = ctx.get("loader");
    if (typeof loader?.entries !== "function") fail(503, "INVENTORY_UNAVAILABLE", "The current Loader inventory is unavailable.");
    const tree = ctx.fiber?.entry?.parent?.tree;
    if (!tree) fail(503, "PROFILE_TREE_UNAVAILABLE", "The current profile tree cannot be verified; plugin management is unavailable.");
    return [...loader.entries()].filter((entry) => entry?.parent?.tree === tree).map((entry) => ({
      id: entry.id,
      patchId: entry.options.id,
      module: entry.options.name,
      group: Boolean(entry.options.group),
      enabled: !entry.disabled,
      phase: entry.fiber === void 0 ? null : phases[entry.fiber.state] ?? null
    }));
  };
  const hasLiveReload = () => {
    try {
      return typeof ctx.get("hmr")?.registerConfig === "function";
    } catch {
      return false;
    }
  };
  ctx.effect(() => {
    try {
      return ctx.webServer.register({ kind: "prefix", path: "/api/plugin-manager", handler: createHandler({ ...config, profileBaseUrl, listRows, hasLiveReload }) });
    } catch {
      console.error("[useful-dsh-plugin-manager] route registration failed; the manager is unavailable.");
    }
  });
}
export {
  Config,
  addManagedDisable,
  apply,
  createHandler,
  inject,
  isPackageName,
  isValidId,
  listManaged,
  name,
  nativeStoreArgument,
  npmLatest,
  profilePackages,
  profileStoreDir,
  removeAllManaged,
  removeManagedDisable,
  resolveProfileDir
};
