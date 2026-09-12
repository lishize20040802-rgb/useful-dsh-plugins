// src/index.ts
import { createRequire as createRequire3 } from "node:module";
import { createReadStream, existsSync as existsSync2, statSync } from "node:fs";
import { dirname as dirname2, extname as extname2, isAbsolute, resolve as resolve3 } from "node:path";
import Schema from "@deepseek-ai/schemastery";

// ../node_modules/@deepseek-ai/dsh-tools/lib/index.js
import { Service as Service2 } from "@deepseek-ai/cordis";
import z2 from "@deepseek-ai/schemastery";

// ../node_modules/@deepseek-ai/dsh-scope/lib/index.js
import { Context } from "@deepseek-ai/cordis";
var NamedEntries = class {
  duplicateError;
  data = /* @__PURE__ */ new Map();
  constructor(duplicateError) {
    this.duplicateError = duplicateError;
  }
  /**
  * Insert one unique name.
  * @param name - name unique within this table.
  * @param value - borrowed value to retain.
  * @returns an idempotent undo that removes only this insertion.
  */
  insert(name2, value) {
    const data = this.data;
    if (data.has(name2)) throw this.duplicateError(name2);
    data.set(name2, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(name2);
      if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
    };
  }
  /**
  * Read one named value.
  * @param name - name to resolve.
  * @returns the retained value, or `undefined` when absent.
  */
  get(name2) {
    return this.data.get(name2);
  }
  /**
  * Test one name for membership.
  * @param name - name to test.
  * @returns whether the table contains that name.
  */
  has(name2) {
    return this.data.has(name2);
  }
  /**
  * Iterate live names in insertion order.
  * @returns the native live key iterator.
  */
  keys() {
    return this.data.keys();
  }
  /**
  * Iterate live entries in insertion order.
  * @returns the native live entry iterator.
  */
  entries() {
    return this.data.entries();
  }
  /**
  * Iterate live values in insertion order.
  * @returns the native live value iterator.
  */
  values() {
    return this.data.values();
  }
  /**
  * Test whether this table has no entries.
  * @returns whether the table is empty.
  */
  isEmpty() {
    return this.data.size === 0;
  }
};
var AnonymousEntries = class {
  data = /* @__PURE__ */ new Map();
  /**
  * Append one independently owned value.
  * @param value - borrowed value to retain.
  * @returns an idempotent undo for this exact append.
  */
  append(value) {
    const data = this.data;
    const key = Symbol();
    data.set(key, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(key);
      if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
    };
  }
  /**
  * Iterate live values in insertion order.
  * @returns the native live value iterator.
  */
  values() {
    return this.data.values();
  }
  /**
  * Test whether this table has no entries.
  * @returns whether the table is empty.
  */
  isEmpty() {
    return this.data.size === 0;
  }
};
var ScopedLayers = class {
  createLayer;
  onChange;
  /** The eagerly constructed context-global layer. */
  global;
  scoped = /* @__PURE__ */ new Map();
  constructor(createLayer, onChange) {
    this.createLayer = createLayer;
    this.onChange = onChange;
    this.global = createLayer(void 0);
  }
  /**
  * Read an existing exact-scope overlay. Deliberately chain-blind: callers
  * addressing one scope's OWN contributions (its restrictions, its guards)
  * must not silently pick up an ancestor's — use {@link chainLayers} where
  * inheritance is the point.
  * @param scope - exact scope key; `undefined` denotes no overlay.
  * @returns the existing scoped layer, or `undefined` without creating one.
  */
  peek(scope) {
    if (scope === void 0) return void 0;
    return this.scoped.get(scope);
  }
  /**
  * Existing overlays along the scope's parent chain ({@link scopeChainOf}),
  * farthest ancestor first and the exact scope last, so a caller layering
  * them in order gives the nearest scope the final word.
  * @param scope - viewing scope, or `undefined` for no overlays.
  * @returns the existing layers, nearest last; absent overlays are skipped.
  */
  chainLayers(scope) {
    const layers = [];
    for (const key of scopeChainOf(scope).reverse()) {
      const layer = this.scoped.get(key);
      if (layer !== void 0) layers.push(layer);
    }
    return layers;
  }
  /**
  * Materialize global named entries followed by scope-chain shadows,
  * farthest ancestor first, so the nearest scope's entry wins a name.
  * @param scope - viewing scope, or `undefined` for the global view.
  * @param pick - select the named table from a layer.
  * @returns an insertion-ordered effective map.
  */
  merge(scope, pick) {
    const merged = new Map(pick(this.global).entries());
    for (const layer of this.chainLayers(scope)) for (const [name2, value] of pick(layer).entries()) merged.set(name2, value);
    return merged;
  }
  /**
  * Attach one synchronous layer mutation to its registration context.
  * @param ctx - context that determines both scope visibility and effect ownership.
  * @param action - atomic mutation returning its synchronous undo.
  * @param options - Cordis effect label and optional change notification.
  * @returns the exact disposer returned by `ctx.effect()`.
  */
  effect(ctx, action, options) {
    const scope = scopeOf(ctx);
    const notify = options.notify ?? true;
    return ctx.effect(function* () {
      let layer;
      let created = false;
      if (scope === void 0) layer = this.global;
      else {
        const existing = this.scoped.get(scope);
        if (existing === void 0) {
          layer = this.createLayer(scope);
          this.scoped.set(scope, layer);
          created = true;
        } else layer = existing;
      }
      let undo;
      try {
        undo = action(layer);
      } catch (error) {
        if (scope !== void 0 && created && layer.isEmpty()) this.scoped.delete(scope);
        throw error;
      }
      yield () => {
        undo();
        if (scope !== void 0 && layer.isEmpty()) this.scoped.delete(scope);
        if (notify) this.onChange();
      };
      if (notify) this.onChange();
    }.bind(this), options.label);
  }
};
var kScope = Symbol("dsh.scope");
var carrierKeys = /* @__PURE__ */ new WeakMap();
var scopeParents = /* @__PURE__ */ new WeakMap();
function scopeChainOf(key) {
  const chain = [];
  for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) chain.push(cursor);
  return chain;
}
function scopeOf(ctx) {
  return ctx[kScope];
}
function scopeTarget(base, key) {
  const baseFilter = base[Context.filter];
  const carrier = { [Context.filter](ctx) {
    if (baseFilter !== void 0 && !baseFilter.call(base, ctx)) return false;
    const tag = scopeOf(ctx);
    if (tag === void 0) return true;
    for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) if (cursor === tag) return true;
    return false;
  } };
  carrierKeys.set(carrier, key);
  return carrier;
}

// ../node_modules/@deepseek-ai/dsh-llm/lib/index.js
import { createRequire } from "node:module";

// ../node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js
import { Service } from "@deepseek-ai/cordis";
var RemoteError = class extends Error {
  code;
  details;
  /** Structural marker: cross-realm/bundle identification never uses instanceof. */
  isDSHRemoteError = true;
  /**
  * @param code - stable failure code declared in {@link RemoteErrorDetailsMap}.
  * @param message - human diagnostic carried across the wire.
  * @param details - structured payload typed by the code.
  * @param options - standard Error options (`cause` survives in-process only).
  */
  constructor(code, message, details, options) {
    super(message, options);
    this.code = code;
    this.details = details;
    this.name = "RemoteError";
  }
};
var TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
function isTypertRemoteSegment(value) {
  return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
var REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
function bindTypertRemote(service, serviceKey, options = {}) {
  validateName("service key", serviceKey);
  const namespace = options.namespace ?? serviceKey;
  validateName("namespace", namespace);
  return Object.freeze({
    service,
    serviceKey,
    namespace
  });
}
var TypertRemoteService = class extends Service {
  /** Visible binding consumed by the Gateway's source-mode discovery. */
  typertRemote;
  /**
  * Register the Service and bind the same key to Typert Gateway.
  * @param ctx - owning Cordis Context.
  * @param serviceKey - exact Cordis service key and default wire namespace.
  * @param options - optional distinct wire namespace.
  */
  constructor(ctx, serviceKey, options = {}) {
    super(ctx, serviceKey);
    this.typertRemote = bindTypertRemote(this, this.name, options);
  }
};
function Remote(methodExportOrOptions, context) {
  if (typeof methodExportOrOptions === "string") {
    validateName("Remote export name", methodExportOrOptions);
    return remoteDecorator({ kind: "direct" }, void 0, methodExportOrOptions);
  }
  if (typeof methodExportOrOptions === "object") {
    if (remoteOptionMode(methodExportOrOptions) !== "stream" || Reflect.ownKeys(methodExportOrOptions).length !== 1) throw new TypeError('typert-protocol: Remote options must contain exactly mode: "stream"');
    return remoteDecorator({ kind: "direct" }, "stream");
  }
  if (context === void 0) throw new TypeError("typert-protocol: Remote decorator context is missing");
  addMarkerInitializer(context, { kind: "direct" });
}
function remoteOptionMode(options) {
  return Reflect.get(options, "mode");
}
function remoteDecorator(invocation, mode, exportName) {
  return function(_method, context) {
    addMarkerInitializer(context, invocation, mode, exportName);
  };
}
function readRemoteMethodDescriptor(prototype) {
  const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
  if (property === void 0) return void 0;
  const descriptor = property.value;
  if (descriptor === null || typeof descriptor !== "object") throw new TypeError("typert-protocol: Remote method descriptor must be an object");
  const version2 = Reflect.get(descriptor, "version");
  if (version2 !== 1) throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version2)}`);
  const methods = Reflect.get(descriptor, "methods");
  if (!Array.isArray(methods)) throw new TypeError("typert-protocol: Remote method descriptor methods must be an array");
  return descriptor;
}
function addMarkerInitializer(context, invocation, mode, exportName) {
  if (context.private || context.static || typeof context.name !== "string") throw new TypeError("typert-protocol: Remote decorators require a public instance method with a string name");
  const method = context.name;
  context.addInitializer(function() {
    const prototype = Object.getPrototypeOf(this);
    if (prototype === null) throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
    mark(prototype, method, invocation, mode, exportName);
  });
}
function mark(prototype, method, invocation, mode, exportName) {
  const descriptor = readRemoteMethodDescriptor(prototype);
  const marker = Object.freeze({
    method,
    ...exportName === void 0 || exportName === method ? {} : { exportName },
    ...mode === void 0 ? {} : { mode },
    invocation: Object.freeze(invocation)
  });
  const current = descriptor?.methods.find((candidate) => candidate.method === method);
  if (current !== void 0) {
    if (current.exportName === marker.exportName && current.mode === marker.mode && sameInvocation(current.invocation, invocation)) return;
    throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
  }
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze([...descriptor?.methods ?? [], marker])
    })
  });
}
function sameInvocation(left, right) {
  if (left.kind === "direct") return right.kind === "direct";
  if (right.kind === "direct") return false;
  return left.context === right.context;
}
function validateName(subject, value) {
  if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}

// ../node_modules/@deepseek-ai/dsh-util-values/lib/index.js
function assertNever(value, context) {
  const rendered = JSON.stringify(value) ?? String(value);
  throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
}
function hasIntrinsicConstructor(prototype, name2) {
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name2 && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name2}() { [native code] }`;
  } catch {
    return false;
  }
}
function isIntrinsicObjectPrototype(value) {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, "Object");
}
function hasPlainArrayPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, "Array")) return false;
  const objectPrototype = Object.getPrototypeOf(prototype);
  return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype(objectPrototype);
}
function hasPlainObjectPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype(prototype);
}
function enumerableStringKeys(value) {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key))) return void 0;
  return keys;
}
function walkJsonValue(value, detach) {
  const ancestors = /* @__PURE__ */ new Set();
  let root;
  const assign = (destination, item) => {
    if (destination === void 0) return;
    if (destination.kind === "root") root = item;
    else if (destination.kind === "array") destination.target[destination.index] = item;
    else Object.defineProperty(destination.target, destination.key, {
      value: item,
      enumerable: true,
      configurable: true,
      writable: true
    });
  };
  const tasks = [{
    kind: "visit",
    value,
    ...detach ? { destination: { kind: "root" } } : {}
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      ancestors.delete(task.source);
      continue;
    }
    if (task.kind === "array-item") {
      if (!Object.prototype.hasOwnProperty.call(task.source, task.index)) return void 0;
      tasks.push({
        kind: "visit",
        value: task.source[task.index],
        ...task.target === void 0 ? {} : { destination: {
          kind: "array",
          target: task.target,
          index: task.index
        } }
      });
      continue;
    }
    if (task.kind === "object-property") {
      tasks.push({
        kind: "visit",
        value: task.source[task.key],
        ...task.target === void 0 ? {} : { destination: {
          kind: "object",
          target: task.target,
          key: task.key
        } }
      });
      continue;
    }
    const current = task.value;
    if (current === null) {
      assign(task.destination, null);
      continue;
    }
    if (typeof current === "boolean" || typeof current === "string") {
      assign(task.destination, current);
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current) || Object.is(current, -0)) return void 0;
      assign(task.destination, current);
      continue;
    }
    if (typeof current !== "object") return void 0;
    if (ancestors.has(current)) return void 0;
    if (Array.isArray(current)) {
      if (!hasPlainArrayPrototype(current)) return void 0;
      const length = current.length;
      if (Reflect.ownKeys(current).length !== length + 1) return void 0;
      const target2 = detach ? [] : void 0;
      if (target2 !== void 0) assign(task.destination, target2);
      ancestors.add(current);
      tasks.push({
        kind: "leave",
        source: current
      });
      for (let index = length - 1; index >= 0; index--) tasks.push({
        kind: "array-item",
        source: current,
        index,
        ...target2 === void 0 ? {} : { target: target2 }
      });
      continue;
    }
    if (!hasPlainObjectPrototype(current)) return void 0;
    const keys = enumerableStringKeys(current);
    if (keys === void 0) return void 0;
    const target = detach ? {} : void 0;
    if (target !== void 0) assign(task.destination, target);
    ancestors.add(current);
    tasks.push({
      kind: "leave",
      source: current
    });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) return void 0;
      tasks.push({
        kind: "object-property",
        source: current,
        key,
        ...target === void 0 ? {} : { target }
      });
    }
  }
  return detach ? root : true;
}
function snapshotJsonValue(value) {
  return walkJsonValue(value, true);
}
function isJsonValue(value) {
  return walkJsonValue(value, false) === true;
}
function deepFreeze(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const pending = [{
    kind: "visit",
    node: value
  }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === void 0) continue;
    if (task.kind === "property") {
      pending.push({
        kind: "visit",
        node: task.source[task.key]
      });
      continue;
    }
    const node = task.node;
    if (node === null || typeof node !== "object") continue;
    if (node instanceof AbortSignal) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    Object.freeze(node);
    const keys = Object.keys(node);
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) continue;
      pending.push({
        kind: "property",
        source: node,
        key
      });
    }
  }
  return value;
}

// ../node_modules/@deepseek-ai/dsh-util-crypto/lib/index.js
function randomUUID() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte, index) => {
    return (index === 6 ? byte & 15 | 64 : index === 8 ? byte & 63 | 128 : byte).toString(16).padStart(2, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ../node_modules/@deepseek-ai/dsh-brand/lib/index.js
function brandString(value) {
  return value;
}

// ../node_modules/@deepseek-ai/dsh-llm/lib/index.js
import z from "@deepseek-ai/schemastery";

// ../node_modules/@deepseek-ai/dsh-timeout/lib/index.js
var MAX_TIMER_DELAY_MS = 2147483647;

// ../node_modules/@deepseek-ai/dsh-llm/lib/index.js
function freezeMessage(message) {
  return deepFreeze(structuredClone(message));
}
function createMessage(input) {
  return freezeMessage({
    ...input,
    id: brandString(randomUUID())
  });
}
function createUserMessage(input) {
  return createMessage({
    ...input,
    role: "user"
  });
}
var HarnessError = class extends Error {
  /** Stable machine-routable failure class (e.g. `RATE_LIMIT`); route on this, never by parsing `message`. */
  code;
  constructor(message, code, options) {
    super(message, options);
    this.code = code;
    this.name = new.target.name;
  }
};
var EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
var STRUCTURED_CONTEXT_OVERFLOW = new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
var TOO_LARGE_FOR_CONTEXT = new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
var EXCEEDS_MODEL_CONTEXT = new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
var DEFAULT_MAX_RETRIES = 5;
var DEFAULT_INITIAL_DELAY_MS = 500;
var DEFAULT_MAX_DELAY_MS = 1e4;
var DEFAULT_JITTER_RATIO = 0.1;
var DEFAULT_RETRYABLE_CODES = Object.freeze([
  EMPTY_RESPONSE_CODE,
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT"
]);
var backoffSchema = z.object({
  initialDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
  maxDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
  jitterRatio: z.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
var normalPolicySchema = z.object({
  mode: z.const("normal").required(),
  maxRetries: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
  retryableCodes: z.array(z.string()).default([...DEFAULT_RETRYABLE_CODES]),
  backoff: backoffSchema
});
var alwaysPolicySchema = z.object({
  mode: z.const("always").required(),
  backoff: backoffSchema
});
var RetryPolicySchema = z.union([normalPolicySchema, alwaysPolicySchema]);
var NORMAL_POLICY_KEYS = /* @__PURE__ */ new Set([
  "mode",
  "maxRetries",
  "retryableCodes",
  "backoff"
]);
var ALWAYS_POLICY_KEYS = /* @__PURE__ */ new Set([
  "mode",
  "maxRetries",
  "retryableCodes",
  "backoff"
]);
var BACKOFF_KEYS = /* @__PURE__ */ new Set([
  "initialDelayMs",
  "maxDelayMs",
  "jitterRatio"
]);
function validateKeys(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}: unknown key "${key}"`);
}
function resolveBackoff(config, path) {
  if (config !== void 0) validateKeys(config, BACKOFF_KEYS, path);
  const initialDelayMs = config?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = config?.jitterRatio ?? DEFAULT_JITTER_RATIO;
  if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > MAX_TIMER_DELAY_MS) throw new Error(`${path}.initialDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > MAX_TIMER_DELAY_MS) throw new Error(`${path}.maxDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
  if (initialDelayMs > maxDelayMs) throw new Error(`${path}.initialDelayMs must be less than or equal to maxDelayMs`);
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) throw new Error(`${path}.jitterRatio must be between 0 and 1`);
  return Object.freeze({
    initialDelayMs,
    maxDelayMs,
    jitterRatio
  });
}
function resolveRetryPolicy(config, path) {
  if (config === void 0) return Object.freeze({
    mode: "normal",
    maxRetries: DEFAULT_MAX_RETRIES,
    retryableCodes: DEFAULT_RETRYABLE_CODES,
    ...resolveBackoff(void 0, `${path}.backoff`)
  });
  switch (config.mode) {
    case "normal": {
      validateKeys(config, NORMAL_POLICY_KEYS, path);
      const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
      const retryableCodes = config.retryableCodes ?? [...DEFAULT_RETRYABLE_CODES];
      if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new Error(`${path}.maxRetries must be a non-negative safe integer`);
      if (retryableCodes.length === 0) throw new Error(`${path}.retryableCodes must not be empty`);
      if (retryableCodes.some((code) => typeof code !== "string" || code.length === 0)) throw new Error(`${path}.retryableCodes must contain only non-empty strings`);
      if (new Set(retryableCodes).size !== retryableCodes.length) throw new Error(`${path}.retryableCodes must not contain duplicates`);
      return Object.freeze({
        mode: "normal",
        maxRetries,
        retryableCodes: Object.freeze([...retryableCodes]),
        ...resolveBackoff(config.backoff, `${path}.backoff`)
      });
    }
    case "always":
      validateKeys(config, ALWAYS_POLICY_KEYS, path);
      return Object.freeze({
        mode: "always",
        ...resolveBackoff(config.backoff, `${path}.backoff`)
      });
    default:
      throw new Error(`${path}.mode must be "normal" or "always"`);
  }
}
function callConfigEquals(a, b) {
  if (a.provider !== b.provider || a.model !== b.model || a.reasoningEffort !== b.reasoningEffort || a.temperature !== b.temperature || a.maxTokens !== b.maxTokens) return false;
  if (a.stop === void 0 || b.stop === void 0) return a.stop === b.stop;
  return a.stop.length === b.stop.length && a.stop.every((s, i) => s === b.stop?.[i]);
}
function normalizeLlmFailure(value) {
  const error = value instanceof Error ? value : new HarnessError(thrownMessage(value), "UNKNOWN", { cause: value });
  const carried = ownFailureSnapshot(error);
  if (carried !== void 0 && carried.code === ownErrorCode(error)) return carried;
  return Object.freeze({
    message: errorMessage(error),
    code: harnessErrorCode(error)
  });
}
function thrownMessage(value) {
  try {
    const message = String(value);
    return message.length > 0 ? message : "LLM adapter failed";
  } catch (_hostileThrownValue) {
    return "LLM adapter failed";
  }
}
function ownErrorCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== void 0 && "value" in descriptor ? descriptor.value : void 0;
  } catch (_sdkPropertyTrap) {
    return;
  }
}
function ownFailureSnapshot(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "failure");
    return descriptor !== void 0 && "value" in descriptor ? failureSnapshot(descriptor.value) : void 0;
  } catch (_sdkPropertyTrap) {
    return;
  }
}
function failureSnapshot(value) {
  if (typeof value !== "object" || value === null) return void 0;
  try {
    const candidate = value;
    const message = candidate.message;
    const code = candidate.code;
    const status = candidate.status;
    const providerRetryAfterMs = candidate.providerRetryAfterMs;
    const requestId = candidate.requestId;
    if (typeof message !== "string" || message.length === 0 || typeof code !== "string" || code.length === 0 || status !== void 0 && (!Number.isInteger(status) || status < 100 || status > 599) || providerRetryAfterMs !== void 0 && (!Number.isFinite(providerRetryAfterMs) || providerRetryAfterMs <= 0) || requestId !== void 0 && (typeof requestId !== "string" || requestId.length === 0)) return void 0;
    return Object.freeze({
      message,
      code,
      ...status === void 0 ? {} : { status },
      ...providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs },
      ...requestId === void 0 ? {} : { requestId }
    });
  } catch (_sdkFailureGetter) {
    return;
  }
}
function errorMessage(error) {
  try {
    const message = error.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch (_sdkMessageGetter) {
  }
  return "LLM adapter failed";
}
function harnessErrorCode(error) {
  return error instanceof HarnessError ? error.code : "UNKNOWN";
}
function quoted(value) {
  return JSON.stringify(value);
}
function textOnlyImageText(ref) {
  return `[image omitted because this model accepts text only; attachment sha256:${String(ref.attachmentId).slice(7, 15)}]`;
}
function contentHasImage(content) {
  return content.some((block) => block.type === "image" || block.type === "tool-result" && contentHasImage(block.content));
}
function contentHasFile(content) {
  for (const block of content) if (block.type === "file" || block.type === "tool-result" && contentHasFile(block.content)) return true;
  return false;
}
function fileHandleText(ref, readonlyPath) {
  const digest = String(ref.attachmentId).slice(7, 15);
  const identity = `File ${quoted(ref.name)} (${ref.bytes} bytes, sha256:${digest})`;
  if (readonlyPath === void 0) return `[${identity} was uploaded, but the current execution environment cannot access a readable path. Report that limitation if its contents are needed; do not claim to have read it.]`;
  return `[${identity}: verbatim read-only copy saved at ${quoted(readonlyPath)}. Read that path with your file tools when its contents are needed; copy it to a writable location before modifying it. When delegating file work, include this saved path in the delegation prompt; only subagents sharing this execution environment can read it.]`;
}
function replaceFilesWithHandles(blocks, resolvePath) {
  let next;
  for (const [index, block] of blocks.entries()) {
    if (block.type === "file") {
      next ??= blocks.slice(0, index);
      next.push({
        type: "text",
        text: fileHandleText(block.attachment, resolvePath(block.attachment))
      });
      continue;
    }
    if (block.type === "tool-result") {
      const content = replaceFilesWithHandles(block.content, resolvePath);
      if (content !== block.content) {
        next ??= blocks.slice(0, index);
        next.push({
          ...block,
          content
        });
        continue;
      }
    }
    next?.push(block);
  }
  return next ?? blocks;
}
function projectFilesToText(messages, resolvePath) {
  if (!messages.some((message) => contentHasFile(message.content))) return messages;
  return messages.map((message) => {
    const content = replaceFilesWithHandles(message.content, resolvePath);
    return content === message.content ? message : {
      ...message,
      content
    };
  });
}
function replaceImagesForTextModel(blocks) {
  let next;
  for (const [index, block] of blocks.entries()) {
    if (block.type === "image") {
      next ??= blocks.slice(0, index);
      next.push({
        type: "text",
        text: textOnlyImageText(block.attachment)
      });
      continue;
    }
    if (block.type === "tool-result") {
      const content = replaceImagesForTextModel(block.content);
      if (content !== block.content) {
        next ??= blocks.slice(0, index);
        next.push({
          ...block,
          content
        });
        continue;
      }
    }
    next?.push(block);
  }
  return next ?? blocks;
}
function projectImagesForTextModel(messages) {
  if (!messages.some((message) => contentHasImage(message.content))) return messages;
  return messages.map((message) => {
    const content = replaceImagesForTextModel(message.content);
    return content === message.content ? message : {
      ...message,
      content
    };
  });
}
var { version } = createRequire(import.meta.url)("../package.json");
var __runInitializers = function(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result = (0, decorators[i])(kind === "accessor" ? {
      get: descriptor.get,
      set: descriptor.set
    } : descriptor[key], context);
    if (kind === "accessor") {
      if (result === void 0) continue;
      if (result === null || typeof result !== "object") throw new TypeError("Object expected");
      if (_ = accept(result.get)) descriptor.get = _;
      if (_ = accept(result.set)) descriptor.set = _;
      if (_ = accept(result.init)) initializers.unshift(_);
    } else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
    else descriptor[key] = _;
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
};
var LlmError = class extends HarnessError {
  /** Serializable facts retained beside this live Error. */
  failure;
  /**
  * @param message - non-empty human-readable failure summary.
  * @param code - non-empty stable provider-neutral machine code.
  * @param options - optional cause and validated serializable provider facts.
  */
  constructor(message, code, options) {
    if (typeof message !== "string" || message.length === 0) throw new Error("LlmError message must be a non-empty string");
    if (typeof code !== "string" || code.length === 0) throw new Error("LlmError code must be a non-empty string");
    if (options?.status !== void 0 && (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)) throw new Error("LlmError status must be an integer from 100 through 599");
    if (options?.providerRetryAfterMs !== void 0 && (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)) throw new Error("LlmError providerRetryAfterMs must be a positive finite number");
    if (options?.requestId !== void 0 && (typeof options.requestId !== "string" || options.requestId.length === 0)) throw new Error("LlmError requestId must be a non-empty string");
    super(message, code, options);
    this.name = "LlmError";
    this.failure = Object.freeze({
      message,
      code,
      ...options?.status === void 0 ? {} : { status: options.status },
      ...options?.providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs: options.providerRetryAfterMs },
      ...options?.requestId === void 0 ? {} : { requestId: options.requestId }
    });
  }
};
var LlmRuntime = (() => {
  let _classSuper = TypertRemoteService;
  let _instanceExtraInitializers = [];
  let _listProviders_decorators;
  let _listConfigurableProviders_decorators;
  let _remoteDiscoverModels_decorators;
  return class LlmRuntime extends _classSuper {
    static {
      const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
      _listProviders_decorators = [Remote];
      _listConfigurableProviders_decorators = [Remote];
      _remoteDiscoverModels_decorators = [Remote("discoverModels")];
      __esDecorate(this, null, _listProviders_decorators, {
        kind: "method",
        name: "listProviders",
        static: false,
        private: false,
        access: {
          has: (obj) => "listProviders" in obj,
          get: (obj) => obj.listProviders
        },
        metadata: _metadata
      }, null, _instanceExtraInitializers);
      __esDecorate(this, null, _listConfigurableProviders_decorators, {
        kind: "method",
        name: "listConfigurableProviders",
        static: false,
        private: false,
        access: {
          has: (obj) => "listConfigurableProviders" in obj,
          get: (obj) => obj.listConfigurableProviders
        },
        metadata: _metadata
      }, null, _instanceExtraInitializers);
      __esDecorate(this, null, _remoteDiscoverModels_decorators, {
        kind: "method",
        name: "remoteDiscoverModels",
        static: false,
        private: false,
        access: {
          has: (obj) => "remoteDiscoverModels" in obj,
          get: (obj) => obj.remoteDiscoverModels
        },
        metadata: _metadata
      }, null, _instanceExtraInitializers);
      if (_metadata) Object.defineProperty(this, Symbol.metadata, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: _metadata
      });
    }
    adapters = (__runInitializers(this, _instanceExtraInitializers), /* @__PURE__ */ new Map());
    directory = /* @__PURE__ */ new Map();
    discoveries = /* @__PURE__ */ new Map();
    constructor(ctx) {
      super(ctx, "llm");
    }
    /** Notify topology observers without letting one broken listener veto the commit. */
    emitAdaptersUpdated() {
      let invariantFailure;
      for (const listener of this.ctx.events.dispatch("emit", ["llm/adapters-updated"])) try {
        const returned = listener();
        if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
          this.warnAdaptersListenerFailure(error);
        });
      } catch (error) {
        if (error?.code === "INVARIANT") {
          invariantFailure ??= error;
          continue;
        }
        this.warnAdaptersListenerFailure(error);
      }
      if (invariantFailure !== void 0) throw invariantFailure;
    }
    /** Contained-listener diagnostic shared by the sync and async failure paths. */
    warnAdaptersListenerFailure(error) {
      this.ctx.logger.warn("llm: an llm/adapters-updated listener failed");
      this.ctx.logger.warn(error);
    }
    /**
    * Register an adapter for the given provider routes. Throws `LlmError` with code
    * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
    * Disposed with the fiber.
    * @param providers - every provider route this adapter should serve.
    * @param adapter - the adapter that streams calls for those providers.
    * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
    */
    registerAdapter(providers, adapter) {
      const owned = /* @__PURE__ */ new Set();
      let released = false;
      const dispose = this.ctx.effect(function* () {
        if (providers.length === 0) throw new LlmError("an adapter must register at least one provider", "INVALID_ADAPTER");
        this.commitRoutes(owned, this.prepareRoutes(providers, adapter, owned));
        yield () => {
          released = true;
          for (const provider of owned) this.adapters.delete(provider);
          owned.clear();
          this.emitAdaptersUpdated();
        };
      }.bind(this), "llm.registerAdapter()");
      const handle = () => void dispose();
      handle.replace = (next) => {
        if (released) throw new LlmError("a disposed adapter registration cannot replace its routes", "REGISTRATION_DISPOSED");
        this.commitRoutes(owned, this.prepareRoutes(next, adapter, owned));
      };
      return handle;
    }
    /**
    * Validate one candidate route set for `adapter`, treating routes this
    * registration already holds as available. Nothing is mutated: a rejected
    * candidate leaves the registry exactly as it was.
    */
    prepareRoutes(providers, adapter, owned) {
      const unique = /* @__PURE__ */ new Set();
      const registrations = [];
      for (const provider of providers) {
        if (provider.length === 0) throw new LlmError("adapter provider names must be non-empty", "INVALID_ADAPTER");
        if (unique.has(provider) || this.adapters.has(provider) && !owned.has(provider)) throw new LlmError(`an adapter for provider "${provider}" is already registered`, "DUPLICATE_ADAPTER");
        const info = adapter.providerInfo(provider);
        if (typeof info.id !== "string" || info.id !== provider || typeof info.name !== "string" || info.name.length === 0) throw new LlmError(`adapter metadata for provider "${provider}" must preserve its id and have a non-empty name`, "INVALID_ADAPTER");
        unique.add(provider);
        const retryPolicy = adapter.providerRetryPolicy(provider) ?? resolveRetryPolicy(void 0, `llm: provider "${provider}" retryPolicy`);
        registrations.push({
          adapter,
          provider: {
            id: info.id,
            name: info.name
          },
          retryPolicy
        });
      }
      return registrations;
    }
    /**
    * Swap this registration's routes for the prepared ones in one synchronous
    * section, so no observer can see the registry between the release and the
    * re-registration. The route set's one mutation point is also where
    * `llm/adapters-updated` is published, so a `replace` announces itself
    * exactly like a first registration.
    */
    commitRoutes(owned, registrations) {
      for (const provider of owned) this.adapters.delete(provider);
      owned.clear();
      for (const registration of registrations) {
        this.adapters.set(registration.provider.id, registration);
        owned.add(registration.provider.id);
      }
      this.emitAdaptersUpdated();
    }
    /**
    * Describe provider routes with a registered adapter.
    * @returns detached provider metadata in registration order.
    */
    listProviders() {
      return [...this.adapters.values()].map(({ provider }) => ({ ...provider }));
    }
    /**
    * Declare provider routes an adapter plugin can activate through
    * configuration. Registration is all-or-nothing: an empty list, invalid
    * entry, or a provider already declared by any registration throws
    * `LlmError` without registering the rest. Disposed with the fiber.
    * @param entries - every configurable provider this plugin owns.
    * @returns a handle that withdraws all of them, and can atomically replace them.
    */
    registerConfigurableProviders(entries) {
      let held = [];
      let disposed = false;
      const commit = (candidates) => {
        const detached = [];
        const own = new Set(held.map((entry) => entry.provider));
        for (const entry of candidates) {
          if (entry.provider.length === 0 || entry.displayName.length === 0 || entry.settingsNs.length === 0) throw new LlmError("configurable providers need a non-empty provider, displayName, and settingsNs", "INVALID_DIRECTORY");
          if (entry.settingsPath.some((segment) => segment.length === 0)) throw new LlmError(`configurable provider "${entry.provider}" has an empty settingsPath segment`, "INVALID_DIRECTORY");
          if (this.directory.has(entry.provider) && !own.has(entry.provider) || detached.some((seen) => seen.provider === entry.provider)) throw new LlmError(`configurable provider "${entry.provider}" is already declared`, "DUPLICATE_DIRECTORY");
          detached.push({
            ...entry,
            settingsPath: [...entry.settingsPath]
          });
        }
        for (const entry of held) this.directory.delete(entry.provider);
        for (const entry of detached) this.directory.set(entry.provider, entry);
        held = detached;
        this.emitAdaptersUpdated();
      };
      const dispose = this.ctx.effect(function* () {
        if (entries.length === 0) throw new LlmError("a configurable-provider registration must declare at least one provider", "INVALID_DIRECTORY");
        commit(entries);
        yield () => {
          disposed = true;
          for (const entry of held) this.directory.delete(entry.provider);
          held = [];
          this.emitAdaptersUpdated();
        };
      }.bind(this), "llm.registerConfigurableProviders()");
      const handle = () => void dispose();
      handle.replace = (next) => {
        if (disposed) throw new LlmError("this configurable-provider registration was disposed", "REGISTRATION_DISPOSED");
        commit(next);
      };
      return handle;
    }
    /**
    * List every declared configurable provider, registered or dormant.
    * @returns detached directory entries in declaration order.
    */
    listConfigurableProviders() {
      return [...this.directory.values()].map((entry) => ({
        ...entry,
        settingsPath: [...entry.settingsPath]
      }));
    }
    /**
    * Offer to interrogate provider endpoints on behalf of the settings
    * namespace this plugin owns. The namespace is the key because that is what
    * a configuration surface already holds from the configurable-provider
    * directory, and because a provider being *added* has no route to name yet.
    * Disposed with the fiber.
    * @param settingsNs - the namespace whose profiles this discovery serves.
    * @param discover - interrogates one endpoint and must honor the supplied signal.
    * @returns the disposer that withdraws the offer.
    */
    registerModelDiscovery(settingsNs, discover) {
      const dispose = this.ctx.effect(function* () {
        if (settingsNs.length === 0) throw new LlmError("model discovery needs a non-empty settings namespace", "INVALID_DISCOVERY");
        if (this.discoveries.has(settingsNs)) throw new LlmError(`model discovery for "${settingsNs}" is already registered`, "DUPLICATE_DISCOVERY");
        this.discoveries.set(settingsNs, discover);
        yield () => {
          this.discoveries.delete(settingsNs);
        };
      }.bind(this), "llm.registerModelDiscovery()");
      return () => void dispose();
    }
    /**
    * Interrogate one provider endpoint for the models it advertises. The
    * request describes a draft, not a stored route, so nothing here reads or
    * writes settings or credentials — the caller owns both, and the reply is
    * candidate metadata a surface may offer for adoption.
    * @param settingsNs - namespace whose registered discovery serves this draft.
    * @param request - the endpoint, protocol, and one-shot credential to use.
    * @param signal - caller cancellation.
    * @returns the advertised models, deduplicated in endpoint order.
    */
    async discoverModels(settingsNs, request, signal) {
      const discover = this.discoveries.get(settingsNs);
      if (discover === void 0) throw new LlmError(`no model discovery is registered for "${settingsNs}"`, "NO_DISCOVERY");
      if ((request.provider ?? "").length === 0 && (request.baseURL ?? "").length === 0) throw new LlmError("model discovery needs a provider route or a baseURL", "INVALID_DISCOVERY");
      const discovered = signal === void 0 ? await discover(request) : await discover(request, signal);
      const seen = /* @__PURE__ */ new Set();
      const models = [];
      for (const model of discovered) {
        if (typeof model.id !== "string" || model.id.length === 0 || seen.has(model.id)) continue;
        seen.add(model.id);
        models.push({
          id: model.id,
          ...model.name === void 0 ? {} : { name: model.name },
          ...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
          ...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
        });
      }
      return models;
    }
    /**
    * Remote adapter for one draft provider interrogation.
    * @param settingsNs - namespace whose registered discovery serves this draft.
    * @param request - endpoint, protocol, and one-shot credential to use.
    * @param signal - caller cancellation supplied by the Remote carrier.
    * @returns advertised models in endpoint order.
    * @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
    */
    async remoteDiscoverModels(settingsNs, request, signal) {
      try {
        return await this.discoverModels(settingsNs, request, signal);
      } catch (error) {
        throw new RemoteError("llm/model-discovery-rejected", error instanceof Error ? error.message : String(error), {
          settingsNs,
          ...request.baseURL === void 0 ? {} : { baseURL: request.baseURL }
        }, { cause: error });
      }
    }
    /**
    * Resolve the retry policy captured when one provider route was registered.
    * @param provider - registered provider route to inspect.
    * @returns the provider-owned policy, with normal defaults already resolved.
    */
    providerRetryPolicy(provider) {
      return this.registration(provider).retryPolicy;
    }
    /**
    * Resolve provider-side request-image pricing for one exact route, or
    * `undefined` when the provider is unregistered or declares none. Unknown
    * providers degrade to `undefined` rather than throwing because callers
    * price durable history whose route may no longer be mounted.
    * @param provider - provider route named by a request header.
    * @param model - exact model id named by the same header.
    * @returns the owning adapter's image pricing for the route, when declared.
    */
    imageRequestPricing(provider, model) {
      return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model);
    }
    /**
    * Resolve the exact text one durable file occurrence contributes to every
    * provider request in the current execution environment.
    * @param ref - durable verbatim file reference from model history.
    * @returns the same deterministic handle text used at adapter dispatch.
    */
    fileRequestText(ref) {
      return fileHandleText(ref, this.fileReadPath(ref));
    }
    /** Detach typed adapter-owned modality metadata. */
    detachedModalities(modalities) {
      return modalities === void 0 ? void 0 : [...modalities];
    }
    /**
    * Discover models advertised by one registered provider. Catalog membership
    * is advisory and never changes routing or request validation.
    * @param provider - registered provider route to inspect.
    * @returns detached model metadata in adapter-preferred order.
    */
    async listModels(provider) {
      const models = await this.registration(provider).adapter.listModels(provider);
      const seen = /* @__PURE__ */ new Set();
      return models.map((model) => {
        if (typeof model.provider !== "string" || model.provider !== provider || typeof model.id !== "string" || model.id.length === 0 || typeof model.name !== "string" || model.name.length === 0 || model.description !== void 0 && typeof model.description !== "string" || seen.has(model.id)) throw new LlmError(`adapter returned invalid or duplicate model metadata for provider "${provider}"`, "INVALID_CATALOG");
        seen.add(model.id);
        const inputModalities = this.detachedModalities(model.inputModalities);
        return {
          provider: model.provider,
          id: model.id,
          name: model.name,
          ...model.description === void 0 ? {} : { description: model.description },
          ...inputModalities === void 0 ? {} : { inputModalities }
        };
      });
    }
    /**
    * Resolve and validate all metadata from the adapter that owns one exact
    * route. The result is detached from adapter-owned objects; catalog
    * membership remains advisory and does not control request routing.
    * @param provider - registered provider route to inspect.
    * @param model - exact model id passed to the adapter.
    * @param signal - optional cancellation for adapter-owned asynchronous lookup.
    * @returns exact model identity plus available context and reasoning metadata.
    */
    async resolveModelInfo(provider, model, signal) {
      return this.resolveModelInfoFor(this.registration(provider), model, signal);
    }
    async resolveModelInfoFor(registration, model, signal) {
      const resolved = await registration.adapter.resolveModel(registration.provider.id, model, signal);
      return this.normalizeModelInfo(registration, model, resolved);
    }
    /** Validate and detach one adapter-returned exact model result. */
    normalizeModelInfo(registration, model, resolved) {
      const provider = registration.provider.id;
      if (typeof resolved.provider !== "string" || resolved.provider !== provider || typeof resolved.id !== "string" || resolved.id !== model || typeof resolved.name !== "string" || resolved.name.length === 0 || resolved.description !== void 0 && typeof resolved.description !== "string") throw new LlmError(`adapter returned invalid exact model metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
      const context = resolved.context;
      if (context !== void 0 && (!Number.isInteger(context.contextWindow) || context.contextWindow <= 0)) throw new LlmError(`adapter returned invalid context metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_CONTEXT");
      const inputModalities = this.detachedModalities(resolved.inputModalities);
      const systemPromptUpdate = resolved.systemPromptUpdate;
      if (systemPromptUpdate !== void 0 && systemPromptUpdate !== "in-history") throw new LlmError(`adapter returned invalid system prompt update mode for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
      const defaultMaxTokens = resolved.defaultMaxTokens;
      if (defaultMaxTokens !== void 0 && (!Number.isSafeInteger(defaultMaxTokens) || defaultMaxTokens <= 0)) throw new LlmError(`adapter returned invalid default maxTokens for provider "${provider}" model "${model}"`, "INVALID_MODEL_MAX_TOKENS");
      const info = {
        provider,
        id: model,
        name: resolved.name,
        ...resolved.description === void 0 ? {} : { description: resolved.description },
        ...inputModalities === void 0 ? {} : { inputModalities },
        ...context === void 0 ? {} : { context: { contextWindow: context.contextWindow } },
        ...defaultMaxTokens === void 0 ? {} : { defaultMaxTokens },
        ...resolved.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: resolved.systemPromptUpdate }
      };
      const reasoning = resolved.reasoning;
      if (reasoning === void 0) return info;
      if (reasoning.efforts.length === 0) throw new LlmError(`adapter returned invalid reasoning metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
      const seen = /* @__PURE__ */ new Set();
      const efforts = reasoning.efforts.map((effort) => {
        if (typeof effort.id !== "string" || effort.id.length === 0 || typeof effort.name !== "string" || effort.name.length === 0 || effort.description !== void 0 && typeof effort.description !== "string" || seen.has(effort.id)) throw new LlmError(`adapter returned invalid or duplicate reasoning effort metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
        seen.add(effort.id);
        return {
          id: effort.id,
          name: effort.name,
          ...effort.description === void 0 ? {} : { description: effort.description }
        };
      });
      if (reasoning.defaultEffort !== void 0 && !seen.has(reasoning.defaultEffort)) throw new LlmError(`adapter returned an unknown default reasoning effort for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
      return {
        ...info,
        reasoning: {
          efforts,
          ...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: reasoning.defaultEffort }
        }
      };
    }
    /**
    * Validate a conversation call config against its exact model capability and
    * materialize adapter-configured defaults. Unsupported explicit efforts
    * reject before provider I/O; no clamping or aliasing is performed. This
    * standalone query does not bind a later dispatch; use {@link prepareCall}
    * when logging and streaming must share one adapter registration.
    * @param config - provider/model route and optional request controls.
    * @param signal - optional cancellation for adapter-owned capability lookup.
    * @returns a detached config only when a default must be materialized.
    */
    async resolveCallConfig(config, signal) {
      return (await this.resolveCallFor(this.registration(config.provider), config, signal)).config;
    }
    async resolveCallFor(registration, config, signal) {
      const info = await this.resolveModelInfoFor(registration, config.model, signal);
      return this.resolveCallWithInfo(config, info);
    }
    /** Validate request controls against one already-bound exact model result. */
    resolveCallWithInfo(config, info) {
      const defaulted = config.maxTokens === void 0 && info.defaultMaxTokens !== void 0 ? {
        ...config,
        maxTokens: info.defaultMaxTokens
      } : config;
      const reasoning = info.reasoning;
      const requested = defaulted.reasoningEffort;
      let resolvedConfig = defaulted;
      if (reasoning === void 0) {
        if (requested !== void 0) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${requested}"`, "UNSUPPORTED_REASONING_EFFORT");
      } else {
        const effective = requested ?? reasoning.defaultEffort;
        if (effective !== void 0) {
          if (!reasoning.efforts.some((effort) => effort.id === effective)) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${effective}"`, "UNSUPPORTED_REASONING_EFFORT");
          if (requested !== effective) resolvedConfig = {
            ...defaulted,
            reasoningEffort: effective
          };
        }
      }
      return {
        config: resolvedConfig,
        ...info.context === void 0 ? {} : { context: info.context },
        modelInfo: info
      };
    }
    /**
    * Resolve one call under its current adapter registration. The returned
    * one-shot handle keeps that registration across header logging and dispatch,
    * so HMR cannot combine one adapter's capability result with another adapter.
    * @param config - provider/model route and optional request controls.
    * @param signal - optional cancellation for adapter-owned capability lookup.
    * @returns a prepared config and its registration-bound stream entry point.
    */
    async prepareCall(config, signal) {
      const registration = this.registration(config.provider);
      const adapterCall = await registration.adapter.prepareCall(config.provider, config.model, signal);
      const modelInfo = this.normalizeModelInfo(registration, config.model, adapterCall.model);
      const resolved = this.resolveCallWithInfo(config, modelInfo);
      const resolvedConfig = deepFreeze(structuredClone(resolved.config));
      const context = resolved.context === void 0 ? void 0 : deepFreeze(structuredClone(resolved.context));
      const adapterDefaults = deepFreeze({
        ...config.reasoningEffort === void 0 && resolvedConfig.reasoningEffort !== void 0 ? { reasoningEffort: true } : {},
        ...config.maxTokens === void 0 && resolvedConfig.maxTokens !== void 0 ? { maxTokens: true } : {}
      });
      let dispatched = false;
      return Object.freeze({
        config: resolvedConfig,
        retryPolicy: registration.retryPolicy,
        adapterDefaults,
        ...context === void 0 ? {} : { context },
        ...modelInfo.inputModalities === void 0 ? {} : { inputModalities: Object.freeze([...modelInfo.inputModalities]) },
        ...modelInfo.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: modelInfo.systemPromptUpdate },
        stream: (options) => {
          if (dispatched) throw new LlmError("a prepared LLM call can only be dispatched once", "INVALID_PREPARED_CALL");
          if (!callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
          dispatched = true;
          return this.streamWithRegistration(options, {
            registration,
            config: resolvedConfig,
            modelInfo,
            dispatch: (options2) => adapterCall.stream(options2)
          });
        }
      });
    }
    registration(provider) {
      const registration = this.adapters.get(provider);
      if (!registration) throw new LlmError(`no adapter registered for provider "${provider}"`, "NO_ADAPTER");
      return registration;
    }
    /** Remove replay state whose historical route is owned by another adapter. */
    forAdapter(options, adapter) {
      const messages = options.messages.map((message) => {
        const source = message.source;
        if (message.role !== "assistant" || source.kind !== "model" || source.replayState === void 0) return message;
        if (this.adapters.get(source.provider)?.adapter === adapter) return message;
        return freezeMessage({
          ...message,
          source: {
            kind: "model",
            provider: source.provider,
            model: source.model
          }
        });
      });
      if (messages.every((message, index) => message === options.messages[index])) return options;
      const filtered = {
        ...options,
        messages
      };
      return Object.isFrozen(options) ? deepFreeze(filtered) : filtered;
    }
    /**
    * Resolve the current execution-world read path of one durable file
    * reference through the mounted attachment and filesystem providers.
    */
    fileReadPath(ref) {
      let hostPath;
      try {
        hostPath = this.ctx.get("attachments")?.fileHostPath(ref);
      } catch {
        return;
      }
      if (hostPath === void 0) return void 0;
      return this.ctx.get("fs")?.processPathFromHostPath(hostPath);
    }
    /**
    * Final adapter boundary. Adapter selection, dispatch, iterator construction,
    * and iteration failures become one terminal failure chunk. Middleware and
    * downstream consumer failures remain thrown plugin or consumer errors.
    */
    async *adapterStream(options, prepared) {
      let iterator;
      try {
        const registration = prepared?.registration ?? this.registration(options.provider);
        const adapter = registration.adapter;
        let modelInfo;
        let resolvedConfig;
        let dispatch;
        if (prepared === void 0) {
          const adapterCall = await adapter.prepareCall(options.provider, options.model, options.signal);
          modelInfo = this.normalizeModelInfo(registration, options.model, adapterCall.model);
          resolvedConfig = this.resolveCallWithInfo(options, modelInfo).config;
          dispatch = (options2) => adapterCall.stream(options2);
        } else {
          modelInfo = prepared.modelInfo;
          resolvedConfig = prepared.config;
          dispatch = prepared.dispatch;
        }
        if (prepared !== void 0 && !callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
        const resolvedOptions = callConfigEquals(options, resolvedConfig) ? options : Object.isFrozen(options) ? deepFreeze({
          ...options,
          ...resolvedConfig
        }) : {
          ...options,
          ...resolvedConfig
        };
        let projectedMessages = resolvedOptions.messages;
        if (projectedMessages.some((message) => contentHasFile(message.content))) projectedMessages = projectFilesToText(projectedMessages, (ref) => this.fileReadPath(ref));
        if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image") && projectedMessages.some((message) => contentHasImage(message.content))) projectedMessages = projectImagesForTextModel(projectedMessages);
        const projectedOptions = projectedMessages === resolvedOptions.messages ? resolvedOptions : Object.isFrozen(resolvedOptions) ? deepFreeze({
          ...resolvedOptions,
          messages: projectedMessages
        }) : {
          ...resolvedOptions,
          messages: projectedMessages
        };
        iterator = dispatch(this.forAdapter(projectedOptions, adapter))[Symbol.asyncIterator]();
      } catch (error) {
        yield adapterFailureChunk(error, options.signal);
        return;
      }
      let completed = false;
      try {
        while (true) {
          let item;
          try {
            const next = await iterator.next();
            item = next.done ? { done: true } : {
              done: false,
              value: next.value
            };
          } catch (error) {
            completed = true;
            yield adapterFailureChunk(error, options.signal);
            return;
          }
          if (item.done) {
            completed = true;
            return;
          }
          yield item.value;
        }
      } finally {
        if (!completed) {
          const close = iterator.return?.bind(iterator);
          if (close) await close();
        }
      }
    }
    /**
    * Stream one model call as raw chunks (token-level deltas). Replay state is
    * retained only when the same adapter instance owns its historical provider
    * and the target provider. Final adapter selection remains fixed through
    * asynchronous exact-model resolution and dispatch. Adapter selection,
    * dispatch, and iteration failures become terminal `error` or `aborted`
    * finish chunks; middleware, nested-call, cleanup, and consumer failures
    * remain thrown.
    * @param options - the full request; `options.provider` selects the adapter.
    * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
    */
    stream(options) {
      return this.streamWithRegistration(options);
    }
    streamWithRegistration(options, prepared) {
      return this.ctx.waterfall(this, "llm/stream", options, () => this.adapterStream(options, prepared));
    }
  };
})();
function adapterFailureChunk(error, signal) {
  const failure = normalizeLlmFailure(error);
  return {
    type: "finish",
    reason: signal?.aborted || failure.code === "ABORTED" ? {
      kind: "aborted",
      failure
    } : {
      kind: "error",
      failure
    }
  };
}

// ../node_modules/@deepseek-ai/dsh-tools/lib/index.js
var JsonSchemaError = class extends HarnessError {
  /** Individual schema violations in walk order. */
  violations;
  constructor(violations) {
    super(`unsupported JSON schema: ${violations.join("; ")}`, "UNSUPPORTED_SCHEMA");
    this.name = "JsonSchemaError";
    this.violations = violations;
  }
};
var CONSTRAINT_KEYWORDS = /* @__PURE__ */ new Set([
  "type",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const"
]);
var ANNOTATION_KEYWORDS = /* @__PURE__ */ new Set([
  "description",
  "title",
  "default",
  "examples"
]);
var SCHEMA_TYPES = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null"
];
function hasIntrinsicConstructor2(prototype, name2) {
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name2 && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name2}() { [native code] }`;
  } catch {
    return false;
  }
}
function isIntrinsicObjectPrototype2(value) {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor2(value, "Object");
}
function isPlainJsonRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype2(prototype);
  } catch {
    return false;
  }
}
function hasPlainArrayPrototype2(value) {
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor2(prototype, "Array")) return false;
  const objectPrototype = Object.getPrototypeOf(prototype);
  return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype2(objectPrototype);
}
function hasOnlyEnumerableStringKeys(value) {
  try {
    return Reflect.ownKeys(value).every((key) => typeof key === "string" && Object.prototype.propertyIsEnumerable.call(value, key));
  } catch {
    return false;
  }
}
function isJsonSchemaRecord(value) {
  return isPlainJsonRecord(value) && hasOnlyEnumerableStringKeys(value);
}
function isPlainJsonArray(value) {
  if (!Array.isArray(value)) return false;
  try {
    if (!hasPlainArrayPrototype2(value) || Reflect.ownKeys(value).length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false;
    return true;
  } catch {
    return false;
  }
}
function isJsonNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}
function scalarMatches(type, value) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return isJsonNumber(value);
    case "integer":
      return isJsonNumber(value) && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    /* v8 ignore next -- JsonSchemaScalarType is closed; this retains compile-time exhaustiveness. */
    default:
      return assertNever(type, "JsonSchemaType");
  }
}
var ONE_OF_SIBLING_KEYWORDS = [
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const"
];
function checkObjectSchemaTail(node, path, properties, violations) {
  const hasRequired = Object.hasOwn(node, "required");
  const required = hasRequired ? node.required : void 0;
  if (hasRequired) if (!isPlainJsonArray(required) || required.some((entry) => typeof entry !== "string")) violations.push(`${path}.required must be an array of strings`);
  else {
    const declared = isJsonSchemaRecord(properties) ? properties : {};
    for (const key of required) if (!Object.hasOwn(declared, key)) violations.push(`${path}.required names "${key}" which is not in properties`);
  }
  if (Object.hasOwn(node, "additionalProperties") && typeof node.additionalProperties !== "boolean") violations.push(`${path}.additionalProperties must be a boolean`);
}
function checkSchemaNode(root, rootPath, violations, seen) {
  const tasks = [{
    kind: "enter",
    node: root,
    path: rootPath
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      seen.delete(task.node);
      continue;
    }
    if (task.kind === "one-of-tail") {
      for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(task.node, key)) violations.push(`${task.path}.${key} is not supported beside oneOf`);
      continue;
    }
    if (task.kind === "object-tail") {
      checkObjectSchemaTail(task.node, task.path, task.properties, violations);
      continue;
    }
    const { node, path } = task;
    if (!isJsonSchemaRecord(node)) {
      violations.push(`${path} must be a schema object`);
      continue;
    }
    if (seen.has(node)) {
      violations.push(`${path} is circular`);
      continue;
    }
    seen.add(node);
    tasks.push({
      kind: "leave",
      node
    });
    for (const key of Object.keys(node)) {
      if (CONSTRAINT_KEYWORDS.has(key)) continue;
      if (ANNOTATION_KEYWORDS.has(key)) {
        try {
          if (!isJsonValue(node[key])) violations.push(`${path}.${key} annotation must be lossless JSON data`);
        } catch {
          violations.push(`${path}.${key} annotation must be lossless JSON data`);
        }
        continue;
      }
      violations.push(`${path}.${key} is not a supported keyword (subset: type/oneOf/properties/required/additionalProperties/items/enum/const + annotations)`);
    }
    if (Object.hasOwn(node, "description") && typeof node.description !== "string") violations.push(`${path}.description must be a string`);
    if (Object.hasOwn(node, "title") && typeof node.title !== "string") violations.push(`${path}.title must be a string`);
    const hasType = Object.hasOwn(node, "type");
    const hasOneOf = Object.hasOwn(node, "oneOf");
    if (hasType && hasOneOf) {
      violations.push(`${path} cannot declare both type and oneOf`);
      continue;
    }
    if (!hasType && !hasOneOf) {
      for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(node, key)) violations.push(`${path}.${key} requires type or oneOf`);
      continue;
    }
    if (hasOneOf) {
      const oneOf = node.oneOf;
      tasks.push({
        kind: "one-of-tail",
        node,
        path
      });
      if (!isPlainJsonArray(oneOf) || oneOf.length < 2) violations.push(`${path}.oneOf must be an array of at least two schemas`);
      else for (let index = oneOf.length - 1; index >= 0; index--) tasks.push({
        kind: "enter",
        node: oneOf[index],
        path: `${path}.oneOf[${index}]`
      });
      continue;
    }
    const type = node.type;
    if (typeof type !== "string" || !SCHEMA_TYPES.includes(type)) {
      violations.push(Array.isArray(type) ? `${path}.type must be a single type string (type arrays are not supported)` : `${path}.type must be one of ${SCHEMA_TYPES.join("/")}`);
      continue;
    }
    const schemaType = type;
    for (const [key, types] of Object.entries({
      properties: ["object"],
      required: ["object"],
      additionalProperties: ["object"],
      items: ["array"],
      enum: [
        "string",
        "number",
        "integer",
        "boolean",
        "null"
      ],
      const: [
        "string",
        "number",
        "integer",
        "boolean",
        "null"
      ]
    })) if (Object.hasOwn(node, key) && !types.includes(schemaType)) violations.push(`${path}.${key} is not supported on type "${schemaType}"`);
    switch (schemaType) {
      case "object": {
        const properties = Object.hasOwn(node, "properties") ? node.properties : void 0;
        tasks.push({
          kind: "object-tail",
          node,
          path,
          properties
        });
        if (Object.hasOwn(node, "properties")) if (!isJsonSchemaRecord(properties)) violations.push(`${path}.properties must be an object of schemas`);
        else {
          const entries = Object.entries(properties);
          for (let index = entries.length - 1; index >= 0; index--) {
            const entry = entries[index];
            if (entry === void 0) continue;
            tasks.push({
              kind: "enter",
              node: entry[1],
              path: `${path}.properties.${entry[0]}`
            });
          }
        }
        break;
      }
      case "array":
        if (Object.hasOwn(node, "items")) tasks.push({
          kind: "enter",
          node: node.items,
          path: `${path}.items`
        });
        break;
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null": {
        const hasEnum = Object.hasOwn(node, "enum");
        const allowed = hasEnum ? node.enum : void 0;
        const enumValid = isPlainJsonArray(allowed) && allowed.length > 0 && allowed.every((entry) => scalarMatches(schemaType, entry));
        if (hasEnum && !enumValid) violations.push(`${path}.enum must be a non-empty array of ${schemaType} values`);
        const hasConst = Object.hasOwn(node, "const");
        const declaredConst = hasConst ? node.const : void 0;
        const constValid = scalarMatches(schemaType, declaredConst);
        if (hasConst) {
          if (!constValid) violations.push(`${path}.const must be a ${schemaType} value`);
          else if (enumValid && !allowed.includes(declaredConst)) violations.push(`${path}.const must be one of ${path}.enum when both are declared`);
        }
        break;
      }
      /* v8 ignore next -- schemaType was narrowed from the closed SCHEMA_TYPES table above. */
      default:
        assertNever(schemaType, "JsonSchemaType");
    }
  }
}
function assertSupportedJsonSchema(schema) {
  const violations = [];
  checkSchemaNode(schema, "schema", violations, /* @__PURE__ */ new Set());
  if (violations.length > 0) throw new JsonSchemaError(violations);
}
function safelyIsJsonValue(value) {
  try {
    return isJsonValue(value);
  } catch {
    return false;
  }
}
function diagnosticPath(path) {
  return path === "" ? "arguments" : path;
}
function propertyPath(path, key) {
  return path === "" ? key : `${path}.${key}`;
}
function losslessValueViolation(path) {
  return [`"${diagnosticPath(path)}" must be a lossless JSON value`];
}
function appendViolations(target, source) {
  for (const violation of source) target.push(violation);
}
function valueFrame(node, value, path) {
  return {
    node,
    value,
    path,
    catches: false,
    phase: "start",
    children: [],
    childIndex: 0,
    violations: [],
    tailViolations: [],
    matches: 0
  };
}
function checkScalarValue(node, value, path) {
  const allowed = Object.hasOwn(node, "enum") ? node.enum : void 0;
  if (allowed !== void 0 && !allowed.includes(value)) return [`"${diagnosticPath(path)}" must be one of ${JSON.stringify(allowed)}`];
  if (Object.hasOwn(node, "const") && value !== node.const) return [`"${diagnosticPath(path)}" must be ${JSON.stringify(node.const)}`];
  return [];
}
function checkValue(schema, value, path) {
  const frames = [valueFrame(schema, value, path)];
  let rootResult;
  const receive = (result) => {
    const parent = frames.at(-1);
    if (parent === void 0) {
      rootResult = result;
      return;
    }
    if (parent.kind === "oneOf") {
      if (result.length === 0) parent.matches++;
    } else appendViolations(parent.violations, result);
  };
  const finish = (result) => {
    frames.pop();
    receive(result);
  };
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === void 0) break;
    try {
      if (frame.phase === "children") {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          if (child === void 0) throw new Error("missing schema-value child frame");
          frame.childIndex++;
          frames.push(valueFrame(child.node, child.value, child.path));
          continue;
        }
        if (frame.kind === "oneOf") {
          finish(frame.matches === 1 ? [] : [`"${diagnosticPath(frame.path)}" must match exactly one oneOf branch (matched ${frame.matches})`]);
          continue;
        }
        appendViolations(frame.violations, frame.tailViolations);
        if (frame.violations.length > 0) finish(frame.violations);
        else if (frame.kind === "object") finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a lossless JSON object`]);
        else finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a dense lossless JSON array`]);
        continue;
      }
      const nodeType = Object.hasOwn(frame.node, "type") ? frame.node.type : void 0;
      frame.catches = !(nodeType !== void 0 && !SCHEMA_TYPES.includes(nodeType));
      const oneOf = Object.hasOwn(frame.node, "oneOf") ? frame.node.oneOf : void 0;
      if (oneOf !== void 0) {
        frame.kind = "oneOf";
        frame.children = Array.from(oneOf, (branch) => ({
          node: branch,
          value: frame.value,
          path: frame.path
        }));
        frame.childIndex = 0;
        frame.matches = 0;
        frame.phase = "children";
        continue;
      }
      if (nodeType === void 0) {
        finish(safelyIsJsonValue(frame.value) ? [] : losslessValueViolation(frame.path));
        continue;
      }
      switch (nodeType) {
        case "object": {
          if (!isPlainJsonRecord(frame.value)) {
            finish([`"${diagnosticPath(frame.path)}" must be an object`]);
            break;
          }
          const properties = Object.hasOwn(frame.node, "properties") ? frame.node.properties ?? {} : {};
          const violations = [];
          const required = Object.hasOwn(frame.node, "required") ? frame.node.required ?? [] : [];
          for (const key of required) if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) violations.push(`missing required property "${propertyPath(frame.path, key)}"`);
          const children = [];
          for (const [key, child] of Object.entries(properties)) {
            if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) continue;
            children.push({
              node: child,
              value: frame.value[key],
              path: propertyPath(frame.path, key)
            });
          }
          const tailViolations = [];
          if (Object.hasOwn(frame.node, "additionalProperties") && frame.node.additionalProperties === false) {
            for (const key of Object.keys(frame.value)) if (!Object.hasOwn(properties, key)) tailViolations.push(`"${propertyPath(frame.path, key)}" is not a declared property (additionalProperties: false)`);
          }
          frame.kind = "object";
          frame.children = children;
          frame.childIndex = 0;
          frame.violations = violations;
          frame.tailViolations = tailViolations;
          frame.phase = "children";
          break;
        }
        case "array": {
          if (!Array.isArray(frame.value)) {
            finish([`"${diagnosticPath(frame.path)}" must be an array`]);
            break;
          }
          const items = Object.hasOwn(frame.node, "items") ? frame.node.items : void 0;
          const children = items === void 0 ? [] : frame.value.flatMap((entry, index) => [{
            node: items,
            value: entry,
            path: `${frame.path}[${index}]`
          }]);
          frame.kind = "array";
          frame.children = children;
          frame.childIndex = 0;
          frame.violations = [];
          frame.phase = "children";
          break;
        }
        case "string":
          finish(typeof frame.value === "string" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a string`]);
          break;
        case "number":
          finish(typeof frame.value !== "number" ? [`"${diagnosticPath(frame.path)}" must be a number`] : !isJsonNumber(frame.value) ? [`"${diagnosticPath(frame.path)}" must be a finite JSON number`] : checkScalarValue(frame.node, frame.value, frame.path));
          break;
        case "integer":
          finish(!isJsonNumber(frame.value) || !Number.isInteger(frame.value) ? [`"${diagnosticPath(frame.path)}" must be an integer`] : checkScalarValue(frame.node, frame.value, frame.path));
          break;
        case "boolean":
          finish(typeof frame.value === "boolean" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a boolean`]);
          break;
        case "null":
          finish(frame.value === null ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be null`]);
          break;
        default:
          finish(assertNever(nodeType, "JsonSchemaType"));
      }
    } catch (error) {
      let failed = frames.pop();
      while (failed !== void 0 && !failed.catches) failed = frames.pop();
      if (failed === void 0) throw error;
      receive(losslessValueViolation(failed.path));
    }
  }
  return rootResult ?? losslessValueViolation(path);
}
function validateJsonSchemaValue(schema, value, path = "value") {
  return checkValue(schema, value, path);
}
var ANNOTATION_KEYS = [
  "description",
  "title",
  "default",
  "examples"
];
function authorError(message) {
  throw new JsonSchemaError([message]);
}
function copyAnnotations(source, target) {
  if (Object.hasOwn(source, "description")) target.description = source.description;
  if (Object.hasOwn(source, "title")) target.title = source.title;
  if (Object.hasOwn(source, "default")) target.default = source.default;
  if (Object.hasOwn(source, "examples")) target.examples = source.examples;
}
function assertAuthorKeys(source, path, allowed) {
  for (const key of Object.keys(source)) if (!allowed.includes(key)) authorError(`${path}.${key} is not supported by the value schema DSL`);
}
function assignCompiledNode(destination, node) {
  switch (destination.kind) {
    case "root":
      destination.holder.value = node;
      break;
    case "property":
      Object.defineProperty(destination.target, destination.key, {
        value: node,
        enumerable: true,
        configurable: true,
        writable: true
      });
      break;
    case "item":
      destination.target.items = node;
      break;
    case "one-of":
      destination.target[destination.index] = node;
      break;
  }
}
function assignCompiledPropertyMap(destination, compiled) {
  if (destination.kind === "root") destination.holder.value = compiled;
  else destination.target.properties = compiled.properties;
}
function runSchemaCompiler(initial) {
  const seen = /* @__PURE__ */ new Set();
  const tasks = [initial];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      seen.delete(task.input);
      continue;
    }
    if (task.kind === "property-map-tail") {
      if (task.required.length > 0) {
        task.compiled.required = task.required;
        if (task.destination.kind === "object") task.destination.target.required = task.required;
      }
      continue;
    }
    if (task.kind === "property") {
      if (!isJsonSchemaRecord(task.property)) authorError(`${task.path} must be a value schema object`);
      if (Object.hasOwn(task.property, "required") && task.property.required !== true) authorError(`${task.path}.required must be true when present`);
      if (Object.hasOwn(task.property, "required") && task.property.required === true) task.required.push(task.key);
      tasks.push({
        kind: "value",
        input: task.property,
        path: task.path,
        allowRequired: true,
        destination: {
          kind: "property",
          target: task.properties,
          key: task.key
        }
      });
      continue;
    }
    if (task.kind === "property-map") {
      if (!isJsonSchemaRecord(task.input)) authorError(`${task.path} must be an object of value schemas`);
      if (seen.has(task.input)) authorError(`${task.path} is circular`);
      seen.add(task.input);
      const compiled = { properties: {} };
      const required = [];
      assignCompiledPropertyMap(task.destination, compiled);
      tasks.push({
        kind: "leave",
        input: task.input
      });
      tasks.push({
        kind: "property-map-tail",
        compiled,
        required,
        destination: task.destination
      });
      const entries = Object.entries(task.input);
      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];
        if (entry === void 0) continue;
        tasks.push({
          kind: "property",
          property: entry[1],
          path: `${task.path}.${entry[0]}`,
          key: entry[0],
          properties: compiled.properties,
          required
        });
      }
      continue;
    }
    const { input, path } = task;
    if (!isJsonSchemaRecord(input)) authorError(`${path} must be a value schema object`);
    if (seen.has(input)) authorError(`${path} is circular`);
    seen.add(input);
    const authorKeys = [...ANNOTATION_KEYS, ...task.allowRequired ? ["required"] : []];
    const node = {};
    assignCompiledNode(task.destination, node);
    tasks.push({
      kind: "leave",
      input
    });
    if (Object.hasOwn(input, "oneOf")) {
      assertAuthorKeys(input, path, [
        ...authorKeys,
        "oneOf",
        "type"
      ]);
      if (Object.hasOwn(input, "type")) authorError(`${path} cannot declare both type and oneOf`);
      if (!isPlainJsonArray(input.oneOf)) authorError(`${path}.oneOf must be an array of at least two value schemas`);
      const branches = [];
      node.oneOf = branches;
      copyAnnotations(input, node);
      for (let index = input.oneOf.length - 1; index >= 0; index--) tasks.push({
        kind: "value",
        input: input.oneOf[index],
        path: `${path}.oneOf[${index}]`,
        allowRequired: false,
        destination: {
          kind: "one-of",
          target: branches,
          index
        }
      });
      continue;
    }
    const inputType = Object.hasOwn(input, "type") ? input.type : void 0;
    switch (inputType) {
      case "json":
        assertAuthorKeys(input, path, [...authorKeys, "type"]);
        copyAnnotations(input, node);
        break;
      case "object":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "properties",
          "additionalProperties"
        ]);
        if (!Object.hasOwn(input, "additionalProperties") || typeof input.additionalProperties !== "boolean") authorError(`${path}.additionalProperties must be explicitly true or false`);
        node.type = "object";
        copyAnnotations(input, node);
        node.additionalProperties = input.additionalProperties;
        if (Object.hasOwn(input, "properties")) tasks.push({
          kind: "property-map",
          input: input.properties,
          path: `${path}.properties`,
          destination: {
            kind: "object",
            target: node
          }
        });
        break;
      case "array":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "items"
        ]);
        node.type = "array";
        copyAnnotations(input, node);
        if (Object.hasOwn(input, "items")) tasks.push({
          kind: "value",
          input: input.items,
          path: `${path}.items`,
          allowRequired: false,
          destination: {
            kind: "item",
            target: node
          }
        });
        break;
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "enum",
          "const"
        ]);
        node.type = inputType;
        copyAnnotations(input, node);
        if (Object.hasOwn(input, "enum")) {
          if (!isPlainJsonArray(input.enum)) authorError(`${path}.enum must be a non-empty array of scalar values`);
          node.enum = Array.from(input.enum, (entry) => entry);
        }
        if (Object.hasOwn(input, "const")) node.const = input.const;
        break;
      default:
        authorError(`${path}.type must be string/number/integer/boolean/null/array/object/json, or use oneOf`);
    }
  }
}
function compilePropertyMap(input, path) {
  const holder = {};
  runSchemaCompiler({
    kind: "property-map",
    input,
    path,
    destination: {
      kind: "root",
      holder
    }
  });
  return holder.value ?? authorError(`${path} did not compile`);
}
function compileValueSchema(input, path) {
  const holder = {};
  runSchemaCompiler({
    kind: "value",
    input,
    path,
    allowRequired: false,
    destination: {
      kind: "root",
      holder
    }
  });
  return holder.value ?? authorError(`${path} did not compile`);
}
function valueSchemaSpecToJsonSchema(spec) {
  const schema = compileValueSchema(spec, "schema");
  assertSupportedJsonSchema(schema);
  return schema;
}
function parameterSchemaSpecToJsonSchema(spec) {
  const compiled = compilePropertyMap(spec, "parameters");
  const schema = {
    type: "object",
    properties: compiled.properties,
    ...compiled.required === void 0 ? {} : { required: compiled.required }
  };
  assertSupportedJsonSchema(schema);
  return schema;
}
var ToolArgsError = class extends HarnessError {
  /** Individual violations in schema-walk order. */
  violations;
  constructor(violations) {
    super(`invalid arguments: ${violations.join("; ")}`, "INVALID_ARGS");
    this.name = "ToolArgsError";
    this.violations = violations;
  }
};
function defineTool(options) {
  const userExecute = options.execute;
  const userFinalizeContent = options.finalizeContent;
  const userRender = options.output.render;
  const userPresentationMeta = options.output.presentationMeta;
  const userPresentCall = options.presentCall;
  const userPresentResult = options.presentResult;
  const userIsConcurrencySafe = options.isConcurrencySafe;
  if (options.timeoutMs !== void 0 && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error(`defineTool(${options.name}): timeoutMs must be a positive finite number`);
  const parameters = parameterSchemaSpecToJsonSchema(options.parameters);
  const outputSchema = valueSchemaSpecToJsonSchema(options.output.schema);
  const validate = (args) => validateJsonSchemaValue(parameters, args, "");
  const tool = {
    name: options.name,
    description: options.description,
    parameters,
    output: {
      schema: outputSchema,
      render(args, value) {
        return userRender(args, value);
      },
      ...userPresentationMeta !== void 0 ? { presentationMeta(args, value) {
        return userPresentationMeta(args, value);
      } } : {}
    },
    ...options.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {},
    async execute(args, exec) {
      const violations = validate(args);
      if (violations.length > 0) throw new ToolArgsError(violations);
      return userExecute(args, exec);
    }
  };
  if (userFinalizeContent) tool.finalizeContent = (exec, result) => userFinalizeContent(exec, result);
  if (userPresentCall) tool.presentCall = (args) => {
    if (validate(args).length > 0) return void 0;
    return userPresentCall(args);
  };
  if (userPresentResult) tool.presentResult = (args, result) => {
    if (validate(args).length > 0) return void 0;
    return userPresentResult(args, result);
  };
  if (userIsConcurrencySafe) tool.isConcurrencySafe = (args) => {
    if (validate(args).length > 0) return false;
    return userIsConcurrencySafe(args);
  };
  return tool;
}
var RUN_CODE_NAME = "run_code";
var TYPESCRIPT_FLAVOR = {
  description: "Execute a TypeScript program against the available tools. Takes two required arguments: `code`, the BODY of an async function (erasable syntax only; top-level `await` and `return` work), and `description`, a short summary of what the program does. Call tools as `await tools.name(args)` per the declarations in the system prompt. Only what you print or return is program output \u2014 curate it. Image-bearing subtool results are attached after the run.",
  codeDescription: "The program: the body of an async TypeScript function."
};
var RUN_CODE_FLAVORS = {
  typescript: TYPESCRIPT_FLAVOR,
  python: {
    description: "Execute a Python program against the available tools. Takes two required arguments: `code`, the BODY of an async function (top-level `await` and `return` work), and `description`, a short summary of what the program does. Call tools as `await tools.name(args)` per the declarations in the system prompt. Use `print(...)` and/or `return <value>` for program output \u2014 curate it. Image-bearing subtool results are attached after the run.",
    codeDescription: "The program: the body of an async Python function."
  }
};
var RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION = 'Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: "Count TODO markers across packages"; "Read failing test and its fixture"; "Rename config key in every cordis.yml".';
function resolveFlavor(peekRuntime) {
  const runtime = peekRuntime();
  if (runtime === void 0) return TYPESCRIPT_FLAVOR;
  const flavor = RUN_CODE_FLAVORS[runtime.language];
  if (!Object.hasOwn(RUN_CODE_FLAVORS, runtime.language) || flavor === void 0) {
    const known = Object.keys(RUN_CODE_FLAVORS).map((name2) => JSON.stringify(name2)).join(", ");
    throw new Error(`dsh-tools: no run_code schema flavor registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`);
  }
  return flavor;
}
var CodeRunFailedError = class extends HarnessError {
  constructor(message) {
    super(message, "CODE_RUN_FAILED");
    this.name = "CodeRunFailedError";
  }
};
function jsonNormalizeArgs(value) {
  let snapshot;
  try {
    snapshot = snapshotJsonValue(value);
  } catch (error) {
    throw new Error(`tool arguments must be lossless JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (snapshot === void 0) throw new Error("tool arguments must be lossless JSON (call the tool with an arguments object, e.g. `{}`)");
  const logged = snapshotJsonValue(snapshot);
  if (logged === void 0) throw new Error("tool arguments could not be detached for durable logging");
  return {
    dispatched: snapshot,
    logged
  };
}
var JSON_INDENT = "  ";
var MAX_JSON_INDENT_CHARS = 10;
function renderJsonValue(value) {
  const chunks = [];
  const tasks = [{
    kind: "value",
    value,
    depth: 0,
    compact: false
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "text") {
      chunks.push(task.text);
      continue;
    }
    const current = task.value;
    if (current === null || typeof current === "boolean" || typeof current === "number") {
      chunks.push(String(current));
      continue;
    }
    if (typeof current === "string") {
      chunks.push(JSON.stringify(current));
      continue;
    }
    const compact = task.compact || (task.depth + 1) * 2 > MAX_JSON_INDENT_CHARS;
    const childDepth = task.depth + 1;
    if (Array.isArray(current)) {
      chunks.push("[");
      if (current.length === 0) {
        chunks.push("]");
        continue;
      }
      tasks.push({
        kind: "text",
        text: compact ? "]" : `
${JSON_INDENT.repeat(task.depth)}]`
      });
      for (let index = current.length - 1; index >= 0; index--) {
        const item = current[index];
        if (item === void 0) throw new Error("cannot render a sparse JSON array");
        tasks.push({
          kind: "value",
          value: item,
          depth: childDepth,
          compact
        });
        tasks.push({
          kind: "text",
          text: compact ? index === 0 ? "" : "," : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}`
        });
      }
      continue;
    }
    const keys = Object.keys(current);
    chunks.push("{");
    if (keys.length === 0) {
      chunks.push("}");
      continue;
    }
    tasks.push({
      kind: "text",
      text: compact ? "}" : `
${JSON_INDENT.repeat(task.depth)}}`
    });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) throw new Error("cannot render a missing JSON object key");
      const item = current[key];
      if (item === void 0) throw new Error("cannot render an undefined JSON object property");
      tasks.push({
        kind: "value",
        value: item,
        depth: childDepth,
        compact
      });
      tasks.push({
        kind: "text",
        text: compact ? `${index === 0 ? "" : ","}${JSON.stringify(key)}:` : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}${JSON.stringify(key)}: `
      });
    }
  }
  return chunks.join("");
}
function renderValue(value) {
  return typeof value === "string" ? value : renderJsonValue(value);
}
function createRunCodeTool(registry, options) {
  const { requireRuntime, peekRuntime, maxParallel, shapeDispatchLog } = options;
  const definition = defineTool({
    name: RUN_CODE_NAME,
    description: TYPESCRIPT_FLAVOR.description,
    parameters: {
      code: {
        type: "string",
        required: true,
        description: TYPESCRIPT_FLAVOR.codeDescription
      },
      description: {
        type: "string",
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          logs: {
            type: "array",
            required: true,
            items: { type: "string" }
          },
          result: { type: "json" }
        }
      },
      render: (_args, value) => {
        const rendered = value.result === void 0 ? "" : renderValue(value.result);
        const parts = [value.logs.join("\n"), rendered].filter((part) => part.length > 0);
        return [{
          type: "text",
          text: parts.length > 0 ? parts.join("\n") : "(run_code completed with no output)"
        }];
      }
    },
    async execute(args, exec) {
      if (args.description.trim().length === 0) throw new Error("invalid description: expected a non-empty string");
      const runtime = requireRuntime();
      const runController = new AbortController();
      const onOuterAbort = () => {
        runController.abort(exec.signal.reason);
      };
      exec.signal.addEventListener("abort", onOuterAbort, { once: true });
      let dispatches = 0;
      const pendingQueue = [];
      const inFlight = /* @__PURE__ */ new Set();
      const logWork = /* @__PURE__ */ new Set();
      const commitQueue = [];
      let exclusiveActive = false;
      let driving = false;
      let driverRun = Promise.resolve();
      let wake;
      const wakeup = () => {
        const release = wake;
        wake = void 0;
        release?.();
      };
      const drive = () => {
        if (driving) return driverRun;
        driving = true;
        driverRun = (async () => {
          try {
            for (; ; ) {
              const signal = new Promise((resolve4) => {
                wake = resolve4;
              });
              const commitHead = commitQueue[0];
              if (commitHead !== void 0 && commitHead.settled) {
                commitQueue.shift();
                await commitHead.commit();
                if (commitHead.mode === "exclusive") exclusiveActive = false;
                continue;
              }
              const head = pendingQueue[0];
              if (head !== void 0) {
                if (runController.signal.aborted) {
                  pendingQueue.shift();
                  head.abandon();
                  continue;
                }
                const mode = head.classify();
                if (!exclusiveActive && (mode === "exclusive" ? inFlight.size === 0 : inFlight.size < maxParallel)) {
                  if (mode === "exclusive") exclusiveActive = true;
                  head.mode = mode;
                  pendingQueue.shift();
                  commitQueue.push(head);
                  await head.start();
                  const flight = head.flight.finally(() => {
                    inFlight.delete(flight);
                    wakeup();
                  });
                  inFlight.add(flight);
                  continue;
                }
              }
              if (pendingQueue.length === 0 && commitQueue.length === 0 && inFlight.size === 0) return;
              await signal;
            }
          } finally {
            driving = false;
            wake = void 0;
          }
        })();
        return driverRun;
      };
      const drainDispatches = async () => {
        await drive();
        while (logWork.size > 0) await Promise.allSettled([...logWork]);
      };
      const runOver = () => runController.signal.aborted;
      const binding = (name2) => async (rawArgs) => {
        if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} not dispatched`);
        const normalized = jsonNormalizeArgs(rawArgs);
        const n = ++dispatches;
        const subCallId = brandString(`${String(exec.callId)}:ptc:${n}`);
        const input = {
          callId: subCallId,
          rootCallId: exec.rootCallId,
          name: name2,
          arguments: normalized.dispatched,
          ...exec.agent ? { agent: exec.agent } : {},
          parent: exec.token,
          signal: runController.signal
        };
        const scheduler = registry[TOOL_RUNTIME_SCHEDULER];
        const outcome = await new Promise((resolve4, reject) => {
          let parked;
          const settle = (result) => {
            resolve4(result.isError ? {
              isError: true,
              message: result.error.message
            } : {
              isError: false,
              value: result.value
            });
            const agent = exec.agent;
            if (agent === void 0) return;
            const task = (async () => {
              const logged = await shapeDispatchLog({
                exec,
                agent,
                subCallId,
                name: name2,
                isError: result.isError,
                content: result.content
              });
              agent.session.append("tool/ptc-dispatch", {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name: name2,
                arguments: normalized.logged,
                isError: result.isError,
                content: logged
              });
            })().finally(() => {
              logWork.delete(task);
            });
            logWork.add(task);
          };
          pendingQueue.push({
            flight: Promise.resolve(),
            settled: false,
            classify: () => registry.executionMode(input).kind,
            abandon: () => {
              reject(/* @__PURE__ */ new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} tool call abandoned`));
            },
            async start() {
              exec.agent?.session.append("tool/ptc-dispatch-start", {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name: name2,
                arguments: normalized.logged
              });
              const prepared = await scheduler.prepare(input);
              if (prepared.kind === "dispatch") {
                this.flight = scheduler.dispatch(prepared.exec).then((dispatchOutcome) => {
                  parked = {
                    kind: dispatchOutcome.kind,
                    exec: prepared.exec,
                    result: dispatchOutcome.result
                  };
                  this.settled = true;
                });
                return;
              }
              parked = {
                kind: prepared.kind,
                exec: prepared.exec,
                result: prepared.result
              };
              this.settled = true;
            },
            async commit() {
              if (parked === void 0) return;
              const result = parked.kind === "post-result" ? await scheduler.finalize(parked.exec, parked.result) : scheduler.finish(parked.exec, parked.result);
              if (!result.isError && result.content.some((block) => block.type === "image")) exec.deferContext(createUserMessage({
                content: result.content,
                source: {
                  kind: "plugin",
                  plugin: "tools-ptc"
                }
              }));
              for (const context of result.additionalContexts ?? []) exec.deferContext(context);
              if (result.concludesTurn) exec.concludeTurn();
              settle(result);
              while (logWork.size > maxParallel) await Promise.race(logWork);
            }
          });
          wakeup();
          drive();
        });
        if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} result discarded`);
        if (outcome.isError) throw new Error(outcome.message);
        return outcome.value;
      };
      const functions = /* @__PURE__ */ Object.create(null);
      for (const schema of registry.schemas(exec.agent)) {
        if (schema.name === "run_code") continue;
        Object.defineProperty(functions, schema.name, {
          enumerable: true,
          value: binding(schema.name)
        });
      }
      try {
        let result;
        try {
          result = await runtime.run({
            program: args.code,
            bindings: [{
              global: "tools",
              functions,
              errorClass: {
                name: "ToolCallError",
                memberNameProperty: "toolName"
              }
            }],
            signal: runController.signal
          });
        } finally {
          runController.abort("run_code settled");
          await drainDispatches();
        }
        if (result.error) {
          const logsText = result.logs.length > 0 ? `
Captured output:
${result.logs.join("\n")}` : "";
          throw new CodeRunFailedError(`code run failed (${result.error.kind}): ${result.error.message}${logsText}`);
        }
        return {
          logs: result.logs,
          ...result.value !== void 0 ? { result: result.value } : {}
        };
      } finally {
        exec.signal.removeEventListener("abort", onOuterAbort);
      }
    },
    presentCall: (args) => ({
      card: "generic",
      title: args.description,
      kind: "execute",
      rawInput: args.code
    })
  });
  Object.defineProperty(definition, "description", {
    enumerable: true,
    get: () => resolveFlavor(peekRuntime).description
  });
  Object.defineProperty(definition, "parameters", {
    enumerable: true,
    get: () => parameterSchemaSpecToJsonSchema({
      code: {
        type: "string",
        required: true,
        description: resolveFlavor(peekRuntime).codeDescription
      },
      description: {
        type: "string",
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
      }
    })
  });
  return definition;
}
var IDENTIFIER$1 = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function renderKey(name2) {
  return IDENTIFIER$1.test(name2) ? name2 : JSON.stringify(name2);
}
function pad$1(indent) {
  return "  ".repeat(indent);
}
function docLines$1(description, indent) {
  if (typeof description !== "string" || description.length === 0) return [];
  const collapsed = description.replace(/\s+/g, " ").trim();
  return [`${pad$1(indent)}/** ${collapsed.replaceAll("*/", String.raw`*\/`)} */`];
}
function renderScalar(value) {
  return JSON.stringify(value);
}
function renderConstrainedScalar$1(node, type) {
  const broad = type === "integer" ? "number" : type;
  if (Object.hasOwn(node, "const")) return renderScalar(node.const);
  if (Object.hasOwn(node, "enum")) return node.enum.map(renderScalar).join(" | ");
  return broad;
}
function typeDocumentFrom(parts) {
  return {
    parts,
    containsUnionOrIntersection: parts.some((part) => typeof part === "string" ? part.includes("|") || part.includes("&") : part.containsUnionOrIntersection)
  };
}
function typeDocument(...parts) {
  return typeDocumentFrom(parts);
}
function flattenTypeDocument(document) {
  const chunks = [];
  const tasks = [document];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (typeof task === "string") {
      chunks.push(task);
      continue;
    }
    for (let index = task.parts.length - 1; index >= 0; index--) {
      const part = task.parts[index];
      if (part !== void 0) tasks.push(part);
    }
  }
  return chunks.join("");
}
function schemaRenderFrame(node, indent) {
  return {
    node,
    indent,
    phase: "start",
    children: [],
    childIndex: 0,
    childDocuments: [],
    entries: []
  };
}
function renderSupportedSchema(schema, indent) {
  const frames = [schemaRenderFrame(schema, indent)];
  let rootDocument;
  const finish = (document) => {
    frames.pop();
    const parent = frames.at(-1);
    if (parent === void 0) rootDocument = document;
    else parent.childDocuments.push(document);
  };
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === void 0) break;
    if (frame.phase === "children") {
      if (frame.childIndex < frame.children.length) {
        const child = frame.children[frame.childIndex];
        if (child === void 0) throw new Error("missing schema render child");
        frame.childIndex++;
        frames.push(schemaRenderFrame(child.node, child.indent));
        continue;
      }
      if (frame.kind === "oneOf") {
        const parts2 = [];
        for (let index = 0; index < frame.childDocuments.length; index++) {
          if (index > 0) parts2.push(" | ");
          const child = frame.childDocuments[index];
          if (child !== void 0) parts2.push(child);
        }
        finish(typeDocumentFrom(parts2));
        continue;
      }
      if (frame.kind === "array") {
        const child = frame.childDocuments[0];
        if (child === void 0) throw new Error("missing array item type");
        finish(child.containsUnionOrIntersection ? typeDocument("(", child, ")[]") : typeDocument(child, "[]"));
        continue;
      }
      const required = new Set(frame.node.required);
      const parts = ["{"];
      for (let index = 0; index < frame.entries.length; index++) {
        const entry = frame.entries[index];
        const child = frame.childDocuments[index];
        if (entry === void 0 || child === void 0) throw new Error("missing object property type");
        const [name2, prop] = entry;
        for (const line of docLines$1(prop.description, frame.indent + 1)) parts.push("\n", line);
        parts.push("\n", `${pad$1(frame.indent + 1)}${renderKey(name2)}${required.has(name2) ? "" : "?"}: `, child, ";");
      }
      parts.push("\n", `${pad$1(frame.indent)}}`);
      const declared = typeDocumentFrom(parts);
      finish(frame.node.additionalProperties === false ? declared : typeDocument(declared, " & Record<string, JsonValue>"));
      continue;
    }
    const node = frame.node;
    if (node.oneOf !== void 0) {
      frame.kind = "oneOf";
      frame.children = Array.from(node.oneOf, (child) => ({
        node: child,
        indent: frame.indent
      }));
      frame.childIndex = 0;
      frame.childDocuments = [];
      frame.phase = "children";
      continue;
    }
    if (node.type === void 0) {
      finish(typeDocument("JsonValue"));
      continue;
    }
    switch (node.type) {
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        finish(typeDocument(renderConstrainedScalar$1(node, node.type)));
        break;
      case "array":
        if (node.items === void 0) finish(typeDocument("JsonValue[]"));
        else {
          frame.kind = "array";
          frame.children = [{
            node: node.items,
            indent: frame.indent
          }];
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      case "object": {
        const open = node.additionalProperties !== false;
        const entries = Object.entries(node.properties ?? {});
        if (entries.length === 0) finish(typeDocument(open ? "Record<string, JsonValue>" : "Record<string, never>"));
        else {
          frame.kind = "object";
          frame.entries = entries;
          frame.children = entries.map(([, child]) => ({
            node: child,
            indent: frame.indent + 1
          }));
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      }
      /* v8 ignore next -- assertSupportedJsonSchema narrowed this closed type union. */
      default:
        finish(typeDocument("unknown"));
    }
  }
  return rootDocument ?? typeDocument("unknown");
}
function jsonSchemaToTs(schema, indent = 0) {
  try {
    assertSupportedJsonSchema(schema);
    return flattenTypeDocument(renderSupportedSchema(schema, indent));
  } catch {
    return "unknown";
  }
}
var SDK_INSTRUCTIONS$1 = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` \u2014 the body of an async TypeScript function (erasable syntax only \u2014 no \`enum\` or namespaces; type annotations are advisory, the code runs type-stripped) \u2014 and \`description\`, a short summary of what the program does. The declarations below are SDK bindings for this program. A declaration does not make its name a directly callable tool; only names supplied as separate tool schemas may be called directly.`;
var SDK_PROGRAM_INSTRUCTIONS = `Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 quoted access for exotic names: \`tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose \`message\` is human-readable \u2014 \`try/catch\` it to handle and continue.
- Independent read-only calls MAY overlap under \`Promise.all\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit results with \`return\` and/or \`console.log(...)\`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

Program-only SDK bindings:`;
function acceptsExampleString(schema, value) {
  return schema?.type === "string" && (schema.const === void 0 || schema.const === value) && (schema.enum === void 0 || schema.enum.includes(value));
}
function renderBashExample(schemas) {
  const bash = schemas.find((schema) => schema.name === "bash");
  if (bash === void 0) return "";
  const parameters = bash.parameters;
  if (parameters.type !== "object") return "";
  const required = parameters.required ?? [];
  if (required.some((name2) => name2 !== "command" && name2 !== "description")) return "";
  if (!acceptsExampleString(parameters.properties?.command, "pwd")) return "";
  const needsDescription = required.includes("description");
  if (needsDescription && !acceptsExampleString(parameters.properties?.description, "Show current directory")) return "";
  return ` When no separate \`bash\` schema is supplied, invoke a declared \`bash\` binding inside \`run_code\`:

\`run_code({ code: "return await tools.bash({ command: 'pwd'${needsDescription ? ", description: 'Show current directory'" : ""} })", description: "Show current directory" })\``;
}
function renderToolsSdk(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const argsMembers = [];
  const outputMembers = [];
  for (const schema of sorted) {
    argsMembers.push(...docLines$1(schema.description, 1));
    argsMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.parameters, 1)};`);
    outputMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.output, 1)};`);
  }
  const declaration = [
    `interface ToolArgsMap {${argsMembers.length > 0 ? `
${argsMembers.join("\n")}
` : ""}}`,
    `interface ToolOutputMap {${outputMembers.length > 0 ? `
${outputMembers.join("\n")}
` : ""}}`,
    "type ToolName = keyof ToolOutputMap",
    [
      "declare class ToolCallError extends Error {",
      '  readonly name: "ToolCallError";',
      "  readonly toolName: ToolName;",
      "}"
    ].join("\n"),
    [
      "declare const tools: {",
      "  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;",
      "}"
    ].join("\n")
  ].join("\n\n");
  return `${SDK_INSTRUCTIONS$1}${renderBashExample(sorted)}

${SDK_PROGRAM_INSTRUCTIONS}

\`\`\`ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

${declaration}
\`\`\``;
}
var IDENTIFIER = /^[\p{XID_Start}_]\p{XID_Continue}*$/u;
function isBareIdentifier(name2) {
  return IDENTIFIER.test(name2) && name2.normalize("NFKC") === name2;
}
var RESERVED = /* @__PURE__ */ new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "__debug__"
]);
var TYPING_ORDER = [
  "Any",
  "Literal",
  "NotRequired",
  "Protocol",
  "TypedDict"
];
function pad(indent) {
  return "    ".repeat(indent);
}
var UNPRINTABLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g;
var LONE_SURROGATE = /[\ud800-\udfff]/gu;
function describe(schema) {
  const description = schema.description;
  if (typeof description !== "string") return void 0;
  const collapsed = description.replace(/\s+/g, " ").replace(UNPRINTABLE, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`).replace(LONE_SURROGATE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).trim();
  return collapsed.length === 0 ? void 0 : collapsed;
}
function docLines(description, indent) {
  const collapsed = describe({ description });
  if (collapsed === void 0) return [];
  const escaped = collapsed.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [`${pad(indent)}"""${escaped}"""`];
}
function camelCase(raw) {
  const joined = raw.split(/[^\p{XID_Continue}]+|_+/u).filter((part) => part.length > 0).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join("").normalize("NFKC");
  return (/^\p{XID_Start}/u.test(joined) ? joined : `Tool${joined}`).normalize("NFKC");
}
var MAX_CLASS_NAME_BASE = 120;
var MAX_LIST_NESTING = 180;
function capClassNameBase(base) {
  if (base.length <= MAX_CLASS_NAME_BASE) return base;
  const capped = base.slice(0, MAX_CLASS_NAME_BASE);
  return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped;
}
function allocateClassName(base, state) {
  const capped = capClassNameBase(base);
  let name2 = capped;
  if (state.usedClassNames.has(name2)) {
    let n = state.nextClassCounter.get(capped) ?? 2;
    while (state.usedClassNames.has(`${capped}${n}`)) n++;
    name2 = `${capped}${n}`;
    state.nextClassCounter.set(capped, n + 1);
  }
  state.usedClassNames.add(name2);
  return name2;
}
function childClassName(base, segment) {
  return capClassNameBase(`${base}${segment}`.normalize("NFKC"));
}
function pyScalar(value) {
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) return BigInt(value).toString();
  return String(value);
}
function renderConstrainedScalar(node, broad, state) {
  if (node.const !== void 0) {
    state.typing.add("Literal");
    return `Literal[${pyScalar(node.const)}]`;
  }
  if (node.enum !== void 0) {
    state.typing.add("Literal");
    return `Literal[${node.enum.map(pyScalar).join(", ")}]`;
  }
  return broad;
}
function renderType(schema, className, state) {
  const newFrame = (schema2, className2, listDepth) => ({
    schema: schema2,
    className: className2,
    phase: "start",
    listDepth,
    children: [],
    childIndex: 0,
    childTypes: [],
    entries: []
  });
  try {
    assertSupportedJsonSchema(schema);
    const frames = [newFrame(schema, className, 0)];
    let result;
    const finish = (type) => {
      frames.pop();
      const parent = frames.at(-1);
      if (parent === void 0) result = type;
      else parent.childTypes.push(type);
    };
    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame === void 0) break;
      if (frame.phase === "children") {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          if (child === void 0) throw new Error("missing python render child");
          frame.childIndex++;
          frames.push(newFrame(child.schema, child.className, child.listDepth));
          continue;
        }
        if (frame.kind === "oneOf") {
          let union = "";
          for (const [index, childType] of frame.childTypes.entries()) union = index === 0 ? childType : `${union} | ${childType}`;
          finish(union);
          continue;
        }
        if (frame.kind === "array") {
          finish(`list[${frame.childTypes[0] ?? "Any"}]`);
          continue;
        }
        const node2 = frame.node;
        const name2 = frame.allocated;
        if (node2 === void 0 || name2 === void 0) throw new Error("missing typeddict frame state");
        const required = new Set(node2.required);
        const lines = [`class ${name2}(TypedDict):`];
        for (let index = 0; index < frame.entries.length; index++) {
          const entry = frame.entries[index];
          const fieldType = frame.childTypes[index];
          if (entry === void 0 || fieldType === void 0) throw new Error("missing typeddict field type");
          const [field, fieldSchema] = entry;
          const description = describe(fieldSchema);
          if (description !== void 0) lines.push(`${pad(1)}# ${description}`);
          if (required.has(field)) lines.push(`${pad(1)}${field}: ${fieldType}`);
          else {
            state.typing.add("NotRequired");
            lines.push(`${pad(1)}${field}: NotRequired[${fieldType}]`);
          }
        }
        if (node2.additionalProperties !== false) lines.push(`${pad(1)}# Additional keys beyond those declared are allowed.`);
        if (lines.length === 1) lines.push(`${pad(1)}pass`);
        state.classes.push(lines.join("\n"));
        finish(name2);
        continue;
      }
      frame.phase = "children";
      const node = frame.schema;
      if (node.oneOf !== void 0) {
        frame.kind = "oneOf";
        frame.children = node.oneOf.map((branch, index) => ({
          schema: branch,
          className: childClassName(frame.className, `${index + 1}`),
          listDepth: frame.listDepth
        }));
        continue;
      }
      if (node.type === void 0) {
        state.typing.add("Any");
        finish("Any");
        continue;
      }
      switch (node.type) {
        case "string":
          finish(renderConstrainedScalar(node, "str", state));
          break;
        case "number":
          finish(renderConstrainedScalar(node, "float", state));
          break;
        case "integer":
          finish(renderConstrainedScalar(node, "int", state));
          break;
        case "boolean":
          finish(renderConstrainedScalar(node, "bool", state));
          break;
        case "null":
          finish("None");
          break;
        case "array":
          if (node.items === void 0) {
            state.typing.add("Any");
            finish("list[Any]");
            break;
          }
          if (frame.listDepth >= MAX_LIST_NESTING) {
            state.typing.add("Any");
            finish("Any");
            break;
          }
          frame.kind = "array";
          frame.children = [{
            schema: node.items,
            className: frame.className,
            listDepth: frame.listDepth + 1
          }];
          break;
        case "object": {
          const entries = Object.entries(node.properties ?? {});
          if (className === "" || !entries.every(([name2]) => isBareIdentifier(name2) && !RESERVED.has(name2) && !(name2.startsWith("__") && !name2.endsWith("__")))) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          if (entries.length === 0 && node.additionalProperties !== false) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          frame.kind = "typeddict";
          frame.node = node;
          frame.allocated = allocateClassName(frame.className, state);
          state.typing.add("TypedDict");
          frame.entries = entries;
          frame.children = entries.map(([field, child]) => ({
            schema: child,
            className: childClassName(frame.allocated ?? "", camelCase(field)),
            listDepth: 1
          }));
          break;
        }
        /* v8 ignore next 4 -- assertSupportedJsonSchema narrowed this closed type union. */
        default:
          state.typing.add("Any");
          finish("Any");
      }
    }
    return result ?? "Any";
  } catch {
    state.typing.add("Any");
    return "Any";
  }
}
var SDK_INSTRUCTIONS = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` \u2014 the body of an async Python function (top-level \`await\` and \`return\` both work) \u2014 and \`description\`, a short summary of what the program does. At run time exactly two of the names declared below are bound: \`tools\` and \`ToolCallError\`. Everything else is a STATIC STUB describing argument and return types \u2014 in particular the \`TypedDict\` classes do NOT exist at run time, so build arguments as plain \`dict\`/\`list\` JSON values: \`await tools.name({"field": 1})\`, never \`FooArgs(field=1)\`, which raises \`NameError\`. Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 subscript access for exotic, reserved, or underscore-leading names: \`await tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value (each method's return type below). Tool arguments must be lossless JSON.
- A FAILED tool call raises \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose message is human-readable \u2014 wrap in \`try/except\` to handle and continue.
- Independent read-only calls MAY overlap under \`asyncio.gather\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit the run's answer with \`print(...)\` and/or a top-level \`return <value>\`; the returned value must be lossless JSON. Only what you print and return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

The available tools:`;
function renderToolsSdkPy(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const state = {
    classes: [],
    usedClassNames: /* @__PURE__ */ new Set(),
    nextClassCounter: /* @__PURE__ */ new Map(),
    typing: /* @__PURE__ */ new Set(["Protocol"])
  };
  const members = [];
  let statements = 0;
  for (const schema of sorted) {
    const argType = renderType(schema.parameters, `${camelCase(schema.name)}Args`, state);
    const outputType = renderType(schema.output, `${camelCase(schema.name)}Output`, state);
    if (isBareIdentifier(schema.name) && !RESERVED.has(schema.name) && !schema.name.startsWith("_")) {
      const doc = docLines(schema.description, 2);
      members.push(doc.length > 0 ? `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}:` : `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}: ...`);
      members.push(...doc);
      statements += 1;
    } else {
      members.push(`${pad(1)}# tools[${JSON.stringify(schema.name)}](args: ${argType}) -> ${outputType}`);
      const description = describe(schema);
      if (description !== void 0) members.push(`${pad(1)}#   ${description}`);
    }
  }
  const body = (statements > 0 ? members : [`${pad(1)}pass`, ...members]).join("\n");
  const imports = TYPING_ORDER.filter((symbol) => state.typing.has(symbol));
  const classBlock = state.classes.length > 0 ? `${state.classes.join("\n\n")}

` : "";
  return `${SDK_INSTRUCTIONS}

\`\`\`python
${`from typing import ${imports.join(", ")}

class ToolCallError(Exception):
    toolName: str

${classBlock}class Tools(Protocol):
${body}

tools: Tools`}
\`\`\``;
}
var PTC_ONLY_INSTRUCTION = `\`${RUN_CODE_NAME}\` is the only tool you can call directly \u2014 a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.`;
var SDK_RENDERERS = {
  typescript: renderToolsSdk,
  python: renderToolsSdkPy
};
var TOOL_RUNTIME_SCHEDULER = Symbol("@deepseek-ai/dsh-tools.scheduler");
var TOOL_ABORTED = "ABORTED";
var TOOL_ABORTED_BEFORE_DISPATCH = "ABORTED_BEFORE_DISPATCH";
var ToolNotFoundError = class extends HarnessError {
  /**
  * @param toolName - the name the caller asked for.
  * @param reachableFrom - how the model reaches this tool instead, when the
  *   name IS visible and only the presentation denies calling it directly.
  *   Omitted for a name that is registered nowhere.
  */
  constructor(toolName, reachableFrom) {
    super(reachableFrom === void 0 ? `unknown tool "${toolName}"` : `unknown tool "${toolName}": ${reachableFrom}`, "UNKNOWN_TOOL");
    this.name = "ToolNotFoundError";
  }
};
var ToolOutputError = class extends HarnessError {
  /** Schema/value violations in validation order. */
  violations;
  constructor(toolName, violations) {
    super(`tool "${toolName}" returned invalid output: ${violations.join("; ")}`, "INVALID_TOOL_OUTPUT");
    this.name = "ToolOutputError";
    this.violations = violations;
  }
};
function projectionError(toolName, projector, error) {
  return new ToolOutputError(toolName, [`output.${projector} failed: ${errorMessage2(error)}`]);
}
function snapshotProjection(toolName, projector, candidate) {
  try {
    const detached = snapshotJsonValue(candidate);
    if (detached === void 0) throw new ToolOutputError(toolName, [`output.${projector} returned non-lossless JSON`]);
    return detached;
  } catch (error) {
    if (error instanceof ToolOutputError) throw error;
    throw projectionError(toolName, projector, error);
  }
}
function snapshotToolValue(toolName, candidate) {
  try {
    const detached = snapshotJsonValue(candidate);
    if (detached === void 0) throw new ToolOutputError(toolName, ["value is not lossless JSON"]);
    return detached;
  } catch (error) {
    if (error instanceof ToolOutputError) throw error;
    throw new ToolOutputError(toolName, [`value snapshot failed: ${errorMessage2(error)}`]);
  }
}
function errorMessage2(error) {
  try {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
    return String(error);
  } catch {
    return "<unprintable thrown value>";
  }
}
function failureMessageFromContent(content) {
  const text = content.map((block) => block.type === "text" ? block.text : `[${block.type} content]`).join("\n");
  return text.length > 0 ? text : "tool result blocked by post-execute policy";
}
function materializePresentation(candidate) {
  const detached = snapshotJsonValue(candidate);
  if (detached === void 0) throw new TypeError("tool result must be losslessly JSON-serializable");
  return deepFreeze(detached);
}
function errorInfo(error) {
  try {
    return error instanceof HarnessError ? {
      name: error.name,
      code: error.code
    } : void 0;
  } catch {
    return;
  }
}
var ToolLayer = class {
  tools;
  restrictions = new AnonymousEntries();
  guards = new AnonymousEntries();
  /**
  * Presentation this scope's agent declared for itself, shadowing the
  * deployment default. One cell rather than an entry table: two answers to
  * "which form does the model see" is a contradiction, not a merge.
  */
  mode;
  constructor(scope) {
    this.tools = new NamedEntries((name2) => /* @__PURE__ */ new Error(scope === void 0 ? `tool "${name2}" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)` : `tool "${name2}" is already registered in this scope`));
  }
  /** Whether every contribution table in this aggregate layer is empty. */
  isEmpty() {
    return this.tools.isEmpty() && this.restrictions.isEmpty() && this.guards.isEmpty() && this.mode === void 0;
  }
  /** Whether every compiled restriction in this layer admits a global tool name. */
  admits(name2) {
    for (const filter of this.restrictions.values()) if (filter.allow !== void 0 && !filter.allow.has(name2) || filter.deny !== void 0 && filter.deny.has(name2)) return false;
    return true;
  }
  /** First monotonic denial from this layer's live guard registrations. */
  guardReason(exec) {
    for (const guard of this.guards.values()) {
      const reason = guard(exec);
      if (reason !== void 0) return reason;
    }
  }
};
function resolveMaxParallelSubCalls(value) {
  const maxParallelSubCalls = value ?? 10;
  if (!Number.isInteger(maxParallelSubCalls) || maxParallelSubCalls < 1) throw new Error("maxParallelSubCalls must be a positive integer");
  return maxParallelSubCalls;
}
var ToolRuntime = class extends Service2 {
  static inject = ["systemPrompt"];
  static Config = z2.object({
    mode: z2.union([
      "native",
      "ptc",
      "both"
    ]).default("native"),
    maxParallelSubCalls: z2.natural().min(1).default(10)
  });
  /** Internal staged view consumed by `dsh-agent-loop`'s parallel scheduler. */
  [TOOL_RUNTIME_SCHEDULER] = {
    prepare: (exec) => this.prepareScheduledExecution(exec),
    dispatch: (exec) => this.dispatchScheduledExecution(exec),
    finalize: (exec, result) => this.finalizeScheduledExecution(exec, result),
    finish: (exec, result) => this.finishScheduledExecution(exec, result)
  };
  /** Context deferred by a running tool body, keyed by its scheduler-owned execution. */
  deferredContexts = /* @__PURE__ */ new WeakMap();
  /** Executions whose tool body declared the current turn complete. */
  concludingExecutions = /* @__PURE__ */ new WeakSet();
  /** Original caller cancellation, kept outside the wrapper-mutable execution object. */
  cancellationStates = /* @__PURE__ */ new WeakMap();
  /** Definition-owned final content transform snapshotted before policy begins. */
  contentFinalizers = /* @__PURE__ */ new WeakMap();
  layers = new ScopedLayers((scope) => new ToolLayer(scope), () => {
    this.ctx.emit("tools/change");
  });
  /** Presentation for scopes that declare none; {@link presentAs} shadows it per scope. */
  defaultMode;
  maxParallelSubCalls;
  /**
  * Reserved presentation transport, kept outside the filterable registration
  * layers. Built on first need rather than at construction: which agents run
  * a PTC mode is no longer known when the service is constructed, and the
  * transport is stateless beyond its closures over `this`.
  */
  ptcTransport;
  constructor(ctx, config = {}) {
    super(ctx, "tools");
    this.defaultMode = config.mode ?? "native";
    this.maxParallelSubCalls = resolveMaxParallelSubCalls(config.maxParallelSubCalls);
    ctx.systemPrompt.tools((context) => this.wireSchemas(context.scope));
    if (this.defaultMode !== "native") {
      ctx.systemPrompt.section(this.collapseSection());
      ctx.systemPrompt.section(this.sdkSection());
    }
  }
  /**
  * The prompt statement of the `ptc` executor collapse, registered wherever
  * {@link sdkSection} is and rendering empty outside an effective `ptc`.
  *
  * Every tool contributes its own guidance section naming its tool, none of
  * them qualify how that tool is reached, and they all render before the SDK.
  * Without this the model reads a catalog of tools it is told to use and no
  * statement that only `run_code` may be called, so it emits a native call,
  * receives `UNKNOWN_TOOL` for a tool the prompt just declared, and concludes
  * the deployment is inconsistent. Its order places the rule before that
  * guidance rather than after it.
  *
  * `both` renders empty: native calls do execute there, so the rule is false.
  * @returns the section registration.
  */
  collapseSection() {
    return {
      name: "tools:ptc-only",
      order: this.ctx.systemPrompt.getSectionOrder("PTC_ONLY"),
      text: (context) => this.modeFor(context.scope) === "ptc" ? PTC_ONLY_INSTRUCTION : ""
    };
  }
  /**
  * The generated-SDK prompt section, registered globally by a PTC mode
  * deployment and per scope by {@link presentAs}.
  *
  * The body regenerates from the CALLING scope, and renders empty for an
  * agent presenting natively — an agent that opted out under a PTC mode
  * deployment still sees the global registration, and an empty section is
  * dropped from the rendered prompt.
  * @returns the section registration.
  */
  sdkSection() {
    return {
      name: "tools:sdk",
      order: this.ctx.systemPrompt.getSectionOrder("TOOLS_SDK"),
      text: (context) => {
        const mode = this.modeFor(context.scope);
        if (mode === "native") return "";
        const runtime = this.requireCodeRuntime(mode);
        const render = SDK_RENDERERS[runtime.language];
        if (render === void 0) throw new Error(`dsh-tools: no SDK renderer for ${runtime.language}`);
        return render(this.sdkSchemas(context.scope));
      }
    };
  }
  /**
  * The presentation one scope's agent sees: its own declaration, else the
  * deployment default.
  * @param scope - the calling agent, or undefined for the global view.
  * @returns the resolved presentation mode.
  */
  modeFor(scope) {
    const layers = this.layers.chainLayers(scope);
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const mode = layers[index]?.mode;
      if (mode !== void 0) return mode;
    }
    return this.defaultMode;
  }
  /**
  * The reserved `run_code` transport, built on first need.
  *
  * It never enters the global layer: per-agent restrictions must not remove
  * it, and a scoped registration must not shadow it. The visibility resolver
  * appends it after resolving the filterable global/scoped capability layers,
  * and only for scopes whose mode actually presents it.
  * @returns the shared transport definition.
  */
  requireCodeTransport() {
    this.ptcTransport ??= createRunCodeTool(this, {
      requireRuntime: () => this.requireCodeRuntime(this.defaultMode),
      peekRuntime: () => this.ctx.get("codeRuntime"),
      maxParallel: this.maxParallelSubCalls,
      shapeDispatchLog: (dispatch) => this.shapeDispatchLog(dispatch)
    });
    return this.ptcTransport;
  }
  /**
  * Present the calling scope's tools in `mode` instead of the deployment
  * default. Nearest scope on the chain wins, so a preset's standing
  * declaration covers every agent joined under it.
  *
  * Scoped only, and one declaration per scope: this is how an agent preset
  * composes PTC mode agents beside native ones in the same process, and a
  * process-global override would be the `mode` config field instead.
  * @param mode - the presentation the covered agents' models see.
  * @returns the exact disposer that restores the deployment default.
  */
  presentAs(mode) {
    const ctx = this.ctx;
    if (scopeOf(ctx) === void 0) throw new Error("tools.presentAs() requires a scoped context (agent.ctx): a context-global presentation is the `mode` config field on the tools row");
    return ctx.effect(function* () {
      yield this.layers.effect(ctx, (layer) => {
        if (layer.mode !== void 0) throw new Error(`tools.presentAs("${mode}") conflicts with "${layer.mode}" already declared for this scope; one composition selects one presentation`);
        layer.mode = mode;
        return () => {
          layer.mode = void 0;
        };
      }, { label: "tools.presentAs()" });
      if (mode !== "native") {
        yield ctx.systemPrompt.section(this.collapseSection());
        yield ctx.systemPrompt.section(this.sdkSection());
      }
    }.bind(this), "tools.presentAs()");
  }
  /**
  * Build one scope's wire schemas and names for prompt-order validation.
  * Restrictions do not make known tools invalid, but a mode collapse does.
  */
  wireSchemas(scope) {
    const view = this.view(scope);
    const mode = this.modeFor(scope);
    if (mode === "native") return {
      schemas: [...view.visible.values()].map((definition) => this.schemaOf(definition, false)),
      knownNames: [...view.knownNames]
    };
    this.requireCodeRuntime(mode);
    const schemas = [...view.visible.values()].map((definition) => this.schemaOf(definition, false));
    if (mode === "ptc") return {
      schemas: schemas.filter((schema) => schema.name === RUN_CODE_NAME),
      knownNames: [RUN_CODE_NAME]
    };
    return {
      schemas,
      knownNames: [...view.knownNames, RUN_CODE_NAME]
    };
  }
  /**
  * Resolve the code runtime or throw the actionable misconfiguration error.
  * Read at use time (assembly / run_code execution), NOT via static
  * `inject`: an inject entry would hold `ctx.tools` — and every tool plugin
  * behind it — hostage to a code runtime existing even under `mode:
  * 'native'`.
  *
  * Assembly and `run_code` execution read separately, so the language is not
  * bound to a request. Harmless while one published backend exists — both
  * reads return the same flavor — but a reload that swapped in a second
  * language between them would hand a program written against one SDK to the
  * other. Binding it is deferred until a second backend ships (the first
  * point it is testable).
  */
  requireCodeRuntime(mode) {
    const runtime = this.ctx.get("codeRuntime");
    if (!runtime) throw new Error(`dsh-tools: mode "${mode}" requires a code runtime \u2014 load a ctx.codeRuntime implementation (e.g. @deepseek-ai/dsh-code-runtime-worker-thread) or set tools mode to "native"`);
    if (!Object.hasOwn(SDK_RENDERERS, runtime.language)) {
      const known = Object.keys(SDK_RENDERERS).map((name2) => JSON.stringify(name2)).join(", ");
      throw new Error(`dsh-tools: no SDK renderer registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`);
    }
    return runtime;
  }
  /**
  * Register globally or in the calling agent scope. Scoped tools shadow
  * globals; duplicates within one layer and the reserved `run_code` name fail.
  * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
  * @returns the exact disposer that unregisters the tool.
  */
  register(definition) {
    const name2 = definition.name;
    const output = definition.output;
    if (output === void 0 || typeof output !== "object" || typeof output.render !== "function" || output.presentationMeta !== void 0 && typeof output.presentationMeta !== "function") throw new TypeError(`tool "${name2}" must declare output { schema, render, presentationMeta? }`);
    assertSupportedJsonSchema(output.schema);
    const timeoutMs = definition.timeoutMs;
    if (timeoutMs !== void 0 && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new TypeError(`tool "${name2}" timeoutMs must be a positive finite number`);
    if (name2 === "run_code") throw new Error(`tool name "${RUN_CODE_NAME}" is reserved for the PTC mode presentation transport and cannot be registered or shadowed`);
    return this.layers.effect(this.ctx, (layer) => layer.tools.insert(name2, definition), { label: "tools.register()" });
  }
  /**
  * Restrict global tools for the calling agent scope. Empty filters, unknown
  * names, scope-local names, and reserved transport names fail. Restrictions
  * intersect; scoped registrations remain visible.
  * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
  * @returns the exact disposer that lifts this restriction.
  */
  restrict(filter) {
    const scope = scopeOf(this.ctx);
    if (scope === void 0) throw new Error("tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent \u2014 deny the tool for the intended agent instead");
    const allow = filter.allow;
    const deny = filter.deny;
    if (allow === void 0 && deny === void 0) throw new Error("tools.restrict({}) is a no-op: pass `allow` and/or `deny` (an empty filter is almost always a materialized-empty-config bug)");
    const compiled = {
      ...allow !== void 0 ? { allow: new Set(allow) } : {},
      ...deny !== void 0 ? { deny: new Set(deny) } : {}
    };
    if ([...allow ?? [], ...deny ?? []].includes("run_code")) throw new Error(`tools.restrict() cannot name reserved PTC mode presentation transport "${RUN_CODE_NAME}"; restrict end-capability tools instead`);
    const known = this.view(scope).restrictableNames;
    const unknown = [...allow ?? [], ...deny ?? []].filter((name2) => !known.has(name2));
    if (unknown.length > 0) throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? "s" : ""} ${unknown.map((n) => `"${n}"`).join(", ")}; known global tools: ${[...known].sort().join(", ") || "(none)"}`);
    return this.layers.effect(this.ctx, (layer) => layer.restrictions.append(compiled), { label: "tools.restrict()" });
  }
  /**
  * Register a monotonic guard after the extensible `tools/pre-execute`
  * waterfall. A plain-context guard applies globally; one registered through
  * `agent.ctx` applies only to that agent. Any matching guard may deny by
  * returning a reason, while no guard can force-allow a call another guard
  * denied. The exact effect disposer is returned for ordered ownership and
  * HMR cleanup.
  * @param guard - synchronous check; a returned string denies the execution.
  * @returns the exact disposer that unregisters the guard.
  */
  guard(guard) {
    return this.layers.effect(this.ctx, (layer) => layer.guards.append(guard), {
      label: "tools.guard()",
      notify: false
    });
  }
  /** First monotonic denial from the global then the scope chain's guard layers, farthest first. */
  guardReason(exec) {
    const globalReason = this.layers.global.guardReason(exec);
    if (globalReason !== void 0) return globalReason;
    if (exec.agent === void 0) return void 0;
    for (const layer of this.layers.chainLayers(exec.agent)) {
      const reason = layer.guardReason(exec);
      if (reason !== void 0) return reason;
    }
  }
  /**
  * Resolve every registry fact one scope needs in one layer traversal. The
  * visible map applies restrictions to the INHERITED surface, then the
  * scope's own registrations and the reserved presentation transport; the
  * other sets retain the pre-restriction facts needed by restriction and
  * prompt-order validation.
  *
  * A restriction filters what a scope inherits — the global layer and every
  * ancestor layer on its chain — and never what its OWN layer registers.
  * That exemption is what a per-child capability filter has to keep intact:
  * the delegation runtime registers a child's structured-output tool into the
  * child's own layer, and a filter naming the capabilities the child may use
  * must not strip the machinery it answers through.
  *
  * Reading the exempt set as "the global layer" instead of "not mine" held
  * only while every model-facing tool sat in the host composition. Once
  * presets moved them onto the agent plane they became an ANCESTOR
  * contribution, so a child's filter silently stopped constraining anything
  * it was given.
  * @param scope - the viewing scope (the agent), or undefined for the global view.
  * @returns the complete derived view for that scope.
  */
  view(scope) {
    const layers = this.layers.chainLayers(scope);
    const own = this.layers.peek(scope);
    const inherited = new Map(this.layers.global.tools.entries());
    for (const layer of layers) {
      if (layer === own) continue;
      for (const [name2, definition] of layer.tools.entries()) inherited.set(name2, definition);
    }
    const visible = /* @__PURE__ */ new Map();
    const knownNames = /* @__PURE__ */ new Set();
    const restrictableNames = /* @__PURE__ */ new Set();
    for (const [name2, definition] of inherited) {
      knownNames.add(name2);
      restrictableNames.add(name2);
      if (layers.every((layer) => layer.admits(name2))) visible.set(name2, definition);
    }
    if (own !== void 0) for (const [name2, definition] of own.tools.entries()) {
      knownNames.add(name2);
      visible.set(name2, definition);
    }
    if (this.modeFor(scope) !== "native") visible.set(RUN_CODE_NAME, this.requireCodeTransport());
    return {
      visible,
      knownNames,
      restrictableNames
    };
  }
  /**
  * Look up a tool as one scope sees it (scoped
  * shadows global; a restricted-away global reads as absent). Presenters pass
  * the calling agent so the rendered card matches the definition that
  * actually executed.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @returns the definition the scope resolves, or undefined when none is visible.
  */
  get(name2, scope) {
    return this.view(scope).visible.get(name2);
  }
  /**
  * Resolve the definition that MAY EXECUTE for a call, applying the mode
  * collapse at the operation boundary that owns it. The registry view
  * (`get`) is presentation-agnostic; here a MODEL-DIRECT call under `ptc`
  * may only name the reserved `run_code` transport, while a nested
  * sub-dispatch (a `parent` token set — the `run_code` SDK calling a tool
  * it bound) may call any visible tool. Denial surfaces as `UNKNOWN_TOOL`
  * through the executor, matching an absent definition.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
  * @returns the definition that may run, or undefined when the call must be rejected.
  */
  resolveExecution(name2, scope, nested) {
    const tool = this.get(name2, scope);
    if (tool === void 0) return void 0;
    if (this.collapses(name2, scope, nested)) return void 0;
    return tool;
  }
  /**
  * Project visible definitions onto the allowlisted model-facing schema fields,
  * excluding execution and presentation callbacks.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @returns one deep-cloned schema per visible tool.
  */
  schemas(scope) {
    return [...this.view(scope).visible.values()].map((definition) => this.schemaOf(definition, true));
  }
  /** Project visible callable tools onto the generated PTC mode SDK contract. */
  sdkSchemas(scope) {
    return [...this.view(scope).visible.values()].filter((definition) => definition.name !== RUN_CODE_NAME).map((definition) => {
      const output = snapshotJsonValue(definition.output.schema);
      if (output === void 0) throw new Error(`tool "${definition.name}" output schema must be lossless JSON before SDK projection`);
      return {
        ...this.schemaOf(definition, true),
        output
      };
    });
  }
  /** Project one definition onto the model-facing schema fields. */
  schemaOf(definition, detachParameters) {
    const { name: name2, description, parameters } = definition;
    const detached = detachParameters ? snapshotJsonValue(parameters) : parameters;
    if (detached === void 0) throw new Error(`tool "${name2}" parameters must be lossless JSON before schema projection`);
    return {
      name: name2,
      description,
      parameters: detached
    };
  }
  /**
  * Classify a pending call through the caller's visible tool definition. Only
  * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or
  * throwing classifiers are exclusive.
  * @param exec - call name, parsed arguments, and optional agent scope.
  * @returns the fail-closed scheduling mode.
  */
  executionMode(exec) {
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
    if (!tool?.isConcurrencySafe) return { kind: "exclusive" };
    try {
      return tool.isConcurrencySafe(exec.arguments) === true ? { kind: "parallel" } : { kind: "exclusive" };
    } catch {
      return { kind: "exclusive" };
    }
  }
  /**
  * Run the `tools/ptc-dispatch-log` waterfall over one settled sub-dispatch
  * and return the content the bridge should log on `tool/ptc-dispatch`.
  * Contained: when a listener throws, the method logs the original settled
  * content; that failure must not fail the dispatch or omit the settle event. Private:
  * the ONE consumer is the `run_code` bridge this registry constructs, which
  * receives it as a capability parameter (the `requireRuntime` idiom) — the
  * waterfall, not this invoker, is the public extension point.
  */
  async shapeDispatchLog(dispatch) {
    try {
      return await this.ctx.waterfall(scopeTarget(this, dispatch.agent), "tools/ptc-dispatch-log", dispatch, () => Promise.resolve(dispatch.content));
    } catch (error) {
      this.ctx.logger.warn(`tools: ptc-dispatch-log listener failed for ${dispatch.name}: ${errorMessage2(error)}; logging the original settled content`);
      return dispatch.content;
    }
  }
  /**
  * Whether the `ptc` mode collapse denies a model-direct call: only the
  * reserved `run_code` transport may be named. Nested sub-dispatches (a
  * `parent` token set) bypass the collapse. One home for the
  * security-relevant predicate, shared by {@link resolveExecution} and
  * {@link createExecution} so the two can never drift apart.
  *
  * Resolved through {@link modeFor}, NOT `defaultMode`: an agent given `ptc`
  * by an agent preset under a native deployment is the composition
  * `dsh-agent-tool-presentation` exists for, and reading the deployment default would
  * leave exactly that agent uncollapsed — announcing one surface while
  * executing another, which is the bypass this collapse closes.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope whose effective presentation mode applies.
  * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
  */
  collapses(name2, scope, nested) {
    return !nested && this.modeFor(scope) === "ptc" && name2 !== "run_code";
  }
  /**
  * Execute through pre-policy, guards, around-dispatch, post-policy,
  * definition-owned content finalization, and final notification. Tool and
  * listener failures resolve as materialized error results; an invisible tool
  * reports `UNKNOWN_TOOL`. The returned outcome is the same lossless, frozen
  * snapshot final observers receive. Cancellation
  * arriving after entry and before final result materialization skips a
  * not-yet-started body with `ABORTED_BEFORE_DISPATCH` or replaces a
  * successful started outcome with `ABORTED`; already-started work is still
  * drained and may retain a tool-owned structured error.
  * @param exec - the typed same-process call input. The registry assigns its
  *   correlation token before policy begins.
  * @returns the materialized final result.
  */
  async execute(exec) {
    return this.prepareExecution(exec, (prepared) => this.completeScheduledExecution(prepared));
  }
  async completeScheduledExecution(prepared) {
    switch (prepared.kind) {
      case "dispatch": {
        const dispatched = await this.dispatchScheduledExecution(prepared.exec);
        return dispatched.kind === "post-result" ? await this.finalizeScheduledExecution(prepared.exec, dispatched.result) : this.finishScheduledExecution(prepared.exec, dispatched.result);
      }
      case "post-result":
        return await this.finalizeScheduledExecution(prepared.exec, prepared.result);
      case "final-result":
        return this.finishScheduledExecution(prepared.exec, prepared.result);
      /* v8 ignore next -- closed-union exhaustiveness guard */
      default:
        return assertNever(prepared, "scheduled tool preparation");
    }
  }
  createExecution(exec) {
    const deferredContexts = [];
    const token = createExecutionToken();
    const callId = exec.callId;
    const rootCallId = exec.rootCallId ?? callId;
    const name2 = exec.name;
    const agent = exec.agent;
    const parent = exec.parent;
    const signal = exec.signal;
    const visible = this.get(name2, agent);
    const collapsed = visible !== void 0 && this.collapses(name2, agent, parent !== void 0);
    const concludingExecutions = this.concludingExecutions;
    const base = {
      token,
      callId,
      rootCallId,
      name: name2,
      signal,
      ...agent !== void 0 ? { agent } : {},
      ...parent !== void 0 ? { parent } : {},
      deferContext(context) {
        deferredContexts.push(context);
      },
      concludeTurn() {
        concludingExecutions.add(this);
      }
    };
    const capturedFinalizer = visible?.finalizeContent?.bind(visible);
    const finalizerFor = () => collapsed && !signal.aborted ? void 0 : capturedFinalizer;
    try {
      const detached = snapshotJsonValue(exec.arguments);
      if (detached === void 0) throw new TypeError("tool execution arguments must be losslessly JSON-serializable");
      const execution = {
        ...base,
        arguments: deepFreeze(detached)
      };
      this.deferredContexts.set(execution, deferredContexts);
      this.contentFinalizers.set(execution, finalizerFor());
      this.cancellationStates.set(execution, {
        callerSignal: signal,
        bodyInvoked: false
      });
      if (collapsed) {
        if (signal.aborted) return {
          kind: "final-result",
          exec: execution,
          result: toolAbortedBeforeDispatchResult()
        };
        return {
          kind: "final-result",
          exec: execution,
          result: toolErrorResult(new ToolNotFoundError(name2, `only \`${RUN_CODE_NAME}\` is callable directly \u2014 call \`${name2}\` from inside a \`${RUN_CODE_NAME}\` program instead`))
        };
      }
      return {
        kind: "ready",
        exec: execution
      };
    } catch (error) {
      const execution = {
        ...base,
        arguments: void 0
      };
      this.contentFinalizers.set(execution, finalizerFor());
      return {
        kind: "final-result",
        exec: execution,
        result: toolErrorResult(error)
      };
    }
  }
  /**
  * Run the ordered pre-execute and monotonic guard stages for the scheduler.
  * @param input - the caller-supplied execution input.
  * @returns the prepared execution plus the next scheduler stage.
  * @internal
  */
  async prepareScheduledExecution(input) {
    return this.prepareExecution(input, (prepared) => prepared);
  }
  async prepareExecution(input, next) {
    const created = this.createExecution(input);
    if (created.kind !== "ready") return next(created);
    const exec = created.exec;
    if (this.callerCancelled(exec)) return next({
      kind: "final-result",
      exec,
      result: toolAbortedBeforeDispatchResult()
    });
    try {
      const carrier = scopeTarget(this, exec.agent);
      const gate = await this.ctx.waterfall(carrier, "tools/pre-execute", exec, () => Promise.resolve({ kind: "allow" }));
      const askResolution = gate.kind === "ask" ? await this.serviceAsk(exec, gate) : {
        decision: gate,
        approvalCancelled: false
      };
      const { decision } = askResolution;
      if (this.callerCancelled(exec) && askResolution.approvalCancelled) return await next({
        kind: "post-result",
        exec,
        result: toolAbortedBeforeDispatchResult()
      });
      const denialReason = decision.kind === "allow" ? this.guardReason(exec) : decision.reason;
      if (denialReason !== void 0) return await next({
        kind: "post-result",
        exec,
        result: this.materializeFinalResult({
          content: [{
            type: "text",
            text: `Error: ${denialReason}`
          }],
          isError: true,
          error: { message: denialReason }
        })
      });
      if (this.callerCancelled(exec)) return await next({
        kind: "post-result",
        exec,
        result: toolAbortedBeforeDispatchResult()
      });
      return await next({
        kind: "dispatch",
        exec
      });
    } catch (error) {
      return next({
        kind: "final-result",
        exec,
        result: toolErrorResult(error)
      });
    }
  }
  /** Whether the original caller signal is currently aborted. */
  callerCancelled(exec) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    return state.callerSignal.aborted;
  }
  /** Canonical cancellation outcome selected by whether the tool body started. */
  cancellationResult(exec, prior) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    return state.bodyInvoked ? toolAbortedResult(prior) : toolAbortedBeforeDispatchResult(prior);
  }
  /**
  * Dispatch the registered body with the original caller signal fused back
  * into any around-wrapper replacement. Cancellation never abandons the body:
  * a started promise reaches quiescence before its outcome becomes `ABORTED`.
  */
  async dispatchToolBody(exec) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    const wrapperSignal = exec.signal;
    const fused = fuseToolSignals(state.callerSignal, wrapperSignal);
    const signal = fused.signal;
    if (isAborted(signal)) {
      fused.dispose();
      return toolAbortedBeforeDispatchResult();
    }
    exec.signal = signal;
    try {
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
      if (!tool) throw new ToolNotFoundError(exec.name);
      state.bodyInvoked = true;
      const returned = await tool.execute(exec.arguments, exec);
      const result = this.createSuccessResult(exec, tool, returned);
      return isAborted(signal) ? toolAbortedResult(result) : result;
    } catch (error) {
      return toolErrorResult(error);
    } finally {
      fused.dispose();
      exec.signal = wrapperSignal;
    }
  }
  /**
  * Run around-dispatch and the tool body. Tool and unknown-tool failures still
  * receive post-execute; pipeline failures are already final.
  * @param exec - the prepared execution.
  * @returns whether the result still needs post-execute.
  * @internal
  */
  async dispatchScheduledExecution(exec) {
    try {
      const mutableExec = exec;
      const carrier = scopeTarget(this, exec.agent);
      const result = await this.ctx.waterfall(carrier, "tools/execute", mutableExec, () => this.dispatchToolBody(mutableExec));
      const normalized = this.normalizeDispatchResult(exec, result);
      const deferredContexts = this.deferredContexts.get(exec);
      if (deferredContexts === void 0) throw new Error("tool registry scheduler invariant violated: unprepared execution");
      const resultWithDeferredContexts = deferredContexts.length === 0 ? normalized : this.markCanonical(exec, {
        ...normalized,
        additionalContexts: [...deferredContexts, ...normalized.additionalContexts ?? []]
      });
      return {
        kind: "post-result",
        result: this.callerCancelled(exec) && !resultWithDeferredContexts.isError ? this.cancellationResult(exec, resultWithDeferredContexts) : resultWithDeferredContexts
      };
    } catch (error) {
      return {
        kind: "final-result",
        result: toolErrorResult(error)
      };
    }
  }
  /**
  * Run ordered post-execute, then apply definition-owned content finalization,
  * materialize, and notify the final outcome.
  * @param exec - the prepared execution.
  * @param result - dispatch/pre result that still needs post-execute.
  * @returns the materialized final result.
  * @internal
  */
  async finalizeScheduledExecution(exec, result) {
    try {
      const postResult = await this.postExecute(exec, result);
      return this.finishScheduledExecution(exec, this.callerCancelled(exec) && !postResult.isError ? this.cancellationResult(exec, postResult) : postResult);
    } catch (error) {
      return this.finishScheduledExecution(exec, toolErrorResult(error));
    }
  }
  /**
  * Materialize the candidate, apply definition-owned content finalization,
  * then materialize and notify the authoritative result.
  * @param exec - the prepared execution.
  * @param result - final result.
  * @returns the materialized final result.
  * @internal
  */
  finishScheduledExecution(exec, result) {
    let materializedResult;
    try {
      materializedResult = this.materializeFinalResult(result);
    } catch (error) {
      materializedResult = this.materializeFinalResult(toolErrorResult(error));
    }
    let finalResult;
    try {
      finalResult = this.materializeFinalResult(this.applyFinalContent(exec, materializedResult));
    } catch (error) {
      finalResult = this.materializeFinalResult(toolErrorResult(error));
    }
    this.notifyResult(exec, finalResult);
    return finalResult;
  }
  /** Apply the snapshotted tool-owned content transform without exposing other result fields. */
  applyFinalContent(exec, result) {
    const finalizeContent = this.contentFinalizers.get(exec);
    if (finalizeContent === void 0) return result;
    const content = finalizeContent(exec, result);
    return content === void 0 ? result : {
      ...result,
      content
    };
  }
  /** Notify observers without exposing a mutation or error channel into the outcome. */
  notifyResult(exec, result) {
    Object.freeze(exec);
    const { name: toolName, callId } = exec;
    const reportFailure = (error) => {
      this.ctx.logger.warn(`tool "${toolName}" (${callId}): tools/result observer failed: ${errorMessage2(error)}`);
    };
    const callbacks = this.ctx.events.dispatch("emit", [
      scopeTarget(this, exec.agent),
      "tools/result",
      exec,
      result
    ]);
    for (const callback of callbacks) try {
      const returned = callback(exec, result);
      Promise.resolve(returned).catch(reportFailure);
    } catch (error) {
      reportFailure(error);
    }
  }
  /**
  * Resolve an `ask` decision to allow/deny through the approval seam. The
  * seam is consumed opportunistically with `ctx.get('approval')` — a
  * deployment that composes no ApprovalService keeps the historical degrade
  * to deny, and an unmount mid-session degrades the same way on the next ask.
  * An agent-less execution also degrades: without an agent there is no
  * session to audit to and no UI to route to. Otherwise the outcome maps
  * one-to-one — `allowed-once` proceeds; the three non-grants deny with
  * distinct reasons so the model can tell a human "no" from an absent
  * approval channel.
  */
  async serviceAsk(exec, ask) {
    const approval = this.ctx.get("approval");
    if (approval === void 0) return {
      decision: {
        kind: "deny",
        reason: ask.reason ?? `tool "${exec.name}" requires approval (not yet supported)`
      },
      approvalCancelled: false
    };
    if (exec.agent === void 0) return {
      decision: {
        kind: "deny",
        reason: `tool "${exec.name}" requires approval, but the call has no agent to route it through`
      },
      approvalCancelled: false
    };
    const outcome = await approval.request({
      agent: exec.agent,
      toolName: exec.name,
      callId: exec.callId,
      ...ask.reason !== void 0 ? { reason: ask.reason } : {},
      signal: exec.signal
    });
    switch (outcome) {
      case "allowed-once":
        return {
          decision: { kind: "allow" },
          approvalCancelled: false
        };
      case "rejected":
        return {
          decision: {
            kind: "deny",
            reason: `the user rejected tool "${exec.name}"`
          },
          approvalCancelled: false
        };
      case "cancelled":
        return {
          decision: {
            kind: "deny",
            reason: `approval for tool "${exec.name}" was cancelled`
          },
          approvalCancelled: true
        };
      case "unavailable":
        return {
          decision: {
            kind: "deny",
            reason: `tool "${exec.name}" requires approval, but no approval channel is available`
          },
          approvalCancelled: false
        };
      default:
        return assertNever(outcome, "ApprovalOutcome");
    }
  }
  /**
  * Run the `tools/post-execute` waterfall over a dispatched `result` and apply
  * its {@link PostToolDecision}: `accept` keeps the call successful (replacing
  * `content` when given), `block` turns it into an `isError` whose content is
  * the corrective `feedback`. Either decision may attach `additionalContexts`,
  * which are ferried on the returned result for the loop's active-batch FIFO.
  * Context deferred by the tool body survives an accepted result but is
  * discarded when the outer call is blocked; a block exposes only context the
  * blocking decision explicitly supplied.
  * Runs inside `execute`'s outer try/catch (a throwing listener → isError).
  */
  async postExecute(exec, result) {
    const decision = await this.ctx.waterfall(scopeTarget(this, exec.agent), "tools/post-execute", exec, result, () => Promise.resolve({ kind: "accept" }));
    const decisionContexts = decision.additionalContexts ?? [];
    if (decision.kind === "block") {
      const message = failureMessageFromContent(decision.feedback);
      return this.markCanonical(exec, {
        content: decision.feedback,
        isError: true,
        error: { message },
        ...decisionContexts.length > 0 ? { additionalContexts: decisionContexts } : {}
      });
    }
    if (Object.hasOwn(decision, "content") && Object.hasOwn(decision, "value")) throw new TypeError("tools/post-execute accept decision cannot replace both value and content");
    const additionalContexts = [...result.additionalContexts ?? [], ...decisionContexts];
    if (Object.hasOwn(decision, "value")) {
      if (result.isError) throw new TypeError("tools/post-execute cannot replace the value of a failed result");
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
      if (tool === void 0) throw new ToolNotFoundError(exec.name);
      const replaced = this.createSuccessResult(exec, tool, decision.value);
      return this.markCanonical(exec, {
        ...replaced,
        ...additionalContexts.length > 0 ? { additionalContexts } : {}
      });
    }
    return this.markCanonical(exec, {
      ...result,
      ...decision.content !== void 0 ? { content: decision.content } : {},
      ...additionalContexts.length > 0 ? { additionalContexts } : {}
    });
  }
  /** Registry-normalized results and the exact dispatch that validated each value. */
  canonicalResults = /* @__PURE__ */ new WeakMap();
  /** Mark one registry-normalized result as canonical only for its owning dispatch. */
  markCanonical(exec, result) {
    this.canonicalResults.set(result, exec.token);
    return result;
  }
  /** Snapshot, validate, render, and optionally project one successful body value. */
  createSuccessResult(exec, tool, candidate) {
    const detached = snapshotToolValue(tool.name, candidate);
    const violations = validateJsonSchemaValue(tool.output.schema, detached, "value");
    if (violations.length > 0) throw new ToolOutputError(tool.name, violations);
    const value = deepFreeze(detached);
    let rendered;
    try {
      rendered = tool.output.render(exec.arguments, value);
    } catch (error) {
      throw projectionError(tool.name, "render", error);
    }
    const content = snapshotProjection(tool.name, "render", rendered);
    let meta;
    if (exec.parent === void 0 && tool.output.presentationMeta !== void 0) {
      let projected;
      try {
        projected = tool.output.presentationMeta(exec.arguments, value);
      } catch (error) {
        throw projectionError(tool.name, "presentationMeta", error);
      }
      meta = snapshotProjection(tool.name, "presentationMeta", projected);
    }
    const concludesTurn = this.concludingExecutions.has(exec);
    return this.markCanonical(exec, this.materializeFinalResult({
      isError: false,
      value,
      content,
      ...meta !== void 0 ? { meta } : {},
      ...concludesTurn ? { concludesTurn: true } : {}
    }));
  }
  /** Normalize an around-dispatch wrapper's authored result through the owning output contract. */
  normalizeDispatchResult(exec, result) {
    if (this.canonicalResults.get(result) === exec.token) return result;
    if (result.isError) return this.markCanonical(exec, {
      isError: true,
      error: result.error,
      content: result.content,
      ...result.meta !== void 0 ? { meta: result.meta } : {},
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    });
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
    if (tool === void 0) throw new ToolNotFoundError(exec.name);
    const normalized = this.createSuccessResult(exec, tool, result.value);
    return this.markCanonical(exec, {
      ...normalized,
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    });
  }
  /** Materialize the authoritative commit outcome once, immediately before `tools/result`. */
  materializeFinalResult(result) {
    const presentation = {
      content: result.content,
      ...result.meta !== void 0 ? { meta: result.meta } : {},
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    };
    if (result.isError) return materializePresentation({
      isError: true,
      error: result.error,
      ...presentation
    });
    return deepFreeze({
      ...materializePresentation({
        isError: false,
        ...presentation,
        ...result.concludesTurn === true ? { concludesTurn: true } : {}
      }),
      value: result.value
    });
  }
};
function createExecutionToken() {
  return Symbol("dsh.tool.execution");
}
function toolErrorResult(error) {
  const info = errorInfo(error);
  const message = errorMessage2(error);
  return {
    content: [{
      type: "text",
      text: `Error: ${message}`
    }],
    isError: true,
    error: {
      message,
      ...info ? { info } : {}
    }
  };
}
function isAborted(signal) {
  return signal.aborted;
}
function fuseToolSignals(caller, wrapper) {
  if (caller === wrapper) return {
    signal: caller,
    dispose() {
    }
  };
  const controller = new AbortController();
  let listening = false;
  const dispose = () => {
    if (!listening) return;
    listening = false;
    caller.removeEventListener("abort", abortFromCaller);
    wrapper.removeEventListener("abort", abortFromWrapper);
  };
  const abortFrom = (source) => {
    const reason = source.reason;
    controller.abort(reason);
    dispose();
  };
  const abortFromCaller = () => {
    abortFrom(caller);
  };
  const abortFromWrapper = () => {
    abortFrom(wrapper);
  };
  if (wrapper.aborted) abortFromWrapper();
  else if (caller.aborted) abortFromCaller();
  else {
    listening = true;
    caller.addEventListener("abort", abortFromCaller, { once: true });
    wrapper.addEventListener("abort", abortFromWrapper, { once: true });
  }
  return {
    signal: controller.signal,
    dispose
  };
}
function toolAbortedResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    content: [{
      type: "text",
      text: "Error: tool call aborted"
    }],
    isError: true,
    error: {
      message: "tool call aborted",
      info: {
        name: "AbortError",
        code: TOOL_ABORTED
      }
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {}
  };
}
function toolAbortedBeforeDispatchResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    content: [{
      type: "text",
      text: "Error: tool call aborted before dispatch"
    }],
    isError: true,
    error: {
      message: "tool call aborted before dispatch",
      info: {
        name: "AbortError",
        code: TOOL_ABORTED_BEFORE_DISPATCH
      }
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {}
  };
}

// ../node_modules/@deepseek-ai/dsh-home-paths/lib/index.js
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
var DSH_HOME_DIR_NAME = ".dsh";
var DEFAULT_DSH_HOME_DISPLAY = `~/${DSH_HOME_DIR_NAME}`;
var DSH_HOME_ENV = "DSH_HOME";
function defaultDshHome() {
  return join(homedir(), DSH_HOME_DIR_NAME);
}
function expandHomePath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}
function resolveDshHome(configured, env = process.env) {
  const fromEnv = env[DSH_HOME_ENV];
  return resolve(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}
function dshHomePath(...segments) {
  return join(resolveDshHome(), ...segments);
}

// src/blocks.ts
import { basename as basename2, extname, resolve as resolve2, sep } from "node:path";
var TEXT_EXTS = /* @__PURE__ */ new Set([".txt", ".md", ".markdown", ".text"]);
function detectKind(fileName) {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".csv") return "csv";
  if (TEXT_EXTS.has(ext)) return "text";
  return null;
}
function sanitizeFileName(name2) {
  const base = basename2(name2).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[.\s]+$/g, "").trim();
  return base || "document";
}
function makeDocId() {
  return `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function clampIndex(n, total) {
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(total, 1));
}
function chunkText(text, blockChars) {
  const chars = Math.max(blockChars, 100);
  const out = [];
  for (let i = 0; i < text.length; i += chars) out.push(text.slice(i, i + chars));
  return out.length > 0 ? out : [""];
}
function chunkTotalChars(chunks, blockChars) {
  if (chunks.length === 0) return 0;
  return (chunks.length - 1) * Math.max(blockChars, 100) + chunks[chunks.length - 1].length;
}
function groupBy(items, perBlock) {
  const per = Math.max(perBlock, 1);
  const out = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out.length > 0 ? out : [[]];
}
function pageLocator(n) {
  return `\u7B2C ${n} \u9875`;
}
function textBlockLocator(index1, blockChars, totalChars) {
  const start = (index1 - 1) * Math.max(blockChars, 100) + 1;
  const end = Math.min(index1 * Math.max(blockChars, 100), Math.max(totalChars, 1));
  return `\u7B2C ${index1} \u5757\uFF08\u5B57\u7B26 ${start}\u2013${end}\uFF09`;
}
function paragraphBlockLocator(first, last) {
  return first === last ? `\u7B2C ${first} \u6BB5` : `\u7B2C ${first}\u2013${last} \u6BB5`;
}
function rowBlockLocator(sheet, first, last) {
  const base = first === last ? `\u7B2C ${first} \u884C` : `\u7B2C ${first}\u2013${last} \u884C`;
  return sheet ? `\u5DE5\u4F5C\u8868\u300C${sheet}\u300D${base}` : base;
}
function safeJoin(root, rel) {
  const clean = rel.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const target = resolve2(root, ...clean.split("/"));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}
function normalizeWhitespace(text) {
  return text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function detectBrokenTextLayer(blocks) {
  if (blocks.length > 0 && blocks.every((b) => b.text.trim().length === 0)) return true;
  const samples = blocks.filter((b) => b.text.length >= 20);
  if (samples.length < 5) return false;
  let cjk = 0;
  let noise = 0;
  let total = 0;
  for (const block of samples) {
    for (const ch of block.text) {
      const code = ch.codePointAt(0) ?? 0;
      total += 1;
      if (code >= 19968 && code <= 40959) cjk += 1;
      else if (code >= 128 && code <= 767 || code >= 7680 && code <= 7935) noise += 1;
    }
  }
  if (total === 0) return false;
  return cjk / total < 0.02 && noise / total > 0.05;
}

// src/store.ts
import { mkdir, readFile, writeFile, copyFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join as join2 } from "node:path";

// src/extract.ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
function isNodeBuffer(value) {
  return typeof Buffer !== "undefined" && Buffer.isBuffer(value);
}
var pdfCache = /* @__PURE__ */ new Map();
var MAX_CACHED_PDFS = 3;
function openPdf(docId, data) {
  const cached = pdfCache.get(docId);
  if (cached !== void 0) return cached;
  const bytes = data instanceof Uint8Array && !isNodeBuffer(data) ? data : Uint8Array.from(data);
  const promise = (async () => {
    const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const handle = {
      numPages: doc.numPages,
      async pageText(page, signal) {
        const pdfPage = await doc.getPage(page);
        const content = await pdfPage.getTextContent({ disableNormalization: false });
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        return joinTextItems(content.items);
      },
      dispose() {
        void doc.destroy();
      }
    };
    return handle;
  })();
  pdfCache.set(docId, promise);
  promise.then((handle) => {
    if (pdfCache.size > MAX_CACHED_PDFS) {
      const oldest = pdfCache.keys().next().value;
      if (oldest !== void 0 && oldest !== docId) {
        pdfCache.delete(oldest);
        void pdfCache.get(oldest)?.then((h) => h.dispose()).catch(() => {
        });
      }
    }
  }).catch(() => {
  });
  return promise;
}
function joinTextItems(items) {
  let out = "";
  for (const raw of items) {
    const item = raw;
    if (typeof item.str !== "string") continue;
    out += item.str;
    out += item.hasEOL ? "\n" : " ";
  }
  return normalizeWhitespace(out);
}
async function extractDocxParagraphs(bytes) {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const paragraphs = result.value.split(/\n+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 0);
  return paragraphs.length > 0 ? paragraphs : ["\uFF08\u6587\u6863\u6CA1\u6709\u53EF\u63D0\u53D6\u7684\u6587\u5B57\uFF09"];
}
async function extractXlsxSheets(bytes) {
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellDates: false });
  const out = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet === void 0) continue;
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    const rows = raw.map((row) => (Array.isArray(row) ? row : []).map(cellToString));
    out.push({ sheetName, rows });
  }
  return out;
}
function cellToString(cell) {
  if (cell === null || cell === void 0) return "";
  if (typeof cell === "number") return Object.is(cell, -0) ? "0" : String(cell);
  return String(cell);
}
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c.length > 0));
}

// src/render.ts
import { createRequire as createRequire2 } from "node:module";
import { fileURLToPath } from "node:url";
import { getDocument as getDocument2 } from "pdfjs-dist/legacy/build/pdf.mjs";
var requireFromPdfjs = createRequire2(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
var canvasLibCache;
function canvasLib() {
  if (canvasLibCache !== void 0) return canvasLibCache;
  try {
    canvasLibCache = requireFromPdfjs("@napi-rs/canvas");
  } catch (error) {
    console.warn(
      "[dsh-plugin-doc-companion] cannot load @napi-rs/canvas:",
      error instanceof Error ? error.message : error
    );
    canvasLibCache = null;
  }
  return canvasLibCache;
}
function installCanvasGlobals(lib) {
  Object.defineProperty(globalThis, "Path2D", { value: lib.Path2D, configurable: true, writable: true });
  Object.defineProperty(globalThis, "DOMMatrix", { value: lib.DOMMatrix, configurable: true, writable: true });
}
var RENDER_SCALE = 2;
var MAX_CACHED_DOCS = 2;
var renderDocs = /* @__PURE__ */ new Map();
async function getRenderDoc(docId, data) {
  const cached = renderDocs.get(docId);
  if (cached !== void 0) return cached;
  const promise = getDocument2({ data, useSystemFonts: true }).promise;
  renderDocs.set(docId, promise);
  promise.then((doc) => {
    if (renderDocs.size > MAX_CACHED_DOCS) {
      const oldest = renderDocs.keys().next().value;
      if (oldest !== void 0 && oldest !== docId) {
        renderDocs.delete(oldest);
        void renderDocs.get(oldest)?.then((d) => d.destroy()).catch(() => {
        });
      }
    }
  }).catch(() => {
  });
  return promise;
}
async function renderPdfPagePng(docId, data, pageNumber) {
  try {
    const lib = canvasLib();
    if (lib === null) return null;
    installCanvasGlobals(lib);
    const doc = await getRenderDoc(docId, data);
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = lib.createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx,
      viewport
    }).promise;
    return new Uint8Array(canvas.toBuffer("image/png"));
  } catch (error) {
    console.warn(
      `[dsh-plugin-doc-companion] page render failed (${docId} p${pageNumber}):`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// src/store.ts
var META_VERSION = 1;
var SAVE_DELAY_MS = 500;
var MAX_SESSION_STATES = 200;
var DocStoreError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "DocStoreError";
  }
};
var DocumentStore = class {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
  }
  docs = /* @__PURE__ */ new Map();
  /** Per-session reading positions (the panel follows the current session). */
  currentBySession = /* @__PURE__ */ new Map();
  /** Fallback position for session-less callers (tests, direct curl probes). */
  fallbackCurrent = { docId: null, block: 1 };
  blocksByDoc = /* @__PURE__ */ new Map();
  readySet = /* @__PURE__ */ new Set();
  /** docId → (block → extracted text) for PDF pages touched so far. */
  pageTextCache = /* @__PURE__ */ new Map();
  /** docId → (block → snapshot path) for scanned pages rendered by the panel. */
  images = /* @__PURE__ */ new Map();
  /** docId → last table block (xlsx/csv table rendering cache). */
  tableCache = /* @__PURE__ */ new Map();
  saveTimer = null;
  get docsDir() {
    return join2(this.root, "docs");
  }
  get textDir() {
    return join2(this.root, "text");
  }
  get imageDir() {
    return join2(this.root, "images");
  }
  // ── lifecycle ────────────────────────────────────────────────────────────
  /** Ensure the storage layout exists and load the persisted registry. */
  async init() {
    await mkdir(this.docsDir, { recursive: true });
    await mkdir(this.textDir, { recursive: true });
    await mkdir(this.imageDir, { recursive: true });
    await this.loadMeta();
    for (const doc of this.docs.values()) this.kickIndex(doc.id);
  }
  async loadMeta() {
    const path = join2(this.root, "meta.json");
    try {
      const raw = JSON.parse(await readFile(path, "utf8"));
      for (const doc of raw.docs ?? []) {
        if (doc && typeof doc.id === "string") this.docs.set(doc.id, doc);
      }
      const cur = raw.current;
      if (cur && typeof cur === "object") {
        const restore = (state) => {
          if (state && typeof state.docId === "string" && this.docs.has(state.docId)) {
            return { docId: state.docId, block: typeof state.block === "number" ? state.block : 1 };
          }
          return null;
        };
        const fallback = restore(cur.fallback);
        if (fallback !== null) this.fallbackCurrent = fallback;
        for (const [sessionId, state] of Object.entries(cur.sessions ?? {})) {
          const restored = restore(state);
          if (restored !== null) this.currentBySession.set(sessionId, restored);
        }
        if ("docId" in cur && !("fallback" in cur)) {
          const legacy = restore(cur);
          if (legacy !== null) this.fallbackCurrent = legacy;
        }
      }
    } catch {
    }
  }
  scheduleSave() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveMeta().catch(() => {
      });
    }, SAVE_DELAY_MS);
  }
  async saveMeta() {
    const meta = {
      version: META_VERSION,
      docs: [...this.docs.values()],
      current: {
        fallback: this.fallbackCurrent,
        sessions: Object.fromEntries(this.currentBySession)
      }
    };
    await writeFile(join2(this.root, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  }
  /** Dispose timers (used by tests). */
  dispose() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
  }
  /** Flush pending metadata to disk immediately (used by tests). */
  async flush() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveMeta();
  }
  // ── registry ─────────────────────────────────────────────────────────────
  /** All registered documents, oldest first. */
  list() {
    return [...this.docs.values()].sort((a, b) => a.addedAt - b.addedAt);
  }
  get(docId) {
    return this.docs.get(docId);
  }
  /** Absolute path of the stored file for one document. */
  filePath(docId) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    return join2(this.docsDir, meta.fileName);
  }
  /** Absolute path of the page snapshot for one block, if any. */
  imagePath(docId, block) {
    return this.images.get(docId)?.get(block);
  }
  /**
   * Register an uploaded file: persist the bytes and make it the current
   * document of the given session (or the fallback position) at block 1.
   * The index build starts in the background.
   */
  async registerBytes(fileName, kind, bytes, sessionId) {
    const meta = this.createMeta(fileName, kind);
    await writeFile(join2(this.docsDir, meta.fileName), bytes);
    this.docs.set(meta.id, meta);
    this.scheduleSave();
    this.setCurrent(meta.id, 1, sessionId);
    this.kickIndex(meta.id);
    return meta;
  }
  /**
   * Register an existing file by path (doc_open): copy it into the store so
   * the reader and the tools serve one canonical location.
   */
  async registerFile(fileName, kind, sourcePath, sessionId) {
    const meta = this.createMeta(fileName, kind);
    await copyFile(sourcePath, join2(this.docsDir, meta.fileName));
    this.docs.set(meta.id, meta);
    this.scheduleSave();
    this.setCurrent(meta.id, 1, sessionId);
    this.kickIndex(meta.id);
    return meta;
  }
  createMeta(fileName, kind) {
    const id = `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const ext = fileName.slice(fileName.lastIndexOf("."));
    return {
      id,
      name: fileName,
      kind,
      fileName: `${id}${ext}`,
      totalBlocks: null,
      addedAt: Date.now()
    };
  }
  /** Forget a document entirely (file, index, snapshots). */
  async remove(docId) {
    const meta = this.docs.get(docId);
    if (meta === void 0) return;
    this.docs.delete(docId);
    for (const [sessionId, state] of this.currentBySession) {
      if (state.docId === docId) this.currentBySession.delete(sessionId);
    }
    if (this.fallbackCurrent.docId === docId) this.fallbackCurrent = { docId: null, block: 1 };
    this.blocksByDoc.delete(docId);
    this.readySet.delete(docId);
    this.pageTextCache.delete(docId);
    this.images.delete(docId);
    this.tableCache.delete(docId);
    this.scheduleSave();
    await Promise.all([
      unlink(join2(this.docsDir, meta.fileName)).catch(() => {
      }),
      unlink(join2(this.textDir, `${docId}.json`)).catch(() => {
      })
    ]);
  }
  // ── current position ──────────────────────────────────────────────────────
  /**
   * Set the current reading position for one session (block clamped into
   * range). Session-less callers (tests, direct probes) use the fallback
   * position instead.
   */
  setCurrent(docId, block, sessionId) {
    if (!this.docs.has(docId)) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    const total = this.docs.get(docId).totalBlocks ?? block;
    const next = { docId, block: clampIndex(block, total) };
    if (sessionId !== void 0 && sessionId !== "") {
      this.currentBySession.set(sessionId, next);
      if (this.currentBySession.size > MAX_SESSION_STATES) {
        const oldest = this.currentBySession.keys().next().value;
        if (oldest !== void 0) this.currentBySession.delete(oldest);
      }
    } else {
      this.fallbackCurrent = next;
    }
    this.scheduleSave();
  }
  /** The reading position of one session (null state when unset). */
  currentState(sessionId) {
    if (sessionId !== void 0 && sessionId !== "") {
      return this.currentBySession.get(sessionId) ?? { docId: null, block: 1 };
    }
    return this.fallbackCurrent;
  }
  /** Clear the reading position of one session (docs stay in the library). */
  close(sessionId) {
    if (sessionId !== void 0 && sessionId !== "") {
      this.currentBySession.delete(sessionId);
    } else {
      this.fallbackCurrent = { docId: null, block: 1 };
    }
    this.scheduleSave();
  }
  // ── block access ─────────────────────────────────────────────────────────
  /** Whether the full index (all block texts) is ready for one document. */
  isReady(docId) {
    return this.readySet.has(docId);
  }
  /**
   * Fast path: the text and locator of one block. For PDFs a single page is
   * extracted on demand (the full index keeps building in the background);
   * other kinds fall back to the (fast) full build.
   */
  async blockText(docId, block, signal) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    if (meta.kind === "pdf") {
      this.kickIndex(docId);
      const cache = this.pageTextFor(docId);
      let text = cache.get(block);
      if (text === void 0) {
        const handle = await openPdf(docId, await readFile(this.filePath(docId)));
        const total = handle.numPages;
        if (meta.totalBlocks !== total) {
          meta.totalBlocks = total;
          this.scheduleSave();
        }
        if (block < 1 || block > total) {
          throw new DocStoreError(`doc_companion: block ${block} out of range (1..${total})`, "BLOCK_OUT_OF_RANGE");
        }
        text = await handle.pageText(block, signal);
        cache.set(block, text);
      }
      return { index: block, locator: pageLocator(block), text };
    }
    const blocks = await this.blocksFor(docId, signal);
    const found = blocks[block - 1];
    if (found === void 0) {
      throw new DocStoreError(`doc_companion: block ${block} out of range (1..${blocks.length})`, "BLOCK_OUT_OF_RANGE");
    }
    return found;
  }
  /**
   * Full index: every block text of the document, in block order. Non-PDF
   * kinds build synchronously (fast); PDFs extract page by page and the
   * result is cached on disk. Callers should pass the exec signal so a
   * long PDF build can be aborted.
   */
  async blocksFor(docId, signal) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    let promise = this.blocksByDoc.get(docId);
    if (promise === void 0) promise = this.buildBlocks(docId);
    const blocks = await promise;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    return blocks;
  }
  /** Start the full index build without awaiting it (PDF fast-path helper). */
  kickIndex(docId) {
    const meta = this.docs.get(docId);
    if (meta === void 0 || this.blocksByDoc.has(docId) || this.readySet.has(docId)) return;
    const promise = this.buildBlocks(docId);
    this.blocksByDoc.set(docId, promise);
    promise.then(() => {
      this.readySet.add(docId);
    }).catch((error) => {
      this.blocksByDoc.delete(docId);
      console.warn(`[dsh-plugin-doc-companion] index build failed for ${docId}:`, error);
    });
  }
  async buildBlocks(docId) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    const sidecar = await this.tryReadSidecar(docId);
    if (sidecar !== null) {
      meta.totalBlocks = sidecar.length;
      if (meta.kind === "pdf") this.checkTextLayerHealth(meta, sidecar);
      this.scheduleSave();
      return sidecar;
    }
    const filePath = this.filePath(docId);
    let blocks;
    switch (meta.kind) {
      case "pdf": {
        const handle = await openPdf(docId, await readFile(filePath));
        meta.totalBlocks = handle.numPages;
        this.scheduleSave();
        const cache = this.pageTextFor(docId);
        blocks = [];
        for (let page = 1; page <= handle.numPages; page += 1) {
          let text = cache.get(page);
          if (text === void 0) {
            text = await handle.pageText(page);
            cache.set(page, text);
          }
          blocks.push({ index: page, locator: pageLocator(page), text });
        }
        break;
      }
      case "text": {
        const text = await readFile(filePath, "utf8");
        const chunks = chunkText(text, this.opts.textBlockChars);
        const totalChars = chunkTotalChars(chunks, this.opts.textBlockChars);
        blocks = chunks.map((chunk, i) => ({
          index: i + 1,
          locator: textBlockLocator(i + 1, this.opts.textBlockChars, totalChars),
          text: chunk
        }));
        break;
      }
      case "docx": {
        const paragraphs = await extractDocxParagraphs(await readFile(filePath));
        const groups = groupBy(paragraphs, this.opts.maxParagraphsPerBlock);
        blocks = groups.map((group, i) => {
          const first = i * this.opts.maxParagraphsPerBlock + 1;
          const last = first + group.length - 1;
          return { index: i + 1, locator: paragraphBlockLocator(first, last), text: group.join("\n") };
        });
        break;
      }
      case "xlsx": {
        const sheets = await extractXlsxSheets(await readFile(filePath));
        blocks = this.sheetBlocks(sheets, (sheetName, first, last) => rowBlockLocator(sheetName, first, last));
        break;
      }
      case "csv": {
        const rows = parseCsv(await readFile(filePath, "utf8"));
        const sheets = [{ sheetName: "", rows }];
        blocks = this.sheetBlocks(sheets, (sheetName, first, last) => rowBlockLocator(sheetName, first, last));
        break;
      }
    }
    meta.totalBlocks = blocks.length;
    if (meta.kind === "pdf") this.checkTextLayerHealth(meta, blocks);
    this.scheduleSave();
    await this.writeSidecar(docId, blocks);
    return blocks;
  }
  /**
   * Whole-document glyph-mapping health check for PDFs: when the text layer
   * is broken (see detectBrokenTextLayer), the flag is persisted on the meta
   * so every page is served through the vision transcription path and search
   * is reported as unavailable instead of returning garbage hits.
   */
  checkTextLayerHealth(meta, blocks) {
    const broken = detectBrokenTextLayer(blocks);
    if (broken !== meta.textLayerBroken) {
      meta.textLayerBroken = broken;
      this.scheduleSave();
    }
  }
  sheetBlocks(sheets, locator) {
    const blocks = [];
    let index = 1;
    for (const sheet of sheets) {
      const groups = groupBy(sheet.rows, this.opts.maxRowsPerBlock);
      for (const group of groups) {
        const first = this.rowOffsetOf(sheet.rows, group);
        const last = first + group.length - 1;
        blocks.push({
          index,
          locator: locator(sheet.sheetName, first, last),
          text: group.map((row) => row.join("	")).join("\n")
        });
        index += 1;
      }
    }
    return blocks;
  }
  rowOffsetOf(rows, group) {
    const idx = rows.indexOf(group[0]);
    return idx < 0 ? 1 : idx + 1;
  }
  /**
   * The table-shaped view of one block (xlsx/csv rendering). Returns the
   * header cells plus the data rows of the requested block.
   */
  async tableBlock(docId, block, signal) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    if (meta.kind !== "xlsx" && meta.kind !== "csv") {
      throw new DocStoreError(`doc_companion: "${meta.name}" has no table view`, "NOT_A_TABLE");
    }
    const cached = this.tableCache.get(docId);
    if (cached !== void 0 && cached.index === block) return cached;
    const filePath = this.filePath(docId);
    const sheets = meta.kind === "xlsx" ? await extractXlsxSheets(await readFile(filePath)) : [{ sheetName: "", rows: parseCsv(await readFile(filePath, "utf8")) }];
    let index = 1;
    for (const sheet of sheets) {
      const groups = groupBy(sheet.rows, this.opts.maxRowsPerBlock);
      for (const group of groups) {
        if (index === block) {
          const firstRow = this.rowOffsetOf(sheet.rows, group);
          const columns = group[0] ?? [];
          const rows = group.slice(1);
          const table = { index, sheet: sheet.sheetName, firstRow, columns, rows };
          this.tableCache.set(docId, table);
          if (signal?.aborted) throw new DOMException("aborted", "AbortError");
          return table;
        }
        index += 1;
      }
    }
    throw new DocStoreError(`doc_companion: block ${block} out of range`, "BLOCK_OUT_OF_RANGE");
  }
  // ── scanned-page snapshots ───────────────────────────────────────────────
  /** Record a page snapshot saved by the reader panel. */
  setBlockImage(docId, block, path) {
    let map = this.images.get(docId);
    if (map === void 0) {
      map = /* @__PURE__ */ new Map();
      this.images.set(docId, map);
    }
    map.set(block, path);
  }
  /** Persist a page snapshot (PNG bytes) and register it for one block. */
  async saveBlockImage(docId, block, bytes) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    const path = join2(this.imageDir, `${docId}-b${block}.png`);
    await writeFile(path, bytes);
    this.setBlockImage(docId, block, path);
    return path;
  }
  /** Cache an extracted/transcribed block text (scanned-page results). */
  cacheBlockText(docId, block, text) {
    this.pageTextFor(docId).set(block, text);
  }
  /**
   * Transcription cache for PDF pages (vision-first reading): maps
   * `docId:block` to the vision-transcribed text. In-memory only — a restart
   * re-transcribes on first access, exactly like the page-text cache.
   */
  transcribedPages = /* @__PURE__ */ new Map();
  /** The vision-transcribed text of a PDF page, or undefined when not yet done. */
  transcribedText(docId, block) {
    return this.transcribedPages.get(`${docId}:${block}`);
  }
  /** Record a successful vision transcription (also feeds the page-text cache). */
  markTranscribed(docId, block, text) {
    this.transcribedPages.set(`${docId}:${block}`, text);
    this.pageTextFor(docId).set(block, text);
  }
  /**
   * Ensure a page snapshot exists for one block, rendering it HOST-SIDE when
   * the reader panel never showed the page (pdf.js + @napi-rs/canvas). This
   * is the background path: the agent can read any page through the vision
   * model without the user navigating there.
   * @returns the snapshot path, or undefined when unavailable/failed.
   */
  async ensurePageImage(docId, block) {
    const existing = this.imagePath(docId, block);
    if (existing !== void 0) return existing;
    const meta = this.docs.get(docId);
    if (meta === void 0 || meta.kind !== "pdf") return void 0;
    const filePath = this.filePath(docId);
    try {
      const bytes = await readFile(filePath);
      const png = await renderPdfPagePng(docId, new Uint8Array(bytes), block);
      if (png === null) return void 0;
      return await this.saveBlockImage(docId, block, png);
    } catch (error) {
      console.warn(
        `[dsh-plugin-doc-companion] ensurePageImage failed (${docId} p${block}):`,
        error instanceof Error ? error.message : error
      );
      return void 0;
    }
  }
  // ── caches & sidecars ────────────────────────────────────────────────────
  pageTextFor(docId) {
    let map = this.pageTextCache.get(docId);
    if (map === void 0) {
      map = /* @__PURE__ */ new Map();
      this.pageTextCache.set(docId, map);
    }
    return map;
  }
  async tryReadSidecar(docId) {
    const path = join2(this.textDir, `${docId}.json`);
    if (!existsSync(path)) return null;
    try {
      const raw = JSON.parse(await readFile(path, "utf8"));
      if (!Array.isArray(raw)) return null;
      const blocks = raw.filter((b) => typeof b === "object" && b !== null && typeof b.index === "number" && typeof b.locator === "string" && typeof b.text === "string");
      return blocks.length > 0 ? blocks : null;
    } catch {
      return null;
    }
  }
  async writeSidecar(docId, blocks) {
    const path = join2(this.textDir, `${docId}.json`);
    await writeFile(path, JSON.stringify(blocks), "utf8");
  }
};

// src/search.ts
function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}
function queryTerms(query) {
  return query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
}
function searchBlocks(blocks, query, maxHits = 5, window = 140) {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const hits = [];
  for (const block of blocks) {
    const lower = block.text.toLowerCase();
    const present = terms.filter((term) => lower.includes(term));
    if (present.length < terms.length) continue;
    const matches = present.reduce((sum, term) => sum + countOccurrences(lower, term), 0);
    const firstTerm = present[0];
    const at = lower.indexOf(firstTerm);
    hits.push({
      block: block.index,
      locator: block.locator,
      snippet: makeSnippet(block.text, at, firstTerm.length, window),
      matches
    });
  }
  hits.sort((a, b) => b.matches - a.matches || a.block - b.block);
  return hits.slice(0, maxHits);
}
function countMatches(blockText, query) {
  const terms = queryTerms(query);
  if (terms.length === 0) return 0;
  const lower = blockText.toLowerCase();
  return terms.reduce((sum, term) => sum + countOccurrences(lower, term), 0);
}
function makeSnippet(text, at, termLen, window) {
  const start = Math.max(0, at - window);
  const end = Math.min(text.length, at + termLen + window);
  const lead = start > 0 ? "\u2026" : "";
  const tail = end < text.length ? "\u2026" : "";
  return `${lead}${text.slice(start, end).replace(/\s+/g, " ").trim()}${tail}`;
}

// src/vision.ts
import { readFile as readFile2 } from "node:fs/promises";
import { basename as basename3 } from "node:path";
var VISION_SYSTEM = "\u4F60\u662F\u4E00\u4E2A\u591A\u6A21\u6001\u89C6\u89C9\u8BC6\u522B\u4EE3\u7406\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u5F20\u4E66\u672C/\u8BD5\u5377\u9875\u9762\u7684\u622A\u56FE\uFF0C\u4F60\u9700\u8981\u539F\u6837\u63D0\u53D6\u8FD9\u4E00\u9875\u7684\u5168\u90E8\u6587\u5B57\u5185\u5BB9\uFF0C\u5305\u62EC\u6B63\u6587\u3001\u516C\u5F0F\u3001\u8868\u683C\u91CC\u7684\u6587\u5B57\u3002\u4FDD\u6301\u539F\u6709\u5206\u6BB5\u548C\u7F16\u53F7\uFF0C\u53EA\u8F93\u51FA\u63D0\u53D6\u7684\u6587\u5B57\uFF0C\u4E0D\u8981\u89E3\u91CA\u3001\u4E0D\u8981\u603B\u7ED3\u3001\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u8BF4\u660E\u3002";
async function transcribeImage(llm, attachments, cfg, imagePath, instruction, signal) {
  try {
    const data = await readFile2(imagePath);
    const ref = await attachments.saveImage({ data, mediaType: "image/png", name: basename3(imagePath) });
    const content = [
      { type: "text", text: instruction },
      { type: "image", attachment: ref }
    ];
    const parts = [];
    for await (const chunk of llm.stream({
      provider: cfg.provider,
      model: cfg.model,
      system: VISION_SYSTEM,
      messages: [createUserMessage({ content, source: { kind: "user" } })],
      signal
    })) {
      if (chunk.type === "text-delta") parts.push(chunk.text);
    }
    const text = parts.join("").trim();
    if (!text) return { ok: false, error: "vision model returned empty content" };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
var TRANSCRIBE_INSTRUCTION = "\u8BF7\u628A\u8FD9\u4E00\u9875\u7684\u5168\u90E8\u6587\u5B57\u5185\u5BB9\u539F\u6837\u63D0\u53D6\u51FA\u6765\uFF0C\u5305\u62EC\u6B63\u6587\u3001\u516C\u5F0F\u3001\u8868\u683C\u4E2D\u7684\u6587\u5B57\uFF0C\u4FDD\u6301\u5206\u6BB5\u4E0E\u7F16\u53F7\u3002";

// src/index.ts
var name = "doc-companion";
var inject = ["tools", "systemPrompt", "webServer"];
var Config = Schema.object({
  storageDir: Schema.string().default(""),
  maxBytes: Schema.natural().default(256 * 1024 * 1024),
  maxImageBytes: Schema.natural().default(20 * 1024 * 1024),
  textBlockChars: Schema.natural().default(2600),
  maxParagraphsPerBlock: Schema.natural().default(40),
  maxRowsPerBlock: Schema.natural().default(50),
  autoTranscribeScanned: Schema.boolean().default(true),
  visionProvider: Schema.string().default("deepseek-official"),
  visionModel: Schema.string().default("deepseek-v4-flash-vision-exp"),
  searchMaxHits: Schema.natural().default(5)
});
function normalizeConfig(raw) {
  const config = raw ?? {};
  return {
    storageDir: typeof config.storageDir === "string" ? config.storageDir.trim() : "",
    maxBytes: typeof config.maxBytes === "number" && config.maxBytes > 0 ? config.maxBytes : 256 * 1024 * 1024,
    maxImageBytes: typeof config.maxImageBytes === "number" && config.maxImageBytes > 0 ? config.maxImageBytes : 20 * 1024 * 1024,
    textBlockChars: typeof config.textBlockChars === "number" && config.textBlockChars > 0 ? config.textBlockChars : 2600,
    maxParagraphsPerBlock: typeof config.maxParagraphsPerBlock === "number" && config.maxParagraphsPerBlock > 0 ? config.maxParagraphsPerBlock : 40,
    maxRowsPerBlock: typeof config.maxRowsPerBlock === "number" && config.maxRowsPerBlock > 0 ? config.maxRowsPerBlock : 50,
    autoTranscribeScanned: config.autoTranscribeScanned !== false,
    visionProvider: typeof config.visionProvider === "string" && config.visionProvider.trim() ? config.visionProvider.trim() : "deepseek-official",
    visionModel: typeof config.visionModel === "string" && config.visionModel.trim() ? config.visionModel.trim() : "deepseek-v4-flash-vision-exp",
    searchMaxHits: typeof config.searchMaxHits === "number" && config.searchMaxHits > 0 ? config.searchMaxHits : 5
  };
}
function isTrustedRequest(req) {
  const host = req.headers.host ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return false;
  const origin = req.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
async function readBody(req, cap) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk;
    total += buf.length;
    if (total > cap) throw new HttpError(413, "body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}
function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}
function sendFile(res, path, mime) {
  const size = statSync(path).size;
  res.writeHead(200, {
    "content-type": mime,
    "content-length": size,
    "cache-control": "public, max-age=3600"
  });
  createReadStream(path).pipe(res);
}
var MIME_BY_EXT = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".json": "application/json",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};
function mimeOf(path) {
  return MIME_BY_EXT[extname2(path).toLowerCase()] ?? "application/octet-stream";
}
var requireFromPlugin = createRequire3(import.meta.url);
var pdfjsRootCache = null;
function pdfjsRoot() {
  if (pdfjsRootCache === null) {
    pdfjsRootCache = dirname2(requireFromPlugin.resolve("pdfjs-dist/package.json"));
  }
  return pdfjsRootCache;
}
function docInfoValue(meta) {
  return {
    id: meta.id,
    name: meta.name,
    kind: meta.kind,
    ...meta.totalBlocks !== null ? { total_blocks: meta.totalBlocks } : {},
    ...meta.textLayerBroken === true ? { text_layer_broken: true } : {}
  };
}
var BLOCK_READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    doc: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
        kind: { type: "string", required: true },
        total_blocks: { type: "integer" },
        text_layer_broken: { type: "boolean" }
      }
    },
    block: { type: "integer" },
    locator: { type: "string" },
    text: { type: "string" },
    image_path: { type: "string" },
    scanned: { type: "boolean" },
    note: { type: "string" }
  }
};
async function resolveBlock(store, cfg, llm, attachments, docId, block, signal) {
  const meta = store.get(docId);
  const isPdf = meta.kind === "pdf";
  const transcribed = store.transcribedText(docId, block);
  const found = await store.blockText(docId, block, signal);
  let text = transcribed ?? found.text;
  let visionRead = transcribed !== void 0;
  let note;
  if (isPdf && transcribed === void 0) {
    let snapshot2 = store.imagePath(docId, block);
    if (snapshot2 === void 0) snapshot2 = await store.ensurePageImage(docId, block);
    const llmFace = llm?.();
    const attachmentFace = attachments?.();
    if (snapshot2 !== void 0 && llmFace !== void 0 && attachmentFace !== void 0) {
      const result = await transcribeImage(
        llmFace,
        attachmentFace,
        { provider: cfg.visionProvider, model: cfg.visionModel },
        snapshot2,
        TRANSCRIBE_INSTRUCTION,
        signal
      );
      if (result.ok) {
        text = result.text;
        store.markTranscribed(docId, block, text);
        visionRead = true;
      } else if (text.trim().length > 0 && meta.textLayerBroken !== true) {
        note = `\u89C6\u89C9\u8F6C\u5199\u5931\u8D25\uFF08${result.error}\uFF09\uFF0C\u4EE5\u4E0B\u4E3A\u8BE5\u9875\u6587\u5B57\u5C42\u7684\u63D0\u53D6\u6587\u672C\u3002`;
      } else {
        note = `\u89C6\u89C9\u8F6C\u5199\u5931\u8D25\uFF1A${result.error}\u3002\u53EF\u8BA9\u7528\u6237\u628A\u9875\u9762\u622A\u56FE\u53D1\u7ED9\u4F60\uFF0C\u6216\u7528 vision \u5DE5\u5177\u8BFB\u53D6 image_path\u3002`;
      }
    } else if (snapshot2 === void 0) {
      note = "\u5F53\u524D\u9875\u65E0\u6CD5\u751F\u6210\u9875\u9762\u5FEB\u7167\uFF0C\u4EE5\u4E0B\u4E3A\u6587\u5B57\u5C42\u63D0\u53D6\uFF08\u82E5\u4E71\u7801\u8BF7\u544A\u77E5\u6211\u622A\u56FE\uFF09\u3002";
    }
  }
  const snapshot = store.imagePath(docId, block);
  return {
    ok: true,
    doc: docInfoValue(meta),
    block,
    locator: found.locator,
    text,
    ...snapshot !== void 0 ? { image_path: snapshot } : {},
    ...visionRead ? { scanned: true } : {},
    ...note !== void 0 ? { note } : {}
  };
}
function apply(ctx, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  const storageDir = cfg.storageDir || dshHomePath("ebooks");
  const store = new DocumentStore(storageDir, {
    textBlockChars: cfg.textBlockChars,
    maxParagraphsPerBlock: cfg.maxParagraphsPerBlock,
    maxRowsPerBlock: cfg.maxRowsPerBlock
  });
  const llm = () => ctx.get("llm");
  const attachments = () => ctx.get("attachments");
  const registerTool = (tool) => {
    ctx.effect(() => ctx.tools.register(tool), `doc-companion: ${tool.name}`);
  };
  void store.init().then(() => {
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/api/doc",
      handler: apiHandler
    }), "doc-companion: /api/doc");
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/doc-static",
      handler: staticHandler
    }), "doc-companion: /doc-static");
    registerTool(docCurrentTool(store, cfg, llm, attachments));
    registerTool(docPageTool(store, cfg, llm, attachments));
    registerTool(docGotoTool(store));
    registerTool(docSearchTool(store, cfg));
    registerTool(docOpenTool(store, cfg));
    registerTool(docCloseTool(store));
    registerTool(docListTool(store));
  }).catch((error) => {
    console.error("[dsh-plugin-doc-companion] store init failed; doc tools are disabled:", error);
  });
  ctx.systemPrompt.section({
    name: "tool:doc-companion",
    order: 97,
    text: "\u672C\u4F1A\u8BDD\u7531 dsh-plugin-doc-companion \u63D0\u4F9B\u300C\u6587\u6863\u4F34\u8BFB\u300D\u80FD\u529B\u3002\u7528\u6237\u5728\u53F3\u4FA7\u9605\u8BFB\u9762\u677F\u4E2D\u6253\u5F00\u6587\u6863\uFF08PDF / Word / Excel / CSV / TXT / MD\uFF09\u5E76\u7FFB\u9875\u65F6\uFF0C\u5F53\u524D\u5757\uFF08\u9875/\u5757\u53F7\uFF09\u4F1A\u81EA\u52A8\u540C\u6B65\uFF1A\u9700\u8981\u77E5\u9053\u7528\u6237\u5F53\u524D\u770B\u5230\u54EA\u4E00\u9875\u53CA\u5185\u5BB9 \u2192 doc_current\uFF1B\u7528\u6237\u95EE\u300C\u7B2C N \u9875/\u5757\u300D\u6216\u8981\u8BFB\u7279\u5B9A\u4F4D\u7F6E \u2192 doc_page({block})\uFF1B\u7528\u6237\u8BF4\u300C\u7FFB\u5230/\u8DF3\u5230\u7B2C N \u9875\u300D\u2192 doc_goto({block})\uFF08\u9605\u8BFB\u9762\u677F\u540C\u6B65\u8DF3\u8F6C\uFF09\uFF1B\u7528\u6237\u7ED9\u51FA\u6587\u4EF6\u8DEF\u5F84\u60F3\u6253\u5F00 \u2192 doc_open({path})\uFF1B\u6587\u6863\u5217\u8868 \u2192 doc_list\uFF1B\u5173\u95ED \u2192 doc_close\u3002\n\u9605\u8BFB\u65B9\u5F0F\uFF1APDF \u4E00\u5F8B\u91C7\u7528\u300C\u89C6\u89C9\u4F18\u5148\u300D\u2014\u2014doc_current / doc_page \u8FD4\u56DE\u7684 PDF \u9875\u6587\u5B57\u7531\u9875\u9762\u622A\u56FE\u7ECF\u89C6\u89C9\u6A21\u578B\u8F6C\u5199\uFF08\u65E0\u9700\u7528\u6237\u7FFB\u9875\uFF0Chost \u81EA\u52A8\u6E32\u67D3\u4EFB\u610F\u9875\uFF09\uFF0C\u56E0\u6B64\u54EA\u6015\u6587\u672C\u5C42\u635F\u574F\u4E5F\u80FD\u8BFB\u5230\u51C6\u786E\u7684\u516C\u5F0F\u4E0E\u6392\u7248\uFF1B\u8FD4\u56DE\u91CC scanned=true \u8868\u793A\u8BE5\u9875\u4E3A\u89C6\u89C9\u8F6C\u5199\u7ED3\u679C\uFF0Cimage_path \u662F\u9875\u9762\u5FEB\u7167\u3002\u9700\u8981\u5B9A\u4F4D\u5185\u5BB9\u65F6\u7528 doc_search({query}) \u505A\u6587\u5B57\u68C0\u7D22\uFF08\u5FEB\uFF09\uFF0C\u547D\u4E2D\u540E\u7528 doc_page \u89C6\u89C9\u9605\u8BFB\u8BE5\u9875\u3002Word/Excel/CSV/TXT \u65E0\u9875\u9762\u6982\u5FF5\uFF0C\u76F4\u63A5\u4F7F\u7528\u5176\u63D0\u53D6\u6587\u672C\u3002\n\u5F15\u7528\u4E0E\u4F5C\u7B54\u89C4\u8303\uFF1A\n1. \u5F15\u7528\u6587\u6863\u5185\u5BB9\u65F6\u5FC5\u987B\u8D34\u51FA\u539F\u6587\u7247\u6BB5\u5E76\u6CE8\u660E\u4F4D\u7F6E\uFF08\u5982\u300C\u7B2C 12 \u9875\u300D\u300C\u5DE5\u4F5C\u8868\u300C\u771F\u9898\u300D\u7B2C 10\u201329 \u884C\u300D\u300C\u7B2C 45\u201360 \u6BB5\u300D\uFF09\uFF0C\u5148\u539F\u6587\u540E\u89E3\u91CA\uFF1B\n2. \u7528\u6237\u505A\u7EC3\u4E60\u4F1A\u5148\u8BF4\u51FA\u81EA\u5DF1\u7684\u505A\u6CD5/\u7B54\u6848\uFF1A\u5148\u660E\u786E\u5224\u65AD\u5BF9\u9519\u5E76\u6307\u51FA\u5BF9\u5728\u54EA\u3001\u9519\u5728\u54EA\uFF0C\u518D\u7ED9\u51FA\u6B63\u786E\u7B54\u6848\u4E0E\u5B8C\u6574\u6B65\u9AA4\uFF0C\u7136\u540E\u7ED9\u51FA\u9488\u5BF9\u6027\u4FEE\u6539\u610F\u89C1\uFF0C\u5C3D\u91CF\u8054\u7CFB\u539F\u6587\u77E5\u8BC6\u70B9\u89E3\u91CA\u539F\u7406\uFF1B\n3. \u68C0\u7D22\u65E0\u7ED3\u679C\u6216\u6587\u6863\u6587\u672C\u5C42\u635F\u574F\u5BFC\u81F4\u68C0\u7D22\u4E0D\u53EF\u7528\u65F6\u5982\u5B9E\u8BF4\u660E\uFF0C\u4E0D\u8981\u7F16\u9020\u539F\u6587\u3002"
  });
  async function apiHandler(req, res) {
    try {
      if (!isTrustedRequest(req)) {
        sendText(res, 403, "forbidden");
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      if (req.method === "POST" && parts[2] === "upload") {
        await handleUpload(req, res, cfg, store);
        return;
      }
      if (req.method === "GET" && parts[2] === "list") {
        sendJson(res, 200, {
          docs: store.list().map((meta) => ({ id: meta.id, name: meta.name, kind: meta.kind, total_blocks: meta.totalBlocks, added_at: meta.addedAt }))
        });
        return;
      }
      if (req.method === "GET" && parts[2] === "state") {
        const sessionId = url.searchParams.get("session") ?? void 0;
        const current = store.currentState(sessionId);
        const meta = current.docId !== null ? store.get(current.docId) : void 0;
        sendJson(res, 200, {
          doc: meta !== void 0 ? { ...docInfoValue(meta), ready: store.isReady(meta.id) } : null,
          block: current.docId !== null ? current.block : null
        });
        return;
      }
      if (parts[2] === "docs" && typeof parts[3] === "string") {
        await handleDocs(req, res, store, cfg, parts, url);
        return;
      }
      sendJson(res, 404, { error: "no such route" });
    } catch (error) {
      if (error instanceof HttpError) {
        sendText(res, error.status, error.message);
        return;
      }
      console.error("[dsh-plugin-doc-companion] /api/doc handler error:", error);
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  async function handleDocs(req, res, store2, cfg2, parts, url) {
    const docId = parts[3];
    const meta = store2.get(docId);
    if (meta === void 0) {
      sendJson(res, 404, { error: "unknown document" });
      return;
    }
    if (req.method === "GET" && parts.length === 4) {
      const filePath = store2.filePath(docId);
      if (!existsSync2(filePath)) {
        sendJson(res, 404, { error: "file missing" });
        return;
      }
      sendFile(res, filePath, mimeOf(meta.fileName));
      return;
    }
    if (req.method === "GET" && parts[4] === "blocks" && parts.length === 6) {
      const block = Number.parseInt(parts[5] ?? "", 10);
      try {
        const found = await store2.blockText(docId, block);
        sendJson(res, 200, { block: found.index, locator: found.locator, text: found.text });
      } catch (error) {
        if (error instanceof DocStoreError) sendJson(res, 404, { error: error.message });
        else throw error;
      }
      return;
    }
    if (req.method === "GET" && parts[4] === "block-table" && parts.length === 6) {
      const block = Number.parseInt(parts[5] ?? "", 10);
      try {
        const table = await store2.tableBlock(docId, block);
        sendJson(res, 200, { sheet: table.sheet, first_row: table.firstRow, columns: table.columns, rows: table.rows });
      } catch (error) {
        if (error instanceof DocStoreError) sendJson(res, 404, { error: error.message });
        else throw error;
      }
      return;
    }
    if (req.method === "POST" && parts[4] === "position") {
      const body = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8"));
      if (typeof body.block !== "number" || !Number.isInteger(body.block)) {
        sendJson(res, 400, { error: "block must be an integer" });
        return;
      }
      store2.setCurrent(docId, body.block, typeof body.session === "string" ? body.session : void 0);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && parts[4] === "block-image") {
      const block = Number.parseInt(url.searchParams.get("block") ?? "", 10);
      if (!Number.isInteger(block)) {
        sendJson(res, 400, { error: "block query param required" });
        return;
      }
      const bytes = await readBody(req, cfg2.maxImageBytes);
      const imagePath = await store2.saveBlockImage(docId, block, bytes);
      sendJson(res, 200, { path: imagePath });
      return;
    }
    sendJson(res, 404, { error: "no such route" });
  }
  async function staticHandler(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const first = parts[1];
      if (req.method !== "GET" || first === void 0 || !["build", "cmaps", "standard_fonts"].includes(first)) {
        sendText(res, 404, "not found");
        return;
      }
      const target = safeJoin(pdfjsRoot(), parts.slice(1).join("/"));
      if (target === null) {
        sendText(res, 403, "forbidden");
        return;
      }
      if (!existsSync2(target) || !statSync(target).isFile()) {
        sendText(res, 404, "not found");
        return;
      }
      sendFile(res, target, mimeOf(target));
    } catch (error) {
      console.error("[dsh-plugin-doc-companion] /doc-static handler error:", error);
      sendText(res, 500, "internal error");
    }
  }
}
async function handleUpload(req, res, cfg, store) {
  const rawNameHeader = req.headers["x-file-name"];
  const rawName = typeof rawNameHeader === "string" ? decodeURIComponent(rawNameHeader) : "document";
  const sessionHeader = req.headers["x-session"];
  const sessionId = typeof sessionHeader === "string" && sessionHeader !== "" ? sessionHeader : void 0;
  const fileName = sanitizeFileName(rawName);
  const kind = detectKind(fileName);
  if (kind === null) {
    sendJson(res, 415, { error: `unsupported file type "${extname2(fileName)}" (support: PDF / DOCX / XLSX / CSV / TXT / MD)` });
    return;
  }
  const bytes = await readBody(req, cfg.maxBytes);
  const meta = await store.registerBytes(fileName, kind, bytes, sessionId);
  sendJson(res, 200, {
    doc_id: meta.id,
    name: meta.name,
    kind: meta.kind,
    total_blocks: meta.totalBlocks
  });
}
function sessionIdOf(exec) {
  const id = exec.agent?.session?.id;
  return typeof id === "string" && id !== "" ? id : void 0;
}
function docCurrentTool(store, cfg, llm, attachments) {
  return defineTool({
    name: "doc_current",
    description: '\u83B7\u53D6\u7528\u6237\u5F53\u524D\u9605\u8BFB\u72B6\u6001\uFF1A\u6B63\u5728\u8BFB\u7684\u6587\u6863\u3001\u5F53\u524D\u5757\u53F7\uFF08\u9875\u7801/\u5757\u53F7\uFF09\u3001\u8BE5\u5757\u7684\u5168\u90E8\u6587\u5B57\u4E0E\u4F4D\u7F6E\u6807\u7B7E\u3002\u7528\u6237\u95EE"\u8FD9\u4E00\u9875/\u73B0\u5728\u770B\u5230\u54EA/\u5F53\u524D\u5185\u5BB9"\u65F6\u8C03\u7528\uFF1B\u5224\u65AD\u7528\u6237\u505A\u9898\u4E4B\u524D\u4E5F\u5EFA\u8BAE\u5148\u8C03\u7528\u4EE5\u5BF9\u9F50\u4E0A\u4E0B\u6587\u3002',
    parameters: {},
    output: {
      schema: BLOCK_READ_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderBlockRead(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) {
        return {
          ok: true,
          note: "\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u4EFB\u4F55\u6587\u6863\u3002\u7528\u6237\u5C1A\u672A\u4E0A\u4F20/\u6253\u5F00\u6587\u6863\u65F6\uFF0C\u5F15\u5BFC\u7528\u6237\u901A\u8FC7\u9605\u8BFB\u9762\u677F\u4E0A\u4F20\uFF0C\u6216\u4F7F\u7528 doc_open \u6253\u5F00\u6587\u4EF6\u8DEF\u5F84\u3002"
        };
      }
      return resolveBlock(store, cfg, llm, attachments, current.docId, current.block, exec.signal);
    }
  });
}
function docPageTool(store, cfg, llm, attachments) {
  return defineTool({
    name: "doc_page",
    description: '\u8BFB\u53D6\u5F53\u524D\u6253\u5F00\u7684\u6587\u6863\u4E2D\u7B2C N \u5757\uFF08\u9875\uFF09\u7684\u6587\u5B57\u4E0E\u4F4D\u7F6E\uFF0C\u4E0D\u6539\u52A8\u9605\u8BFB\u9762\u677F\u7684\u9875\u7801\u3002\u7528\u6237\u95EE"\u7B2C N \u9875\u8BB2\u4E86\u4EC0\u4E48"\u6216\u9700\u8981\u8BFB\u7279\u5B9A\u4F4D\u7F6E\u65F6\u8C03\u7528\u3002',
    parameters: {
      block: {
        type: "integer",
        required: true,
        description: "\u8981\u8BFB\u53D6\u7684\u5757\u53F7\uFF08PDF \u4E3A\u9875\u7801\uFF0C\u4ECE 1 \u5F00\u59CB\uFF09"
      }
    },
    output: {
      schema: BLOCK_READ_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderBlockRead(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) throw new Error("doc_page: \u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u6587\u6863\uFF08\u7528\u6237\u5C1A\u672A\u4E0A\u4F20/\u6253\u5F00\u6587\u6863\uFF09");
      const block = typeof args.block === "number" ? args.block : Number.NaN;
      if (!Number.isInteger(block) || block < 1) throw new Error("doc_page: block \u5FC5\u987B\u662F\u6B63\u6574\u6570");
      const meta = store.get(current.docId);
      const total = meta.totalBlocks ?? block;
      if (block > total) throw new Error(`doc_page: block ${block} \u8D85\u51FA\u8303\u56F4\uFF081..${total}\uFF09`);
      return resolveBlock(store, cfg, llm, attachments, current.docId, block, exec.signal);
    }
  });
}
function docGotoTool(store) {
  return defineTool({
    name: "doc_goto",
    description: '\u628A\u9605\u8BFB\u9762\u677F\u8DF3\u8F6C\u5230\u7B2C N \u5757\uFF08\u9875\uFF09\u3002\u7528\u6237\u8BF4"\u7FFB\u5230/\u8DF3\u5230\u7B2C N \u9875"\u65F6\u8C03\u7528\uFF1B\u9875\u7801\u4F1A\u5B9E\u65F6\u540C\u6B65\u5230\u9762\u677F\u3002',
    parameters: {
      block: {
        type: "integer",
        required: true,
        description: "\u76EE\u6807\u5757\u53F7\uFF08PDF \u4E3A\u9875\u7801\uFF0C\u4ECE 1 \u5F00\u59CB\uFF09"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          doc: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", required: true },
              name: { type: "string", required: true },
              kind: { type: "string", required: true },
              total_blocks: { type: "integer" },
              text_layer_broken: { type: "boolean" }
            }
          },
          block: { type: "integer", required: true },
          locator: { type: "string", required: true }
        }
      },
      render: (_args, value) => {
        const v = value;
        return [{
          type: "text",
          text: `<doc-goto>
\u6587\u6863\uFF1A${v.doc?.name ?? ""}
\u5DF2\u8DF3\u8F6C\u5230\uFF1A${v.locator ?? ""}
</doc-goto>`
        }];
      }
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) throw new Error("doc_goto: \u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u6587\u6863");
      const block = typeof args.block === "number" ? args.block : Number.NaN;
      if (!Number.isInteger(block) || block < 1) throw new Error("doc_goto: block \u5FC5\u987B\u662F\u6B63\u6574\u6570");
      const meta = store.get(current.docId);
      const total = meta.totalBlocks;
      if (total !== null && block > total) throw new Error(`doc_goto: block ${block} \u8D85\u51FA\u8303\u56F4\uFF081..${total}\uFF09`);
      store.setCurrent(current.docId, block, sessionIdOf(exec));
      return {
        ok: true,
        doc: docInfoValue(meta),
        block,
        locator: meta.kind === "pdf" ? `\u7B2C ${block} \u9875` : `\u7B2C ${block} \u5757`
      };
    }
  });
}
function docSearchTool(store, cfg) {
  return defineTool({
    name: "doc_search",
    description: "\u5728\u5F53\u524D\u6253\u5F00\u7684\u6587\u6863\u5185\u90E8\u5168\u6587\u68C0\u7D22\uFF08\u5757=\u9875/\u6BB5\u843D\u7EC4/\u884C\u7EC4\uFF09\u3002\u95EE\u9898\u6D89\u53CA\u6587\u6863\u5185\u90E8\u4F46\u8D85\u51FA\u5F53\u524D\u9875\u65F6\u8C03\u7528\uFF1A\u8FD4\u56DE\u547D\u4E2D\u4F4D\u7F6E\u4E0E\u4E0A\u4E0B\u6587\u7247\u6BB5\uFF0C\u53EF\u518D\u914D\u5408 doc_page \u8BFB\u53D6\u5B8C\u6574\u539F\u6587\u3002\u591A\u4E2A\u8BCD\u7528\u7A7A\u683C\u5206\u9694\uFF08\u5168\u90E8\u547D\u4E2D\u624D\u8FD4\u56DE\uFF09\u3002",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: '\u68C0\u7D22\u8BCD\uFF0C\u4F8B\u5982 "\u6CF0\u52D2\u516C\u5F0F" \u6216 "\u6781\u9650 \u6D1B\u5FC5\u8FBE"'
      },
      max_hits: {
        type: "integer",
        description: "\u6700\u591A\u8FD4\u56DE\u51E0\u4E2A\u547D\u4E2D\uFF08\u9ED8\u8BA4 5\uFF09"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          query: { type: "string", required: true },
          hits: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                block: { type: "integer", required: true },
                locator: { type: "string", required: true },
                snippet: { type: "string", required: true },
                matches: { type: "integer", required: true }
              }
            }
          },
          note: { type: "string" }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: renderSearch(value)
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) throw new Error("doc_search: \u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u6587\u6863");
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (query.length === 0) throw new Error("doc_search: query \u4E0D\u80FD\u4E3A\u7A7A");
      const meta = store.get(current.docId);
      const maxHits = typeof args.max_hits === "number" && args.max_hits > 0 ? Math.floor(args.max_hits) : cfg.searchMaxHits;
      const blocks = await store.blocksFor(current.docId, exec.signal);
      if (meta.textLayerBroken === true) {
        return {
          ok: true,
          query,
          hits: [],
          note: `\u300C${meta.name}\u300D\u6CA1\u6709\u53EF\u68C0\u7D22\u7684\u6587\u672C\u5C42\uFF08\u626B\u63CF\u4EF6\uFF0C\u6216\u5B57\u5F62\u6620\u5C04\u635F\u574F\uFF09\uFF0C\u5168\u6587\u68C0\u7D22\u4E0D\u53EF\u7528\u3002\u4F60\u5173\u5FC3\u7684\u9875\u9762\u53EF\u7528 doc_page \u8BFB\u53D6\uFF08\u4F1A\u81EA\u52A8\u622A\u56FE\u8F6C\u5199\uFF09\uFF0C\u6216\u5C06\u9875\u9762\u622A\u56FE\u53D1\u7ED9\u6211\u3002`
        };
      }
      const hits = searchBlocks(blocks, query, maxHits);
      const note = hits.length === 0 ? `\u5728\u300C${meta.name}\u300D\u4E2D\u6CA1\u6709\u627E\u5230\u4E0E "${query}" \u76F8\u5173\u7684\u5185\u5BB9\u3002` : void 0;
      return { ok: true, query, hits, ...note !== void 0 ? { note } : {} };
    }
  });
}
function docOpenTool(store, cfg) {
  return defineTool({
    name: "doc_open",
    description: "\u6309\u6587\u4EF6\u8DEF\u5F84\u6253\u5F00\u4E00\u4E2A\u6587\u6863\uFF08PDF / DOCX / XLSX / CSV / TXT / MD\uFF09\u3002\u6253\u5F00\u540E\u9605\u8BFB\u9762\u677F\u81EA\u52A8\u52A0\u8F7D\u5E76\u8DF3\u8F6C\u5230\u7B2C 1 \u5757\u3002\u7528\u6237\u63D0\u5230\u67D0\u4E2A\u6587\u4EF6\u8DEF\u5F84\u60F3\u8BFB\u65F6\u8C03\u7528\uFF1B\u8DEF\u5F84\u53EF\u7528\u7EDD\u5BF9\u8DEF\u5F84\u6216\u76F8\u5BF9\u5F53\u524D\u5DE5\u4F5C\u76EE\u5F55\u7684\u8DEF\u5F84\u3002",
    parameters: {
      path: {
        type: "string",
        required: true,
        description: "\u6587\u6863\u6587\u4EF6\u8DEF\u5F84"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          doc: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", required: true },
              name: { type: "string", required: true },
              kind: { type: "string", required: true },
              total_blocks: { type: "integer" },
              text_layer_broken: { type: "boolean" }
            }
          },
          note: { type: "string" }
        }
      },
      render: (_args, value) => {
        const doc = value.doc;
        return [{
          type: "text",
          text: `<doc-open>
\u5DF2\u6253\u5F00\uFF1A${doc?.name ?? ""}\uFF08${doc?.kind ?? ""}${doc?.total_blocks != null ? ` \xB7 ${doc.total_blocks} \u5757` : ""}\uFF09
</doc-open>`
        }];
      }
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const rawPath = typeof args.path === "string" ? args.path.trim() : "";
      if (rawPath.length === 0) throw new Error("doc_open: path \u4E0D\u80FD\u4E3A\u7A7A");
      const cwd = exec.agent?.session?.header?.cwd;
      const target = isAbsolute(rawPath) ? rawPath : cwd !== void 0 ? resolve3(cwd, rawPath) : resolve3(rawPath);
      const kind = detectKind(target);
      if (kind === null) {
        throw new Error(`doc_open: \u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B\uFF08\u652F\u6301 PDF / DOCX / XLSX / CSV / TXT / MD\uFF09: ${rawPath}`);
      }
      if (!existsSync2(target)) throw new Error(`doc_open: \u627E\u4E0D\u5230\u6587\u4EF6 "${rawPath}"`);
      const size = statSync(target).size;
      if (size > cfg.maxBytes) throw new Error(`doc_open: \u6587\u4EF6\u8FC7\u5927\uFF08${size} \u5B57\u8282 > ${cfg.maxBytes}\uFF09`);
      const meta = await store.registerFile(sanitizeFileName(rawPath), kind, target, sessionIdOf(exec));
      return { ok: true, doc: docInfoValue(meta) };
    }
  });
}
function docCloseTool(store) {
  return defineTool({
    name: "doc_close",
    description: "\u5173\u95ED\u5F53\u524D\u6253\u5F00\u7684\u6587\u6863\uFF08\u9605\u8BFB\u9762\u677F\u56DE\u5230\u7A7A\u72B6\u6001\uFF1B\u6587\u6863\u5E93\u91CC\u7684\u6587\u6863\u4FDD\u7559\uFF09\u3002",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true }
        }
      },
      render: () => [{ type: "text", text: "<doc-close>\u5DF2\u5173\u95ED\u5F53\u524D\u6587\u6863</doc-close>" }]
    },
    isConcurrencySafe: () => false,
    async execute(_args, exec) {
      store.close(sessionIdOf(exec));
      return { ok: true };
    }
  });
}
function docListTool(store) {
  return defineTool({
    name: "doc_list",
    description: "\u5217\u51FA\u6587\u6863\u5E93\u91CC\u5DF2\u6709\u7684\u6587\u6863\uFF08id\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u5757\u6570\uFF09\u3002",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          docs: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                name: { type: "string", required: true },
                kind: { type: "string", required: true },
                total_blocks: { type: "integer" },
                added_at: { type: "integer", required: true }
              }
            }
          }
        }
      },
      render: (_args, value) => {
        const docs = value.docs;
        if (docs.length === 0) return [{ type: "text", text: "<doc-list>\uFF08\u6587\u6863\u5E93\u4E3A\u7A7A\uFF09</doc-list>" }];
        const lines = docs.map((doc) => `- ${doc.name}\uFF08${doc.kind}${doc.total_blocks != null ? ` \xB7 ${doc.total_blocks} \u5757` : ""}\uFF09id=${doc.id}`);
        return [{ type: "text", text: `<doc-list>
${lines.join("\n")}
</doc-list>` }];
      }
    },
    isConcurrencySafe: () => true,
    async execute() {
      return {
        ok: true,
        docs: store.list().map((meta) => ({
          id: meta.id,
          name: meta.name,
          kind: meta.kind,
          ...meta.totalBlocks !== null ? { total_blocks: meta.totalBlocks } : {},
          added_at: meta.addedAt
        }))
      };
    }
  });
}
function renderBlockRead(value) {
  const lines = [];
  lines.push("<doc-block>");
  const doc = value.doc;
  if (doc !== void 0) {
    lines.push(`\u6587\u6863\uFF1A${doc.name}\uFF08${doc.kind}${doc.total_blocks != null ? ` \xB7 \u5171 ${doc.total_blocks} \u5757` : ""}\uFF09`);
  }
  if (value.locator !== void 0) lines.push(`\u4F4D\u7F6E\uFF1A${value.locator}`);
  if (value.scanned === true) lines.push("\u626B\u63CF\u9875\uFF1A\u662F\uFF08\u65E0\u6587\u5B57\u5C42\uFF09");
  if (typeof value.text === "string" && value.text.length > 0) {
    lines.push("<block-text>");
    lines.push(value.text);
    lines.push("</block-text>");
  }
  if (value.image_path !== void 0) lines.push(`\u9875\u9762\u5FEB\u7167\uFF1A${value.image_path}`);
  if (value.note !== void 0) lines.push(`\u63D0\u793A\uFF1A${value.note}`);
  lines.push("</doc-block>");
  return lines.join("\n");
}
function renderSearch(value) {
  const lines = [];
  lines.push(`<doc-search query="${value.query}">`);
  if (value.hits.length === 0) {
    lines.push(value.note ?? "\uFF08\u6CA1\u6709\u547D\u4E2D\uFF09");
  } else {
    lines.push(`\u5171 ${value.hits.length} \u4E2A\u547D\u4E2D\uFF1A`);
    for (const hit of value.hits) {
      lines.push(`\u2500\u2500 \u3010${hit.locator}\u3011\u2500\u2500`);
      lines.push(hit.snippet);
    }
  }
  lines.push("</doc-search>");
  return lines.join("\n");
}
export {
  Config,
  DocStoreError,
  DocumentStore,
  TRANSCRIBE_INSTRUCTION,
  apply,
  chunkText,
  chunkTotalChars,
  clampIndex,
  countMatches,
  detectBrokenTextLayer,
  detectKind,
  extractDocxParagraphs,
  extractXlsxSheets,
  groupBy,
  inject,
  joinTextItems,
  makeDocId,
  makeSnippet,
  name,
  normalizeConfig,
  normalizeWhitespace,
  openPdf,
  pageLocator,
  paragraphBlockLocator,
  parseCsv,
  queryTerms,
  renderPdfPagePng,
  rowBlockLocator,
  safeJoin,
  sanitizeFileName,
  searchBlocks,
  textBlockLocator,
  transcribeImage
};
//# sourceMappingURL=index.js.map
