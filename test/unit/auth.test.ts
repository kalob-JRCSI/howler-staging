import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/worker/hash";
import {
  authenticatePilotUser,
  clearSessionCookie,
  createSessionCookie,
  readSession,
  type AuthenticatedUser,
} from "../../src/worker/auth";

const SESSION_SECRET = "unit-test-session-secret-should-never-be-used-in-prod";
const NOW_MS = Date.UTC(2026, 8, 7, 19, 45, 0);
const USER: AuthenticatedUser = {
  id: "pilot-kalob",
  displayName: "Kalob",
  role: "OWNER_PM",
};

function requestWithCookie(setCookie: string): Request {
  const cookie = setCookie.split(";", 1)[0] ?? "";
  return new Request("https://example.test/", {
    headers: { cookie },
  });
}

describe("pilot authentication", () => {
  it("accepts the configured pilot username and password hash", async () => {
    const password = "correct horse battery staple pilot";
    const result = await authenticatePilotUser(
      "kalob",
      password,
      {
        username: "kalob",
        passwordHash: await sha256Hex(password),
        user: USER,
      },
    );

    expect(result).toEqual(USER);
  });

  it("rejects an incorrect username or password", async () => {
    const password = "correct horse battery staple pilot";
    const config = {
      username: "kalob",
      passwordHash: await sha256Hex(password),
      user: USER,
    };

    await expect(
      authenticatePilotUser("someone-else", password, config),
    ).resolves.toBeNull();
    await expect(
      authenticatePilotUser("kalob", "wrong-password", config),
    ).resolves.toBeNull();
  });
});

describe("signed product session", () => {
  it("round-trips a valid signed user session", async () => {
    const setCookie = await createSessionCookie(USER, SESSION_SECRET, NOW_MS);
    const session = await readSession(
      requestWithCookie(setCookie),
      SESSION_SECRET,
      NOW_MS + 60_000,
    );

    expect(session).toEqual(USER);
  });

  it("rejects a tampered session", async () => {
    const setCookie = await createSessionCookie(USER, SESSION_SECRET, NOW_MS);
    const cookie = setCookie.split(";", 1)[0] ?? "";
    const [name, value = ""] = cookie.split("=", 2);
    const chars = value.split("");
    chars[5] = chars[5] === "a" ? "b" : "a";
    const tampered = `${name}=${chars.join("")}`;
    const request = new Request("https://example.test/", {
      headers: { cookie: tampered },
    });

    await expect(
      readSession(request, SESSION_SECRET, NOW_MS + 60_000),
    ).resolves.toBeNull();
  });

  it("rejects an expired session", async () => {
    const setCookie = await createSessionCookie(USER, SESSION_SECRET, NOW_MS);

    await expect(
      readSession(
        requestWithCookie(setCookie),
        SESSION_SECRET,
        NOW_MS + 9 * 60 * 60 * 1000,
      ),
    ).resolves.toBeNull();
  });

  it("sets secure browser-only cookie flags", async () => {
    const setCookie = await createSessionCookie(USER, SESSION_SECRET, NOW_MS);

    expect(setCookie).toContain("howler_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toMatch(/Max-Age=\d+/);
  });

  it("clears the product session cookie on logout", () => {
    const setCookie = clearSessionCookie();

    expect(setCookie).toContain("howler_session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
  });
});
