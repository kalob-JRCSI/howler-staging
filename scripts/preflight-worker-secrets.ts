// Pre-deploy correction (Step 2 -- confirmation secret preflight): the repaired conversation path
// (src/worker/index.ts's confirmation signing/verification) requires
// HOWLER_CONFIRMATION_SIGNING_SECRET to be configured on the deployed Worker; without it, every
// confirmation attempt fails closed with a 500 (by design -- see src/worker/env.d.ts's own comment
// on that binding). We must never deploy a candidate whose conversation route would fail closed
// this way. This script verifies, BY NAME ONLY, that the required secret bindings already exist on
// the target Worker before deployment proceeds -- it never reads, prints, or otherwise exposes any
// secret's value (wrangler's own `secret list` command never returns values either, only
// {name, type}), and it never creates, sets, or rotates a secret itself. A missing required
// binding fails this script (non-zero exit) rather than silently deploying anyway.
//
// Uses the exact same Cloudflare credentials .github/workflows/deploy.yml already has as GitHub
// encrypted secrets (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID) -- no new secret is introduced,
// and this script is not itself capable of writing anything to the Cloudflare account (it shells
// out only to `wrangler secret list`, a read-only command).
//
// Usage (from repo root, with the same env deploy.yml's wrangler-action already has):
//   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> \
//     node scripts/preflight-worker-secrets.ts [--worker-name jarvis-voice-staging]

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REQUIRED_SECRET_BINDINGS = [
  "HOWLER_CONFIRMATION_SIGNING_SECRET",
  "HOWLER_ADMIN_KEY",
];

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`PREFLIGHT FAILED: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

function parseWorkerName(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--worker-name" && argv[i + 1]) {
      return argv[i + 1] as string;
    }
  }
  return "jarvis-voice-staging";
}

interface SecretListEntry {
  name?: unknown;
  type?: unknown;
}

/**
 * Lists a Worker's secret binding names via `wrangler secret list` -- the same command
 * `npx wrangler secret list` documents as returning `[{name, type}, ...]` and nothing else; secret
 * *values* are never retrievable through this command, by Cloudflare's own design, so there is no
 * value for this script to ever accidentally expose.
 */
function listSecretBindingNames(workerName: string): string[] {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    fail(
      "CLOUDFLARE_API_TOKEN is not set -- refusing to run without credentials to verify the target Worker (fail closed).",
    );
  }
  let raw: string;
  try {
    raw = execFileSync(
      "npx",
      ["wrangler", "secret", "list", "--name", workerName, "--format", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const rawStderr =
      error && typeof error === "object" && "stderr" in error
        ? (error as { stderr?: unknown }).stderr
        : undefined;
    const stderr = typeof rawStderr === "string" ? rawStderr : "";
    fail(
      `could not list secret bindings for Worker "${workerName}" (${
        error instanceof Error ? error.message : String(error)
      })${stderr ? `\n${stderr}` : ""}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(
      `wrangler secret list did not return parseable JSON for "${workerName}"`,
    );
  }
  if (!Array.isArray(parsed)) {
    fail(
      `wrangler secret list returned an unexpected shape for "${workerName}" (expected an array)`,
    );
  }
  return (parsed as SecretListEntry[])
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string");
}

export function verifyRequiredSecretBindings(workerName: string): void {
  const existingNames = new Set(listSecretBindingNames(workerName));
  const missing = REQUIRED_SECRET_BINDINGS.filter(
    (name) => !existingNames.has(name),
  );
  if (missing.length > 0) {
    fail(
      `Worker "${workerName}" is missing required secret binding(s): ${missing.join(", ")}. ` +
        "This script never creates or rotates secrets automatically -- configure the missing " +
        `binding(s) manually (e.g. \`npx wrangler secret put <NAME> --name ${workerName}\`, ` +
        "entering the value at the interactive prompt, never via a committed file or CI log) " +
        "before deploying.",
    );
  }
  log(
    `Required secret bindings present on "${workerName}": ${REQUIRED_SECRET_BINDINGS.join(", ")}.`,
  );
}

function main(): void {
  const workerName = parseWorkerName(process.argv.slice(2));
  verifyRequiredSecretBindings(workerName);
}

// Only run when executed directly (`node scripts/preflight-worker-secrets.ts`), never on import --
// so scripts/test/preflight-worker-secrets.test.ts can import verifyRequiredSecretBindings for
// real assertions without triggering a live `wrangler secret list` call as a side effect of import.
const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  try {
    main();
  } catch {
    // fail() already wrote a clear message to stderr and set process.exitCode -- avoid a
    // second, redundant Node uncaught-exception stack trace on top of it.
  }
}
