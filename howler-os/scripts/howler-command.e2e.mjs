import { chromium } from "playwright";

const url = "http://127.0.0.1:8080/";

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
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
    body: JSON.stringify({ ok: true, rewrite: posted?.text, projectId: "mcmillan-v1" }),
  });
});
const spoken = [];
await page.addInitScript(() => {
  const Original = window.SpeechSynthesisUtterance;
  window.__howlerSpoken = [];
  const synth = window.speechSynthesis;
  const speak = synth.speak.bind(synth);
  synth.speak = (utter) => {
    window.__howlerSpoken.push(String(utter.text || ""));
    return speak(utter);
  };
  void Original;
});

await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
await page.getByPlaceholder("Hey Howler, McMillan porch ceiling going in this week").fill("Hey Howler, McMillan exterior is closing out");
await page.getByRole("button", { name: "Tell Howler" }).click();

await page.getByText(/Confirm/i).first().waitFor({ timeout: 10000 });
const pad = await page.locator(".howler-pad").innerText();
const preview = await page.locator("#howler-preview").innerText();
const uttered = await page.evaluate(() => window.__howlerSpoken);

if (!/McMillan/i.test(pad + preview)) {
  throw new Error(`Readback missing McMillan.\nPAD:${pad}\nPREVIEW:${preview}`);
}
if (/Budget unchanged|change order/i.test(uttered.join(" "))) {
  throw new Error(`Lectured money on a progress update. ${JSON.stringify(uttered)}`);
}
if (!uttered.some((line) => /confirm/i.test(line))) {
  throw new Error(`Did not ask confirm. ${JSON.stringify(uttered)}`);
}

await page.getByRole("button", { name: "Confirm" }).click();
await page.getByText("Next call to action").first().waitFor({ timeout: 10000 });
const overview = await page.locator("body").innerText();
if (!/McMillan/i.test(overview)) throw new Error(`Did not open McMillan overview.\n${overview.slice(0, 400)}`);
if (!/closing out|complete|Next call/i.test(overview)) {
  throw new Error(`Overview missing the job picture.\n${overview.slice(0, 600)}`);
}

await page.screenshot({ path: "/workspace/screenshots/howler-command-loop.png", fullPage: true });
await browser.close();
console.log("PAD", pad.slice(0, 400));
console.log("PREVIEW", preview.slice(0, 400));
console.log("SPOKEN", uttered);
console.log("PASS howler command loop");
