import type { Money } from "./money";

export type ActivityState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
export type CoStatus =
  | "DRAFT"
  | "PROPOSED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "VOID";

export type OccupancyClass =
  | "DETACHED_GARAGE"
  | "GARAGE_WITH_HABITABLE"
  | "DWELLING"
  | "POST_AND_FRAME"
  | "OTHER";

export type LumberSize = "2x4" | "2x6" | "2x8" | "2x10" | "2x12";
export type SpeciesGrade = "SPF_2" | "DF_LARCH_2" | "SYP_2";
export type RoofStyle = "GABLE" | "HIP" | "SHED";
export type JoistDirection = "WIDTH" | "DEPTH";
export type DrawingScaleId = "FIT" | "1/4" | "3/16" | "1/8" | "1/16";
export type SheetId =
  | "L1"
  | "L2"
  | "FDN"
  | "EL"
  | "SEC"
  | "WALL"
  | "JOIST"
  | "ROOF"
  | "ELEC"
  | "ELEC2"
  | "PLUMB"
  | "STUD";
export type WallFace = "FRONT" | "BACK" | "LEFT" | "RIGHT";
export type OpeningKind = "OHD" | "MAN" | "WINDOW";
export type DimProvenance = "VERIFIED" | "INFERRED" | "PROPOSED" | "UNKNOWN";
export type DimDatum = "FACE_FRAMING" | "FACE_FINISH" | "CENTERLINE";
export type DrawingIssueStatus = "DRAFT" | "REVIEWED" | "ISSUED";
export type EvidenceKind =
  | "TRADEWALK"
  | "CALCS"
  | "FRAMING"
  | "STRUCTURAL"
  | "SCOPE"
  | "UPLOAD"
  | "SITE"
  | "ESTIMATE"
  | "QUOTE"
  | "PROCESS";

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  TRADEWALK: "Tradewalk",
  CALCS: "Calcs",
  FRAMING: "Framing",
  STRUCTURAL: "Structural",
  SCOPE: "Scope",
  UPLOAD: "File",
  SITE: "Site",
  ESTIMATE: "Estimate",
  QUOTE: "Quote",
  PROCESS: "Process",
};

export interface DrawingSheetRef {
  number: string;
  title: string;
}

export interface EvidenceRecord {
  id: string;
  name: string;
  kind: EvidenceKind;
  note: string;
  url: string | null;
  fileId?: string | null;
  issued?: string | null;
  sheets?: DrawingSheetRef[];
  previewSrc?: string | null;
  /** Local Howler copy. Drive original stays in Drive — never deleted. */
  storedSrc?: string | null;
}

export type InspectionStatus = "NOT_READY" | "READY" | "SCHEDULED" | "PASSED" | "FAILED";
export type PermitStatus = "NOT_FILED" | "SUBMITTED" | "ISSUED";
export type SelectionStatus = "UNKNOWN" | "MATCH_EXISTING" | "SELECTED";

export type FindingKind =
  | "LINE_HAS_NO_BASELINE"
  | "ACTUAL_COST_UNALLOCATED"
  | "COMMITMENT_HAS_UNALLOCATED_AMOUNT"
  | "APPROVED_CO_HAS_UNALLOCATED_AMOUNT"
  | "ALLOWANCE_OVERRUN"
  | "SCOPE_ALLOWANCE_NOT_LINKED"
  | "LINE_COMMITMENT_OVER_REVISED"
  | "LINE_ACTUAL_OVER_REVISED"
  | "SCOPE_HAS_NO_BUDGET_ASSOCIATION"
  | "LINE_HAS_NO_SCOPE"
  | "PENDING_CO_UNPRICED"
  | "DRAFT_CO_UNPRICED";

export type PlanFindingSeverity = "REQUIRED" | "WATCH" | "INFO";

export interface Activity {
  id: string;
  name: string;
  phase: string;
  state: ActivityState;
  trade: string | null;
  durationLikely: number;
  committedStart: string | null;
  committedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  predecessorId: string | null;
  locked: boolean;
  notes: string | null;
}

export interface ScopeItem {
  id: string;
  description: string;
  phase: string;
  trade: string | null;
  included: boolean;
  complete: boolean;
  activityId: string | null;
  allowanceLineId: string | null;
  notes: string | null;
  fromBaseline: boolean;
}

export interface BudgetCategory {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  notes: string | null;
}

export interface BudgetLine {
  id: string;
  categoryId: string;
  description: string;
  costCode: string | null;
  trade: string | null;
  baselineAmount: Money | null;
  isAllowance: boolean;
  vendorRef: string | null;
  activityId: string | null;
  scopeItemIds: string[];
  notes: string | null;
  active: boolean;
}

export interface Commitment {
  id: string;
  amount: Money;
  allocations: { budgetLineId: string; amount: Money }[];
  vendorRef: string | null;
  activityId: string | null;
  scopeItemIds: string[];
  reference: string | null;
  status: "ACTIVE" | "VOID";
  notes: string | null;
}

export interface ActualCost {
  id: string;
  amount: Money;
  date: string;
  description: string;
  budgetLineId: string | null;
  commitmentId: string | null;
  reference: string | null;
  status: "RECORDED" | "VOID";
  notes: string | null;
}

export interface ChangeOrder {
  id: string;
  number: string;
  title: string;
  description: string;
  reason: string;
  status: CoStatus;
  cost: Money;
  allocations: { budgetLineId: string; amount: Money }[];
  declaredScheduleDays: number | null;
  scopeItemIds: string[];
  activityIds: string[];
  categoryId: string | null;
  clientApproval: string | null;
  requestedAt: string | null;
  proposedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  notes: string | null;
}

export interface BlueprintRoom {
  id: string;
  name: string;
  level: number;
  widthIn: number | null;
  depthIn: number | null;
  originXIn: number | null;
  originYIn: number | null;
  scopeItemIds: string[];
  notes: string | null;
}

export interface Opening {
  id: string;
  kind: OpeningKind;
  wall: WallFace;
  widthIn: number;
  heightIn: number | null;
  offsetIn: number;
  sillIn: number | null;
  headerSize: LumberSize | null;
  /** Tradewalk schedule tag, e.g. 2868, 2840DH. */
  tag?: string | null;
  /** Size source. Missing stays UNKNOWN — Howler will not invent a leaf width. */
  provenance?: DimProvenance;
  /** Offset from wall start / corner. Proposed until field-measured. */
  offsetProvenance?: DimProvenance;
  /** What the size and offset are to. */
  datum?: DimDatum;
  notes: string | null;
}

export interface Blueprint {
  jurisdiction: "KENTUCKY";
  codeEdition: "KRC_2018";
  county: string | null;
  groundSnowLoadPsf: number | null;
  windSpeedMph: number;
  weathering: "SEVERE";
  frostDepthIn: number | null;
  occupancy: OccupancyClass | null;
  stories: number | null;
  widthIn: number | null;
  depthIn: number | null;
  eaveHeightIn: number | null;
  roofRise: number | null;
  roofRun: number | null;
  roofStyle: RoofStyle | null;
  overhangIn: number | null;
  studSize: LumberSize | null;
  studSpacingIn: number | null;
  joistSize: LumberSize | null;
  joistSpacingIn: number | null;
  joistSpecies: SpeciesGrade;
  joistDirection: JoistDirection;
  rafterSize: LumberSize | null;
  rafterSpacingIn: number | null;
  overheadDoorWidthIn: number | null;
  overheadDoorHeightIn: number | null;
  drawingScale: DrawingScaleId;
  drawingStatus: DrawingIssueStatus;
  dimDatum: DimDatum;
  envelopeProvenance: DimProvenance;
  issuedRevision: number | null;
  rooms: Record<string, BlueprintRoom>;
  openings: Opening[];
  evidence: EvidenceRecord[];
  notes: string | null;
}

export interface Financials {
  currency: string;
  baseline: Money | null;
  categories: Record<string, BudgetCategory>;
  lines: Record<string, BudgetLine>;
  commitments: Record<string, Commitment>;
  actualCosts: Record<string, ActualCost>;
  changeOrders: Record<string, ChangeOrder>;
}

export interface HistoryEvent {
  id: string;
  revision: number;
  type: string;
  occurredAt: string;
  note: string;
  clerical: boolean;
  recordId?: string;
}

export interface PhotoNote {
  id: string;
  caption: string;
  takenAt: string;
  evidenceName: string | null;
}

export interface Inspection {
  id: string;
  name: string;
  code: string | null;
  status: InspectionStatus;
  date: string | null;
  notes: string | null;
}

export interface Contact {
  id: string;
  name: string;
  trade: string;
  phone: string | null;
  notes: string | null;
}

export interface SelectionItem {
  id: string;
  name: string;
  value: string | null;
  status: SelectionStatus;
  notes: string | null;
}

export interface JobBook {
  permitStatus: PermitStatus;
  permitNumber: string | null;
  inspections: Record<string, Inspection>;
  contacts: Record<string, Contact>;
  selections: Record<string, SelectionItem>;
  photos: Record<string, PhotoNote>;
  /** Copied from the job's Scope of Work and Rules. Same rules, job-named header. */
  rules: string[];
}

export type HealthBand = "GREEN" | "YELLOW" | "RED";

export interface Project {
  id: string;
  name: string;
  clientName: string;
  address: string;
  projectType: string;
  timezone: string;
  revision: number;
  healthBand: HealthBand;
  paused: boolean;
  /** Named phases that are held without freezing the live job. Interior hold is not a whole-job pause. */
  heldPhases: string[];
  dashboardNote: string | null;
  /** Contract / NTP start. Null until supplied — Howler will not infer it from the first activity. */
  officialStart: string | null;
  /** Intended substantial completion. Null until supplied — a trade target is not this date. */
  intendedFinish: string | null;
  sourceLabel: string;
  activities: Record<string, Activity>;
  scopeItems: Record<string, ScopeItem>;
  financials: Financials | null;
  blueprint: Blueprint;
  job: JobBook;
  events: HistoryEvent[];
}

export interface PortfolioState {
  projects: Record<string, Project>;
}

export interface FinancialSummary {
  currency: string;
  baseline: Money | null;
  approvedChangeOrderTotal: Money;
  pendingChangeOrderTotal: Money;
  revisedBudget: Money | null;
  committedTotal: Money;
  actualTotal: Money;
  remaining: Money | null;
}

export interface Finding {
  kind: FindingKind;
  budgetLineId: string | null;
  commitmentId: string | null;
  actualCostId: string | null;
  changeOrderId: string | null;
  scopeItemId: string | null;
  message: string;
}

export interface PlanFinding {
  id: string;
  severity: PlanFindingSeverity;
  code: string;
  title: string;
  message: string;
  engineerLikely: boolean;
}

export interface PriorityAction {
  id: string;
  priority: "CRITICAL" | "WATCH";
  action: string;
  requiredBy: string | null;
}

export interface CommandPreview {
  understood: string;
  changes: string[];
  consequences: string[];
  nextAction: string;
  clerical: boolean;
  eventType: string;
  apply: (project: Project) => Project;
  ripple?: { ledger: string; moduleId: string; status: string; fact: string }[];
}

export type InterpretResult =
  | { outcome: "CLARIFICATION"; message: string }
  | { outcome: "RESOLVED"; preview: CommandPreview }
  | { outcome: "ACTION"; action: "EXPORT_PDF" | "PRINT" | "OPEN"; message: string; projectId?: string };

export const LUMBER_SIZES: LumberSize[] = ["2x4", "2x6", "2x8", "2x10", "2x12"];
export const DRAWING_SCALES: { id: DrawingScaleId; label: string; inchesPerFoot: number | null }[] = [
  { id: "FIT", label: "Fit to sheet (not a plotted scale)", inchesPerFoot: null },
  { id: "1/4", label: "1/4\" = 1'-0\"", inchesPerFoot: 0.25 },
  { id: "3/16", label: "3/16\" = 1'-0\"", inchesPerFoot: 0.1875 },
  { id: "1/8", label: "1/8\" = 1'-0\"", inchesPerFoot: 0.125 },
  { id: "1/16", label: "1/16\" = 1'-0\"", inchesPerFoot: 0.0625 },
];
export const SHEETS: { id: SheetId; label: string; number: string }[] = [
  { id: "L1", label: "Proposed 1st floor plan", number: "A01" },
  { id: "L2", label: "Proposed attic plan", number: "A02" },
  { id: "FDN", label: "Foundation plan", number: "A03" },
  { id: "EL", label: "Elevations", number: "A04" },
  { id: "SEC", label: "Building section", number: "A05" },
  { id: "WALL", label: "Wall section detail", number: "A06" },
  { id: "JOIST", label: "Attic floor framing", number: "A07" },
  { id: "ROOF", label: "Roof framing plan", number: "A08" },
  { id: "ELEC", label: "Electric plan (garage)", number: "A09" },
  { id: "ELEC2", label: "Electric plan (attic)", number: "A10" },
  { id: "PLUMB", label: "Plumbing plan", number: "A11" },
  { id: "STUD", label: "Wall framing", number: "A15" },
];
export const WALL_FACES: { id: WallFace; label: string }[] = [
  { id: "FRONT", label: "Front" },
  { id: "BACK", label: "Back" },
  { id: "LEFT", label: "Left" },
  { id: "RIGHT", label: "Right" },
];
export const OPENING_KINDS: { id: OpeningKind; label: string }[] = [
  { id: "OHD", label: "Overhead door" },
  { id: "MAN", label: "Man / walk door" },
  { id: "WINDOW", label: "Window" },
];
export const DIM_DATUMS: { id: DimDatum; label: string }[] = [
  { id: "FACE_FRAMING", label: "Face of framing" },
  { id: "FACE_FINISH", label: "Finished face (brick)" },
  { id: "CENTERLINE", label: "Centerline" },
];
export const DRAWING_STATUSES: { id: DrawingIssueStatus; label: string }[] = [
  { id: "DRAFT", label: "Draft — not issued" },
  { id: "REVIEWED", label: "Reviewed — not issued" },
  { id: "ISSUED", label: "Issued for layout" },
];
export const OCCUPANCY_LABEL: Record<OccupancyClass, string> = {
  DETACHED_GARAGE: "Detached garage (no habitable above)",
  GARAGE_WITH_HABITABLE: "Garage with habitable space above",
  DWELLING: "Dwelling",
  POST_AND_FRAME: "Post-and-frame (KRC R327)",
  OTHER: "Other / not classified",
};

export function emptyBlueprint(): Blueprint {
  return {
    jurisdiction: "KENTUCKY",
    codeEdition: "KRC_2018",
    county: null,
    groundSnowLoadPsf: null,
    windSpeedMph: 115,
    weathering: "SEVERE",
    frostDepthIn: null,
    occupancy: null,
    stories: null,
    widthIn: null,
    depthIn: null,
    eaveHeightIn: null,
    roofRise: null,
    roofRun: null,
    roofStyle: "GABLE",
    overhangIn: null,
    studSize: null,
    studSpacingIn: null,
    joistSize: null,
    joistSpacingIn: null,
    joistSpecies: "SPF_2",
    joistDirection: "WIDTH",
    rafterSize: null,
    rafterSpacingIn: null,
    overheadDoorWidthIn: null,
    overheadDoorHeightIn: null,
    drawingScale: "FIT",
    drawingStatus: "DRAFT",
    dimDatum: "FACE_FRAMING",
    envelopeProvenance: "UNKNOWN",
    issuedRevision: null,
    rooms: {},
    openings: [],
    evidence: [],
    notes: null,
  };
}

export function ensureBlueprint(project: Project): Blueprint {
  const bp = project.blueprint ?? emptyBlueprint();
  return {
    ...emptyBlueprint(),
    ...bp,
    rooms: bp.rooms ?? {},
    openings: Array.isArray(bp.openings) ? bp.openings : [],
    evidence: Array.isArray(bp.evidence) ? bp.evidence : [],
    drawingScale: bp.drawingScale ?? "FIT",
    drawingStatus: bp.drawingStatus ?? "DRAFT",
    dimDatum: bp.dimDatum ?? "FACE_FRAMING",
    envelopeProvenance:
      bp.envelopeProvenance ?? (bp.widthIn != null && bp.depthIn != null ? "PROPOSED" : "UNKNOWN"),
    issuedRevision: bp.issuedRevision ?? null,
  };
}
