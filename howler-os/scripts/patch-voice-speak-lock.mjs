/**
 * Apply speak-lock patches to howler-os/src/lib/howler/voice.ts
 * Run from repo root: node howler-os/scripts/patch-voice-speak-lock.mjs
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2] || path.join(process.cwd(), "howler-os/src/lib/howler/voice.ts");
let s = fs.readFileSync(file, "utf8");
const markers = [];

if (!s.includes("isBareJobEcho")) {
  const insert = `
/** Single job-name echo from TTS — not a real command. */
export function isBareJobEcho(text: string): boolean {
  const said = text.trim().replace(/[.!?]+$/g, "").trim();
  return /^(mcmillan|macmillan|deboard|de board|debord|ciurlizza|cher liza|carver|julian|pratt|stewart|swiderski|swidersky|craven|caveson|andover|garage)$/i.test(
    said,
  );
}

function synthesisBusy(): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  try {
    return Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
  } catch {
    return false;
  }
}
`;
  s = s.replace(
    "export function isJobNameDump(text: string): boolean {",
    insert + "export function isJobNameDump(text: string): boolean {",
  );
  markers.push("bare+busy");
}

if (!s.includes('reason: "speaking"')) {
  s = s.replace(
    'if (!said) return { kind: "ignore", reason: "empty" };\n  if (isSelfTalk(said) || isJobNameDump(said)) return { kind: "ignore", reason: "echo" };',
    `if (!said) return { kind: "ignore", reason: "empty" };
  if (isEarMuted() || synthesisBusy()) {
    if (isHardSleep(said)) return { kind: "sleep" };
    return { kind: "ignore", reason: "speaking" };
  }
  if (isSelfTalk(said) || isJobNameDump(said) || isBareJobEcho(said)) return { kind: "ignore", reason: "echo" };`,
  );
  markers.push("decide-speak-lock");
}

if (!s.includes("speakGeneration")) {
  s = s.replace("let muted = false;", "let muted = false;\nlet speakGeneration = 0;");
  s = s.replace(
    "export async function speakHowler(text: string, opts: { mute?: boolean; cloud?: boolean } = {}): Promise<void> {\n  if (typeof window === \"undefined\") return;\n  const clean = text.replace(/\\s+/g, \" \").trim().slice(0, 600);\n  if (!clean) return;\n  const holdMute = opts.mute !== false;\n  if (holdMute) {\n    muted = true;\n  }\n  const done = () => {\n    muted = false;\n  };",
    `export async function speakHowler(text: string, opts: { mute?: boolean; cloud?: boolean; force?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return;
  const clean = text.replace(/\\s+/g, " ").trim().slice(0, 600);
  if (!clean) return;
  if (!opts.force && (synthesisBusy() || (muted && speakGeneration > 0))) {
    return;
  }
  const holdMute = opts.mute !== false;
  const gen = ++speakGeneration;
  if (holdMute) muted = true;
  const holdMs = Math.min(2500, 600 + clean.length * 12);
  const done = () => {
    if (gen !== speakGeneration) return;
    window.setTimeout(() => {
      if (gen === speakGeneration) muted = false;
    }, holdMs);
  };`,
  );
  s = s.replace(
    "unlockSpeech();\n  window.speechSynthesis.cancel();",
    `unlockSpeech();
  if (opts.force || !synthesisBusy()) {
    try { window.speechSynthesis.cancel(); } catch { /* */ }
  }`,
  );
  s = s.replace(
    "window.setTimeout(finish, Math.min(8000, 700 + clean.length * 55));",
    "window.setTimeout(finish, Math.min(20000, 1200 + clean.length * 70));",
  );
  markers.push("speakHowler-lock");
}

fs.writeFileSync(file, s);
console.log(JSON.stringify({ ok: true, file, markers, len: s.length }, null, 2));
