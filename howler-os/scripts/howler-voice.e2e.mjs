import { chromium } from "playwright";

const url = "http://127.0.0.1:8080/";

const browser = await chromium.launch({
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  permissions: ["microphone"],
});
const page = await context.newPage();

await page.route("**/api/howler-intent", async (route) => {
  const posted = route.request().postDataJSON();
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      rewrite: posted?.text || "McMillan exterior is closing out",
      projectId: "mcmillan-v1",
    }),
  });
});

await page.addInitScript(() => {
  window.__howlerSpoken = [];
  window.__howlerRec = null;
  const synth = window.speechSynthesis;
  const speak = synth.speak.bind(synth);
  synth.speak = (utter) => {
    window.__howlerSpoken.push(String(utter.text || ""));
    return speak(utter);
  };

  class FakeRec {
    continuous = true;
    interimResults = true;
    lang = "en-US";
    onstart = null;
    onresult = null;
    onerror = null;
    onend = null;
    start() {
      window.__howlerRec = this;
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
});

function fire(text) {
  return page.evaluate((transcript) => {
    const rec = window.__howlerRec;
    rec?.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript }, length: 1 }],
    });
  }, text);
}

await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
const allow = page.getByRole("button", { name: "Allow microphone" });
if (await allow.count()) await allow.click();
await page.locator("button.howler-voice").waitFor({ timeout: 10000 });
await page.waitForTimeout(1300);

await fire("draft a change order on every job and shout the scopes");
await page.waitForTimeout(1500);
const afterNoise = await page.locator(".howler-pad").innerText().catch(() => "");
if (/Confirm and I'll|Say confirm/i.test(afterNoise)) {
  throw new Error(`Interpreted speech without Hey Howler.\n${afterNoise}`);
}

await fire("Hey Howler, McMillan exterior is closing out");
await page.getByText(/Confirm/i).first().waitFor({ timeout: 15000 });

const pad = await page.locator(".howler-pad").innerText();
const uttered = await page.evaluate(() => window.__howlerSpoken);
if (!/McMillan/i.test(pad)) throw new Error(`No McMillan readback. PAD:${pad}`);
if (uttered.some((line) => /budget unchanged|change order/i.test(line))) {
  throw new Error(`Lectured money. ${JSON.stringify(uttered)}`);
}

await page.getByRole("button", { name: "Confirm" }).click();
await page.getByText("Next call to action").first().waitFor({ timeout: 10000 });

await page.screenshot({ path: "/workspace/screenshots/howler-voice-loop.png", fullPage: true });
await browser.close();
console.log("PAD", pad.slice(0, 400));
console.log("SPOKEN", uttered);
console.log("PASS Siri wake: Hey Howler, readback, confirm, card");
