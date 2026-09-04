// Pre-deploy correction (Step 2 -- confirmation secret preflight). Plain-Node unit tests (see
// ../vitest.config.ts) driving verifyRequiredSecretBindings() against a mocked
// node:child_process.execFileSync -- proves this script only ever reads binding names (never
// values, never a create/rotate command), and fails closed when a required binding is missing or
// credentials are absent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRequiredSecretBindings } from "../preflight-worker-secrets.ts";

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

function bothPresentJson(): string {
  return JSON.stringify([
    { name: "HOWLER_CONFIRMATION_SIGNING_SECRET", type: "secret_text" },
    { name: "HOWLER_ADMIN_KEY", type: "secret_text" },
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
  it("passes when both required bindings are present", () => {
    execFileSyncMock.mockReturnValue(bothPresentJson());
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).not.toThrow();
  });

  it("calls wrangler with a read-only 'secret list' command, never a set/put/bulk command", () => {
    execFileSyncMock.mockReturnValue(bothPresentJson());
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

  it("fails when HOWLER_CONFIRMATION_SIGNING_SECRET is missing, naming it, without creating/rotating anything", () => {
    execFileSyncMock.mockReturnValue(
      JSON.stringify([{ name: "HOWLER_ADMIN_KEY", type: "secret_text" }]),
    );
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).toThrow(/HOWLER_CONFIRMATION_SIGNING_SECRET/);
    // Exactly the one read-only list call -- no follow-up "secret put" attempt.
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("fails when HOWLER_ADMIN_KEY is missing, naming it", () => {
    execFileSyncMock.mockReturnValue(
      JSON.stringify([
        { name: "HOWLER_CONFIRMATION_SIGNING_SECRET", type: "secret_text" },
      ]),
    );
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).toThrow(/HOWLER_ADMIN_KEY/);
  });

  it("fails closed without ever calling wrangler when CLOUDFLARE_API_TOKEN is not set", () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).toThrow(/CLOUDFLARE_API_TOKEN/);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("fails clearly (never crashes uncaught) when wrangler itself fails", () => {
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("wrangler exited with code 1"), {
        stderr: "Authentication error",
      });
    });
    expect(() => {
      verifyRequiredSecretBindings("jarvis-voice-staging");
    }).toThrow(/could not list secret bindings/);
  });

  it("never includes a secret value anywhere in a failure message (there is none to leak, but the message shape is asserted)", () => {
    execFileSyncMock.mockReturnValue(JSON.stringify([]));
    try {
      verifyRequiredSecretBindings("jarvis-voice-staging");
      throw new Error("expected verifyRequiredSecretBindings to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/"text":/);
      expect(message).toContain("HOWLER_CONFIRMATION_SIGNING_SECRET");
      expect(message).toContain("HOWLER_ADMIN_KEY");
    }
  });
});
