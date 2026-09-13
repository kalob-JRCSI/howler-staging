/**
 * Transcribed from Kalob Fayne's Drive doc
 * "KF Live PM Intelligence Dashboard — New Model v2"
 * (Google Doc, last modified 2026-09-11). Header still says Update 12 / Aug 17;
 * body is the September operating snapshot. Howler will not invent a budget,
 * an address, or a completed date from a target.
 */
import type { Activity, Contact, JobBook, Project, ScopeItem, SelectionItem } from "./types";
import { emptyBlueprint } from "./types";
import { emptyJob } from "./job";
import { ciurlizzaFinancials, mcmillanFinancials } from "./client-budgets";
import {
  carverBlueprint,
  ciurlizzaBlueprint,
  emptyEvidenceBlueprint,
  mcmillanBlueprint,
  mcmillanScope,
  PRATT_REFS,
  STEWART_REFS,
  SWIDERSKI_REFS,
} from "./plan-library";
import { CARVER_RULES, carverSowScope, CIURLIZZA_RULES, ciurlizzaSowScope, JR_SITE_RULES } from "./sow";

export const KF_SOURCE =
  "KF Live PM Intelligence Dashboard — New Model v2 · observed 2026-09-11";

function activity(input: Partial<Activity> & Pick<Activity, "id" | "name" | "phase" | "state">): Activity {
  return {
    trade: null,
    durationLikely: 3,
    committedStart: null,
    committedFinish: null,
    actualStart: null,
    actualFinish: null,
    predecessorId: null,
    locked: false,
    notes: null,
    ...input,
  };
}

function scope(input: Partial<ScopeItem> & Pick<ScopeItem, "id" | "description" | "phase">): ScopeItem {
  return {
    trade: null,
    included: true,
    complete: false,
    activityId: null,
    allowanceLineId: null,
    notes: null,
    fromBaseline: true,
    ...input,
  };
}

function contact(id: string, name: string, trade: string, notes: string | null = null): Contact {
  return { id, name, trade, phone: null, notes };
}

function selection(id: string, name: string, value: string | null, status: SelectionItem["status"], notes: string | null = null): SelectionItem {
  return { id, name, value, status, notes };
}

function job(patch: Partial<JobBook>): JobBook {
  return { ...emptyJob(), ...patch, inspections: { ...emptyJob().inspections, ...patch.inspections }, contacts: patch.contacts ?? {}, selections: patch.selections ?? {} };
}

function event(id: string, revision: number, note: string): Project["events"][number] {
  return { id, revision, type: "DASHBOARD_INGESTED", occurredAt: "2026-09-11T15:04:15.000Z", note, clerical: true };
}

function base(input: {
  id: string;
  name: string;
  clientName: string;
  projectType: string;
  healthBand: Project["healthBand"];
  paused?: boolean;
  heldPhases?: string[];
  dashboardNote: string;
  officialStart?: string | null;
  intendedFinish?: string | null;
  address?: string;
  financials?: Project["financials"];
  blueprint?: Project["blueprint"];
  revision?: number;
  activities: Record<string, Activity>;
  scopeItems: Record<string, ScopeItem>;
  job?: JobBook;
  events?: Project["events"];
}): Project {
  return {
    id: input.id,
    name: input.name,
    clientName: input.clientName,
    address: input.address ?? "Unknown",
    projectType: input.projectType,
    timezone: "America/New_York",
    revision: input.revision ?? 1,
    healthBand: input.healthBand,
    paused: input.paused ?? false,
    heldPhases: input.heldPhases ?? [],
    dashboardNote: input.dashboardNote,
    officialStart: input.officialStart ?? null,
    intendedFinish: input.intendedFinish ?? null,
    sourceLabel: KF_SOURCE,
    activities: input.activities,
    scopeItems: input.scopeItems,
    financials: input.financials ?? null,
    blueprint: input.blueprint ?? emptyBlueprint(),
    job: input.job ?? emptyJob(),
    events: input.events ?? [event(`evt-${input.id}-kf`, input.revision ?? 1, `Ingested from ${KF_SOURCE}.`)],
  };
}

export function stewart(): Project {
  return base({
    id: "stewart",
    name: "Stewart",
    clientName: "Stewart",
    address: "110 Creek Ridge Dr",
    projectType: "Final punch closeout",
    healthBand: "YELLOW",
    dashboardNote:
      "Bill Moore flooring estimate and cabinetry repair estimate pending. Cabinetry repairs block Artistic side-splash reinstall.",
    blueprint: emptyEvidenceBlueprint(
      STEWART_REFS,
      "Stewart Tile.pdf is in Drive. No floor-plan or tradewalk PDF named Stewart was found. Geometry stays Unknown.",
    ),
    activities: {
      "act-pollock": activity({
        id: "act-pollock",
        name: "Tom Pollock tile and handrail",
        phase: "Closeout",
        state: "COMPLETE",
        trade: "Tile",
        actualStart: "2026-09-03",
        actualFinish: "2026-09-03",
        notes: "Complete in CoConstruct and approved by Miss Stewart.",
      }),
      "act-dax": activity({
        id: "act-dax",
        name: "Dax Painting",
        phase: "Painting",
        state: "IN_PROGRESS",
        trade: "Painting",
        notes: "Remains active. Finish date Unknown.",
      }),
      "act-flooring": activity({
        id: "act-flooring",
        name: "Bill Moore flooring repair",
        phase: "Closeout",
        state: "IN_PROGRESS",
        trade: "Flooring",
        committedStart: "2026-09-08",
        notes: "Visited Sep 8. Estimate pending. Follow-up targeted Sep 10 — not confirmed received.",
      }),
      "act-cabinetry": activity({
        id: "act-cabinetry",
        name: "Cabinetry repairs",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Cabinetry",
        committedStart: "2026-09-09",
        predecessorId: "act-flooring",
        notes: "Site visit scheduled Sep 9. Estimate pending. Howler will not mark the visit complete from the schedule.",
      }),
      "act-splashes": activity({
        id: "act-splashes",
        name: "Artistic upstairs kitchen side splashes",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Surfaces",
        predecessorId: "act-cabinetry",
        notes: "Blocked on cabinetry repairs. Do not release Artistic until repairs are verified complete.",
      }),
    },
    scopeItems: {
      "scp-punch": scope({ id: "scp-punch", description: "Final punch closeout", phase: "Closeout", activityId: "act-dax" }),
      "scp-floor": scope({ id: "scp-floor", description: "Flooring repair (Bill Moore)", phase: "Closeout", activityId: "act-flooring" }),
      "scp-cab": scope({ id: "scp-cab", description: "Cabinetry repairs", phase: "Closeout", activityId: "act-cabinetry" }),
      "scp-splash": scope({ id: "scp-splash", description: "Artistic side-splash reinstall", phase: "Closeout", activityId: "act-splashes" }),
    },
    job: job({
      contacts: {
        "ct-moore": contact("ct-moore", "Bill Moore", "Flooring", "Visited Sep 8. Estimate pending."),
        "ct-artistic": contact("ct-artistic", "Artistic", "Surfaces", "Side splashes after cabinetry repairs."),
        "ct-pollock": contact("ct-pollock", "Tom Pollock", "Tile", "Tile and handrail complete / approved."),
        "ct-dax": contact("ct-dax", "Dax Painting", "Painting", "Ongoing."),
      },
    }),
  });
}

export function swiderski(): Project {
  return base({
    id: "swiderski",
    name: "Swiderski",
    clientName: "Swiderski",
    address: "1138 Payne Depot Rd",
    blueprint: emptyEvidenceBlueprint(
      SWIDERSKI_REFS,
      "Stanfield tile quote is in Drive. No floor-plan or tradewalk PDF named Swiderski was found. Geometry stays Unknown.",
    ),
    projectType: "Interior remodel — paint handoff",
    healthBand: "YELLOW",
    dashboardNote:
      "Meet Dylan Jasper: deliver selected paint, review Antle drywall, bathroom mirror removal, painting scope. Electrical finals wait on paint.",
    activities: {
      "act-tile": activity({
        id: "act-tile",
        name: "Bathroom tile",
        phase: "Finishes",
        state: "COMPLETE",
        trade: "Tile",
        notes: "Complete per dashboard.",
      }),
      "act-drywall": activity({
        id: "act-drywall",
        name: "Antle drywall — bath, living, foyer",
        phase: "Finishes",
        state: "COMPLETE",
        trade: "Drywall",
        notes: "Complete. Contract via email Jeffrey / Paul. Quality review with Dylan still due.",
      }),
      "act-paint": activity({
        id: "act-paint",
        name: "Dylan Jasper painting",
        phase: "Painting",
        state: "NOT_STARTED",
        trade: "Painting",
        predecessorId: "act-drywall",
        notes: "Selections confirmed (Paul Swiderski + Brittany). Do not start until drywall quality and mirror plan are resolved.",
      }),
      "act-elec-final": activity({
        id: "act-elec-final",
        name: "Electrical finals — bath, living, foyer",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Electrical",
        predecessorId: "act-paint",
        notes: "Dependent on completed paint.",
      }),
    },
    scopeItems: {
      "scp-drywall": scope({ id: "scp-drywall", description: "Drywall bath / living / foyer", phase: "Finishes", activityId: "act-drywall", complete: true }),
      "scp-paint": scope({ id: "scp-paint", description: "Painting", phase: "Painting", activityId: "act-paint" }),
      "scp-mirrors": scope({ id: "scp-mirrors", description: "Bathroom mirror removal / reinstall", phase: "Painting", notes: "Feasibility Unknown until Dylan review." }),
    },
    job: job({
      contacts: {
        "ct-dylan": contact("ct-dylan", "Dylan Jasper", "Painting", "On-site paint delivery and scope review."),
        "ct-antle": contact("ct-antle", "Tim Antle / Antle Drywall", "Drywall", "Bath, living, foyer complete. Quality review due."),
        "ct-paul": contact("ct-paul", "Paul Swiderski", "Owner", "Paint selections confirmed with Brittany."),
      },
      selections: {
        "sel-paint": selection("sel-paint", "Paint", "Confirmed — Paul Swiderski and Brittany", "SELECTED", "Colors not listed on the dashboard. Unknown until named."),
      },
    }),
  });
}

export function pratt(): Project {
  return base({
    id: "pratt",
    name: "Pratt",
    clientName: "Pratt",
    projectType: "Final closeout — paint before carpet and closets",
    healthBand: "YELLOW",
    dashboardNote:
      "Painting controls the sequence. Carpet One install date Unknown. Kenny closets after carpet. Gatsby Glass Wed Sep 16 1:00 p.m.",
    blueprint: emptyEvidenceBlueprint(
      PRATT_REFS,
      "No floor-plan or tradewalk PDF named Pratt was in Drive. Geometry stays Unknown.",
    ),
    activities: {
      "act-paint": activity({
        id: "act-paint",
        name: "Complete remaining painting",
        phase: "Painting",
        state: "IN_PROGRESS",
        trade: "Painting",
        notes: "Ms. Pratt requires all painting before carpet and closets. Completion date not committed.",
      }),
      "act-carpet": activity({
        id: "act-carpet",
        name: "Carpet One installation",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Flooring",
        predecessorId: "act-paint",
        notes: "Selected. Lindsay sent install price. Date Unknown — Howler will not invent one.",
      }),
      "act-closets": activity({
        id: "act-closets",
        name: "Kenny / Custom Closets Design",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Closets",
        predecessorId: "act-carpet",
        notes: "Materials expected that week. Initial install target the following week, after carpet.",
      }),
      "act-glass": activity({
        id: "act-glass",
        name: "Gatsby Glass shower-door template",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Glass",
        committedStart: "2026-09-16",
        committedFinish: "2026-09-16",
        notes: "Rescheduled Wednesday Sep 16 at 1:00 p.m.",
      }),
    },
    scopeItems: {
      "scp-paint": scope({ id: "scp-paint", description: "Remaining painting", phase: "Painting", activityId: "act-paint" }),
      "scp-carpet": scope({ id: "scp-carpet", description: "Carpet installation", phase: "Closeout", activityId: "act-carpet" }),
      "scp-closets": scope({ id: "scp-closets", description: "Custom closets", phase: "Closeout", activityId: "act-closets" }),
      "scp-glass": scope({ id: "scp-glass", description: "Shower door glass", phase: "Closeout", activityId: "act-glass" }),
    },
    job: job({
      permitStatus: "ISSUED",
      inspections: {
        "insp-final": {
          id: "insp-final",
          name: "Final",
          code: "R110",
          status: "READY",
          date: null,
          notes: "Fayette County final result still requires closeout documentation. Howler will not mark passed from that sentence.",
        },
      },
      contacts: {
        "ct-lindsay": contact("ct-lindsay", "Lindsay", "Carpet One", "Selection and install price confirmed. Date Unknown."),
        "ct-kenny": contact("ct-kenny", "Kenny", "Custom Closets Design", "Materials expected; install after paint + carpet."),
        "ct-gatsby": contact("ct-gatsby", "Gatsby Glass", "Glass", "Wed Sep 16 1:00 p.m. template."),
      },
      selections: {
        "sel-carpet": selection("sel-carpet", "Carpet", "Selected via Lindsay / Carpet One", "SELECTED", "Product name not on the dashboard."),
        "sel-walls": selection("sel-walls", "Walls", "Sherwin-Williams Balanced Beige SW 7037 eggshell; mildew-resistant bath", "SELECTED"),
        "sel-trim": selection("sel-trim", "Doors / trim", "Porter/PPG Velvet White semi-gloss", "SELECTED"),
        "sel-ceiling": selection("sel-ceiling", "Ceiling", "Velvet White flat", "SELECTED"),
        "sel-grout-w": selection("sel-grout-w", "Shower wall grout", "Bostik Mobe Pearl H145", "SELECTED"),
        "sel-grout-f": selection("sel-grout-f", "Shower floor / tub backsplash grout", "TEC Warm Taupe 973", "SELECTED"),
      },
    }),
  });
}

export function carver(): Project {
  return base({
    id: "carver",
    name: "Carver / Julian",
    clientName: "Carver, Craig & Julian, Augusta",
    address: "1035 Wil Rose Ln, Versailles KY 40383",
    projectType: "Two-bath remodel — final closeout",
    healthBand: "YELLOW",
    dashboardNote:
      "SOW work is in. Remaining closeout: Waylon Electric finals and Artistic vanities were scheduled Wed Sep 9 — not field-confirmed. Gatsby Glass templates Wed Sep 16 8:00–9:00 a.m.",
    revision: 5,
    blueprint: carverBlueprint(),
    activities: {
      "act-demo": activity({
        id: "act-demo",
        name: "Bath demolition",
        phase: "Demo",
        state: "COMPLETE",
        trade: "Demo",
        durationLikely: 5,
        notes: "Master: keep tub surround. Upstairs: full demo + expand into closet. Per SOW and hall/master design A02.",
      }),
      "act-frame": activity({
        id: "act-frame",
        name: "Framing / blocking / niche headers",
        phase: "Framing",
        state: "COMPLETE",
        trade: "Framing",
        durationLikely: 8,
        predecessorId: "act-demo",
        notes: "12×28 Schluter niche headers, grab-bar and glass blocking. A04 both sets.",
      }),
      "act-mech-rough": activity({
        id: "act-mech-rough",
        name: "Plumbing + electrical rough",
        phase: "Systems",
        state: "COMPLETE",
        trade: "MEP",
        durationLikely: 8,
        predecessorId: "act-frame",
        notes: "Rough is in. Electrical finals are a separate closeout card.",
      }),
      "act-drywall": activity({
        id: "act-drywall",
        name: "Drywall",
        phase: "Finishes",
        state: "COMPLETE",
        trade: "Drywall",
        durationLikely: 5,
        predecessorId: "act-mech-rough",
        notes: "Moisture-resistant in wet areas. Glue and screw.",
      }),
      "act-tile": activity({
        id: "act-tile",
        name: "Schluter + tile",
        phase: "Finishes",
        state: "COMPLETE",
        trade: "Tile",
        durationLikely: 10,
        predecessorId: "act-drywall",
        notes: "Look-ahead week of Aug 3 was tile finals. KF Sep 11 is closeout — tile is behind that.",
      }),
      "act-paint": activity({
        id: "act-paint",
        name: "Painting",
        phase: "Painting",
        state: "COMPLETE",
        trade: "Painting",
        durationLikely: 5,
        predecessorId: "act-tile",
        notes: "SOW paint for both baths. Vanity paint rides with Artistic.",
      }),
      "act-elec": activity({
        id: "act-elec",
        name: "Waylon Electric electrical finals",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Electrical",
        committedStart: "2026-09-09",
        committedFinish: "2026-09-09",
        predecessorId: "act-paint",
        notes: "Scheduled Sep 9. Dashboard did not confirm completion. Howler will not mark it done.",
      }),
      "act-vanity": activity({
        id: "act-vanity",
        name: "Artistic vanity installation",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Cabinetry",
        committedStart: "2026-09-09",
        committedFinish: "2026-09-09",
        predecessorId: "act-paint",
        notes: "Scheduled Sep 9. Completion Unknown.",
      }),
      "act-glass": activity({
        id: "act-glass",
        name: "Gatsby Glass shower-door template",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Glass",
        committedStart: "2026-09-16",
        committedFinish: "2026-09-16",
        notes: "Wednesday Sep 16, 8:00–9:00 a.m. Master and upstairs.",
      }),
    },
    scopeItems: carverSowScope(),
    job: job({
      permitStatus: "ISSUED",
      contacts: {
        "ct-waylon": contact("ct-waylon", "Waylon Electric", "Electrical", "Finals scheduled Sep 9."),
        "ct-artistic": contact("ct-artistic", "Artistic", "Cabinetry", "Vanities scheduled Sep 9."),
        "ct-gatsby": contact("ct-gatsby", "Gatsby Glass", "Glass", "Template Sep 16 8:00–9:00 a.m."),
      },
      rules: CARVER_RULES,
    }),
  });
}

export function ciurlizza(): Project {
  return base({
    id: "ciurlizza",
    name: "Ciurlizza",
    clientName: "Ciurlizza",
    address: "740 Andover Village Dr",
    financials: ciurlizzaFinancials(),
    blueprint: ciurlizzaBlueprint(),
    projectType: "Inspection recovery — Fayette County",
    healthBand: "RED",
    dashboardNote:
      "Fayette County inspection FAILED. 31-W fire stop Tue Sep 15. LVL docs (Marcus / 84 Lumber) and 2x4 strapping before reinspection Thu Sep 17. Drywall blocked.",
    activities: {
      "act-firestop": activity({
        id: "act-firestop",
        name: "31-W fire stop",
        phase: "Corrections",
        state: "NOT_STARTED",
        trade: "Firestopping",
        committedStart: "2026-09-15",
        committedFinish: "2026-09-15",
        notes: "Scheduled Tuesday Sep 15.",
      }),
      "act-lvl": activity({
        id: "act-lvl",
        name: "LVL specifications from Marcus / 84 Lumber",
        phase: "Corrections",
        state: "NOT_STARTED",
        trade: "Lumber",
        notes: "Documentation not received. Howler will not invent sizes.",
      }),
      "act-strap": activity({
        id: "act-strap",
        name: "2x4 wall strapping",
        phase: "Corrections",
        state: "NOT_STARTED",
        trade: "Framing",
        notes: "Required for reinspection. Completion Unknown.",
      }),
      "act-reinspect": activity({
        id: "act-reinspect",
        name: "Fayette County reinspection",
        phase: "Inspections",
        state: "NOT_STARTED",
        trade: null,
        committedStart: "2026-09-17",
        committedFinish: "2026-09-17",
        predecessorId: "act-firestop",
        notes: "Thursday Sep 17. Contingent on fire stop, LVL docs, and strapping.",
      }),
      "act-drywall-mat": activity({
        id: "act-drywall-mat",
        name: "Drywall material delivery",
        phase: "Finishes",
        state: "NOT_STARTED",
        trade: "Drywall",
        committedStart: "2026-09-18",
        predecessorId: "act-reinspect",
        notes: "Friday Sep 18. Held until passing reinspection.",
      }),
      "act-antle": activity({
        id: "act-antle",
        name: "Antle Drywall installation",
        phase: "Finishes",
        state: "NOT_STARTED",
        trade: "Drywall",
        committedStart: "2026-09-21",
        predecessorId: "act-drywall-mat",
        notes: "Monday Sep 21, contingent on county clearance.",
      }),
    },
    scopeItems: ciurlizzaSowScope(),
    job: job({
      permitStatus: "ISSUED",
      inspections: {
        "insp-framing": {
          id: "insp-framing",
          name: "Framing",
          code: "R602 / R502 / R802",
          status: "FAILED",
          date: null,
          notes: "Fayette County failed. Fire stop Sep 15. Reinspection Sep 17. Fail date not on the dashboard.",
        },
      },
      contacts: {
        "ct-yeiser": contact("ct-yeiser", "Yeiser Structural", "Engineering", "Dave Mills. Markup set Feb 26, 2026. Field-verify existing steel."),
        "ct-31w": contact("ct-31w", "31-W", "Firestopping", "On site Tue Sep 15."),
        "ct-marcus": contact("ct-marcus", "Marcus", "84 Lumber", "LVL specifications / documentation."),
        "ct-colin": contact("ct-colin", "Colin", "Builders First Choice", "Bay and egress windows — confirm ordered."),
        "ct-cox": contact("ct-cox", "Cox Interiors", "Doors", "Approved frosted pocket-door order."),
        "ct-antle": contact("ct-antle", "Antle Drywall", "Drywall", "Install Mon Sep 21 if county clears."),
      },
      rules: CIURLIZZA_RULES,
    }),
  });
}

export function mcmillan(): Project {
  return base({
    id: "mcmillan",
    name: "McMillan",
    clientName: "McMillan",
    address: "109 Caveson Way",
    financials: mcmillanFinancials(),
    blueprint: mcmillanBlueprint(),
    projectType: "Exterior closeout — interior held",
    healthBand: "GREEN",
    paused: false,
    heldPhases: ["Interior"],
    revision: 3,
    dashboardNote:
      "Exterior is closing out (Phase 1 porch). Concrete platform/sidewalk and Bonham circuit correction are still live — not marked complete from a target. Porch ceiling and column paint wait on approval. Interior remains held pending Stanfield vs Saul. Do not release interior work.",
    activities: {
      "act-concrete": activity({
        id: "act-concrete",
        name: "Concrete platform and sidewalk pour/stamp/color",
        phase: "Closeout",
        state: "IN_PROGRESS",
        trade: "Concrete",
        durationLikely: 2,
        notes:
          "KF Sep 3 IN_PROGRESS. Owner Sep 12: exterior is closing out. Field-confirm before marking complete.",
      }),
      "act-elec": activity({
        id: "act-elec",
        name: "Bonham Electric circuit correction",
        phase: "Electrical",
        state: "IN_PROGRESS",
        trade: "Electrical",
        durationLikely: 1,
        notes:
          "Light-pole / water-heater shared circuit. KF commercial signal $600. Proposed CO, not approved.",
      }),
      "act-porch": activity({
        id: "act-porch",
        name: "Phase 1 front porch closeout",
        phase: "Closeout",
        state: "IN_PROGRESS",
        trade: "Masonry",
        durationLikely: 4,
        notes:
          "SOW §2 + McMillanPorchsheet2.pdf A03 proposed 51'-7\" × 8'-6\". Owner: exterior portion is closing out.",
      }),
      "act-ceiling": activity({
        id: "act-ceiling",
        name: "Porch-ceiling renovation",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Carpentry",
        durationLikely: 3,
        notes: "Approval / committed dates not yet given. Howler will not invent them.",
      }),
      "act-columns": activity({
        id: "act-columns",
        name: "Column painting / columns to match rear",
        phase: "Closeout",
        state: "NOT_STARTED",
        trade: "Painting",
        durationLikely: 2,
        notes: "Material and size to confirm. Approval not yet given.",
      }),
      "act-compare": activity({
        id: "act-compare",
        name: "Stanfield vs Saul interior estimate comparison",
        phase: "Interior",
        state: "NOT_STARTED",
        durationLikely: 1,
        notes: "Stanfield estimate is in Drive Sep 10. Still compare vs Saul. Do not release interior work.",
      }),
    },
    scopeItems: mcmillanScope(),
    job: job({
      contacts: {
        "ct-stanfield": contact(
          "ct-stanfield",
          "David Stanfield",
          "Estimating",
          "Interior estimate in Drive Sep 10 (prepared for J&R). Compare vs Saul before releasing interior. Dollar total not extracted.",
        ),
        "ct-saul": contact("ct-saul", "Saul", "Estimating", "Compare against Stanfield."),
        "ct-bonham": contact(
          "ct-bonham",
          "Bonham Electric",
          "Electrical",
          "Circuit separation CO $600 proposed. Live closeout item.",
        ),
      },
      rules: JR_SITE_RULES,
    }),
    events: [
      {
        id: "evt-mcmillan-closeout",
        revision: 3,
        type: "DASHBOARD_CORRECTED",
        occurredAt: "2026-09-12T21:20:00.000Z",
        note: "Exterior is closing out. Whole-job pause lifted. Interior stays held. Progress reads released porch work, not the paused interior.",
        clerical: true,
      },
      event("evt-mcmillan-kf", 1, `Ingested from ${KF_SOURCE}.`),
    ],
  });
}

export function craven(): Project {
  return base({
    id: "craven",
    name: "Craven",
    clientName: "Craven",
    address: "Unknown",
    projectType: "Unknown",
    healthBand: "YELLOW",
    dashboardNote:
      "Live howler-dashboard job. Status, next call, and address stay Unknown until the dashboard row supplies them — Howler will not invent them.",
    activities: {},
    scopeItems: {},
  });
}

export function kfProjects(): Record<string, Project> {
  return {
    "stewart": stewart(),
    "swiderski": swiderski(),
    "pratt": pratt(),
    carver: carver(),
    "ciurlizza": ciurlizza(),
    "mcmillan": mcmillan(),
    craven: craven(),
  };
}
