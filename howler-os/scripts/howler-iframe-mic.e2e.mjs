import { chromium } from "playwright";
import http from "node:http";

const host = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><iframe id="app" src="http://127.0.0.1:8080/" style="width:100%;height:100vh;border:0"></iframe>`,
  );
});
await new Promise((resolve) => host.listen(8099, "127.0.0.1", resolve));

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const frameLogs = [];
page.on("console", (msg) => frameLogs.push(msg.text()));

await page.goto("http://127.0.0.1:8099/", { waitUntil: "domcontentloaded" });
const frame = page.frameLocator("#app");
await frame.getByRole("button", { name: "Allow microphone" }).waitFor({ timeout: 25000 });
await frame.getByRole("button", { name: "Allow microphone" }).click();
await page.waitForTimeout(2500);

const pad = await frame.locator(".howler-pad").innerText().catch(() => "NO PAD");
const spoken = await page
  .frames()
  .find((f) => f.url().includes(":8080"))
  ?.evaluate(() => window.__howlerSpoken ?? "no-hook");

const probe = await page
  .frames()
  .find((f) => f.url().includes(":8080"))
  ?.evaluate(async () => {
    let gum = "n/a";
    try {
      gum = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }).then(
          () => "ok",
          (e) => `fail:${e.name}`,
        ),
        new Promise((r) => setTimeout(() => r("hang"), 1200)),
      ]);
    } catch (e) {
      gum = `throw:${e.name}`;
    }
    const policy =
      document.permissionsPolicy?.allowsFeature?.("microphone") ??
      document.featurePolicy?.allowsFeature?.("microphone") ??
      "unknown";
    return {
      gum,
      policy,
      rec: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
      framed: window.self !== window.top,
      pad: document.querySelector(".howler-pad")?.innerText ?? "none",
    };
  });

console.log("PROBE", probe);
console.log("PAD", pad);
console.log("SPOKEN", spoken);
await page.screenshot({ path: "/workspace/screenshots/howler-iframe-mic.png", fullPage: true });
await browser.close();
host.close();
