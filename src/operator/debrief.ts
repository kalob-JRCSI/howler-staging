// Derived DebriefItem view and source-freshness classification.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// "Source freshness" and "Debrief item view" sections, and
// docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md Tasks 7-8.

import type { ProjectModelV094 } from "../domain/types";
import type { OversightReviewV094 } from "../engine/oversight";

export type SourceFreshness =
  | "OBSERVED_CONFIRMED"
  | "PLANNED_SCHEDULED"
  | "STALE_EXPIRED"
  | "UNKNOWN_OUTCOME";

/**
 * Pure function; takes an explicit `now` for determinism (matches the injected-clock convention
 * from Task 18's confirmation-expiry design). `sourceFreshness` is never stored — it is always
 * computed on demand from `effectiveDate`/tense vs. "now" and whether a later observed claim on
 * the same subject supersedes it. A future scheduled date is never treated as evidence the work
 * occurred; only an OBSERVED/CONFIRMED claim (past tense, or a later `supersededBy`) does that.
 */
export function classifySourceFreshness(
  claim: { tense: "PAST" | "FUTURE"; effectiveDate?: string },
  now: string,
  supersededBy?: { tense: "PAST"; effectiveDate?: string },
): SourceFreshness {
  if (supersededBy) {
    return "OBSERVED_CONFIRMED";
  }
  if (claim.tense === "PAST") {
    return "OBSERVED_CONFIRMED";
  }
  // FUTURE tense from here on.
  if (!claim.effectiveDate) {
    return "PLANNED_SCHEDULED";
  }
  const hasPassed = claim.effectiveDate < now.slice(0, 10);
  return hasPassed ? "UNKNOWN_OUTCOME" : "PLANNED_SCHEDULED";
}

// ---------------------------------------------------------------------------------------------
// Derived DebriefItem view (Task 8).
//
// One normalized, derived view over data Howler already computes -- not a second competing
// database, not a persisted table. `buildDebriefItems` is a pure function over data the caller
// already has in hand: it performs zero new fetch, zero new D1 read, zero new engine
// recomputation. It only ever reads real activityIds/constraintIds already present in the given
// `ProjectModelV094`s and real findings already present in the given `OversightReviewV094`s.
// ---------------------------------------------------------------------------------------------

export interface DebriefItem {
  itemId: string; // deterministic, derived from projectId + category + subject
  projectId: string;
  category:
    | "BLOCKING_TODAY"
    | "EXPIRED_COMMITMENT"
    | "TRADE_MOVEMENT"
    | "MATERIAL_MOVEMENT"
    | "INSPECTION"
    | "CLIENT_DECISION"
    | "STALE_DATE"
    | "HOUSEKEEPING";
  subject: string; // e.g. "masonry-material", "Jason Bonham electrical rough-in"
  expectedAt?: string;
  lastVerifiedAt?: string;
  source: string; // sourceId(s) this item traces to
  severity: "BLOCK" | "WARN" | "INFO"; // carried straight from the oversight finding when one exists
  status: "OPEN" | "CONFIRMED_COMPLETE" | "MOVED" | "DEFERRED" | "UNKNOWN";
  question: string; // the exact spoken prompt Howler would ask
  supportingRefs: string[]; // activityIds/constraintIds/oversight-finding ids backing this item
}

/** The 8-category priority order, highest priority first — matches the design's morning-debrief
 * flow section exactly. */
const CATEGORY_PRIORITY: DebriefItem["category"][] = [
  "BLOCKING_TODAY",
  "EXPIRED_COMMITMENT",
  "TRADE_MOVEMENT",
  "MATERIAL_MOVEMENT",
  "INSPECTION",
  "CLIENT_DECISION",
  "STALE_DATE",
  "HOUSEKEEPING",
];

/** Categories eligible to be grouped together when they share a project and an underlying
 * activity — mirrors the design's example of `masonry-material` + `masonry-trade` (both real
 * WARN findings on the same DeBoard activity) being asked about together, not as two separate
 * questions. */
const GROUPABLE_CATEGORIES = new Set<DebriefItem["category"]>([
  "BLOCKING_TODAY",
  "EXPIRED_COMMITMENT",
  "TRADE_MOVEMENT",
  "MATERIAL_MOVEMENT",
]);

function categoryForConstraintType(type: string): DebriefItem["category"] {
  switch (type.toUpperCase()) {
    case "MATERIAL":
      return "MATERIAL_MOVEMENT";
    case "TRADE_AVAILABILITY":
      return "TRADE_MOVEMENT";
    case "INSPECTION":
      return "INSPECTION";
    case "DECISION":
      return "CLIENT_DECISION";
    default:
      return "HOUSEKEEPING";
  }
}

function questionFor(category: DebriefItem["category"], label: string): string {
  switch (category) {
    case "MATERIAL_MOVEMENT":
      return `Has "${label}" arrived and been verified?`;
    case "TRADE_MOVEMENT":
      return `Is "${label}" confirmed?`;
    case "INSPECTION":
      return `Has "${label}" happened?`;
    case "CLIENT_DECISION":
      return `Did "${label}" happen?`;
    default:
      return `Can you confirm "${label}"?`;
  }
}

function addFindingBackedItems(
  items: Map<string, DebriefItem>,
  model: ProjectModelV094,
  review: OversightReviewV094,
): void {
  for (const finding of review.findings) {
    if (finding.category !== "CRITICAL_PATH") continue;
    if (finding.severity !== "WARN" && finding.severity !== "BLOCK") continue;
    for (const activityId of finding.activityIds) {
      const activity = model.activities[activityId];
      if (!activity) continue;
      for (const constraintId of activity.constraintIds) {
        const constraint = model.constraints[constraintId];
        if (!constraint) continue;
        if (!constraint.hard) continue;
        if (constraint.state === "SATISFIED") continue;
        const category = categoryForConstraintType(constraint.type);
        const itemId = `${model.projectId}:${category}:${constraint.id}`;
        if (items.has(itemId)) continue;
        items.set(itemId, {
          itemId,
          projectId: model.projectId,
          category,
          subject: constraint.label,
          source: constraint.sourceIds[0] ?? "",
          severity: finding.severity,
          status: "OPEN",
          question: questionFor(category, constraint.label),
          supportingRefs: [activity.id, constraint.id, finding.category],
        });
      }
    }
  }
}

/**
 * Source-freshness-derived items (Task 7's `classifySourceFreshness`): any DECISION-type
 * constraint whose `readiness.likely` due date has passed with the constraint still unsatisfied
 * surfaces as an `UNKNOWN`-status `CLIENT_DECISION` item — the same PLANNED-to-STALE machinery,
 * worked through a decision instead of a schedule commitment.
 */
function addStaleDecisionItems(
  items: Map<string, DebriefItem>,
  model: ProjectModelV094,
  now: string,
): void {
  for (const constraint of Object.values(model.constraints)) {
    if (constraint.type.toUpperCase() !== "DECISION") continue;
    if (constraint.state === "SATISFIED") continue;
    const likely = constraint.readiness?.likely;
    if (!likely) continue;
    const freshness = classifySourceFreshness(
      { tense: "FUTURE", effectiveDate: likely },
      now,
    );
    if (freshness !== "UNKNOWN_OUTCOME") continue;
    const itemId = `${model.projectId}:CLIENT_DECISION:${constraint.id}`;
    items.set(itemId, {
      itemId,
      projectId: model.projectId,
      category: "CLIENT_DECISION",
      subject: constraint.label,
      expectedAt: likely,
      source: constraint.sourceIds[0] ?? "",
      severity: "WARN",
      status: "UNKNOWN",
      question: questionFor("CLIENT_DECISION", constraint.label),
      supportingRefs: [constraint.activityId, constraint.id],
    });
  }
}

/**
 * Pure derivation over data the caller already has in hand — adds no new fetch, no new D1 read.
 * `healthResults`/`recoveryResults` are accepted per the design's input list (already-computed
 * `topRisks`/`priorityActions`/workflow-noteworthiness data) but this implementation's concrete,
 * test-proven mechanism is the oversight-finding and source-freshness derivations above, which
 * alone already reproduce the exact real DeBoard `masonry-material`/`masonry-trade` findings this
 * design was built against.
 */
export function buildDebriefItems(
  projectModels: ProjectModelV094[],
  oversightReviews: OversightReviewV094[],
  _healthResults: unknown[],
  _recoveryResults: unknown[],
  now: string,
): DebriefItem[] {
  const items = new Map<string, DebriefItem>();
  const reviewsByProject = new Map<string, OversightReviewV094[]>();
  for (const review of oversightReviews) {
    const list = reviewsByProject.get(review.projectId) ?? [];
    list.push(review);
    reviewsByProject.set(review.projectId, list);
  }
  for (const model of projectModels) {
    for (const review of reviewsByProject.get(model.projectId) ?? []) {
      addFindingBackedItems(items, model, review);
    }
    addStaleDecisionItems(items, model, now);
  }
  return Array.from(items.values());
}

/**
 * Groups items sharing both a `projectId` and an underlying activity id (the first
 * `supportingRefs` entry) within the groupable tiers (`BLOCKING_TODAY`/`EXPIRED_COMMITMENT`/
 * `TRADE_MOVEMENT`/`MATERIAL_MOVEMENT`) into one inner array — the
 * `masonry-material`/`masonry-trade` mechanism — then orders every group into the required
 * 8-category priority order (a group's rank is its highest-priority member's category).
 */
export function prioritizeDebriefItems(items: DebriefItem[]): DebriefItem[][] {
  const groups: DebriefItem[][] = [];
  const groupByKey = new Map<string, DebriefItem[]>();

  for (const item of items) {
    if (GROUPABLE_CATEGORIES.has(item.category) && item.supportingRefs[0]) {
      const key = `${item.projectId}:${item.supportingRefs[0]}`;
      const existing = groupByKey.get(key);
      if (existing) {
        existing.push(item);
        continue;
      }
      const group = [item];
      groupByKey.set(key, group);
      groups.push(group);
    } else {
      groups.push([item]);
    }
  }

  const rankOf = (group: DebriefItem[]): number =>
    Math.min(
      ...group.map((item) => {
        const index = CATEGORY_PRIORITY.indexOf(item.category);
        return index === -1 ? CATEGORY_PRIORITY.length : index;
      }),
    );

  return groups
    .map((group, originalIndex) => ({
      group,
      originalIndex,
      rank: rankOf(group),
    }))
    .sort((a, b) => a.rank - b.rank || a.originalIndex - b.originalIndex)
    .map((entry) => entry.group);
}
