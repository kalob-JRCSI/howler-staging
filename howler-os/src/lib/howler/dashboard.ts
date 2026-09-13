import { emptyJob } from "./job";
import { emptyBlueprint } from "./types";
import type { HealthBand, Project } from "./types";

export const LIVE_PROJECT_IDS = [
  "stewart",
  "swiderski",
  "pratt",
  "carver",
  "ciurlizza",
  "deboard",
  "mcmillan",
  "craven",
] as const;

export type LiveProjectId = (typeof LIVE_PROJECT_IDS)[number];

export const SKIP_PROJECT_NAMES = [/smith/, /deboard-v09\b/, /deboard-v091/];

export type DashboardRow = {
  id?: string | number;
  name?: string | null;
  status?: string | null;
  blocker?: string | null;
  action?: string | null;
  next_call?: string | null;
  updated_at?: string | null;
  address?: string | null;
  phone?: string | null;
  project_type?: string | null;
  status_note?: string | null;
  completed_at?: string | null;
  project_id?: string | null;
  revision?: number | null;
  current_model_json?: string | null;
};

export function slugFromName(name: string | null | undefined): LiveProjectId | null {
  const n = (name ?? "").toLowerCase();
  if (SKIP_PROJECT_NAMES.some((re) => re.test(n))) return null;
  if (n.includes("stewart")) return "stewart";
  if (n.includes("swider")) return "swiderski";
  if (n.includes("pratt")) return "pratt";
  if (n.includes("carver") || n.includes("julian")) return "carver";
  if (n.includes("ciurlizza")) return "ciurlizza";
  if (n.includes("deboard") || n.includes("de board") || n.includes("debord")) return "deboard";
  if (n.includes("mcmillan") || n.includes("macmillan")) return "mcmillan";
  if (n.includes("craven")) return "craven";
  return null;
}

export function slugFromProjectId(value: string | null | undefined): LiveProjectId | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "deboard-v09" || raw === "deboard-v091") return "deboard";
  if ((LIVE_PROJECT_IDS as readonly string[]).includes(raw)) return raw as LiveProjectId;
  return slugFromName(raw.replace(/-v\d+$/, ""));
}

export function healthFromStatus(status: string | null | undefined, blocker: string | null | undefined): HealthBand {
  const s = (status ?? "").toUpperCase();
  if (/\bRED\b/.test(s) || s.includes("BLOCKED")) return "RED";
  if (/\bGREEN\b/.test(s)) return "GREEN";
  if (/\bYELLOW\b/.test(s)) return "YELLOW";
  if ((blocker ?? "").trim()) return "YELLOW";
  return "YELLOW";
}

function dashboardNote(row: DashboardRow): string | null {
  const parts = [row.status_note, row.blocker, row.action, row.next_call]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function projectFromDashboardRow(row: DashboardRow, slug: LiveProjectId): Project {
  const name = (row.name ?? slug).trim() || slug;
  const phone = (row.phone ?? "").trim();
  return {
    id: slug,
    name,
    clientName: name,
    address: (row.address ?? "").trim() || "Unknown",
    projectType: (row.project_type ?? "").trim() || "Unknown",
    timezone: "America/New_York",
    revision: typeof row.revision === "number" ? row.revision : 0,
    healthBand: healthFromStatus(row.status, row.blocker),
    paused: false,
    heldPhases: [],
    dashboardNote: dashboardNote(row),
    officialStart: null,
    intendedFinish: null,
    sourceLabel: "howler-dashboard",
    activities: {},
    scopeItems: {},
    financials: null,
    blueprint: emptyBlueprint(),
    job: {
      ...emptyJob(),
      contacts: phone
        ? {
            "ct-site": {
              id: "ct-site",
              name: name,
              trade: "Site",
              phone,
              notes: null,
            },
          }
        : {},
    },
    events: [
      {
        id: `evt-${slug}-dashboard`,
        revision: 0,
        type: "DASHBOARD_INGESTED",
        occurredAt: row.updated_at || new Date().toISOString(),
        note: "Loaded from howler-dashboard. Howler will not invent missing fields.",
        clerical: true,
      },
    ],
  };
}

export function overlayDashboard(seed: Project, row: DashboardRow, slug: LiveProjectId): Project {
  const fromRow = projectFromDashboardRow(row, slug);
  const note = dashboardNote(row);
  const phone = (row.phone ?? "").trim();
  return {
    ...seed,
    id: slug,
    name: fromRow.name || seed.name,
    clientName: seed.clientName || fromRow.clientName,
    address: fromRow.address !== "Unknown" ? fromRow.address : seed.address,
    projectType: fromRow.projectType !== "Unknown" ? fromRow.projectType : seed.projectType,
    healthBand: row.status ? fromRow.healthBand : seed.healthBand,
    dashboardNote: note ?? seed.dashboardNote,
    sourceLabel: seed.sourceLabel,
    job: {
      ...seed.job,
      contacts:
        phone && !Object.values(seed.job.contacts).some((contact) => contact.phone === phone)
          ? {
              ...seed.job.contacts,
              "ct-dashboard": {
                id: "ct-dashboard",
                name: fromRow.name,
                trade: "Site",
                phone,
                notes: "From howler-dashboard",
              },
            }
          : seed.job.contacts,
    },
  };
}
