import { describe, expect, it } from "vitest";
import { HttpError, json, readJson, requireAdmin } from "../../src/worker/http";

describe("json", () => {
  it("defaults to status 200 with JSON content-type and no-store caching", async () => {
    const response = json({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("accepts a custom status code", () => {
    const response = json({ error: "not found" }, 404);
    expect(response.status).toBe(404);
  });

  it("merges in additional headers without overriding content-type/cache-control", () => {
    const response = json({ ok: true }, 200, { "x-request-id": "abc123" });
    expect(response.headers.get("x-request-id")).toBe("abc123");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });

  it("pretty-prints the JSON body with two-space indentation", async () => {
    const response = json({ a: 1 });
    const text = await response.text();
    expect(text).toBe('{\n  "a": 1\n}');
  });
});

describe("readJson", () => {
  function jsonRequest(
    body: string,
    contentType = "application/json",
  ): Request {
    return new Request("https://example.test/", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });
  }

  it("parses a valid application/json body", async () => {
    const result = await readJson(jsonRequest('{"a":1}'));
    expect(result).toEqual({ a: 1 });
  });

  it("accepts a content-type with a charset suffix", async () => {
    const result = await readJson(
      jsonRequest('{"a":1}', "application/json; charset=utf-8"),
    );
    expect(result).toEqual({ a: 1 });
  });

  it("rejects a non-JSON content-type with 415", async () => {
    await expect(
      readJson(jsonRequest("plain text", "text/plain")),
    ).rejects.toMatchObject({
      status: 415,
      message: "Content-Type must be application/json",
    });
  });

  it("rejects an empty body with 400", async () => {
    await expect(readJson(jsonRequest(""))).rejects.toMatchObject({
      status: 400,
      message: "JSON body is required",
    });
  });

  it("rejects a whitespace-only body with 400", async () => {
    await expect(readJson(jsonRequest("   \n  "))).rejects.toMatchObject({
      status: 400,
      message: "JSON body is required",
    });
  });

  it("rejects malformed JSON with 400", async () => {
    await expect(readJson(jsonRequest("{not json"))).rejects.toMatchObject({
      status: 400,
      message: "Invalid JSON body",
    });
  });

  it("rejects a body whose declared content-length exceeds the 256KB bound with 413", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(256 * 1024 + 1),
      },
      body: "{}",
    });
    await expect(readJson(request)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects a streamed body that exceeds the 256KB bound even without a declared content-length", async () => {
    const oversized = JSON.stringify({ padding: "x".repeat(256 * 1024 + 1) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversized));
        controller.close();
      },
    });
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      // @ts-expect-error -- required by undici/workers when streaming a body without a known length
      duplex: "half",
    });
    await expect(readJson(request)).rejects.toMatchObject({ status: 413 });
  });
});

describe("HttpError", () => {
  it("carries status, message, and optional details", () => {
    const error = new HttpError(409, "conflict", { code: "X" });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("HttpError");
    expect(error.status).toBe(409);
    expect(error.message).toBe("conflict");
    expect(error.details).toEqual({ code: "X" });
  });
});

describe("requireAdmin", () => {
  function withAuth(header?: string): Request {
    return new Request("https://example.test/", {
      headers: header ? { authorization: header } : {},
    });
  }

  it("throws 500 when no admin key is configured", async () => {
    await expect(
      requireAdmin(withAuth("Bearer x"), undefined),
    ).rejects.toMatchObject({
      status: 500,
      message: "HOWLER_ADMIN_KEY is not configured",
    });
  });

  it("throws 401 when no authorization header is present", async () => {
    await expect(requireAdmin(withAuth(), "secret")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
  });

  it("throws 401 when the header is not a Bearer token", async () => {
    await expect(
      requireAdmin(withAuth("Basic abc"), "secret"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 when the bearer token does not match", async () => {
    await expect(
      requireAdmin(withAuth("Bearer wrong"), "secret"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("resolves without throwing when the bearer token matches exactly", async () => {
    await expect(
      requireAdmin(withAuth("Bearer secret"), "secret"),
    ).resolves.toBeUndefined();
  });
});
