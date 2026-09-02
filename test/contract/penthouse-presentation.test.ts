/// <reference types="vite/client" />

// Task 19 "Howler Penthouse" presentation contract: proves the visual system is genuinely
// presentation-only. Two concerns:
//   1. The voice-state indicator (wireVoicePresentationState) correctly classifies the *existing*
//      #voice-status text into a visual state and never touches anything else -- it is a read-only
//      observer of DOM text voiceBrowserClient already produces, not a second voice implementation.
//   2. The three rendered pages stay free of the things the design brief explicitly forbids
//      (external fonts/icon CDNs/images/scripts) and /admin remains the frozen v0.9.4 page,
//      completely untouched by this task.

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  adminHtml,
  fieldDashboardHtml,
  operatorPanelHtml,
  wireVoicePresentationState,
} from "../../src/worker/admin";

function plainRequest(method: string, path: string): Request {
  return new Request(`https://example.test${path}`, { method });
}

interface FakeVoiceElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  attributes: Record<string, string>;
}

function fakeVoiceElement(initialText: string): FakeVoiceElement {
  const attributes: Record<string, string> = {};
  return {
    textContent: initialText,
    attributes,
    setAttribute(name, value) {
      attributes[name] = value;
    },
  };
}

describe("wireVoicePresentationState: read-only classification of existing voice status text", () => {
  it.each([
    ["IDLE", "READY"],
    ["LISTENING", "LISTENING"],
    ["REQUESTING_PERMISSION", "LISTENING"],
    ["RESOLVING: forecast carver-001", "PROCESSING"],
    ["SUBMITTING", "PROCESSING"],
    [
      "CONFIRMATION_REQUIRED: Apply evidence to carver-001 in shadow mode? Say yes or no.",
      "CONFIRMATION",
    ],
    ["RESULT", "COMPLETED"],
    ["ERROR: recognition could not start", "FAILED"],
    ["CLARIFICATION: Which project do you mean?", "FAILED"],
    ["CANCELLED", "FAILED"],
  ])("classifies %s as data-voice-state=%s", (statusText, expectedState) => {
    const status = fakeVoiceElement(statusText);
    const section = fakeVoiceElement("");
    const elements = new Map<string, FakeVoiceElement>([
      ["voice-status", status],
      ["voice-section", section],
    ]);
    wireVoicePresentationState({
      getElementById: (id) => elements.get(id) ?? null,
    });
    expect(section.attributes["data-voice-state"]).toBe(expectedState);
  });

  it("never writes to #voice-status itself", () => {
    const status = fakeVoiceElement("LISTENING");
    const section = fakeVoiceElement("");
    const elements = new Map<string, FakeVoiceElement>([
      ["voice-status", status],
      ["voice-section", section],
    ]);
    wireVoicePresentationState({
      getElementById: (id) => elements.get(id) ?? null,
    });
    expect(status.textContent).toBe("LISTENING");
  });

  it("is a safe no-op when #voice-status or #voice-section is missing", () => {
    expect(() => {
      wireVoicePresentationState({ getElementById: () => null });
    }).not.toThrow();
  });
});

const FORBIDDEN_EXTERNAL_PATTERNS = [
  /<link[^>]+fonts\.googleapis\.com/i,
  /<link[^>]+fonts\.gstatic\.com/i,
  /cdnjs\.cloudflare\.com/i,
  /cdn\.jsdelivr\.net/i,
  /fontawesome/i,
  /<img\b/i,
  /<script[^>]+src=/i,
  /background-image\s*:\s*url\(/i,
];

describe("Task 19 visual system: no external dependencies on any rendered page", () => {
  it.each([
    ["adminHtml (frozen, untouched by this task)", adminHtml("test")],
    ["operatorPanelHtml", operatorPanelHtml()],
    ["fieldDashboardHtml", fieldDashboardHtml()],
  ])(
    "%s has no external fonts, icon CDNs, images, or external scripts",
    (_label, html) => {
      for (const pattern of FORBIDDEN_EXTERNAL_PATTERNS) {
        expect(html).not.toMatch(pattern);
      }
    },
  );
});

describe("Task 19 visual system: shared design tokens present on the two restyled surfaces", () => {
  it.each([
    ["operatorPanelHtml", operatorPanelHtml()],
    ["fieldDashboardHtml", fieldDashboardHtml()],
  ])(
    "%s declares the Howler Penthouse token custom properties",
    (_label, html) => {
      expect(html).toMatch(/--hw-bg:/);
      expect(html).toMatch(/--hw-surface:/);
      expect(html).toMatch(/--hw-ink:/);
      expect(html).toMatch(/--hw-accent:/);
    },
  );
});

describe("Task 19 scope boundary: /admin stays the frozen legacy page", () => {
  it("GET /admin is untouched by the Penthouse restyle (still uses its own literal hex palette, not the shared tokens)", async () => {
    const response = await worker.fetch(plainRequest("GET", "/admin"), env);
    const html = await response.text();
    expect(html).not.toMatch(/--hw-bg:/);
    expect(html).toContain("#111318");
  });
});
