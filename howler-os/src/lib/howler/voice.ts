import { HOWLER_CLOUD } from "./cloud";

export type VoiceState =
  | "READY"
  | "ARMED"
  | "AWAKE"
  | "LISTENING"
  | "UNSUPPORTED"
  | "DENIED"
  | "FAILED";

type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: {
    resultIndex?: number;
    results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function SpeechCtor(): (new () => Recog) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupported(): boolean {
  return SpeechCtor() != null;
}

/** Hey Howler / Howler / Howler we’re updating — only at the start, like Siri. */
const WAKE_PREFIX =
  /(?:(?:hey|hi|okay|ok|yo)[,.\s]+)?\bhowler\b(?:[,.\s]+(?:we(?:'re| are) (?:gonna |going to )?updat(?:e|ing)|we have an update|i(?:'ve| have)(?: got)? an update|take this(?: update)?|field update|\bupdate\b))?[.!,]*/i;

export function matchWake(text: string): { woke: boolean; rest: string } {
  const t = text.trim();
  if (!t) return { woke: false, rest: "" };
  const start = new RegExp(`^${WAKE_PREFIX.source}`, "i").exec(t);
  if (!start) return { woke: false, rest: t };
  return { woke: true, rest: t.slice(start[0].length).trim() };
}

export const HOWLER_ACKS = ["Ready.", "On it.", "Yes, boss."] as const;

export function pickHowlerAck(): (typeof HOWLER_ACKS)[number] {
  return HOWLER_ACKS[Math.floor(Math.random() * HOWLER_ACKS.length)] ?? HOWLER_ACKS[0];
}

export function isHardSleep(text: string): boolean {
  return /^(go to sleep|goodbye|good ?night|disarm)[.!?]?$/i.test(text.trim());
}

export function isUtteranceEnd(text: string): boolean {
  return /^(end(?:\s+(?:the\s+)?(?:update|it))?|end of (?:the )?update|that'?s the update|that'?s it|that'?s all|over|stop|stop listening)[.!?]?$/i.test(
    text.trim(),
  );
}

export function isSleepCommand(text: string): boolean {
  if (isHardSleep(text) || isUtteranceEnd(text)) return true;
  return /^(i'?m done|we'?re done|go to sleep|good ?night)[.!?]?$/i.test(text.trim());
}

export function isArmCommand(text: string): boolean {
  return /^(listen|arm(?: yourself)?|wake up|start listening)[.!?]?$/i.test(text.trim());
}

export function isSelfTalk(text: string): boolean {
  const said = text.trim();
  if (/^(ready|on it|yes,? boss|go ahead|applied|cancelled|which job|i'?m here|alright)[.!?]?$/i.test(said)) return true;
  return /howler is armed|howler is listening|say hey howler|listening for(?: the command)?|say confirm or cancel|ready to apply|say confirm|confirm and i'?ll|going to sleep|name the job|which job|i'?m listening|speak now|speak the job|go ahead|what can i do for you|keep this (tab|window) open|allow the microphone|click allow|recorded\b|applied\b|card only|budget unchanged|what finish date|pinned on|i'?m here/i.test(
    said,
  );
}

const JOB_NAME_RE =
  /\b(mcmillan|deboard|de board|ciurlizza|carver|pratt|stewart|swiderski|julian)\b/gi;

export function isJobNameDump(text: string): boolean {
  const hits = text.toLowerCase().match(JOB_NAME_RE);
  if (!hits || hits.length < 2) return false;
  const verbs = /\b(is|are|was|finish|start|hold|held|pour|inspect|confirm|approve|open|status|how's|schedule|close)\b/i;
  return !verbs.test(text) || hits.length >= 3;
}

export type HeardAction =
  | { kind: "ignore"; reason: string }
  | { kind: "sleep" }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "wake-only" }
  | { kind: "command"; text: string };

/**
 * Siri model: ARMED listens only for Hey Howler / Howler.
 * After wake, LISTENING/AWAKE takes the next sentence as the command.
 */
export function decideHeardAction(
  text: string,
  ctx: { state: VoiceState; hasPreview: boolean },
): HeardAction {
  const said = text.trim();
  if (!said) return { kind: "ignore", reason: "empty" };
  if (isSelfTalk(said) || isJobNameDump(said)) return { kind: "ignore", reason: "echo" };
  if (ctx.hasPreview) {
    if (isVoiceConfirm(said)) return { kind: "confirm" };
    if (isVoiceCancel(said)) return { kind: "cancel" };
    if (isHardSleep(said) || isUtteranceEnd(said) || isSleepCommand(said)) return { kind: "sleep" };
    return { kind: "ignore", reason: "awaiting-confirm" };
  }
  if (isUtteranceEnd(said) || isSleepCommand(said)) return { kind: "sleep" };
  const { woke, rest } = matchWake(said);
  const listening = ctx.state === "AWAKE" || ctx.state === "LISTENING";
  if (ctx.state === "ARMED") {
    if (woke && rest) return { kind: "command", text: rest };
    if (woke) return { kind: "wake-only" };
    return { kind: "ignore", reason: "waiting-for-wake" };
  }
  if (!listening) {
    if (woke && rest) return { kind: "command", text: rest };
    if (woke) return { kind: "wake-only" };
    return { kind: "ignore", reason: "not-listening" };
  }
  if (woke && !rest) {
    if (ctx.state === "AWAKE" || ctx.state === "LISTENING") return { kind: "ignore", reason: "already-awake" };
    return { kind: "wake-only" };
  }
  return { kind: "command", text: rest || said };
}

let muted = false;

export function isEarMuted(): boolean {
  return muted;
}

export function muteEar(next: boolean) {
  muted = next;
}

export function unlockSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.resume();
  } catch {
    /* no voices yet */
  }
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const n = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;
  if (/google uk english female/.test(n)) score += 100;
  if (/en-gb|en_gb|uk english|united kingdom/.test(n)) score += 50;
  if (/\b(libby|sonia|hazel|serena|martha|kate)\b/.test(n)) score += 40;
  if (/female|woman/.test(n)) score += 25;
  if (/natural|neural|premium|online/.test(n)) score += 15;
  if (/^en-gb/i.test(voice.lang)) score += 20;
  if (/male|david|daniel|george|ravi|mark|arthur|thomas|ryan|fred|alex\b/.test(n)) score -= 80;
  if (/female|samantha|karen|moira|fiona|zira|susan/.test(n)) score += 6;
  return score;
}

export function pickHowlerVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => voiceScore(b) - voiceScore(a))[0] ?? null;
}

export async function speakHowler(text: string, opts: { mute?: boolean; cloud?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 600);
  if (!clean) return;
  const holdMute = opts.mute !== false;
  if (holdMute) {
    muted = true;
  }
  const done = () => {
    muted = false;
  };
  if (opts.cloud) {
    try {
      const res = await fetch(HOWLER_CLOUD.speak, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 800) {
          const url = URL.createObjectURL(new Blob([buf], { type: res.headers.get("content-type") || "audio/mpeg" }));
          await new Promise<void>((resolve) => {
            const audio = new Audio(url);
            const finish = () => {
              URL.revokeObjectURL(url);
              done();
              resolve();
            };
            audio.onended = finish;
            audio.onerror = finish;
            void audio.play().catch(finish);
          });
          return;
        }
      }
    } catch {
      /* Howler browser voice */
    }
  }
  if (!window.speechSynthesis) {
    done();
    return;
  }
  unlockSpeech();
  window.speechSynthesis.cancel();
  const voices = window.speechSynthesis.getVoices();
  const chosen = pickHowlerVoice(voices);
  await new Promise<void>((resolve) => {
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = chosen?.lang || "en-GB";
    utter.rate = 1.08;
    utter.pitch = 1.05;
    utter.volume = 1;
    if (chosen) utter.voice = chosen;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      done();
      resolve();
    };
    utter.onend = finish;
    utter.onerror = finish;
    window.setTimeout(finish, Math.min(8000, 700 + clean.length * 55));
    window.speechSynthesis.speak(utter);
  });
}

export function howlerChime(): void {
  if (typeof window === "undefined" || !window.AudioContext) return;
  muteEar(true);
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    window.setTimeout(() => {
      muteEar(false);
      void ctx.close();
    }, 240);
  } catch {
    muteEar(false);
  }
}

export async function warmMicrophone(): Promise<"ok" | "denied" | "missing"> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "missing";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return "ok";
  } catch {
    return "denied";
  }
}

export function createVoiceSession(handlers: {
  onFinal: (transcript: string) => void;
  onInterim?: (transcript: string) => void;
  onState: (state: VoiceState, detail?: string) => void;
}): { start: () => void; stop: () => void; abort: () => void } {
  const Ctor = SpeechCtor();
  if (!Ctor) {
    handlers.onState("UNSUPPORTED", "This browser has no speech recognition.");
    return { start: () => {}, stop: () => {}, abort: () => {} };
  }

  const RecogClass = Ctor;
  let recog: Recog | null = null;
  let want = false;
  let cursor = 0;

  function attach() {
    cursor = 0;
    const next = new RecogClass();
    next.continuous = true;
    next.interimResults = true;
    next.lang = "en-US";
    next.onstart = () => handlers.onState("ARMED");
    next.onresult = (event) => {
      const start = event.resultIndex ?? 0;
      const results = event.results;
      let interim = "";
      for (let i = start; i < results.length; i += 1) {
        const row = results[i];
        const said = row?.[0]?.transcript.trim();
        if (!said) continue;
        if (row.isFinal === false) {
          interim = said;
          continue;
        }
        if (i < cursor) continue;
        cursor = i + 1;
        handlers.onInterim?.(said);
        handlers.onFinal(said);
      }
      if (interim) handlers.onInterim?.(interim);
    };
    next.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        want = false;
        handlers.onState("DENIED", "Allow the microphone on this dashboard.");
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "network") {
        handlers.onState("FAILED", "This tab cannot reach speech recognition. Type the command.");
        return;
      }
      handlers.onState("FAILED", event.error);
    };
    next.onend = () => {
      if (!want) {
        handlers.onState("READY");
        return;
      }
      cursor = 0;
      window.setTimeout(() => {
        if (!want) return;
        try {
          next.start();
        } catch {
          try {
            attach();
            recog?.start();
          } catch {
            want = false;
            handlers.onState("FAILED", "Listening stopped.");
          }
        }
      }, 120);
    };
    recog = next;
  }

  return {
    start: () => {
      want = true;
      if (!recog) attach();
      try {
        recog?.start();
      } catch {
        try {
          recog?.abort();
          attach();
          recog?.start();
        } catch {
          want = false;
          handlers.onState("FAILED", "Could not start the microphone.");
        }
      }
    },
    stop: () => {
      want = false;
      recog?.stop();
    },
    abort: () => {
      want = false;
      recog?.abort();
    },
  };
}

export function isVoiceConfirm(text: string): boolean {
  return /^(yes|yeah|yep|confirm|do it|apply|send it|record it|that'?s right|thats right)(\s+(it|that|this|please|howler))?[.!?]?$/i.test(
    text.trim(),
  );
}

export function isVoiceCancel(text: string): boolean {
  return /^(no|nope|cancel|never ?mind|scratch that|don'?t|do not)(\s+(it|that|this|the update))?[.!?]?$/i.test(
    text.trim(),
  );
}
