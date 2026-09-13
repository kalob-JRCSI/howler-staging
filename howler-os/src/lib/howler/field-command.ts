import { jobBrief } from "./derive";
import { interpretUtterance } from "./ear";
import { rememberFromPreview } from "./memory";
import { ensureProjectShape } from "./store";
import { talkReadback } from "./talk";
import type { Project } from "./types";

export type FieldCommandResult = {
  say: string;
  applied: boolean;
  job: string | null;
  projectId: string | null;
  projects: Record<string, Project>;
};

export function talkRecorded(job: string, picture: string): string {
  return talkReadback(job, picture).replace(/\s*Confirm\?$/i, " Recorded.");
}

export function runFieldCommand(
  projects: Record<string, Project>,
  command: string,
  activeProjectId: string | null = null,
): FieldCommandResult {
  const said = command.replace(/\s+/g, " ").trim().slice(0, 1200);
  const book = Object.fromEntries(
    Object.entries(projects).map(([id, project]) => [id, ensureProjectShape(project)]),
  );
  if (!said) {
    return { say: "Go ahead.", applied: false, job: null, projectId: activeProjectId, projects: book };
  }
  const resolved = interpretUtterance(book, said, activeProjectId);
  const pid = resolved.projectId;
  if (resolved.result.outcome === "CLARIFICATION") {
    return {
      say: resolved.result.message.slice(0, 400),
      applied: false,
      job: pid ? book[pid]?.name ?? null : null,
      projectId: pid,
      projects: book,
    };
  }
  if (resolved.result.outcome === "ACTION") {
    return {
      say: resolved.result.message.slice(0, 400),
      applied: false,
      job: pid ? book[pid]?.name ?? null : null,
      projectId: pid,
      projects: book,
    };
  }
  if (!pid || !book[pid]) {
    return {
      say: "Name the job, then what happened.",
      applied: false,
      job: null,
      projectId: null,
      projects: book,
    };
  }
  const next = resolved.result.preview.apply(book[pid]);
  rememberFromPreview(resolved.result.preview, next);
  const nextBook = { ...book, [pid]: next };
  const brief = jobBrief(next);
  return {
    say: talkRecorded(next.name, brief.now).slice(0, 400),
    applied: true,
    job: next.name,
    projectId: pid,
    projects: nextBook,
  };
}
