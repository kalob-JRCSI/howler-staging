import { useState } from "react";
import { Button } from "@/components/ui/button";
import { COMMAND_EXAMPLES } from "@/lib/howler/commands";
import { interpretUpload } from "@/lib/howler/interpret";
import { useHowlerStore } from "@/lib/howler/store";
import type { Project } from "@/lib/howler/types";
import { ensureBlueprint } from "@/lib/howler/types";
import { HowlerSpeakPad, useHowlerEar } from "./howler-ear";
import { PreviewConfirm } from "./preview-confirm";
import { Field, inputClass, Panel } from "./primitives";

const GROUPS = ["Upload", "Plans", "Issue", "Code", "Job"] as const;

export function TellHowler({ project, compact = false }: { project?: Project; compact?: boolean }) {
  const projects = useHowlerStore((state) => state.projects);
  const ear = useHowlerEar();
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const target = ear.project ?? project ?? null;
  const last = target?.events[0];
  const evidence = target ? ensureBlueprint(target).evidence ?? [] : [];

  function runTyped(raw: string) {
    const said = raw.trim();
    if (!said) return;
    ear.submitText(said);
    setText("");
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!target) {
      ear.setMessage("Open a job, then drop the file. Howler will not hang a PDF on the wrong address.");
      return;
    }
    ear.take(interpretUpload(target, { name: file.name, type: file.type, size: file.size }), false, target.id);
  }

  const drop = (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-xs text-muted shadow-[var(--shadow-border)] ${
        dragging ? "bg-surface-2 text-fg" : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(event.dataTransfer.files);
      }}
    >
      Drop file
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
        onChange={(event) => {
          onFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );

  const preview = ear.preview ? (
    <PreviewConfirm
      preview={ear.preview}
      project={target ?? undefined}
      onConfirm={() => ear.confirmPreview()}
      onCancel={() => ear.cancelPreview()}
    />
  ) : null;

  if (compact) {
    return (
      <div className="print-hide">
        {ear.heard || ear.message ? (
          <p className="mb-3 text-sm text-muted">{ear.heard || ear.message}</p>
        ) : null}
        <form
          className="howler-command mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            runTyped(text);
          }}
        >
          <Field label="Howler">
            <input
              id="howler-command"
              className={inputClass}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="McMillan concrete is done. Awaiting Stanfield estimate."
              autoComplete="off"
            />
          </Field>
          <Button variant="primary" type="submit">
            Tell Howler
          </Button>
          {drop}
        </form>
        {last ? <p className="mt-2 font-mono text-[11px] text-subtle">Rev {last.revision}</p> : null}
        {preview}
      </div>
    );
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-normal">Tell Howler</h3>
          <p className="mt-1 text-sm text-muted">
            Enable Howler once. Then say “Hey Howler” anytime. Type is the backup.
          </p>
        </div>
      </div>
      <HowlerSpeakPad />
      {last ? (
        <p className="mt-3 text-xs text-subtle">
          Continuing from rev {last.revision}: {last.note}
          {last.recordId ? " You can refer to that record as “it.”" : ""}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-[11px] text-subtle">
        {ear.armed ? "LISTENING" : ear.voice}
        {ear.heard ? ` · ${ear.heard}` : ""}
      </p>
      <label
        className={`mt-4 flex min-h-24 cursor-pointer flex-col items-start justify-center rounded-md px-4 py-3 text-sm transition-colors duration-[var(--motion-quick)] ${
          dragging ? "bg-surface-2 text-fg" : "text-muted shadow-[var(--shadow-border)]"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles(event.dataTransfer.files);
        }}
      >
        <span className="font-medium text-fg">Drop plans, calcs, or a sketch</span>
        <span className="mt-1 text-xs">
          Deboard Tradewalk Plans.pdf / Calcs / Stanfield framing adopt the recorded
          set. Any other file is evidence only — Howler will not scale it.
        </span>
        <input
          type="file"
          className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
          onChange={(event) => {
            onFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {evidence.length ? (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {evidence.slice(-4).map((item) => (
            <li key={item.id}>
              {item.kind}: {item.name}
              {item.url ? (
                <>
                  {" · "}
                  <a href={item.url} target="_blank" rel="noreferrer" className="text-accent">
                    Drive
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 space-y-3">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">{group}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {COMMAND_EXAMPLES.filter((item) => item.group === group).map((example) => (
                <button
                  key={example.phrase}
                  type="button"
                  title={example.does}
                  className="min-h-11 rounded-md px-3 text-left text-xs text-muted shadow-[var(--shadow-border)] transition-colors duration-[var(--motion-quick)] hover:text-fg"
                  onClick={() => {
                    setText(example.phrase);
                    ear.setMessage(null);
                    ear.setPreview(null);
                  }}
                >
                  {example.phrase}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          runTyped(text);
        }}
      >
        <Field label="What happened">
          <textarea
            className={`${inputClass} min-h-24 py-2`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Press the ring, then speak. Or type the update."
          />
        </Field>
        <Button variant="primary" type="submit">
          Analyze
        </Button>
      </form>
      {ear.message ? <p className="mt-3 text-sm text-muted">{ear.message}</p> : null}
      {preview}
    </Panel>
  );
}
