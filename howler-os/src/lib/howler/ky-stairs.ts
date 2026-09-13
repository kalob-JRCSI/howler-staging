/**
 * 2018 Kentucky Residential Code stair geometry.
 * KRC adopts the 2015 IRC with Kentucky amendments. The ones that bite:
 *   R311.7.5.1 riser max 8¼"  (vanilla IRC 2015/2018 is 7¾")
 *   R311.7.5.2 tread min 9"    (vanilla IRC is 10")
 * Richmond KY Building Inspection publishes the same numbers (Deboard AHJ).
 * Howler will not invent a run, width, or direction.
 */
import type { Blueprint } from "./types";
import { formatFtIn, nominalDepthIn } from "./layout";

export const KY_STAIR = {
  maxRiserIn: 8.25,
  minTreadIn: 9,
  minWidthIn: 36,
  clearOneHandrailIn: 31.5,
  clearTwoHandrailIn: 27,
  handrailProjectionIn: 4.5,
  minHeadroomIn: 80,
  maxFlightRiseIn: 147,
  maxVariationIn: 0.375,
  nosingMinIn: 0.75,
  nosingMaxIn: 1.25,
  nosingRadiusMaxIn: 0.5625,
  nosingNotRequiredTreadIn: 11,
  openRiserSphereIn: 4,
  handrailMinIn: 34,
  handrailMaxIn: 38,
  handrailRequiredRisers: 4,
  landingStraightIn: 36,
  guardMinIn: 36,
  guardOnStairsMinIn: 34,
  /** Vanilla IRC — do not use these for a Kentucky job. */
  ircMaxRiserIn: 7.75,
  ircMinTreadIn: 10,
} as const;

export interface StairProposal {
  wallHeightIn: number;
  joistDepthIn: number | null;
  /** Wall + joist only. Subfloor is not added. */
  proposedRiseIn: number;
  minRisers: number;
  riserHeightIn: number;
  minGoingIn: number;
  treads: number;
  provenance: "PROPOSED";
  note: string;
}

export function minRisersForRise(riseIn: number): number {
  if (!(riseIn > 0)) return 0;
  return Math.ceil(riseIn / KY_STAIR.maxRiserIn - 1e-9);
}

export function riserHeightIn(riseIn: number, risers: number): number | null {
  if (!(risers > 0) || !(riseIn > 0)) return null;
  return riseIn / risers;
}

export function minGoingIn(risers: number): number {
  if (risers < 2) return 0;
  return (risers - 1) * KY_STAIR.minTreadIn;
}

export function proposedStairFromWalls(bp: Blueprint): StairProposal | null {
  if (bp.eaveHeightIn == null || bp.eaveHeightIn <= 0) return null;
  const joistDepthIn = bp.joistSize ? nominalDepthIn(bp.joistSize) : null;
  const proposedRiseIn = bp.eaveHeightIn + (joistDepthIn ?? 0);
  const minRisers = minRisersForRise(proposedRiseIn);
  const height = riserHeightIn(proposedRiseIn, minRisers) ?? 0;
  const treads = Math.max(0, minRisers - 1);
  const note = joistDepthIn
    ? `${formatFtIn(bp.eaveHeightIn)} walls + ${bp.joistSize} (${formatFtIn(joistDepthIn)}) — subfloor not added`
    : `${formatFtIn(bp.eaveHeightIn)} walls — floor assembly Unknown, not added`;
  return {
    wallHeightIn: bp.eaveHeightIn,
    joistDepthIn,
    proposedRiseIn,
    minRisers,
    riserHeightIn: height,
    minGoingIn: minGoingIn(minRisers),
    treads,
    provenance: "PROPOSED",
    note,
  };
}

export function stairCodeSummary(bp: Blueprint): string {
  const proposal = proposedStairFromWalls(bp);
  const bits = [
    "Kentucky stair code is the 2018 KRC (2015 IRC with KY amendments), not vanilla IRC.",
    `Riser max 8¼ in (R311.7.5.1) — IRC is 7¾ in. Do not use 7¾ on this job.`,
    `Tread min 9 in (R311.7.5.2) — IRC is 10 in. Do not use 10 as the Kentucky minimum.`,
    "Width 36 in clear (R311.7.1). Headroom 6'-8\" (R311.7.2). Uniformity ⅜ in (R311.7.5).",
    "Handrail 34–38 in on any flight of 4 or more risers (R311.7.8).",
    "Landing 36 in in the direction of travel on a straight run (R311.7.6). Exception: no landing at the top of an interior / enclosed-garage flight if a door does not swing over the stairs.",
    "Max 147 in between floors or landings (R311.7.3). Richmond Building Inspection publishes the same numbers.",
  ];
  if (proposal) {
    bits.push(
      `From recorded walls: ${proposal.note} → proposed floor-to-floor ${formatFtIn(proposal.proposedRiseIn)} needs at least ${proposal.minRisers} risers at ${proposal.riserHeightIn.toFixed(2)}" and ${formatFtIn(proposal.minGoingIn)} of going (${proposal.treads} treads × 9"). That is PROPOSED, not a field measurement. Run, width, and direction stay Unknown until you place them.`,
    );
  } else {
    bits.push("Floor-to-floor is Unknown — Howler will not invent a stringer.");
  }
  return bits.join(" ");
}

export function stairLimitRows(bp: Blueprint): { label: string; value: string; code: string }[] {
  const proposal = proposedStairFromWalls(bp);
  const rows = [
    { label: "WIDTH", value: `36" clear min`, code: "R311.7.1" },
    { label: "RISER", value: `8¼" max · KY (not IRC 7¾")`, code: "R311.7.5.1" },
    { label: "TREAD", value: `9" min · KY (not IRC 10")`, code: "R311.7.5.2" },
    { label: "HEADROOM", value: `6'-8"`, code: "R311.7.2" },
    { label: "HANDRAIL", value: `34–38" if 4+ risers`, code: "R311.7.8" },
    { label: "LANDING", value: `36" straight run`, code: "R311.7.6" },
    { label: "FLIGHT", value: `147" max between floors`, code: "R311.7.3" },
  ];
  if (proposal) {
    rows.push({
      label: "THIS JOB",
      value: `${proposal.minRisers} risers · going ≥ ${formatFtIn(proposal.minGoingIn)} PROP`,
      code: "PROPOSED",
    });
  } else {
    rows.push({ label: "THIS JOB", value: "Run Unknown — not invented", code: "R311.7" });
  }
  return rows;
}
