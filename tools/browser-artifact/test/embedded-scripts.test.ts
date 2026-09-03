import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

// This suite exists because of a real, previously-shipped defect: `src/worker/admin.ts` and
// `src/worker/voice-transport.ts` embed several server-side functions into the pages they render
// by calling `fn.toString()` and interpolating the result into a <script> tag (see the doc comment
// atop voice-transport.ts). `Function.prototype.toString()` returns the function's source *as the
// engine actually loaded it* -- which, once Wrangler's real esbuild bundler has processed the
// Worker, includes esbuild's `keep_names` transform: a `__name(fn, "name")` call injected as a
// sibling statement immediately after every named function/class declaration, including ones
// nested inside a `.toString()`-embedded function (so the call ends up *inside* the extracted
// text). `__name` exists only in the Worker's own bundle scope; a real browser tab re-executing
// that extracted text throws `ReferenceError: __name is not defined` before a single event
// listener attaches -- every button, form, and the entire voice transport were inert on first
// load.
//
// Root cause and fix: `wrangler.jsonc`'s `keep_names` option (default true) controls exactly this
// transform (https://esbuild.github.io/api/#keep-names); nothing in this codebase reads a
// function's `.name` at runtime (grepped for `.name ===`/`.constructor.name`/etc., zero matches),
// so the fix is `"keep_names": false` in wrangler.jsonc, eliminating every `__name(...)` injection
// at the source rather than patching around it per call site.
//
// Critically, `@cloudflare/vitest-plugin`'s own test bundler does NOT reproduce this defect (its
// bundling differs from `wrangler deploy`'s) -- every other test in this repo calls
// `worker.fetch(...)` through that bundler and would stay green even with the bug fully present.
// This suite instead spawns the REAL `wrangler deploy --dry-run` bundler (the same pipeline that
// produces what actually gets deployed), imports its literal output, and executes the extracted
// <script> text in a fully isolated Node `vm` context that provides nothing resembling a bundler
// helper -- the closest deterministic, automatable proxy for "a real, empty browser tab" available
// in this test suite.

const repoRoot = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);

let buildDir: string;
let bundleUrl: string;

function runCommand(cmd: string, args: string[]) {
  return spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 55_000,
  });
}

beforeAll(() => {
  buildDir = mkdtempSync(join(tmpdir(), "howler-browser-artifact-"));
  const result = runCommand("npx", [
    "wrangler",
    "deploy",
    "--dry-run",
    "--outdir",
    buildDir,
  ]);
  if (result.status !== 0) {
    throw new Error(
      `real wrangler build failed (exit ${String(result.status)}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  const jsPath = join(buildDir, "index.js");
  if (!existsSync(jsPath)) {
    throw new Error(`expected build output not found at ${jsPath}`);
  }
  // Force ESM interpretation regardless of any ambient package.json "type" -- the real bundle
  // uses `export { ... as default }` syntax, which only a `.mjs` (or "type":"module") file allows
  // Node to parse without a separate loader.
  const mjsPath = join(buildDir, "index.mjs");
  copyFileSync(jsPath, mjsPath);
  bundleUrl = pathToFileURL(mjsPath).href;
}, 60_000);

afterAll(() => {
  if (buildDir) rmSync(buildDir, { recursive: true, force: true });
});

interface WorkerModule {
  default: { fetch(request: Request, env: unknown): Promise<Response> };
}

async function renderPage(path: string): Promise<string> {
  const mod = (await import(bundleUrl)) as WorkerModule;
  const response = await mod.default.fetch(
    new Request(`https://example.test${path}`),
    {},
  );
  return response.text();
}

function extractEmbeddedScript(html: string): string {
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const last = matches.at(-1)?.[1];
  if (!last) throw new Error("no <script> block found in rendered page");
  return last;
}

// --- minimal fake DOM, matching the pattern already established in
// test/contract/voice-transport.test.ts and test/unit/field-dashboard.test.ts, so this suite is
// testing the same *shape* of environment those already-reviewed harnesses exercise, just against
// the real bundled script text instead of the direct TypeScript function.

interface FakeElement {
  value: string;
  textContent: string;
  disabled: boolean;
  hidden: boolean;
  className: string;
  classList: {
    toggle(name: string, force?: boolean): void;
    contains(name: string): boolean;
  };
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, handler: (event?: unknown) => void): void;
  trigger(type: string, event?: unknown): void;
  innerHTML: string;
}

function makeFakeDocument(staticIds: string[]): {
  document: { getElementById(id: string): FakeElement };
  elements: Map<string, FakeElement>;
} {
  const elements = new Map<string, FakeElement>();

  function createElement(): FakeElement {
    const listeners: Record<string, ((event?: unknown) => void)[]> = {};
    let html = "";
    let ownedIds: string[] = [];
    const classes = new Set<string>();
    const element: FakeElement = {
      value: "",
      textContent: "",
      disabled: false,
      hidden: false,
      attributes: {},
      get className() {
        return [...classes].join(" ");
      },
      set className(value: string) {
        classes.clear();
        for (const c of value.split(/\s+/).filter(Boolean)) classes.add(c);
      },
      classList: {
        toggle(name: string, force?: boolean) {
          const should = force ?? !classes.has(name);
          if (should) classes.add(name);
          else classes.delete(name);
        },
        contains(name: string) {
          return classes.has(name);
        },
      },
      setAttribute(name: string, value: string) {
        element.attributes[name] = value;
      },
      addEventListener(type: string, handler: (event?: unknown) => void) {
        (listeners[type] ??= []).push(handler);
      },
      trigger(type: string, event?: unknown) {
        for (const handler of listeners[type] ?? []) handler(event);
      },
      get innerHTML() {
        return html;
      },
      set innerHTML(value: string) {
        html = value;
        for (const id of ownedIds) elements.delete(id);
        ownedIds = [];
        for (const match of value.matchAll(/<([a-zA-Z0-9]+)\b([^>]*)>/g)) {
          const attrs = match[2] ?? "";
          const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
          if (!id) continue;
          elements.set(id, createElement());
          ownedIds.push(id);
        }
      },
    };
    return element;
  }

  for (const id of staticIds) elements.set(id, createElement());

  return {
    document: {
      getElementById(id: string) {
        const existing = elements.get(id);
        if (existing) return existing;
        // A real DOM returns null for a missing id; several embedded scripts guard against that
        // (e.g. wireVoicePresentationState). Returning a fresh, inert element here would mask a
        // genuine "this id doesn't exist" bug, so surface it the same way a real browser would.
        return null as unknown as FakeElement;
      },
    },
    elements,
  };
}

function makeFakeSessionStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function runInSandbox(
  scriptText: string,
  extraGlobals: Record<string, unknown>,
): void {
  const sandbox: Record<string, unknown> = {
    sessionStorage: makeFakeSessionStorage(),
    fetch: () =>
      Promise.reject(
        new Error("fetch should not be called during initialization"),
      ),
    crypto: { randomUUID: () => "00000000-0000-0000-0000-000000000000" },
    console,
    ...extraGlobals,
  };
  const context = vm.createContext(sandbox);
  // Deliberately no `__name`, no bundler helpers of any kind -- this is the entire point.
  vm.runInContext(scriptText, context, { filename: "embedded-script.js" });
}

describe("real wrangler bundle: /admin/operator embedded script", () => {
  it("executes in an isolated context with no ReferenceError (proves the shipped bundle is self-contained)", async () => {
    const html = await renderPage("/admin/operator");
    const script = extractEmbeddedScript(html);
    const { document } = makeFakeDocument([
      "admin-key",
      "project-id",
      "intent-kind",
      "revision-field",
      "expected-revision",
      "evidence-field",
      "evidence-event-json",
      "run-intent",
      "resume-button",
      "status",
      "out-intent-id",
      "out-workflow-id",
      "out-workflow-state",
      "out-attempt",
      "out-current-step",
      "out-result-id",
      "out-result-status",
      "out-persisted",
      "out-problem",
      "out-revision-conflict",
      "intent-form",
    ]);
    expect(() => {
      runInSandbox(script, { document, window: {} });
    }).not.toThrow();
  });

  it("wires the intent-kind change listener, including the Task 19 consequential-action toggle", async () => {
    const html = await renderPage("/admin/operator");
    const script = extractEmbeddedScript(html);
    const { document } = makeFakeDocument([
      "admin-key",
      "project-id",
      "intent-kind",
      "revision-field",
      "expected-revision",
      "evidence-field",
      "evidence-event-json",
      "run-intent",
      "resume-button",
      "status",
      "out-intent-id",
      "out-workflow-id",
      "out-workflow-state",
      "out-attempt",
      "out-current-step",
      "out-result-id",
      "out-result-status",
      "out-persisted",
      "out-problem",
      "out-revision-conflict",
      "intent-form",
    ]);
    runInSandbox(script, { document, window: {} });

    const intentKind = document.getElementById("intent-kind");
    intentKind.value = "EVIDENCE_APPLY_SHADOW";
    intentKind.trigger("change");

    expect(document.getElementById("revision-field").hidden).toBe(false);
    expect(document.getElementById("evidence-field").hidden).toBe(false);
    expect(
      document
        .getElementById("run-intent")
        .classList.contains("btn-consequential"),
    ).toBe(true);

    intentKind.value = "FORECAST_QUERY";
    intentKind.trigger("change");
    expect(
      document
        .getElementById("run-intent")
        .classList.contains("btn-consequential"),
    ).toBe(false);
  });
});

describe("real wrangler bundle: /admin/field embedded script", () => {
  const STATIC_FIELD_IDS = [
    "admin-key",
    "new-project-id",
    "add-project",
    "refresh-all",
    "projects-container",
    "voice-push-to-talk",
    "voice-status",
    "voice-section",
    "ph-portfolio-rows",
    "ph-priorities-section",
    "ph-priority-count",
    "ph-priority-word",
    "ph-priority-caption",
    "ph-priorities-list",
    "ph-movement-band",
    "ph-intelligence-text",
  ];

  it("executes in an isolated context with no ReferenceError, including the Task 18 voice client and the Task 19 voice-state observer", async () => {
    const html = await renderPage("/admin/field");
    const script = extractEmbeddedScript(html);
    const { document } = makeFakeDocument(STATIC_FIELD_IDS);
    expect(() => {
      runInSandbox(script, { document, window: {} });
    }).not.toThrow();
  });

  it("initializes the voice transport: push-to-talk disabled and status set when SpeechRecognition is unavailable, data-voice-state reflects it", async () => {
    const html = await renderPage("/admin/field");
    const script = extractEmbeddedScript(html);
    const { document } = makeFakeDocument(STATIC_FIELD_IDS);
    runInSandbox(script, { document, window: {} });

    const button = document.getElementById("voice-push-to-talk");
    const status = document.getElementById("voice-status");
    const section = document.getElementById("voice-section");
    expect(button.disabled).toBe(true);
    expect(status.textContent).toContain("unavailable");
    // wireVoicePresentationState still ran and classified the initial (unsupported-path) text.
    expect(section.attributes["data-voice-state"]).toBeDefined();
  });

  it("wires project management controls (add project) and the evidence-kind consequential-action toggle", async () => {
    const html = await renderPage("/admin/field");
    const script = extractEmbeddedScript(html);
    const { document } = makeFakeDocument(STATIC_FIELD_IDS);
    runInSandbox(script, { document, window: {} });

    const newProjectId = document.getElementById("new-project-id");
    newProjectId.value = "carver-001";
    document.getElementById("add-project").trigger("click");

    const evidenceKind = document.getElementById("fp-0-evidence-kind");
    expect(evidenceKind).toBeDefined();
    evidenceKind.value = "EVIDENCE_APPLY_SHADOW";
    evidenceKind.trigger("change");
    expect(
      document
        .getElementById("fp-0-evidence-run")
        .classList.contains("btn-consequential"),
    ).toBe(true);
  });
});
