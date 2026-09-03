// Derived DebriefItem view and source-freshness classification.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// "Source freshness" and "Debrief item view" sections, and
// docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md Tasks 7-8.

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
  if (supersededBy && supersededBy.tense === "PAST") {
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
