import { describe, expect, it } from "vitest";
import { fieldDashboardHtml } from "../../src/worker/admin";

describe("Task 18 field voice contract", () => {
  it("renders an accessible push-to-talk control and live status region", () => {
    const html = fieldDashboardHtml();
    expect(html).toContain('id="voice-push-to-talk"');
    expect(html).toContain('aria-label="Push to talk"');
    expect(html).toContain('id="voice-status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("embeds the shared voice transport and uses no legacy mutation endpoint", () => {
    const html = fieldDashboardHtml();
    expect(html).toContain("SpeechRecognition");
    expect(html).not.toContain("/v1/projects/");
    expect(html).not.toContain("events/apply-shadow");
    expect(html).not.toContain('sessionStorage.setItem("voice');
  });
});
