// Transcribed from baseline commit d851357bd08a795df3508ff610da9eaa1c386a43 (worker.js); unclosed categorical fields stay `string` rather than a guessed union.

export type ISODate = string;
export type ISODateTime = string;

export type ActivityState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export type VerificationState =
  | "UNVERIFIED"
  | "STALE_REVERIFY"
  | "PM_CONFIRMED"
  | "CORROBORATED"
  | "FIELD_VERIFIED"
  | "VERIFIED_ACTUAL";

export interface DurationEstimateV094 {
  optimistic: number;
  likely: number;
  conservative: number;
  sourceIds: string[];
}

export interface ScheduleLockV094 {
  startDate?: ISODate;
  finishDate?: ISODate;
  sourceId: string;
}

export interface ConstraintReadinessV094 {
  optimistic: ISODate;
  likely: ISODate;
  conservative: ISODate;
}

export interface SourceV094 {
  id: string;
  type: string;
  label: string;
  observedAt: ISODateTime;
  authority: number;
  reliability: number;
  effectiveDate?: ISODate;
  supersededBySourceId?: string;
}

export interface ActivityV094 {
  id: string;
  name: string;
  phase: string;
  state: ActivityState;
  duration: DurationEstimateV094;
  constraintIds: string[];
  sourceIds: string[];
  actualStart?: ISODate;
  actualStartSourceIds?: string[];
  actualStartVerification?: VerificationState;
  actualFinish?: ISODate;
  actualFinishSourceIds?: string[];
  actualFinishVerification?: VerificationState;
  scheduleLock?: ScheduleLockV094;
  tags?: string[];
}

export interface ConstraintV094 {
  id: string;
  activityId: string;
  type: string;
  label: string;
  state: string;
  hard: boolean;
  readiness?: ConstraintReadinessV094;
  sourceIds: string[];
  verification: VerificationState;
}

export interface DependencyV094 {
  id: string;
  active: boolean;
  predecessorId: string;
  successorId: string;
  type: string;
  lagWorkdays: number;
  hard: boolean;
  reason: string;
  sourceIds: string[];
}

export interface ConflictV094 {
  id: string;
  category: string;
  description: string;
  activityIds: string[];
  sourceIds: string[];
  severity: string;
  status: string;
  resolutionNote?: string;
}

export interface CommercialSignalV094 {
  id: string;
  kind: string;
  activityIds: string[];
  workPackage: string;
  amount: number;
  currency: string;
  selected: boolean;
  scopeCoverage: string;
  sourceIds: string[];
}

export interface WorkloadSignalV094 {
  id: string;
  activityIds: string[];
  dimension: string;
  value: number;
  unit: string;
  label: string;
  sourceIds: string[];
}

export interface WorkCalendarV094 {
  workingWeekdays: number[];
  holidays: ISODate[];
}

export interface ProjectEventV094 {
  id: string;
  baseRevision: number;
  projectId: string;
  type: string;
  occurredAt: ISODateTime;
  receivedAt: ISODateTime;
  sourceIds: string[];
  verification: VerificationState;
  impactSeedActivityIds: string[];
  mutations: EventMutationV094[];
  payload: Record<string, unknown>;
  note?: string;
  causeCode?: string;
  causeVerification?: string;
  /**
   * Conversational PM layer (docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md
   * "Oversight model" section): optional, additive, backward-compatible. Absent on every existing
   * caller (admin UI evidence textarea, hand-built sync scripts) — those keep today's exact
   * strict oversight-gate behavior. Only the conversational claim compiler
   * (src/operator/claim-compiler.ts) ever sets this field, and only from its fixed CLASSIFY
   * table, never inferred from event content.
   */
  mutationClass?: "FACT" | "COMMITMENT";
}

// v0.9.6 Contractor Hub: the Project Genesis intake/review artifact carried on the canonical
// model, additive and optional (docs/superpowers/specs/2026-09-04-howler-contractor-hub-v096-design.md).
// A project created before v0.9.6, or via the existing seed/import paths, simply has no
// `projectProfile` -- every existing required field on ProjectModelV094 is unchanged.
export interface ProjectProfileScopeItemV096 {
  id: string;
  label: string;
  phase: string;
}

export interface ProjectBudgetV096 {
  baseline?: number;
  spent?: number;
  currency: string;
}

export interface ProjectProfileV096 {
  clientName?: string;
  address?: string;
  baselineScope: ProjectProfileScopeItemV096[];
  budget?: ProjectBudgetV096;
  genesisSourceId?: string;
  genesisApprovedAt?: ISODateTime;
}

// Phase 3 (Howler Recovery Directive, Functional Project Scope Workspace): the CURRENT, mutable
// project scope -- deliberately a separate map from `projectProfile.baselineScope` above, which
// stays frozen forever (nothing mutates it) so "what was originally contracted" and "what are we
// now actually building" both remain independently traceable. A scope item whose id also appears
// in baselineScope descended from that baseline entry; one that doesn't was added after baseline.
export type ScopeStatusV096 =
  "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "NOT_APPLICABLE";

export interface ScopeAllowanceV096 {
  amount: number;
  currency: string;
  note?: string;
}

export interface ScopeItemV096 {
  id: string;
  description: string;
  phase: string;
  active: boolean;
  status: ScopeStatusV096;
  included: boolean;
  trade?: string;
  allowance?: ScopeAllowanceV096;
  responsibleVendor?: string;
  // Real, validated references into `activities` -- the only connective tissue between Scope
  // (what are we building) and Schedule (when/in what sequence). A scope item never becomes a
  // schedule activity itself, and an activity carries no reciprocal scope reference; the reverse
  // mapping is computed on read, exactly like Schedule's own dependency refs.
  activityIds: string[];
  // Forward-compatible only: no Plans/Photos/Documents module exists yet, so these are never
  // populated or read by anything in this phase -- present so a later phase can add real
  // references without a schema migration.
  planDocumentRefs: string[];
  // Phase 4 (corrected plan, Correction 7): replaces the never-populated, never-read
  // `changeOrderRef` field above (removed, not deprecated-in-place -- nothing referenced it).
  // A one-allowance-owner relationship only: the single BudgetLineV097 this scope item's
  // allowance is tracked against, if any. The general many-to-many Scope<->Budget association
  // is the reverse: `BudgetLineV097.scopeItemIds[]` and `ChangeOrderV097.scopeItemIds[]` are the
  // owning collections; this field is never written back to from those, only read alongside them.
  allowanceBudgetLineId?: string;
  notes?: string;
  sourceIds: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// Phase 4 (Howler Recovery Directive, Budget + Change Orders, corrected plan): the one money
// shape used by every financial entity below. `currency` is deliberately a plain `string`, not
// `SupportedCurrencyCode` -- this is the wire/storage shape, and a persisted or legacy value must
// be able to round-trip even if its currency turns out to be unsupported; `isValidMoney` /
// `isSupportedCurrency` in src/domain/money.ts are the actual validation boundary. Never confuse
// this with `ProjectBudgetV096.currency` / `ScopeAllowanceV096.currency` above, which predate this
// contract and are legacy, unvalidated `LegacyCurrencyLabel` strings -- read-only display fields
// this phase does not parse or reinterpret as cents.
export interface MoneyV097 {
  amountMinor: number;
  currency: string;
}

// Phase 4 (Howler Recovery Directive, Budget + Change Orders, corrected plan): Budget/Change
// Order entities. All totals a PM or Howler Intelligence would call "revised budget," "pending
// exposure," "committed," "actual," or "unallocated" are DERIVED on every read from these small
// records -- never stored/incremented on any entity -- which is the mechanism that prevents
// additive double-counting under retry or duplicate-confirmation. See
// src/operator/budget.ts / src/operator/change-orders.ts (Task 3) for those derivations.
//
// A project tracks money in exactly one currency (`ProjectFinancialsV097.currency`, chosen once
// via INITIALIZE_PROJECT_FINANCIALS and never changed): no invented FX conversion. Every
// MoneyV097 value reachable from `financials` below must share that currency; validation.ts
// enforces this project-wide, not just per-field currency validity.

export interface BudgetCategoryV097 {
  id: string;
  name: string;
  // True only for a category seeded from the owner's construction starter list (never a
  // hard-coded accounting taxonomy baked into the reducer/validation) -- fully PM-editable and
  // deactivatable exactly like a PM-created category.
  isDefault: boolean;
  active: boolean;
  sortOrder?: number;
  notes?: string;
  sourceIds: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BudgetLineV097 {
  id: string;
  categoryId: string;
  description: string;
  costCode?: string;
  trade?: string;
  // "Unknown" when absent -- a line legitimately exists (e.g. scoped but not yet priced) before
  // it has a baseline. Never fabricated as 0; a corrected baseline is a new
  // SET-style UPSERT_BUDGET_LINE event, the old value stays in eventLedger history.
  baselineAmount?: MoneyV097;
  isAllowance: boolean;
  // Real, optional stable reference only -- no Vendors/Trades module exists yet in this phase.
  vendorRef?: string;
  // General many-to-many Scope association (a line can cover several scope items; a scope item's
  // single allowance-owner line, if any, is the reverse `ScopeItemV096.allowanceBudgetLineId`).
  // The reverse view is always computed on read, never written back here.
  scopeItemIds: string[];
  notes?: string;
  active: boolean;
  sourceIds: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type CommitmentStatusV097 = "ACTIVE" | "VOID";

export interface CommitmentAllocationV097 {
  budgetLineId: string;
  amount: MoneyV097;
}

export interface CommitmentV097 {
  id: string;
  // Total committed amount (e.g. the full PO/subcontract value) -- may exceed the sum of
  // `allocations`; see `allocations` below.
  amount: MoneyV097;
  // Correction 6: partial/unallocated allocation is legal and expected, not an error state. The
  // sum of `allocations[].amount` may be less than `amount`; the remainder
  // (`unallocatedAmount`, computed in src/operator/budget.ts, never stored here) is a real,
  // visible fact for the PM to resolve, not silently dropped or forced to zero.
  allocations: CommitmentAllocationV097[];
  vendorRef?: string;
  // Optional Schedule association for context/reporting only -- a commitment never mutates
  // Schedule, and this reference carries no scheduling authority.
  activityId?: string;
  scopeItemIds: string[];
  reference?: string;
  // No separate DEACTIVATE_COMMITMENT op exists: correction/voiding is expressed by re-UPSERTing
  // with `status: "VOID"`, keeping one mutation op per entity and full history via the event that
  // changed it, exactly like Commitment's own status field says so on every read.
  status: CommitmentStatusV097;
  notes?: string;
  sourceIds: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ActualCostStatusV097 = "RECORDED" | "VOID";

export interface ActualCostV097 {
  id: string;
  amount: MoneyV097;
  date: ISODate;
  description: string;
  // Correction 6: optional -- an actual cost can be recorded before anyone has decided which
  // budget line it belongs to. Absence is a real "unallocated actual cost," never coerced to a
  // guessed line.
  budgetLineId?: string;
  commitmentId?: string;
  reference?: string;
  // No separate DEACTIVATE_ACTUAL_COST op: correction/voiding is a re-UPSERT with
  // `status: "VOID"`, same rationale as CommitmentV097.status above.
  status: ActualCostStatusV097;
  notes?: string;
  sourceIds: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// Exact-once approval, explicit auditable reject/void/correction (reconciliation doc, Change
// Orders acceptance walkthrough): APPROVED is reachable only from PENDING_APPROVAL, and only VOID
// follows APPROVED -- there is no path back from APPROVED to any earlier state, so a change order
// cannot be approved twice and its approved-budget effect cannot be silently reapplied. The legal
// transition table lives next to the reducer's UPSERT_CHANGE_ORDER case in src/engine/reducer.ts,
// the only place old-status-to-new-status is actually checked (validation.ts only ever sees the
// final model, not the transition that produced it).
export type ChangeOrderStatusV097 =
  "DRAFT" | "PROPOSED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "VOID";

export interface ChangeOrderCostAllocationV097 {
  budgetLineId: string;
  amount: MoneyV097;
}

export interface ChangeOrderV097 {
  id: string;
  // PM-facing display number (e.g. "CO-014"), distinct from the internal `id` -- optional because
  // a DRAFT originated conversationally or from Scope/Budget may not have one assigned yet.
  number?: string;
  title: string;
  description?: string;
  reason?: string;
  status: ChangeOrderStatusV097;
  // Total declared cost. May be negative (a credit CO is a legitimate, real record, not modeled
  // as a separate type).
  cost: MoneyV097;
  // Correction 5: partial/unallocated allocation to budget lines is legal -- the sum of
  // `costAllocations[].amount` may be less than `cost`; the remainder (`unallocatedAmount`,
  // computed in src/operator/change-orders.ts, never stored here) is a real, visible fact.
  costAllocations: ChangeOrderCostAllocationV097[];
  // A DECLARED fact only. Approving this change order never itself mutates Schedule -- a
  // separately authorized Schedule command (existing UPSERT_ACTIVITY/UPSERT_DEPENDENCY pathway)
  // is the only thing that ever changes activities/dependencies/locks. This preserves the
  // Schedule-mutation boundary the corrected plan requires.
  declaredScheduleImpactDays?: number;
  scopeItemIds: string[];
  // Optional Schedule association for context/reporting only, exactly like
  // CommitmentV097.activityId -- carries no scheduling authority.
  activityIds: string[];
  categoryId?: string;
  clientApproved?: boolean;
  requestedAt?: ISODateTime;
  proposedAt?: ISODateTime;
  approvedAt?: ISODateTime;
  rejectedAt?: ISODateTime;
  voidedAt?: ISODateTime;
  notes?: string;
  sourceIds: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// The financial state for one project. Optional on ProjectModelV094 itself: a project that has
// never had INITIALIZE_PROJECT_FINANCIALS applied to it (every project that predates Phase 4,
// and any new project before its first financial action) simply has no `financials` -- absence
// is "not yet initialized," never an implied zero-currency-less budget of $0.
export interface ProjectFinancialsV097 {
  // The project's one tracked currency, set once at INITIALIZE_PROJECT_FINANCIALS and never
  // changed by any later event (changing it would be an invented FX conversion).
  currency: string;
  // "Unknown" when absent -- correction 2/3: a project's overall financial baseline is not
  // required to exist, and is never fabricated as 0 merely because INITIALIZE_PROJECT_FINANCIALS
  // ran. Set (or corrected) independently via SET_PROJECT_FINANCIAL_BASELINE.
  baseline?: MoneyV097;
  baselineSetAt?: ISODateTime;
  baselineSourceIds: string[];
  categories: Record<string, BudgetCategoryV097>;
  budgetLines: Record<string, BudgetLineV097>;
  commitments: Record<string, CommitmentV097>;
  actualCosts: Record<string, ActualCostV097>;
  changeOrders: Record<string, ChangeOrderV097>;
}

export interface ProjectModelV094 {
  projectId: string;
  revision: number;
  name: string;
  projectType: string;
  timezone: string;
  forecastAnchorDate: ISODate;
  calendar: WorkCalendarV094;
  sources: Record<string, SourceV094>;
  activities: Record<string, ActivityV094>;
  constraints: Record<string, ConstraintV094>;
  dependencies: Record<string, DependencyV094>;
  conflicts?: Record<string, ConflictV094>;
  commercialSignals?: Record<string, CommercialSignalV094>;
  workloadSignals?: Record<string, WorkloadSignalV094>;
  eventLedger: ProjectEventV094[];
  projectProfile?: ProjectProfileV096;
  scopeItems?: Record<string, ScopeItemV096>;
  financials?: ProjectFinancialsV097;
}

// Every EventMutationV094 variant below corresponds 1:1 to a `case` in the
// baseline bundle's src/reducer.js `applyEventMutations` switch statement.

export interface SetActualStartMutationV094 {
  op: "SET_ACTUAL_START";
  activityId: string;
  date: ISODate;
}

export interface SetActualFinishMutationV094 {
  op: "SET_ACTUAL_FINISH";
  activityId: string;
  date: ISODate;
}

export interface SetActivityStateMutationV094 {
  op: "SET_ACTIVITY_STATE";
  activityId: string;
  state: ActivityState;
}

export interface SetDurationMutationV094 {
  op: "SET_DURATION";
  activityId: string;
  duration: DurationEstimateV094;
}

export interface SetConstraintStateMutationV094 {
  op: "SET_CONSTRAINT_STATE";
  constraintId: string;
  state: string;
  verification?: VerificationState;
}

export interface SetConstraintReadinessMutationV094 {
  op: "SET_CONSTRAINT_READINESS";
  constraintId: string;
  readiness: ConstraintReadinessV094;
  verification?: VerificationState;
}

export interface SetScheduleLockMutationV094 {
  op: "SET_SCHEDULE_LOCK";
  activityId: string;
  lock: ScheduleLockV094;
}

export interface ClearScheduleLockMutationV094 {
  op: "CLEAR_SCHEDULE_LOCK";
  activityId: string;
}

export interface UpsertSourceMutationV094 {
  op: "UPSERT_SOURCE";
  source: SourceV094;
}

export interface SupersedeSourceMutationV094 {
  op: "SUPERSEDE_SOURCE";
  sourceId: string;
  supersededBySourceId: string;
}

export interface UpsertConflictMutationV094 {
  op: "UPSERT_CONFLICT";
  conflict: ConflictV094;
}

export interface ResolveConflictMutationV094 {
  op: "RESOLVE_CONFLICT";
  conflictId: string;
  resolutionNote: string;
}

export interface UpsertCommercialSignalMutationV094 {
  op: "UPSERT_COMMERCIAL_SIGNAL";
  signal: CommercialSignalV094;
}

export interface UpsertWorkloadSignalMutationV094 {
  op: "UPSERT_WORKLOAD_SIGNAL";
  signal: WorkloadSignalV094;
}

export interface UpsertActivityMutationV094 {
  op: "UPSERT_ACTIVITY";
  activity: ActivityV094;
}

export interface UpsertConstraintMutationV094 {
  op: "UPSERT_CONSTRAINT";
  constraint: ConstraintV094;
}

export interface UpsertDependencyMutationV094 {
  op: "UPSERT_DEPENDENCY";
  dependency: DependencyV094;
}

export interface DeactivateDependencyMutationV094 {
  op: "DEACTIVATE_DEPENDENCY";
  dependencyId: string;
}

export interface UpsertScopeItemMutationV094 {
  op: "UPSERT_SCOPE_ITEM";
  scopeItem: ScopeItemV096;
}

export interface DeactivateScopeItemMutationV094 {
  op: "DEACTIVATE_SCOPE_ITEM";
  scopeItemId: string;
}

// Phase 4 (Howler Recovery Directive, Budget + Change Orders, corrected plan): 9 new mutation
// ops. Named ...MutationV094 like every variant above, per this file's own convention -- the
// EventMutationV094 discriminated union is versioned once, permanently; it is each mutation's
// *payload* type (BudgetLineV097, CommitmentV097, etc.) that carries the version reflecting when
// that shape was introduced.

export interface InitializeProjectFinancialsMutationV094 {
  op: "INITIALIZE_PROJECT_FINANCIALS";
  currency: string;
}

export interface SetProjectFinancialBaselineMutationV094 {
  op: "SET_PROJECT_FINANCIAL_BASELINE";
  baseline: MoneyV097;
}

export interface UpsertBudgetCategoryMutationV094 {
  op: "UPSERT_BUDGET_CATEGORY";
  category: BudgetCategoryV097;
}

export interface DeactivateBudgetCategoryMutationV094 {
  op: "DEACTIVATE_BUDGET_CATEGORY";
  categoryId: string;
}

export interface UpsertBudgetLineMutationV094 {
  op: "UPSERT_BUDGET_LINE";
  budgetLine: BudgetLineV097;
}

export interface DeactivateBudgetLineMutationV094 {
  op: "DEACTIVATE_BUDGET_LINE";
  budgetLineId: string;
}

export interface UpsertCommitmentMutationV094 {
  op: "UPSERT_COMMITMENT";
  commitment: CommitmentV097;
}

export interface UpsertActualCostMutationV094 {
  op: "UPSERT_ACTUAL_COST";
  actualCost: ActualCostV097;
}

export interface UpsertChangeOrderMutationV094 {
  op: "UPSERT_CHANGE_ORDER";
  changeOrder: ChangeOrderV097;
}

export type EventMutationV094 =
  | SetActualStartMutationV094
  | SetActualFinishMutationV094
  | SetActivityStateMutationV094
  | SetDurationMutationV094
  | SetConstraintStateMutationV094
  | SetConstraintReadinessMutationV094
  | SetScheduleLockMutationV094
  | ClearScheduleLockMutationV094
  | UpsertSourceMutationV094
  | SupersedeSourceMutationV094
  | UpsertConflictMutationV094
  | ResolveConflictMutationV094
  | UpsertCommercialSignalMutationV094
  | UpsertWorkloadSignalMutationV094
  | UpsertActivityMutationV094
  | UpsertConstraintMutationV094
  | UpsertDependencyMutationV094
  | DeactivateDependencyMutationV094
  | UpsertScopeItemMutationV094
  | DeactivateScopeItemMutationV094
  | InitializeProjectFinancialsMutationV094
  | SetProjectFinancialBaselineMutationV094
  | UpsertBudgetCategoryMutationV094
  | DeactivateBudgetCategoryMutationV094
  | UpsertBudgetLineMutationV094
  | DeactivateBudgetLineMutationV094
  | UpsertCommitmentMutationV094
  | UpsertActualCostMutationV094
  | UpsertChangeOrderMutationV094;
