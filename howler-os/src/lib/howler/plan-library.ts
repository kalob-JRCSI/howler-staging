/**
 * Drive drawing / scope references for the seven live jobs.
 * Named files only. Unnamed PDFs that belong to other addresses stay unmatched.
 * Visual Tradewalk sets found 2026-09-12 in Kalob / J&R Drive — recorded, not scaled.
 */
import {
  emptyBlueprint,
  type Blueprint,
  type DrawingSheetRef,
  type EvidenceKind,
  type EvidenceRecord,
  type ScopeItem,
} from "./types";

export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function driveDocUrl(fileId: string): string {
  return `https://docs.google.com/document/d/${fileId}/edit`;
}

export function ref(
  id: string,
  name: string,
  kind: EvidenceKind,
  note: string,
  fileId: string,
  extra: Partial<Pick<EvidenceRecord, "issued" | "sheets" | "previewSrc" | "url" | "storedSrc">> = {},
): EvidenceRecord {
  return {
    id,
    name,
    kind,
    note,
    url: extra.url ?? driveFileUrl(fileId),
    fileId,
    issued: extra.issued ?? null,
    sheets: extra.sheets,
    previewSrc: extra.previewSrc ?? null,
    storedSrc: extra.storedSrc ?? null,
  };
}

const DEBOARD_SHEETS: DrawingSheetRef[] = [
  { number: "A01", title: "Proposed 1st floor plan" },
  { number: "A02", title: "Proposed attic plan" },
  { number: "A03", title: "Foundation plan" },
  { number: "A04", title: "Elevations" },
  { number: "A05", title: "Building section" },
  { number: "A06", title: "Wall section detail" },
  { number: "A07", title: "Attic floor framing" },
  { number: "A08", title: "Roof framing plan" },
  { number: "A09", title: "Electric plan (garage)" },
  { number: "A10", title: "Electric plan (attic)" },
  { number: "A11", title: "Plumbing plan" },
  { number: "A15", title: "Wall framing" },
];

const CIURLIZZA_KITCHEN_SHEETS: DrawingSheetRef[] = [
  { number: "A01", title: "Existing floor plan" },
  { number: "A02", title: "Demo plan" },
  { number: "A03", title: "Proposed floor plan" },
  { number: "A04", title: "Framing plan" },
];

const CIURLIZZA_BASEMENT_SHEETS: DrawingSheetRef[] = [
  { number: "A01", title: "Existing floor plan" },
  { number: "A02", title: "Demo plan" },
  { number: "A03", title: "Proposed floor plan" },
  { number: "A04", title: "Framing plan" },
  { number: "A05", title: "Electric plan" },
  { number: "A06", title: "Plumbing plan" },
  { number: "A07", title: "3D view" },
  { number: "A08", title: "3D view" },
];

const MCMILLAN_PORCH_SHEETS: DrawingSheetRef[] = [
  { number: "A01", title: "Existing floor plan — porch 51'-9\" × 7'-8\"" },
  { number: "A02", title: "Demo plan" },
  { number: "A03", title: "Proposed floor plan — porch 51'-7\" × 8'-6\"" },
  { number: "A04", title: "Elevation — ~4.5\" risers, ~11\" treads, 6 steps" },
  { number: "A05", title: "3D capture" },
];

const CARVER_HALL_SHEETS: DrawingSheetRef[] = [
  { number: "A01", title: "Existing floor plan" },
  { number: "A02", title: "Demo plan — expand into office closet" },
  { number: "A03", title: "Proposed floor plan" },
  { number: "A04", title: "Framing / accessory placement" },
  { number: "A05", title: "Elevations — vanity / niche" },
  { number: "A06", title: "Electric plan" },
  { number: "A07", title: "Plumbing plan" },
  { number: "A08", title: "3D capture" },
];

const CARVER_MASTER_SHEETS: DrawingSheetRef[] = [
  { number: "A01", title: "Existing floor plan — keep tub surround" },
  { number: "A02", title: "Demo plan — keep vanity cabinets" },
  { number: "A03", title: "Proposed floor plan" },
  { number: "A04", title: "Framing / accessory placement" },
  { number: "A05", title: "Elevations" },
  { number: "A06", title: "Electric plan" },
  { number: "A07", title: "Plumbing plan" },
  { number: "A08", title: "3D capture" },
];

export const DEBOARD_REFS: EvidenceRecord[] = [
  ref(
    "ev-tw",
    "Deboard Tradewalk Plans.pdf",
    "TRADEWALK",
    "A01–A11 + A15. Latest Drive copy Aug 14, 2026. Already the working set. Howler working sheets are drawn from this PDF — not a PE stamp.",
    "1C-TdtWpVnHL-VC5cSqxhCPK-f3iK9-_A",
    { issued: "June 12, 2025 · Drive copy Aug 14, 2026", sheets: DEBOARD_SHEETS, previewSrc: "/plans/deboard-a01.png", storedSrc: "/evidence/deboard/Deboard-Tradewalk-Plans.pdf" },
  ),
  ref(
    "ev-tw-early",
    "plans.pdf",
    "TRADEWALK",
    "Same Deboard Tradewalk set, earlier Drive copy (July 23, 2026). Title is only “plans.pdf”. Latest copy is Deboard Tradewalk Plans.pdf.",
    "17-Yqnx23N7_zNQ2HRyh5sibt4ogSky1z",
    { issued: "June 12, 2025 · Drive copy July 23, 2026", sheets: DEBOARD_SHEETS },
  ),
  ref("ev-calcs", "Deboard Calcs.pdf", "CALCS", "Murphy LVL B1/B2/B3. 8/17/2026. Coordinated with A07.", "1JYq2cDF9qU8i8buH_R2Cs3MzbsoK0IXt", {
    issued: "August 17, 2026",
  }),
  ref("ev-framing", "David S Deboard Framing.pdf", "FRAMING", "Stanfield framing. Cites A01.", "1McP71m1fOMUaTaOhcCpS7-Dh7hGMpvS8", {
    issued: "July 21, 2026",
  }),
  ref("ev-scope", "David S Deboard scope.pdf", "SCOPE", "Stanfield scope PDF. Howler copy stored. Original stays in Drive.", "1uRoUzf29EXsTgQ4ygmzw0a_VwMx34NFL", {
    storedSrc: "/evidence/deboard/David-S-Deboard-scope.pdf",
  }),
  ref(
    "ev-sow-rules",
    "Scope of Work and Rules",
    "SCOPE",
    "Deboard job rules + full garage SOW. Copied from the Drive Google Doc into Howler. Original not deleted.",
    "1b2ADEtIfjbPik8d1UC6hhR5yTC7FAKENTN38Mbu1aBE",
    { url: driveDocUrl("1b2ADEtIfjbPik8d1UC6hhR5yTC7FAKENTN38Mbu1aBE"), issued: "August 6, 2026", storedSrc: "/evidence/deboard/sow-and-rules.txt" },
  ),
  ref(
    "ev-site-adu",
    "Deboard Site Plan",
    "SITE",
    "Google Doc: “Sweet Spot Design – 34' × 36' detached structure,” 10:12, guest suite. Design 2 ADU narrative. NOT governing. Working set is Tradewalk A01–A11 + A15 (37'-4 7/8\" × 30'-0 1/16\", 8/12).",
    "1eLDzo5bXYRcOJJTf-t8dv2UhdBHnpg4qn0jvmpyDyVA",
    { url: driveDocUrl("1eLDzo5bXYRcOJJTf-t8dv2UhdBHnpg4qn0jvmpyDyVA"), issued: "June 3, 2026" },
  ),
  ref(
    "ev-mars",
    "John_Mars_Deboard_Labor_Estimate_2026-08-06.pdf",
    "ESTIMATE",
    "John Marr / Mars labor estimate. Not a drawing. Framing confirmation still pending.",
    "1v-9jgd7YIl5ppNDLWIRkn9Rxr_-rx6Oy",
    { issued: "August 6, 2026" },
  ),
];

export const CIURLIZZA_REFS: EvidenceRecord[] = [
  ref(
    "ev-kitchen-tw",
    "KITCHEN PLANS 4.29.pdf",
    "TRADEWALK",
    "Ciurlizza Residence, 740 Andover Village Dr, Lexington KY 40509. Apr 29, 2026. Visual remodel set: existing / demo / proposed / framing. Rooms named Dining, Kitchen, Living, Foyer, Office, Bathroom, Bedroom, Mud Room. Callouts: install beam as needed for removed posts, pocket doors, bay window, new exterior door. Envelope not adopted — existing house. Yeiser remains the structural correction reference.",
    "1EyEzJUUeO5gdFXLDXTONGiKLXrNUoWw4",
    { issued: "April 29, 2026", sheets: CIURLIZZA_KITCHEN_SHEETS, storedSrc: "/evidence/ciurlizza/KITCHEN-PLANS-4.29.pdf" },
  ),
  ref(
    "ev-basement-tw",
    "BASEMENT PLANS 4.29.pdf",
    "TRADEWALK",
    "Same job, basement visual set. Apr 29, 2026. A01–A08 including electric, plumbing, 3D. Frame for egress window. Greenwich recessed doors tagged. Envelope not adopted.",
    "1GinRFtl0SUO1rfyK6hNgpsmAYQc7-Ybw",
    { issued: "April 29, 2026", sheets: CIURLIZZA_BASEMENT_SHEETS, storedSrc: "/evidence/ciurlizza/BASEMENT-PLANS-4.29.pdf" },
  ),
  ref(
    "ev-yeiser",
    "260215 Ciurlizza Residence — YEISER MARKUPS.pdf",
    "STRUCTURAL",
    "Yeiser Structural. Feb 26, 2026. Demo A02 + framing A04. LVL 5.25×16, LVL 3.5×9.25, 2x6 fur-out, bay window, pocket doors, egress window. Existing steel beams FIELD VERIFY. Not a field measurement.",
    "1Gb3lQUTziyD9gYb-QFhaJLHRDZDv-W21",
    { issued: "February 26, 2026" },
  ),
  ref(
    "ev-yeiser-1f",
    "260215 Ciurlizza — UPDATED 1ST FLOOR FRAMING YEISER MARKUPS.pdf",
    "STRUCTURAL",
    "Updated first-floor framing. Flush LVL 5.25×16. LUS210 hangers. Existing (3) 2x10 w/ 1\" steel plate FIELD VERIFY. 16'-0\" span field verify.",
    "1wCAhYN0ywbxh1zyoFrqnruwUtipW_TCg",
    { issued: "June 19, 2026 Drive copy" },
  ),
  ref("ev-beam", "David S cuilizza beam.pdf", "FRAMING", "Stanfield beam PDF. Filename misspells Ciurlizza.", "12-GZMjvKGjH7Zx7prA61TdkvGYte0ZrO"),
  ref("ev-window", "David S Window Repair Kitchen.pdf", "UPLOAD", "Kitchen window repair. Not a full set.", "1HDEruPtI4QA_TMKBHIutejRf95Or7QqO"),
  ref(
    "ev-andover-scan",
    "740 ANDOVER VILLAGE DR.pdf",
    "SITE",
    "Address-named PDF. Scan/encoded text — Howler could not read dimensions from it. Not used as geometry.",
    "1gEx134r-8ZJxyHnFEYlf_JN99HffNBdr",
    { issued: "May 21, 2026" },
  ),
  ref(
    "ev-jr-andover-quote",
    "J&R Andover Village Quote.docx",
    "QUOTE",
    "J&R quote for Andover Village / Ciurlizza. Word file — recorded as a reference, not a drawing.",
    "1j64g7_h1reJbUWTnaND-LTfQWKsf7nwr",
    { issued: "June 3, 2026" },
  ),
  ref(
    "ev-jr-carpet",
    "J&R - Ciurlizza Carpet.PDF",
    "QUOTE",
    "J&R carpet quote for Ciurlizza. Not a floor plan.",
    "1DSgRAMxOBKkcKITlskFq_6BPXkYdOTpp",
    { issued: "May 12, 2026" },
  ),
  ref(
    "ev-basement-sow",
    "BASEMENT Scope of Work.docx",
    "SCOPE",
    "Ciurlizza Job Rules + basement remodel SOW. Howler copy stored as text. Original Word file stays in Drive.",
    "1TciKJikhzH7l_ACiu30XpXC5f0DTDKyS",
    { issued: "February 26, 2026", storedSrc: "/evidence/ciurlizza/basement-sow-and-rules.txt" },
  ),
];

export const MCMILLAN_REFS: EvidenceRecord[] = [
  ref(
    "ev-porch-tw",
    "McMillanPorchsheet2.pdf",
    "TRADEWALK",
    "McMillans, 109 Caveson Way. Oct 20, 2025. Visual porch Tradewalk: A01 existing 51'-9\" × 7'-8\" porch, A02 demo, A03 proposed 51'-7\" × 8'-6\" porch, A04 elevation (~4.5\" risers, ~11\" treads, 6 steps, ~26.5\" deck height, ~29 3/8\" retaining wall), A05 3D. House overall on the sheet is not adopted as a new envelope. Interior remains paused.",
    "1XL_H9kvJRhqTcaiI2QCLqSSVRkCNUEmF",
    { issued: "October 20, 2025", sheets: MCMILLAN_PORCH_SHEETS },
  ),
  ref(
    "ev-kitchen-plan",
    "McMillanKitchen.plan",
    "UPLOAD",
    "Chief Architect .plan file. Binary — recorded as a reference. Howler cannot parse .plan geometry.",
    "1f_vGg0lCXRh6cZNYCpgH12lmcPkKOVL3",
    { issued: "June 4, 2026" },
  ),
  ref("ev-sow", "McMillan Scope of Work.pdf", "SCOPE", "Porch + interior SOW. Howler copy stored. Interior remains paused pending Stanfield vs Saul.", "1GvMWbPcIp7ToRujSqh6v9kN_oQqkX88W", {
    storedSrc: "/evidence/mcmillan/McMillan-Scope-of-Work.pdf",
  }),
  ref("ev-proposal", "McMillan Proposal.docx", "SCOPE", "Proposal file. Binary — recorded as a reference, not parsed as a drawing.", "1aoQxqcHSFIm_dZsu1r-JZAFmeYmL0aSF"),
  ref("ev-binder", "McMillan Binder.docx", "SCOPE", "Binder. Not a floor plan.", "13mORwPJkAjkEVbp0gokrrd1P1lcRf-Of"),
  ref(
    "ev-stanfield-int",
    "David S McMillan interior entire scope (not finish drywall)",
    "ESTIMATE",
    "Stanfield interior estimate, prepared for J&R construction (info@jrcsi.com). Drive copy Sep 10, 2026. Demo / framing / LVT / shower curb named. Dollar total not extracted (garbled). Interior stays paused until compared against Saul. Howler will not invent the number.",
    "1H2ooQ1jaFwxeJSLLhNqgkABHFcjKlDbo",
    { issued: "September 9, 2026" },
  ),
  ref(
    "ev-ceiling-co",
    "David S Mcmillan Ceiling change order.pdf",
    "ESTIMATE",
    "Stanfield ceiling change order. Not an approved CO in Howler — recorded as a file. Pending never inflates Revised.",
    "1pDSmSY1-4YLDRav8Y9BLvD2XRN_x382A",
    { issued: "September 3, 2026" },
  ),
];

export const CARVER_REFS: EvidenceRecord[] = [
  ref(
    "ev-hall-tw",
    "hall design.pdf",
    "TRADEWALK",
    "Carver/Julian Residence, 1035 Wil Rose Ln, Versailles KY 40383. June 4, 2026. Upstairs hall bath A01–A08: existing / demo (expand into office closet) / proposed / framing-accessories / elevations / electric / plumbing / 3D. Howler copy stored. Drive original not deleted.",
    "1XZiJGbYQZ7cDB4a9WSX2kfULKXbFGb29",
    {
      issued: "June 4, 2026 · Drive copy Sep 2, 2026",
      sheets: CARVER_HALL_SHEETS,
      previewSrc: "/plans/carver/hall-bath-floor.png",
      storedSrc: "/evidence/carver/hall-design.pdf",
    },
  ),
  ref(
    "ev-master-tw",
    "master design.pdf",
    "TRADEWALK",
    "Same job, master bath. June 4, 2026. Keep tub surround and vanity cabinets. Demo shower tile/door, vanity top, toilet. A01–A08. Howler copy stored.",
    "1xaOsa5uL-xUytU0DVlcQVXzIVwX2PdpI",
    {
      issued: "June 4, 2026 · Drive copy Sep 2, 2026",
      sheets: CARVER_MASTER_SHEETS,
      previewSrc: "/plans/carver/master-bath-floor.png",
      storedSrc: "/evidence/carver/master-design.pdf",
    },
  ),
  ref(
    "ev-sow",
    "Carver/Julian Scope of Work and Rules.docx",
    "SCOPE",
    "Master + upstairs bath SOW and job rules. Copied into Howler as text. Original Word file stays in Drive.",
    "1K3KQLeLZc0S8P1uPs0YQKjBMFD2IRLjh",
    { issued: "September 2, 2026", storedSrc: "/evidence/carver/sow-and-rules.txt" },
  ),
  ref("ev-inv-1", "Davud S Invoice Carver.pdf", "ESTIMATE", "Stanfield invoice 1. Filename misspells David. Not a drawing.", "1AxV921luzqf0JxuikysWUvQmjyCaVjPh", {
    issued: "July 19, 2026",
  }),
  ref("ev-inv-2", "David S invoice 2 carver.pdf", "ESTIMATE", "Stanfield invoice 2. Not a drawing.", "1SnYhL_TVpBVFoPokzQVEytTQN126nKdV", { issued: "July 19, 2026" }),
  ref("ev-inv-3", "David S Carver invoice 3.pdf", "ESTIMATE", "Stanfield invoice 3. Not a drawing.", "1rL7aEPRkVXw6gxP-aOC4KsQDmQ2uYPhT", { issued: "July 19, 2026" }),
];

export const STEWART_REFS: EvidenceRecord[] = [
  ref("ev-tile", "Stewart Tile.pdf", "QUOTE", "Tile quote named Stewart. Not a floor plan. Geometry stays Unknown.", "1sUCv_w4RxBpqqndMjHFfwp-XYEWHKtmw", {
    issued: "January 22, 2026",
  }),
];

export const SWIDERSKI_REFS: EvidenceRecord[] = [
  ref(
    "ev-tile",
    "David S Swiderski tile quote.pdf",
    "QUOTE",
    "Stanfield tile quote for Swiderski. Not a floor plan. Geometry stays Unknown.",
    "1u6gq7iSKCXI0ykC7dEN9YZ4uSQ6X3kUH",
    { issued: "August 4, 2026" },
  ),
];

export const PRATT_REFS: EvidenceRecord[] = [];

export interface UnmatchedDrivePlan {
  name: string;
  address: string;
  note: string;
  fileId: string;
  kind: EvidenceKind;
  issued?: string;
  sheets?: DrawingSheetRef[];
}

export const UNMATCHED_DRIVE_PLANS: UnmatchedDrivePlan[] = [
  {
    name: "TRADEWALK PLANS.pdf",
    address: "North Residence — 3910 Old Frankfort Pike, Versailles, KY 40383",
    note: "July 31, 2026. Visual Tradewalk: foundation / first floor / second floor / elevations. Crawl + garage slab, option dog run. Not one of the seven live jobs. Howler will not hang it on Pratt or DeBoard.",
    fileId: "17JdVC50ZKYReYa6SrxAyZUZkH_7kueYb",
    kind: "TRADEWALK",
    issued: "July 31, 2026",
    sheets: [
      { number: "A01", title: "Slab / crawl space foundation" },
      { number: "A02", title: "Foundation plan" },
      { number: "A03", title: "First floor plan" },
    ],
  },
  {
    name: "Garrison Plans.pdf",
    address: "Garrison Residence — 645 Montclair Dr, Lexington, KY 40502",
    note: "Aug 11, 2026. Visual set: existing floor, proposed options 1 and 2, electric, plumbing. Highlighted walls are new construction. Not in the live portfolio.",
    fileId: "1as2lduM3H1sAxloshZN1zNsn5zqezKCs",
    kind: "TRADEWALK",
    issued: "August 11, 2026",
    sheets: [
      { number: "A01", title: "Existing floor plan" },
      { number: "A02", title: "Proposed floor plan (option 1 / option 2)" },
      { number: "A03", title: "Electric plan" },
      { number: "A04", title: "Plumbing plan" },
    ],
  },
  {
    name: "FLOOR PLAN.pdf",
    address: "Garrison Residence — 645 Montclair Dr, Lexington, KY 40502",
    note: "Aug 11, 2026. A01 only — same Garrison job as Garrison Plans.pdf. Not in the live portfolio.",
    fileId: "1Z7JbeLvvHEixxTDexP2nTtvRzSCa9_mO",
    kind: "TRADEWALK",
    issued: "August 11, 2026",
    sheets: [{ number: "A01", title: "Floor plan" }],
  },
  {
    name: "GANZEL PLANS REVISED.pdf",
    address: "Ganzel Residence — 115 Creek Rock Cir, Nicholasville, KY 40356",
    note: "Aug 5, 2026. Visual Tradewalk: site, floor, foundation, wall details, roof framing, electric, 3D. 2x6 rafters 16\" O.C., 5/12 vaulted gable + 1/12 shed. Sauna / cupola electric notes. Not a live Howler job.",
    fileId: "1xHTvHN3eFjTix-JGw_wQBsljwQanYT4j",
    kind: "TRADEWALK",
    issued: "August 5, 2026",
    sheets: [
      { number: "A01", title: "Site plan" },
      { number: "A02", title: "Floor plan" },
      { number: "A03", title: "Foundation plan" },
      { number: "A04", title: "Building details" },
      { number: "A05", title: "Roof framing plan" },
      { number: "A06", title: "Electric plan" },
      { number: "A07", title: "3D captures" },
    ],
  },
  {
    name: "J&R Revised .pdf",
    address: "Ganzel — 21' × 20' pad (William Welch / Charlotte Construct)",
    note: "Sep 3, 2026. Named J&R Revised — it is a Ganzel site-work / 4,000 PSI pad quote, not a floor plan. $9,000 full pad vs $3,150 site-work-only. Not hung on a live job.",
    fileId: "1a14GFyQsMUNWI4eCHgEUh8R2hKWVm-Vz",
    kind: "QUOTE",
    issued: "September 3, 2026",
  },
  {
    name: "Plans - REVISED 7.29.pdf",
    address: "Tyler Residence — 2217 Savannah Ln, Lexington, KY 40513",
    note: "July 29, 2026. Visual Tradewalk: existing / demo / proposed / framing / elevations / fireplace / electric / 3D / site. Deck rebuild, keep existing structure. Not a live Howler job.",
    fileId: "1IxTqeiGoExro4DKsUaIk_ImobA1hmp6k",
    kind: "TRADEWALK",
    issued: "July 29, 2026",
    sheets: [
      { number: "A01", title: "Existing floor plan" },
      { number: "A02", title: "Demo plan" },
      { number: "A03", title: "Proposed floor plan" },
      { number: "A04", title: "Framing plan" },
      { number: "A05", title: "Elevations" },
      { number: "A06", title: "Fireplace details" },
      { number: "A07", title: "Electric plan" },
      { number: "A08", title: "3D capture" },
      { number: "A09", title: "Site plan" },
    ],
  },
  {
    name: "Tyler, Chris - Builder Set Plans 10.01.25.pdf",
    address: "Tyler / Chris — builder set",
    note: "Oct 1, 2025 builder set. Drive would not extract text. Same Tyler family as Plans - REVISED 7.29.pdf. Not a live job.",
    fileId: "1Czra7N2F7Y7bxl90KNOc925D1PqTLfaB",
    kind: "TRADEWALK",
    issued: "October 1, 2025",
  },
  {
    name: "Plans.pdf",
    address: "Gainesway Small Animal Clinic — 1230 Armstrong Mill Rd, Lexington, KY 40517",
    note: "June 7, 2025. Clinic remodel visual set (exam rooms, kennels, parking). Not a residence and not a live Howler job.",
    fileId: "1Uq21Cxb6iE_JjFeto-cN8rHNKYgMzfx4",
    kind: "TRADEWALK",
    issued: "June 7, 2025",
    sheets: [
      { number: "A03", title: "Proposed floor plan" },
      { number: "A04", title: "Parking layout" },
      { number: "A05", title: "Building section" },
      { number: "A06", title: "Electric plan" },
    ],
  },
  {
    name: "Craven Floor Plan.plan",
    address: "Craven — Chief Architect source",
    note: "Mar 21, 2026 .plan file plus Design 1–3 and Design 4. Binary. Not parsed. Not a live job.",
    fileId: "1OYImSULYMEHDNb_iXd7ZmHTsVdbhdpT_",
    kind: "UPLOAD",
    issued: "March 21, 2026",
  },
];

export const JR_PROCESS_REFS: EvidenceRecord[] = [
  ref(
    "ev-jr-howto",
    "J&R How To Plan A Remodel.pptx",
    "PROCESS",
    "J&R company visual planning deck (jalyn, Mar 30, 2026). How to plan a remodel — process, not a job drawing. 28 MB presentation.",
    "1rnvg2eD7HCIosVWTOISBnWXdLyD1uWvg",
    { issued: "March 30, 2026" },
  ),
  ref(
    "ev-jr-4000",
    "J&R 4000 (1).pdf",
    "QUOTE",
    "Invoice TO J&R Construction (1035 Wil Rose Lane) from MG Remodeling, June 27, 2026. Bathroom framing + drywall. Job address not named on the invoice. Not hung on a live card.",
    "1bk98LD9fpPLSclPRm_fWZaJAPAObmX3k",
    { issued: "June 27, 2026" },
  ),
];

export const DEBOARD_WORKING_PREVIEWS: { number: string; title: string; src: string }[] = [
  { number: "A01", title: "Proposed 1st floor", src: "/plans/deboard-a01.png" },
  { number: "A04", title: "Elevations", src: "/plans/deboard-a04.png" },
  { number: "A06", title: "Wall section", src: "/plans/deboard-a06.png" },
  { number: "A07", title: "Attic framing", src: "/plans/deboard-a07.png" },
  { number: "A15", title: "Wall framing", src: "/plans/deboard-a15.png" },
];

export function ciurlizzaBlueprint(): Blueprint {
  return {
    ...emptyBlueprint(),
    county: "Fayette",
    occupancy: "DWELLING",
    stories: 2,
    envelopeProvenance: "UNKNOWN",
    drawingStatus: "REVIEWED",
    drawingScale: "1/4",
    dimDatum: "FACE_FRAMING",
    studSize: "2x6",
    openings: [],
    rooms: {},
    evidence: CIURLIZZA_REFS,
    notes:
      "Visual remodel set in Drive: KITCHEN PLANS 4.29.pdf and BASEMENT PLANS 4.29.pdf (Apr 29, 2026) — existing/demo/proposed/framing plus basement electric/plumbing/3D. Yeiser Structural markups (Feb 26, 2026) remain the correction reference for the failed Fayette inspection. Existing house — envelope not a new box. Yeiser: field-verify assumed framing, dimensions, and existing steel. LVL 5.25×16 flush beam; LVL 3.5×9.25 header; (4) 2x6 or LVL 1.5×3.5 stud packs; 2x6 wall to fur out for plumbing; Versa-Lam LVL 2.1E 3100 SP; SYP #2 min. Temporary shoring by contractor. Tags include 2868, 5068, 2468, W3561, 3050DH — walls not placed. FRAME FOR NEW BAY WINDOW, EGRESS WINDOW, POCKET DOOR ×2 — sizes Unknown. Failed Fayette inspection is the live gate. These sheets are not a passed stamp.",
  };
}

export function mcmillanBlueprint(): Blueprint {
  return {
    ...emptyBlueprint(),
    occupancy: "DWELLING",
    stories: 2,
    envelopeProvenance: "UNKNOWN",
    drawingStatus: "REVIEWED",
    drawingScale: "1/4",
    dimDatum: "FACE_FRAMING",
    evidence: MCMILLAN_REFS,
    notes:
      "McMillanPorchsheet2.pdf (Oct 20, 2025) is the visual porch Tradewalk for 109 Caveson Way. A01 existing porch 51'-9\" × 7'-8\". A03 proposed porch 51'-7\" × 8'-6\". A04 ~4.5\" risers, ~11\" treads, 6 steps, ~26.5\" deck height. House overall on that sheet is not adopted as a new box. McMillanKitchen.plan is a Chief Architect file — not parsed. Exterior is closing out. Interior remains held pending Stanfield vs Saul. Geometry besides the named porch stays Unknown.",
  };
}

export function mcmillanScope(): Record<string, ScopeItem> {
  const item = (
    id: string,
    description: string,
    phase: string,
    included: boolean,
    notes: string,
    trade: string | null = null,
    activityId: string | null = null,
  ): ScopeItem => ({
    id,
    description,
    phase,
    trade,
    included,
    complete: false,
    activityId,
    allowanceLineId: null,
    notes,
    fromBaseline: true,
  });
  return {
    "scp-porch": item(
      "scp-porch",
      "Phase 1 front porch repairs",
      "Closeout",
      true,
      "SOW §2 + McMillanPorchsheet2.pdf A03 proposed 51'-7\" × 8'-6\" porch. Walkway, pavers herringbone, curved steps, brick planter walls. Owner: exterior is closing out — not marked complete.",
      "Masonry",
      "act-porch",
    ),
    "scp-concrete": item(
      "scp-concrete",
      "Concrete platform and sidewalk",
      "Closeout",
      true,
      "KF Sep 3 IN_PROGRESS. Stamp/color. Field-confirm before complete.",
      "Concrete",
      "act-concrete",
    ),
    "scp-elec": item(
      "scp-elec",
      "Bonham Electric circuit correction",
      "Electrical",
      true,
      "Light-pole / water-heater shared circuit. Proposed CO $600. Revised unchanged until approved.",
      "Electrical",
      "act-elec",
    ),
    "scp-ceiling": item(
      "scp-ceiling",
      "Porch-ceiling renovation",
      "Closeout",
      true,
      "Approval / committed dates not yet given.",
      "Carpentry",
      "act-ceiling",
    ),
    "scp-columns": item(
      "scp-columns",
      "Porch columns to match rear / column paint",
      "Closeout",
      true,
      "Material and size to be confirmed. Cracked-column reply still unverified to client.",
      "Masonry",
      "act-columns",
    ),
    "scp-builtin": item("scp-builtin", "Upstairs hallway glass-front built-in", "Interior", false, "Interior — held pending Stanfield vs Saul.", "Cabinetry", "act-compare"),
    "scp-island": item("scp-island", "Kitchen island for 36\" cooktop + butcher block", "Interior", false, "Interior — held. Green cabinet finish, door style TBD.", "Cabinetry", "act-compare"),
    "scp-bath": item("scp-bath", "Master bath renovation", "Interior", false, "Interior — held. Walk-in shower, heated floor, client-provided tile/fixtures.", "Tile", "act-compare"),
    "scp-closet": item("scp-closet", "Master closet reconfiguration", "Interior", false, "Interior — held. Closet system allowance $5,000.", "Closets", "act-compare"),
    "scp-floor": item("scp-floor", "Master bedroom flooring", "Interior", false, "Interior — held. Remove LVT, client-supplied flooring.", "Flooring", "act-compare"),
  };
}

export function carverBlueprint(): Blueprint {
  return {
    ...emptyBlueprint(),
    county: "Woodford",
    occupancy: "DWELLING",
    stories: 2,
    envelopeProvenance: "UNKNOWN",
    drawingStatus: "REVIEWED",
    drawingScale: "1/4",
    dimDatum: "FACE_FINISH",
    evidence: CARVER_REFS,
    notes:
      "Carver/Julian, 1035 Wil Rose Ln, Versailles KY 40383. Two Tradewalk sets copied into Howler: hall design.pdf (upstairs bath, expand into office closet) and master design.pdf (keep tub surround + vanity cabinets). June 4, 2026. Existing house — envelope not a new box. Remaining field work is electrical finals, Artistic vanities, Gatsby Glass. These sheets are not a PE stamp.",
  };
}

export const CARVER_WORKING_PREVIEWS: { number: string; title: string; src: string }[] = [
  { number: "MB", title: "Master bath floor", src: "/plans/carver/master-bath-floor.png" },
  { number: "MB3D", title: "Master bath capture", src: "/plans/carver/master-bath-1.png" },
  { number: "HB", title: "Hall bath floor", src: "/plans/carver/hall-bath-floor.png" },
  { number: "HB3D", title: "Hall bath capture", src: "/plans/carver/hall-bath-1.png" },
];

export function emptyEvidenceBlueprint(refs: EvidenceRecord[], notes: string): Blueprint {
  return {
    ...emptyBlueprint(),
    evidence: refs,
    notes,
  };
}
