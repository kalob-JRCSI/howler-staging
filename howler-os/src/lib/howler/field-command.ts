import { jobBrief } from "./derive";
import { interpretUtterance } from "./ear";
import {
  digestIntakeFromLocal,
  isCreateClientUtterance,
  makeIntakeProject,
  parseIntakeLocal,
  slugifyName,
} from "./intake";
import { rememberFromPreview } from "./memory";
import { emptyJob } from "./job";
import { ensureProjectShape } from "./store";
import { talkReadback } from "./talk";
import { emptyBlueprint, type Project } from "./types";

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

function intakeToProject(digest: NonNullable<ReturnType<typeof digestIntakeFromLocal>>, existing: Project | null): Project | null {
  const built = makeIntakeProject(digest as any, existing);
  if (!built || !built.name) return null;
  const id = existing?.id || slugifyName(built.name);
  const base: Project = {
    id,
    name: built.name,
    clientName: built.clientName || built.name,
    address: built.address || "Address TBD",
    projectType: built.projectType || "Intake",
    timezone: existing?.timezone || "America/New_York",
    revision: existing?.revision ?? 0,
    healthBand: existing?.healthBand || "YELLOW",
    paused: existing?.paused ?? false,
    heldPhases: existing?.heldPhases || [],
    dashboardNote: built.dashboardNote ?? existing?.dashboardNote ?? null,
    officialStart: existing?.officialStart ?? null,
    intendedFinish: existing?.intendedFinish ?? null,
    sourceLabel: existing?.sourceLabel || "intake",
    activities: built.activities || existing?.activities || {},
    scopeItems: built.scopeItems || existing?.scopeItems || {},
    financials: existing?.financials ?? null,
    blueprint: existing?.blueprint || emptyBlueprint(),
    job: existing?.job || emptyJob(),
    events: existing?.events || [
      {
        id: `evt-${id}-intake`,
        revision: 0,
        type: "INTAKE_CREATED",
        occurredAt: new Date().toISOString(),
        note: "Created from spoken intake.",
        clerical: true,
      },
    ],
  };
  return ensureProjectShape(base);
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

  // Soft create / intake — never fall through to "Name the job" when create was spoken.
  const intake = parseIntakeLocal(said, { now: new Date() });
  if (intake?.kind === "create" && intake.clientName) {
    const digest = digestIntakeFromLocal(said, { now: new Date() });
    if (digest) {
      const existing =
        Object.values(book).find(
          (p) =>
            (p.clientName || "").toLowerCase() === intake.clientName!.toLowerCase() ||
            (p.id || "") === slugifyName(intake.clientName!),
        ) || null;
      const project = intakeToProject({ ...digest, utterance: said } as any, existing);
      if (project) {
        const nextBook = { ...book, [project.id]: project };
        return {
          say: `${project.name} is on the board.`,
          applied: true,
          job: project.name,
          projectId: project.id,
          projects: nextBook,
        };
      }
    }
  }
  if (isCreateClientUtterance(said) && (!intake || !intake.clientName)) {
    return {
      say: "Name the new client — first and last if you have them.",
      applied: false,
      job: null,
      projectId: null,
      projects: book,
    };
  }
  if (intake?.kind === "followup" && intake.clientName) {
    const digest = digestIntakeFromLocal(said, { now: new Date() });
    const needle = intake.clientName.toLowerCase();
    const hit =
      Object.values(book).find(
        (p) =>
          (p.name || "").toLowerCase().includes(needle.split(" ")[0]!) ||
          (p.clientName || "").toLowerCase().includes(needle) ||
          (p.id || "") === slugifyName(needle),
      ) || null;
    if (hit && digest) {
      const merged = intakeToProject({ ...digest, clientName: hit.clientName || hit.name }, hit);
      if (merged) {
        return {
          say: talkRecorded(merged.name, jobBrief(merged).now).slice(0, 400),
          applied: true,
          job: merged.name,
          projectId: merged.id,
          projects: { ...book, [merged.id]: merged },
        };
      }
    }
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
