// Pre-deploy secret preflight. Plain-Node unit tests (see ../vitest.config.ts) drive
// verifyRequiredSecretBindings() against a mocked node:child_process.execFileSync. They prove the
// script only reads binding names (never values, never a create/rotate command) and fails closed
// when any secret required by the staging Worker is missing or credentials are absent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRequiredSecretBindings } from "../preflight-worker-secrets.ts";

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

const REQUIRED_SECRET_NAMES = [
  "HOWLER_CONFIRMATION_SIGNING_SECRET",
  "HOWLER_ADMIN_KEY",
  "HOWLER_PILOT_USERNAME",
  "HOWLER_PILOT_PASSWORD_HASH",
  "HOWLER_SESSION_SIGNING_SECRET",
] as const;

function allPresentJson(): string {
  return JSON.stringify([
    ...REQUIRED_SECRET_NAMES.map((name) => ({ name, type: "secret_text" })),
    { name: "HOWLER_MODE", type: "plain_text" },
  ]);
}

beforeEach(() => {
  execFileSyncMock.mockReset();
  process.env.CLOUDFLARE_API_TOKEN = "test-cf-token";
});

afterEach(() => {
  delete process.env.CLOUDFLARE_API_TOKEN;
});

describe("verifyRequiredSecretBindings: only ever reads binding names, never values", () => {
  it("passes when every required staging secret binding is present", () => {
    execFileSyncMock.mockReturnValue(allPresentJson());
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).not.toThrow();
  });

  it("calls wrangler with a read-only 'secret list' command, never a set/put/bulk command", () => {
    execFileSyncMock.mockReturnValue(allPresentJson());
    verifyRequiredSecretBindings("jarvis-voice-staging");
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const [command, args] = execFileSyncMock.mock.calls[0] as [
      string,
      string[],
    ];
    expect(command).toBe("npx");
    expect(args).toEqual([
      "wrangler",
      "secret",
      "list",
      "--name",
      "jarvis-voice-staging",
      "--format",
      "json",
    ]);
  });

  it.each(REQUIRED_SECRET_NAMES)(
    "fails closed when required secret %s is missing",
    (missingName) => {
      execFileSyncMock.mockReturnValue(
        JSON.stringify(
          REQUIRED_SECRET_NAMES.filter((name) => name !== missingName).map(
            (name) => ({ name, type: "secret_text" }),
          ),
        ),
      );
      expect(() => {
        verifyRequiredSecretBindings("jarvis-voice-staging");
      }).toThrow(new RegExp(missingName));
      expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    },
  );

  it("fails closed without ever calling wrangler when CLOUDFLARE_API_TOKEN is not set", () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).toThrow(/CLOUDFLARE_API_TOKEN/);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("fails clearly when wrangler itself fails", () => {
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("wrangler exited with code 1"), {
        stderr: "Authentication error",
      });
    });
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).toThrow(/could not list secret bindings/);
  });

  it("never includes a secret value anywhere in a failure message", () => {
    execFileSyncMock.mockReturnValue(JSON.stringify([]));
    try {
      verifyRequiredSecretBindings("jarvis-voice-staging");
      throw new Error("expected verifyRequiredSecretBindings to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/"text":/);
      for (const name of REQUIRED_SECRET_NAMES) {
        expect(message).toContain(name);
      }
    }
  });
});
