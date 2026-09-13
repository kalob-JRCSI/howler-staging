import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { interpretUtterance } from "@/lib/howler/ear";
import { jobBrief } from "@/lib/howler/derive";
import { isPhoneHowler } from "@/lib/howler/device";
import { talkClarify, talkReadback, talkWake } from "@/lib/howler/talk";
import { startFieldEar } from "@/lib/howler/field-ear";
import {
  micAskingCopy,
  micIdleCopy,
  micNeedsTap,
  micReadyCopy,
} from "@/lib/howler/mic-platform";
import { annotatePreview } from "@/lib/howler/ripple";
import { useHowlerStore } from "@/lib/howler/store";
import { howlerIsFramed, howlerTrace, howlerTraceEnv, openHowlerTab } from "@/lib/howler/trace";
import type { CommandPreview, InterpretResult, Project } from "@/lib/howler/types";
import {
  decideHeardAction,
  howlerChime,
  isHardSleep,
  isJobNameDump,
  isSelfTalk,
  muteEar,
  speakHowler,
  unlockSpeech,
  type VoiceState,
} from "@/lib/howler/voice";

interface EarContextValue {
  voice: VoiceState;
  heard: string | null;
  message: string | null;
  preview: CommandPreview | null;
  project: Project | null;
  armed: boolean;
  enable: () => void;
  listenNow: () => void;
  sleep: () => void;
  confirmPreview: () => void;
  cancelPreview: () => void;
  submitText: (text: string) => void;
  setPreview: (preview: CommandPreview | null) => void;
  setMessage: (message: string | null) => void;
  take: (result: InterpretResult, spoken?: boolean, projectId?: string | null) => void;
}

const EarContext = createContext<EarContextValue | null>(null);
const ARM_KEY = "howler-listen-enabled";
const GRANT_KEY = "howler-mic-granted";

export function HowlerEarProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projects = useHowlerStore((state) => state.projects);
  const applyPreview = useHowlerStore((state) => state.applyPreview);

  const activeProjectId = pathname.startsWith("/projects/")
    ? pathname.split("/")[2] ?? null
    : null;
  const activeProject = activeProjectId ? projects[activeProjectId] ?? null : null;

  const [voice, setVoice] = useState<VoiceState>("READY");
  const [heard, setHeard] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [targetId, setTargetId] = useState<string | null>(activeProjectId);
  const targetRef = useRef<string | null>(activeProjectId);

  const previewRef = useRef<CommandPreview | null>(null);
  const voiceRef = useRef<VoiceState>(voice);
  const projectsRef = useRef(projects);
  const activeRef = useRef(activeProjectId);
  const awakeTimer = useRef<number | null>(null);
  const fieldRef = useRef<{
    stop: () => void;
    restart: () => void;
    listen: () => void;
    listenConfirm: () => void;
  } | null>(null);
  previewRef.current = preview;
  voiceRef.current = voice;
  projectsRef.current = projects;
  activeRef.current = activeProjectId;

  const take = useCallback(
    (result: InterpretResult, spoken = false, projectId: string | null = activeRef.current) => {
      if (result.outcome === "CLARIFICATION") {
        setPreview(null);
        const parts = result.message.split(". ").filter(Boolean);
        const short = parts[0] ? `${parts[0].replace(/\.$/, "")}.` : "Howler.";
        setMessage(short);
        setHeard(result.message);
        howlerTrace("clarification", result.message.slice(0, 240));
        setVoice("ARMED");
        if (spoken) {
          void speakHowler(talkClarify(result.message), { mute: true }).then(() => fieldRef.current?.listen());
        } else {
          fieldRef.current?.listen();
        }
        return;
      }
      if (result.outcome === "ACTION") {
        setPreview(null);
        if (result.action === "OPEN" && result.projectId) {
          navigate({
            to: "/projects/$projectId/$moduleId",
            params: { projectId: result.projectId, moduleId: "overview" },
          });
        } else {
          window.dispatchEvent(
            new Event(result.action === "PRINT" ? "howler-print-sheet" : "howler-export-set"),
          );
        }
        setMessage(result.message);
        if (spoken) void speakHowler(result.message, { mute: true }).then(() => fieldRef.current?.restart());
        return;
      }
      const pid = projectId ?? activeRef.current;
      const project = pid ? projectsRef.current[pid] : null;
      setTargetId(pid);
      targetRef.current = pid;
      const annotated = project ? annotatePreview(project, result.preview) : result.preview;
      setPreview(annotated);
      setVoice("AWAKE");
      const job = project?.name ?? "This job";
      let picture = annotated.understood;
      if (project) {
        try {
          const after = annotated.apply(project);
          const brief = jobBrief(after);
          picture = brief.now;
        } catch {
          picture = annotated.understood;
        }
      }
      const readback = talkReadback(job, picture);
      setMessage(readback);
      howlerTrace("preview", readback.slice(0, 240));
      unlockSpeech();
      if (spoken) {
        void speakHowler(readback, { mute: true }).then(() => {
          muteEar(false);
          fieldRef.current?.listenConfirm();
        });
      } else {
        muteEar(false);
        fieldRef.current?.listenConfirm();
      }
    },
    [navigate],
  );

  const takeRef = useRef(take);
  takeRef.current = take;

  const sleep = useCallback(() => {
    if (awakeTimer.current) window.clearTimeout(awakeTimer.current);
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* */
    }
    muteEar(false);
    fieldRef.current?.stop();
    fieldRef.current = null;
    setPreview(null);
    setVoice("READY");
    setHeard(null);
    setMessage(null);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(ARM_KEY);
  }, []);

  const confirmPreview = useCallback(() => {
    const current = previewRef.current;
    const pid = targetRef.current ?? targetId ?? activeRef.current;
    if (!current || !pid) return;
    applyPreview(pid, current);
    const project = useHowlerStore.getState().projects[pid];
    const brief = project ? jobBrief(project) : null;
    howlerTrace("confirm", `${pid} ${current.understood}`);
    setPreview(null);
    const line = brief
      ? `${brief.now} ${brief.next[0] ?? ""}`.trim()
      : `Applied: ${current.understood}`;
    setMessage(line);
    setHeard(null);
    setVoice("ARMED");
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* */
    }
    muteEar(false);
    howlerChime();
    fieldRef.current?.restart();
    void navigate({
      to: "/projects/$projectId/$moduleId",
      params: { projectId: pid, moduleId: "overview" },
    });
  }, [applyPreview, navigate, targetId]);

  const cancelPreview = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* */
    }
    setPreview(null);
    setMessage(null);
    setVoice("ARMED");
    muteEar(false);
    fieldRef.current?.restart();
  }, []);

  const restArm = useCallback(() => {
    if (awakeTimer.current) window.clearTimeout(awakeTimer.current);
    awakeTimer.current = window.setTimeout(() => {
      if (voiceRef.current === "AWAKE" || voiceRef.current === "LISTENING") {
        if (!previewRef.current) {
          setVoice("ARMED");
          setMessage("Listening for Hey Howler.");
        }
      }
    }, 45000);
  }, []);

  const submitText = useCallback(
    (text: string, spoken = false, alreadyCommand = false) => {
      const said = text.trim();
      if (!said) return;
      setHeard(said);
      howlerTrace("submit", said.slice(0, 240));
      const action = decideHeardAction(said, {
        state: alreadyCommand ? "LISTENING" : spoken ? voiceRef.current : "AWAKE",
        hasPreview: previewRef.current != null,
      });
      if (action.kind === "ignore") {
        howlerTrace("submit-ignore", action.kind);
        return;
      }
      if (action.kind === "sleep") {
        howlerTrace("command-end", said.slice(0, 80));
        if (isHardSleep(said)) {
          sleep();
          return;
        }
        setVoice("ARMED");
        setMessage("Say Hey Howler anytime.");
        fieldRef.current?.restart();
        return;
      }
      if (action.kind === "confirm") {
        confirmPreview();
        return;
      }
      if (action.kind === "cancel") {
        cancelPreview();
        return;
      }
      if (action.kind === "wake-only") {
        if (voiceRef.current === "AWAKE" || voiceRef.current === "LISTENING") return;
        setVoice("LISTENING");
        setMessage(talkWake());
        howlerChime();
        restArm();
        return;
      }
      if (action.kind !== "command") return;
      setVoice("AWAKE");
      const command = action.text;
      const pid = activeRef.current;
      howlerTrace("intent", command.slice(0, 240));
      const resolved = interpretUtterance(projectsRef.current, command, pid);
      if (resolved.projectId) {
        setTargetId(resolved.projectId);
        targetRef.current = resolved.projectId;
      }
      takeRef.current(resolved.result, spoken, resolved.projectId);
      restArm();
    },
    [cancelPreview, confirmPreview, restArm, sleep],
  );

  const submitRef = useRef(submitText);
  submitRef.current = submitText;

  const enable = useCallback(() => {
    howlerTrace("enable-click", `${voiceRef.current} framed=${howlerIsFramed()} secure=${window.isSecureContext}`);
    if (howlerIsFramed()) {
      const opened = openHowlerTab();
      howlerTrace("open-howler", opened ? "opened" : "blocked");
      if (!opened) {
        setVoice("DENIED");
        setMessage("The browser blocked the Howler window. Allow popups, then click Open Howler.");
        return;
      }
      setVoice("DENIED");
      setMessage("A Howler tab just opened. Click Allow microphone in THAT tab — this preview cannot hear.");
      return;
    }
    unlockSpeech();
    setVoice("READY");
    setMessage(micAskingCopy());
    setHeard("Waiting on the browser…");
    fieldRef.current?.stop();
    fieldRef.current = startFieldEar({
      onPartial: (text) => {
        if (voiceRef.current === "ARMED") return;
        setHeard(text || "Listening.");
      },
      onWake: () => {
        howlerTrace("wake");
        setVoice("LISTENING");
        setMessage("Go ahead.");
        setHeard("Listening.");
        howlerChime();
      },
      onUtterance: (text) => {
        const said = text.trim();
        howlerTrace("utterance", said.slice(0, 240));
        if (!said || isSelfTalk(said) || isJobNameDump(said)) {
          howlerTrace("utterance-dropped", said.slice(0, 120));
          return;
        }
        setHeard(said);
        submitRef.current(said, true, true);
      },
      onState: (state, detail) => {
        howlerTrace("ear-state", `${state} ${detail ?? ""}`);
        if (state === "armed") {
          setVoice("ARMED");
          setMessage(micReadyCopy());
          setHeard(micNeedsTap() ? "Tap the orb, then speak." : "Listening for Hey Howler.");
          window.sessionStorage.setItem(ARM_KEY, "1");
          window.localStorage.setItem(GRANT_KEY, "1");
          if (micNeedsTap()) {
            fieldRef.current?.listen();
            setVoice("LISTENING");
            setMessage("Go ahead.");
            howlerChime();
            return;
          }
          void speakHowler("Ready.", { mute: true }).then(() => fieldRef.current?.restart());
          return;
        }
        if (state === "denied" || state === "failed") {
          setVoice("DENIED");
          setMessage(detail ?? "Click Allow on the browser prompt. Turn on Always allow.");
          setHeard("Howler cannot hear until the browser allows the microphone.");
        }
      },
    });
  }, []);

  const listenNow = useCallback(() => {
    if (howlerIsFramed() || voiceRef.current === "READY" || voiceRef.current === "DENIED" || voiceRef.current === "FAILED") {
      enable();
      return;
    }
    fieldRef.current?.listen();
    setVoice("LISTENING");
    setMessage("Go ahead.");
    setHeard("Listening.");
    howlerChime();
  }, [enable]);

  useEffect(() => {
    howlerTrace("boot", howlerTraceEnv());
    let cancelled = false;
    void (async () => {
      if (typeof window === "undefined") return;
      if (isPhoneHowler()) return;
      if (voiceRef.current === "ARMED" || voiceRef.current === "AWAKE") return;
      let granted = window.localStorage.getItem(GRANT_KEY) === "1";
      try {
        const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
        granted = status.state === "granted";
      } catch {
        /* Safari */
      }
      if (cancelled || !granted) return;
      enable();
    })();
    return () => {
      cancelled = true;
    };
  }, [enable]);

  const value = useMemo<EarContextValue>(
    () => ({
      voice,
      heard,
      message,
      preview,
      project: (targetId && projects[targetId]) || activeProject,
      armed: voice === "ARMED" || voice === "AWAKE" || voice === "LISTENING",
      enable,
      listenNow,
      sleep,
      confirmPreview,
      cancelPreview,
      submitText: (text) => submitText(text, false),
      setPreview,
      setMessage,
      take,
    }),
    [
      activeProject,
      cancelPreview,
      confirmPreview,
      enable,
      listenNow,
      heard,
      message,
      preview,
      projects,
      sleep,
      submitText,
      take,
      targetId,
      voice,
    ],
  );

  return <EarContext.Provider value={value}>{children}</EarContext.Provider>;
}

export function useHowlerEar(): EarContextValue {
  const ctx = useContext(EarContext);
  if (!ctx) {
    throw new Error("HowlerEarProvider is required.");
  }
  return ctx;
}

export function HowlerMic({ label = true }: { label?: boolean }) {
  const { voice, enable, listenNow, sleep, armed } = useHowlerEar();
  if (!armed) {
    const framed = howlerIsFramed();
    return (
      <button type="button" className="howler-enable" onClick={enable}>
        {voice === "DENIED" || voice === "FAILED"
          ? "Try microphone again"
          : framed
            ? "Open Howler"
            : "Allow microphone"}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="howler-voice"
        data-state={voice}
        aria-label={micNeedsTap() ? "Tap to talk to Howler" : "Howler is listening for Hey Howler"}
        onClick={listenNow}
      >
        <span className="howler-voice-ring" aria-hidden="true" />
      </button>
      {label ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
          {voice === "LISTENING" || voice === "AWAKE" ? "Go ahead" : micNeedsTap() ? "Tap to talk" : "Say Hey Howler"}
        </span>
      ) : null}
      <button type="button" className="text-[11px] uppercase tracking-[0.12em] text-subtle" onClick={sleep}>
        Sleep
      </button>
    </div>
  );
}

export function HowlerSpeakPad() {
  const ear = useHowlerEar();
  return (
    <div className="howler-pad print-hide" role="status">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
        {ear.voice === "AWAKE"
          ? "Howler"
          : ear.voice === "ARMED" || ear.voice === "LISTENING"
            ? "Listening"
            : "Microphone"}
      </p>
      <h2 className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-display text-[22px] leading-tight">
        {ear.message ||
          (howlerIsFramed()
            ? "This preview cannot use a microphone. Click Open Howler."
            : micIdleCopy())}
      </h2>
      <p className="mt-2 max-h-48 max-w-3xl overflow-auto whitespace-pre-wrap text-sm text-muted">
        {ear.heard || micIdleCopy()}
      </p>
    </div>
  );
}
