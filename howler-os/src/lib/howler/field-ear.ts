import { transcribeBlob } from "./record";
import { howlerTrace } from "./trace";
import { micAskingCopy, micBlockedCopy } from "./mic-platform";
import { isEarMuted, isHardSleep, isSelfTalk, isUtteranceEnd, isVoiceCancel, isVoiceConfirm, matchWake } from "./voice";

type Handlers = {
  onPartial: (text: string) => void;
  onUtterance: (text: string) => void;
  onWake: () => void;
  onState: (state: "armed" | "denied" | "failed", detail?: string) => void;
};

const TICK = 80;
const END_MS = 400;
const MAX_MS = 12000;

function looksComplete(text: string): boolean {
  return (
    /\b(done|complete|completed|finished|closed|awaiting|waiting|update|confirm|cancel)\b/i.test(text) &&
    text.split(/\s+/).length >= 4
  );
}

function rms(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const v = (data[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

function SpeechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: {
    resultIndex?: number;
    results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onstart: (() => void) | null;
};

export function joinUtterance(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function startFieldEar(handlers: Handlers): {
  stop: () => void;
  restart: () => void;
  listen: () => void;
  listenConfirm: () => void;
} {
  let stopped = false;
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: number | null = null;
  let watchdog: number | null = null;
  let mode: "wake" | "command" | "confirm" = "wake";
  let commandUntil = 0;
  let parts: string[] = [];
  let interim = "";
  let quiet: number | null = null;
  let recog: SpeechRecognitionLike | null = null;
  let wantRecog = true;
  let live = false;
  let restarting = false;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let recording = false;
  let speechMs = 0;
  let silenceMs = 0;

  let coolUntil = 0;

  const cool = (ms = 900) => {
    coolUntil = Date.now() + ms;
  };

  const inCommand = () => mode === "command" && Date.now() < commandUntil;

  const openCommand = () => {
    mode = "command";
    commandUntil = Date.now() + 20000;
    handlers.onWake();
  };

  const openConfirm = () => {
    mode = "confirm";
    commandUntil = Date.now() + 25000;
    stopRecorder(false);
  };

  const endCommand = () => {
    mode = "wake";
    commandUntil = 0;
    parts = [];
    interim = "";
    stopRecorder(false);
    cool(600);
  };

  const handleText = (raw: string) => {
    const said = raw.trim();
    if (!said || isEarMuted() || isSelfTalk(said) || Date.now() < coolUntil) return;
    if (mode === "confirm") {
      if (isVoiceConfirm(said) || isVoiceCancel(said) || isUtteranceEnd(said) || isHardSleep(said)) {
        endCommand();
        handlers.onUtterance(said);
      }
      return;
    }
    const { woke, rest } = matchWake(said);
    if (mode === "wake" && !inCommand()) {
      if (!woke) return;
      if (rest) {
        openConfirm();
        handlers.onUtterance(rest);
        return;
      }
      openCommand();
      return;
    }
    if (isUtteranceEnd(said)) {
      const buffered = joinUtterance(parts);
      parts = [];
      if (buffered) {
        openConfirm();
        handlers.onUtterance(buffered);
        return;
      }
      endCommand();
      handlers.onUtterance(said);
      return;
    }
    const payload = woke ? rest : said;
    if (!payload) {
      endCommand();
      return;
    }
    openConfirm();
    handlers.onUtterance(payload);
  };

  const bump = () => {
    if (quiet) window.clearTimeout(quiet);
    quiet = window.setTimeout(() => {
      const said = joinUtterance(parts);
      parts = [];
      interim = "";
      if (said) handleText(said);
    }, END_MS);
  };

  const stopRecorder = (useClip: boolean) => {
    if (!recording || !recorder) return;
    recording = false;
    const rec = recorder;
    recorder = null;
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      chunks = [];
      if (!useClip || blob.size < 800 || isEarMuted() || recog) return;
      handlers.onPartial("Transcribing…");
      void transcribeBlob(blob).then((result) => {
        if (result.ok) handleText(result.text);
        else handlers.onPartial(result.error);
      });
    };
    try {
      rec.stop();
    } catch {
      recording = false;
    }
  };

  const beginRecorder = () => {
    if (!stream || recording || isEarMuted()) return;
    chunks = [];
    speechMs = 0;
    silenceMs = 0;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.start(250);
    recording = true;
  };

  const tick = () => {
    if (stopped || !analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
    const level = rms(data);
    if (isEarMuted()) {
      if (recording) stopRecorder(false);
      return;
    }
    if (!inCommand()) {
      if (recording) stopRecorder(false);
      return;
    }
    if (!recording) {
      if (level >= 0.012) beginRecorder();
      return;
    }
    speechMs += TICK;
    if (level >= 0.01) silenceMs = 0;
    else silenceMs += TICK;
    if ((silenceMs >= END_MS && speechMs >= 350) || speechMs >= MAX_MS) stopRecorder(true);
  };

  const attachRecog = () => {
    const Ctor = SpeechCtor();
    if (!Ctor) return;
    const next = new Ctor();
    next.continuous = true;
    next.interimResults = true;
    next.lang = "en-US";
    next.onstart = () => {
      live = true;
    };
    next.onresult = (event) => {
      if (isEarMuted()) return;
      const start = event.resultIndex ?? 0;
      for (let i = start; i < event.results.length; i += 1) {
        const row = event.results[i];
        const said = row?.[0]?.transcript ?? "";
        if (!said) continue;
        if (mode === "wake" || mode === "confirm") {
          if (row.isFinal === false) continue;
          handleText(said);
          continue;
        }
        if (row.isFinal === false) {
          interim = said;
          handlers.onPartial(joinUtterance([...parts, interim]));
          continue;
        }
        parts.push(said);
        interim = "";
        const joined = joinUtterance(parts);
        handlers.onPartial(joined);
        if (looksComplete(joined)) {
          if (quiet) window.clearTimeout(quiet);
          parts = [];
          handleText(joined);
        } else {
          bump();
        }
      }
    };
    next.onerror = (event) => {
      live = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        howlerTrace("sr-denied", { error: event.error });
        wantRecog = false;
        handlers.onState("denied", "Click Allow on the browser prompt. Turn on Always allow.");
      } else {
        howlerTrace("sr-error", { error: event.error });
      }
    };
    next.onend = () => {
      live = false;
      if (restarting || !wantRecog || stopped) return;
      window.setTimeout(() => {
        if (!live && wantRecog && !stopped) attachRecog();
      }, 80);
    };
    recog = next;
    try {
      next.start();
    } catch {
      /* recorder still available in command mode */
    }
  };

  wantRecog = true;
  attachRecog();
  watchdog = window.setInterval(() => {
    if (!stopped && wantRecog && !live && !restarting) attachRecog();
  }, 1500);

  if (navigator.mediaDevices?.getUserMedia) {
    let settled = false;
    const fail = (detail: string) => {
      if (settled || stopped) return;
      settled = true;
      handlers.onState("denied", detail);
    };
    const timerId = window.setTimeout(() => {
      fail(micAskingCopy());
    }, 8000);
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((held) => {
      window.clearTimeout(timerId);
      if (stopped) {
        held.getTracks().forEach((track) => track.stop());
        return;
      }
      settled = true;
      stream = held;
      howlerTrace("gum-ok", { tracks: held.getAudioTracks().map((track) => track.label) });
      audioCtx = new AudioContext();
      void audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(held);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      timer = window.setInterval(tick, TICK);
      handlers.onState("armed");
      if (!recog) attachRecog();
    }).catch((err: unknown) => {
      window.clearTimeout(timerId);
      const name = err instanceof Error ? err.name : "";
      const message = err instanceof Error ? err.message : String(err);
      howlerTrace("gum-fail", { name, error: message });
      if (name === "NotFoundError") {
        fail("This computer has no microphone Howler can use.");
        return;
      }
      if (name === "NotAllowedError" || /denied|permission/i.test(message)) {
        fail(micBlockedCopy());
        return;
      }
      fail(`Microphone failed (${name || "error"}). Click Allow microphone again.`);
    });
  } else {
    handlers.onState("denied", "This browser has no microphone API. Use Chrome.");
  }

  return {
    stop: () => {
      stopped = true;
      wantRecog = false;
      if (quiet) window.clearTimeout(quiet);
      if (timer) window.clearInterval(timer);
      if (watchdog) window.clearInterval(watchdog);
      try {
        recog?.abort();
      } catch {
        /* */
      }
      stopRecorder(false);
      stream?.getTracks().forEach((track) => track.stop());
      void audioCtx?.close();
    },
    restart: () => {
      if (stopped) return;
      endCommand();
      restarting = true;
      live = false;
      try {
        recog?.abort();
      } catch {
        /* */
      }
      restarting = false;
      if (wantRecog) attachRecog();
    },
    listen: () => {
      if (stopped) return;
      openCommand();
    },
    listenConfirm: () => {
      if (stopped) return;
      openConfirm();
    },
  };
}
