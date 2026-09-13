import { progressPercent, spokenBrief } from "./derive";
import { interpretFinancial } from "./interpret";
import type { InterpretResult, Project } from "./types";
import { matchWake, pickHowlerAck } from "./voice";

const ALIASES: { alias: string; projectId: string }[] = [
  { alias: "deboard", projectId: "deboard-v091" },
  { alias: "de board", projectId: "deboard-v091" },
  { alias: "debord", projectId: "deboard-v091" },
  { alias: "garage", projectId: "deboard-v091" },
  { alias: "mcmillan", projectId: "mcmillan-v1" },
  { alias: "macmillan", projectId: "mcmillan-v1" },
  { alias: "caveson", projectId: "mcmillan-v1" },
  { alias: "ciurlizza", projectId: "ciurlizza-v1" },
  { alias: "cher liza", projectId: "ciurlizza-v1" },
  { alias: "andover", projectId: "ciurlizza-v1" },
  { alias: "carver", projectId: "carver" },
  { alias: "julian", projectId: "carver" },
  { alias: "wil rose", projectId: "carver" },
  { alias: "pratt", projectId: "pratt-v1" },
  { alias: "stewart", projectId: "stewart-v1" },
  { alias: "swiderski", projectId: "swiderski-v1" },
  { alias: "swidersky", projectId: "swiderski-v1" },
];

export function resolveProjectMention(
  text: string,
  projects: Record<string, Project>,
): { projectId: string | null; names: string[] } {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const project of Object.values(projects)) {
    if (lower.includes(project.name.toLowerCase()) || lower.includes(project.clientName.toLowerCase())) {
      hits.add(project.id);
    }
    if (project.address !== "Unknown" && lower.includes(project.address.toLowerCase().split(",")[0]!.toLowerCase())) {
      hits.add(project.id);
    }
  }
  for (const alias of ALIASES) {
    if (lower.includes(alias.alias) && projects[alias.projectId]) hits.add(alias.projectId);
  }
  const ids = [...hits];
  const names = ids.map((id) => projects[id]?.name ?? id);
  if (ids.length === 1) return { projectId: ids[0]!, names };
  return { projectId: null, names };
}

export function isStatusQuery(text: string): boolean {
  return /^(how'?s|how is|status|what'?s going on|what'?s the status|give me a status|brief me)\b/i.test(
    text.trim(),
  ) || /\b(status|how'?s it going|where (?:are|is) (?:we|it))\b/i.test(text);
}

export function isOpenCommand(text: string): boolean {
  return /^(open|go to|show|take me to|pull up)\b/i.test(text.trim());
}

export interface UtteranceResolution {
  projectId: string | null;
  result: InterpretResult;
  woke: boolean;
}

export function interpretUtterance(
  projects: Record<string, Project>,
  raw: string,
  activeProjectId: string | null,
): UtteranceResolution {
  const { woke, rest } = matchWake(raw);
  const text = (rest || (!woke ? raw : "")).trim();
  if (!text) {
    return {
      projectId: activeProjectId,
      woke,
      result: {
        outcome: "CLARIFICATION",
        message: pickHowlerAck(),
      },
    };
  }

  const mention = resolveProjectMention(text, projects);
  const projectId = mention.projectId ?? activeProjectId;
  const project = projectId ? projects[projectId] : null;

  if (isOpenCommand(text)) {
    if (!project) {
      return {
        projectId: null,
        woke,
        result: {
          outcome: "CLARIFICATION",
          message: mention.names.length
            ? `Which job: ${mention.names.join("; ")}?`
            : "Which job should I open?",
        },
      };
    }
    return {
      projectId: project.id,
      woke,
      result: {
        outcome: "ACTION",
        action: "OPEN",
        projectId: project.id,
        message: `Opening ${project.name}.`,
      },
    };
  }

  if (!project) {
    return {
      projectId: null,
      woke,
      result: {
        outcome: "CLARIFICATION",
        message: mention.names.length
          ? `Which job: ${mention.names.join("; ")}?`
          : "Name the job — McMillan, DeBoard, Ciurlizza, Carver, Pratt, Stewart, or Swiderski — then what happened.",
      },
    };
  }

  if (isStatusQuery(text) || /^(how'?s|status)\b/i.test(text)) {
    return {
      projectId: project.id,
      woke,
      result: {
        outcome: "CLARIFICATION",
        message: spokenBrief(project),
      },
    };
  }

  return {
    projectId: project.id,
    woke,
    result: interpretFinancial(project, text),
  };
}

export function progressLine(project: Project): string {
  return `${project.name} ${progressPercent(project)}%`;
}
