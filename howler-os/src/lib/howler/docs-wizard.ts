import { computeFindings, financialSummary } from "./derive";
import { computePlanFindings, engineerRequired } from "./ky-code";
import { envelopeComplete } from "./layout";
import type { Project } from "./types";
import { ensureBlueprint } from "./types";
import { ensureJob } from "./job";

export type DocStatus = "READY" | "WATCH" | "MISSING";

export interface DocItem {
  id: string;
  title: string;
  why: string;
  next: string;
  status: DocStatus;
  moduleId: string;
}

export function documentationNeeds(project: Project): DocItem[] {
  const bp = ensureBlueprint(project);
  const summary = financialSummary(project);
  const findings = computeFindings(project);
  const planFindings = computePlanFindings(project);
  const engineer = engineerRequired(project);
  const issued = project.events.some((event) => event.type === "BLUEPRINT_SET_ISSUED");
  const job = ensureJob(project);
  const inspectionsPassed = Object.values(job.inspections).filter((item) => item.status === "PASSED").length;
  const scopeIncluded = Object.values(project.scopeItems).filter((item) => item.included);
  const unscoped = scopeIncluded.filter((item) => !item.activityId);
  const unpriced = findings.filter(
    (finding) => finding.kind === "DRAFT_CO_UNPRICED" || finding.kind === "PENDING_CO_UNPRICED",
  );
  const committedSchedule = Object.values(project.activities).filter(
    (activity) => activity.committedStart && activity.committedFinish,
  );

  const items: DocItem[] = [
    {
      id: "scope",
      title: "Scope of work",
      why: "A job cannot close on a notepad. Included work has to be named so budget, schedule, and drawings point at the same thing.",
      next: scopeIncluded.length
        ? unscoped.length
          ? `Tie ${unscoped.length} included item${unscoped.length === 1 ? "" : "s"} to a schedule activity.`
          : "Scope is named. Keep it current when the field changes."
        : "Record included work on Scope.",
      status: scopeIncluded.length === 0 ? "MISSING" : unscoped.length ? "WATCH" : "READY",
      moduleId: "scope",
    },
    {
      id: "budget",
      title: "Budget baseline",
      why: "Unknown is allowed. Zero is a lie. Original / approved / revised have to exist before a number can move.",
      next: summary?.baseline
        ? "Baseline is recorded. Price COs before they inflate Revised."
        : "Initialize Budget and set the original baseline.",
      status: summary?.baseline ? "READY" : "MISSING",
      moduleId: "budget",
    },
    {
      id: "schedule",
      title: "Committed schedule",
      why: "Forecast is derived. Committed dates are the contract with the field.",
      next:
        committedSchedule.length >= 3
          ? "Committed dates are in. Protect in-progress work."
          : "Commit start/finish on the remaining activities.",
      status: committedSchedule.length >= 3 ? "READY" : committedSchedule.length ? "WATCH" : "MISSING",
      moduleId: "schedule",
    },
    {
      id: "drawings",
      title: "Source drawings on Drive",
      why: "A job needs the visual Tradewalk / structural set named, not a notepad sketch. Howler records the file. It does not invent a size from it.",
      next: (ensureBlueprint(project).evidence ?? []).some(
        (item) => item.kind === "TRADEWALK" || item.kind === "STRUCTURAL",
      )
        ? "Named drawing set is on Documents. Open the Drive file to read the sheets."
        : "No Tradewalk or structural PDF named for this job was in Drive.",
      status: (ensureBlueprint(project).evidence ?? []).some(
        (item) => item.kind === "TRADEWALK" || item.kind === "STRUCTURAL",
      )
        ? "READY"
        : "WATCH",
      moduleId: "documents",
    },
    {
      id: "envelope",
      title: "Building envelope",
      why: "Working drawings cannot invent a 24×32. Width, depth, wall height, and pitch are field facts.",
      next: envelopeComplete(bp)
        ? bp.eaveHeightIn && bp.roofRise
          ? "Envelope is recorded."
          : "Record wall height and rise over run."
        : "Enter width by depth. Howler will not guess.",
      status:
        envelopeComplete(bp) && bp.eaveHeightIn && bp.roofRise
          ? "READY"
          : envelopeComplete(bp)
            ? "WATCH"
            : "MISSING",
      moduleId: "plans",
    },
    {
      id: "jurisdiction",
      title: "Kentucky jurisdiction",
      why: "Snow, wind, and weathering come from KRC Table R301.2(1) by county. Street address is not a county.",
      next: bp.county
        ? `${bp.county} County · ${bp.groundSnowLoadPsf ?? "?"} psf ground snow.`
        : "Name the county. Do not guess it from the street.",
      status: bp.county ? "READY" : "MISSING",
      moduleId: "plans",
    },
    {
      id: "framing",
      title: "Framing layout",
      why: "Stud and joist spacing is how the field lays out plates. Empty stays Unknown.",
      next:
        bp.studSize && bp.studSpacingIn
          ? `${bp.studSize} @ ${bp.studSpacingIn}" · joists ${bp.joistSize ?? "Unknown"}.`
          : "Enter stud size and on-center, or ask Howler for conventional fill of empty fields only.",
      status: bp.studSize && bp.studSpacingIn ? "READY" : "WATCH",
      moduleId: "plans",
    },
    {
      id: "engineer",
      title: "Engineer-plan needs",
      why: "KRC R301.1.3: conventional tables are not a stamp. Exceeding a span or R327 post-frame limits is an engineer conversation.",
      next: engineer.length
        ? engineer.map((finding) => finding.title).join(" · ")
        : planFindings.some((finding) => finding.severity === "WATCH")
          ? "Watch items remain on Plans. AHJ still governs."
          : "No tabulated exceedance on the recorded envelope.",
      status: engineer.length ? "WATCH" : "READY",
      moduleId: "plans",
    },
    {
      id: "permit",
      title: "Permit / inspections",
      why: "The AHJ card is separate from the working set. Howler will not mark an inspection passed unless you said it passed.",
      next:
        job.permitStatus === "ISSUED"
          ? `Permit issued${job.permitNumber ? ` ${job.permitNumber}` : ""}. ${inspectionsPassed}/${Object.keys(job.inspections).length} inspections passed.`
          : job.permitStatus === "SUBMITTED"
            ? "Permit submitted. Record the number when the AHJ issues it."
            : "Permit not filed. R106 package still missing a site plan.",
      status: job.permitStatus === "ISSUED" ? "READY" : job.permitStatus === "SUBMITTED" ? "WATCH" : "MISSING",
      moduleId: "inspections",
    },
    {
      id: "changes",
      title: "Change orders priced",
      why: "An unpriced draft is a conversation, not money. Pending never inflates Revised.",
      next: unpriced.length
        ? `Price or void ${unpriced.length} open change order${unpriced.length === 1 ? "" : "s"}.`
        : "No unpriced COs.",
      status: unpriced.length ? "WATCH" : "READY",
      moduleId: "change-orders",
    },
    {
      id: "issued",
      title: "Working-drawing set issued",
      why: "A PDF / share link is how the field and the designer look at the same sheet. Guests never enter Howler.",
      next: issued
        ? "A set has been issued. Re-issue when the envelope changes."
        : "Export PDF or open a drawing session when the sheets are ready to leave the office.",
      status: issued ? "READY" : envelopeComplete(bp) ? "WATCH" : "MISSING",
      moduleId: "plans",
    },
  ];

  return items;
}

export function closeoutLine(project: Project): string {
  const items = documentationNeeds(project);
  const missing = items.filter((item) => item.status === "MISSING").length;
  const watch = items.filter((item) => item.status === "WATCH").length;
  if (missing === 0 && watch === 0) return "Documentation is complete enough to move. AHJ and PE still govern stamps.";
  if (missing === 0) return `${watch} documentation item${watch === 1 ? "" : "s"} still need a home before closeout.`;
  return `${missing} required document${missing === 1 ? "" : "s"} missing · ${watch} watch. Howler will not pretend this is a notepad.`;
}
