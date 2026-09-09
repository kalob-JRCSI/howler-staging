import { beforeEach, describe, expect, it } from "vitest";
import {
  buildScopeEvent,
  buildScopeView,
  ScopeCommandError,
} from "../../src/operator/scope";
import type { ScopeCommandV096 } from "../../src/operator/scope";
import { applyEventMutations } from "../../src/engine/reducer";
import { validateProjectModel } from "../../src/domain/validation";
import { appendEvent } from "../../src/engine/engine";
import type {
  ActivityV094,
  BudgetLineV097,
  ProjectFinancialsV097,
  ProjectModelV094,
  ScopeItemV096,
} from "../../src/domain/types";

function activity(
  id: string,
  overrides: Partial<ActivityV094> = {},
): ActivityV094 {
  return {
    id,
    name: id,
    phase: "Framing",
    state: "NOT_STARTED",
    duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: [] },
    constraintIds: [],
    sourceIds: [],
    ...overrides,
  };
}

function scopeItem(
  id: string,
  overrides: Partial<ScopeItemV096> = {},
): ScopeItemV096 {
  return {
    id,
    description: id,
    phase: "Framing",
    active: true,
    status: "NOT_STARTED",
    included: true,
    activityIds: [],
    planDocumentRefs: [],
    sourceIds: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test Project",
    projectType: "RESIDENTIAL",
    timezone: "UTC",
    forecastAnchorDate: "2026-01-01",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {},
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

function idSequence(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String((n += 1))}`;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`expected ${label} to be defined`);
  return value;
}

function scopeItemOf(model: ProjectModelV094, id: string): ScopeItemV096 {
  return required(model.scopeItems?.[id], `scopeItems.${id}`);
}

describe("buildScopeView", () => {
  it("synthesizes a transient current-equals-baseline row for a never-edited baseline item", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [
          { id: "tile", label: "Master shower tile", phase: "Finishes" },
        ],
      },
    });
    const view = buildScopeView(model);
    expect(view.items).toHaveLength(1);
    const row = required(view.items[0], "items[0]");
    expect(row.description).toBe("Master shower tile");
    expect(row.status).toBe("NOT_STARTED");
    expect(row.included).toBe(true);
    expect(row.addedAfterBaseline).toBe(false);
    expect(row.baselineDescription).toBe("Master shower tile");
  });

  it("defaults activityIds from a same-id activity, the exact Genesis convention", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [{ id: "framing", label: "Framing", phase: "Framing" }],
      },
      activities: { framing: activity("framing", { name: "Framing" }) },
    });
    const row = required(buildScopeView(model).items[0], "items[0]");
    expect(row.activities).toEqual([
      {
        activityId: "framing",
        activityName: "Framing",
        activityState: "NOT_STARTED",
      },
    ]);
  });

  it("shows a materialized (edited) item's own current fields, not the baseline's", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [
          { id: "tile", label: "Master shower tile", phase: "Finishes" },
        ],
      },
      scopeItems: {
        tile: scopeItem("tile", {
          description: "Hall bathroom tile",
          status: "IN_PROGRESS",
        }),
      },
    });
    const row = required(buildScopeView(model).items[0], "items[0]");
    expect(row.description).toBe("Hall bathroom tile");
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.baselineDescription).toBe("Master shower tile");
    expect(row.addedAfterBaseline).toBe(false);
  });

  it("marks a scope item with no baseline counterpart as added after baseline", () => {
    const model = baseModel({
      scopeItems: {
        lamp: scopeItem("lamp", {
          description: "Exterior lamp-post relocation",
        }),
      },
    });
    const row = required(buildScopeView(model).items[0], "items[0]");
    expect(row.addedAfterBaseline).toBe(true);
    expect(row.baselineDescription).toBeNull();
  });

  it("excludes deactivated scope items from the view", () => {
    const model = baseModel({
      scopeItems: { removed: scopeItem("removed", { active: false }) },
    });
    expect(buildScopeView(model).items).toHaveLength(0);
  });

  describe("insights", () => {
    it("flags an included scope item with no schedule activity", () => {
      const model = baseModel({
        scopeItems: {
          closet: scopeItem("closet", { description: "Custom closet" }),
        },
      });
      const insights = buildScopeView(model).insights;
      expect(
        insights.some(
          (i) =>
            i.kind === "NO_SCHEDULE_ACTIVITY" && i.scopeItemId === "closet",
        ),
      ).toBe(true);
    });

    it("does not flag an excluded scope item for having no schedule activity", () => {
      const model = baseModel({
        scopeItems: {
          closet: scopeItem("closet", { included: false }),
        },
      });
      expect(
        buildScopeView(model).insights.some(
          (i) => i.kind === "NO_SCHEDULE_ACTIVITY",
        ),
      ).toBe(false);
    });

    it("flags a scope item added after baseline", () => {
      const model = baseModel({
        scopeItems: { lamp: scopeItem("lamp") },
      });
      expect(
        buildScopeView(model).insights.some(
          (i) => i.kind === "ADDED_AFTER_BASELINE",
        ),
      ).toBe(true);
    });

    it("flags a COMPLETE scope item whose associated activity is not complete", () => {
      const model = baseModel({
        activities: { framing: activity("framing", { state: "IN_PROGRESS" }) },
        scopeItems: {
          s1: scopeItem("s1", { status: "COMPLETE", activityIds: ["framing"] }),
        },
      });
      const insights = buildScopeView(model).insights;
      expect(
        insights.some(
          (i) =>
            i.kind === "COMPLETE_BUT_ACTIVITY_INCOMPLETE" &&
            i.activityId === "framing",
        ),
      ).toBe(true);
    });

    it("never flags COMPLETE_BUT_ACTIVITY_INCOMPLETE when the activity really is complete", () => {
      const model = baseModel({
        activities: { framing: activity("framing", { state: "COMPLETE" }) },
        scopeItems: {
          s1: scopeItem("s1", { status: "COMPLETE", activityIds: ["framing"] }),
        },
      });
      expect(
        buildScopeView(model).insights.some(
          (i) => i.kind === "COMPLETE_BUT_ACTIVITY_INCOMPLETE",
        ),
      ).toBe(false);
    });

    it("flags a real schedule activity with no corresponding scope item", () => {
      const model = baseModel({
        activities: { orphan: activity("orphan", { name: "Orphan activity" }) },
      });
      expect(
        buildScopeView(model).insights.some(
          (i) => i.kind === "UNSCOPED_ACTIVITY" && i.activityId === "orphan",
        ),
      ).toBe(true);
    });
  });
});

describe("buildScopeEvent", () => {
  const now = "2026-09-08T12:00:00.000Z";
  let uniqueId: () => string;

  beforeEach(() => {
    uniqueId = idSequence("id");
  });

  function apply(
    model: ProjectModelV094,
    command: ScopeCommandV096,
  ): ProjectModelV094 {
    const { event } = buildScopeEvent(model, command, now, uniqueId);
    const mutated = applyEventMutations(model, event);
    const withEvent = appendEvent(mutated, event);
    validateProjectModel(withEvent);
    return withEvent;
  }

  it("ADD_SCOPE_ITEM creates a valid new, included, NOT_STARTED scope item", () => {
    const model = baseModel();
    const result = apply(model, {
      kind: "ADD_SCOPE_ITEM",
      description: "Exterior lamp-post relocation",
      phase: "Exterior",
    });
    const added = Object.values(result.scopeItems ?? {})[0];
    expect(added?.description).toBe("Exterior lamp-post relocation");
    expect(added?.status).toBe("NOT_STARTED");
    expect(added?.included).toBe(true);
    expect(added?.active).toBe(true);
  });

  it("ADD_SCOPE_ITEM rejects an empty description", () => {
    const model = baseModel();
    expect(() =>
      buildScopeEvent(
        model,
        { kind: "ADD_SCOPE_ITEM", description: "  ", phase: "Exterior" },
        now,
        uniqueId,
      ),
    ).toThrow(ScopeCommandError);
  });

  it("marks SET_DESCRIPTION/SET_PHASE/SET_TRADE as clerical, everything else as not", () => {
    const model = baseModel({ scopeItems: { s1: scopeItem("s1") } });
    const clerical = buildScopeEvent(
      model,
      { kind: "SET_DESCRIPTION", scopeItemId: "s1", description: "New name" },
      now,
      uniqueId,
    );
    expect(clerical.clerical).toBe(true);
    const material = buildScopeEvent(
      model,
      { kind: "SET_STATUS", scopeItemId: "s1", status: "IN_PROGRESS" },
      now,
      uniqueId,
    );
    expect(material.clerical).toBe(false);
  });

  it("SET_DESCRIPTION, SET_PHASE, and SET_TRADE each patch only the targeted field", () => {
    const model = baseModel({
      scopeItems: {
        s1: scopeItem("s1", { description: "Hallway tile", phase: "Finishes" }),
      },
    });
    const renamed = apply(model, {
      kind: "SET_DESCRIPTION",
      scopeItemId: "s1",
      description: "Hall bathroom tile",
    });
    expect(scopeItemOf(renamed, "s1").description).toBe("Hall bathroom tile");
    expect(scopeItemOf(renamed, "s1").phase).toBe("Finishes");

    const rephased = apply(renamed, {
      kind: "SET_PHASE",
      scopeItemId: "s1",
      phase: "Punch",
    });
    expect(scopeItemOf(rephased, "s1").phase).toBe("Punch");
    expect(scopeItemOf(rephased, "s1").description).toBe("Hall bathroom tile");

    const retraded = apply(rephased, {
      kind: "SET_TRADE",
      scopeItemId: "s1",
      trade: "Tile",
    });
    expect(scopeItemOf(retraded, "s1").trade).toBe("Tile");
  });

  it("SET_INCLUDED toggles inclusion", () => {
    const model = baseModel({ scopeItems: { s1: scopeItem("s1") } });
    const excluded = apply(model, {
      kind: "SET_INCLUDED",
      scopeItemId: "s1",
      included: false,
    });
    expect(scopeItemOf(excluded, "s1").included).toBe(false);
  });

  it("SET_ALLOWANCE sets and then clears an allowance", () => {
    const model = baseModel({ scopeItems: { s1: scopeItem("s1") } });
    const withAllowance = apply(model, {
      kind: "SET_ALLOWANCE",
      scopeItemId: "s1",
      allowance: { amount: 2500, currency: "USD" },
    });
    expect(scopeItemOf(withAllowance, "s1").allowance).toEqual({
      amount: 2500,
      currency: "USD",
    });

    const cleared = apply(withAllowance, {
      kind: "SET_ALLOWANCE",
      scopeItemId: "s1",
      allowance: null,
    });
    expect(scopeItemOf(cleared, "s1").allowance).toBeUndefined();
  });

  it("SET_ALLOWANCE rejects a negative amount", () => {
    const model = baseModel({ scopeItems: { s1: scopeItem("s1") } });
    expect(() =>
      buildScopeEvent(
        model,
        {
          kind: "SET_ALLOWANCE",
          scopeItemId: "s1",
          allowance: { amount: -1, currency: "USD" },
        },
        now,
        uniqueId,
      ),
    ).toThrow(ScopeCommandError);
  });

  it("SET_STATUS is always an explicit PM change, never inferred", () => {
    const model = baseModel({ scopeItems: { s1: scopeItem("s1") } });
    const inProgress = apply(model, {
      kind: "SET_STATUS",
      scopeItemId: "s1",
      status: "IN_PROGRESS",
    });
    expect(scopeItemOf(inProgress, "s1").status).toBe("IN_PROGRESS");
    const blocked = apply(inProgress, {
      kind: "SET_STATUS",
      scopeItemId: "s1",
      status: "BLOCKED",
    });
    expect(scopeItemOf(blocked, "s1").status).toBe("BLOCKED");
  });

  it("ASSOCIATE_ACTIVITIES links real activities and rejects an unknown one", () => {
    const model = baseModel({
      activities: { demo: activity("demo"), tile: activity("tile") },
      scopeItems: { s1: scopeItem("s1") },
    });
    const associated = apply(model, {
      kind: "ASSOCIATE_ACTIVITIES",
      scopeItemId: "s1",
      activityIds: ["demo", "tile"],
    });
    expect(scopeItemOf(associated, "s1").activityIds).toEqual(["demo", "tile"]);

    expect(() =>
      buildScopeEvent(
        model,
        {
          kind: "ASSOCIATE_ACTIVITIES",
          scopeItemId: "s1",
          activityIds: ["ghost"],
        },
        now,
        uniqueId,
      ),
    ).toThrow(ScopeCommandError);
  });

  it("DEACTIVATE_SCOPE_ITEM is non-destructive: the record remains, only active flips", () => {
    const model = baseModel({
      scopeItems: {
        s1: scopeItem("s1", { description: "Shower accent wall" }),
      },
    });
    const removed = apply(model, {
      kind: "DEACTIVATE_SCOPE_ITEM",
      scopeItemId: "s1",
    });
    expect(scopeItemOf(removed, "s1").active).toBe(false);
    expect(scopeItemOf(removed, "s1").description).toBe("Shower accent wall");
  });

  it("materializes a baseline-only item on its first edit, including the free activity default", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [{ id: "framing", label: "Framing", phase: "Framing" }],
      },
      activities: { framing: activity("framing", { name: "Framing" }) },
    });
    expect(model.scopeItems).toBeUndefined();
    const edited = apply(model, {
      kind: "SET_STATUS",
      scopeItemId: "framing",
      status: "IN_PROGRESS",
    });
    const materialized = scopeItemOf(edited, "framing");
    expect(materialized.status).toBe("IN_PROGRESS");
    expect(materialized.description).toBe("Framing");
    expect(materialized.activityIds).toEqual(["framing"]);
  });

  it("rejects a command against a scope item id that exists in neither scopeItems nor baseline", () => {
    const model = baseModel();
    expect(() =>
      buildScopeEvent(
        model,
        { kind: "SET_DESCRIPTION", scopeItemId: "ghost", description: "x" },
        now,
        uniqueId,
      ),
    ).toThrow(ScopeCommandError);
  });

  it("stamps a fresh, referentially-valid Source and PM_CONFIRMED verification on every command", () => {
    const model = baseModel({
      scopeItems: { s1: scopeItem("s1", { description: "Custom closet" }) },
    });
    const { event, historyNote } = buildScopeEvent(
      model,
      { kind: "SET_STATUS", scopeItemId: "s1", status: "IN_PROGRESS" },
      now,
      uniqueId,
    );
    expect(event.verification).toBe("PM_CONFIRMED");
    expect(event.baseRevision).toBe(model.revision);
    expect(historyNote).toContain("Custom closet");
    expect(event.mutations.some((m) => m.op === "UPSERT_SOURCE")).toBe(true);
  });
});

describe("Phase 4 Task 8: linked Budget allowance (allowanceBudgetLineId)", () => {
  const now = "2026-09-08T12:00:00.000Z";
  let uniqueId: () => string;

  beforeEach(() => {
    uniqueId = idSequence("id");
  });

  function financialsWith(
    overrides: Partial<ProjectFinancialsV097> = {},
  ): ProjectFinancialsV097 {
    return {
      currency: "USD",
      baselineSourceIds: [],
      categories: {},
      budgetLines: {},
      commitments: {},
      actualCosts: {},
      changeOrders: {},
      ...overrides,
    };
  }

  function budgetLine(overrides: Partial<BudgetLineV097> = {}): BudgetLineV097 {
    return {
      id: "line1",
      categoryId: "cat1",
      description: "Kitchen fixtures allowance",
      isAllowance: true,
      scopeItemIds: [],
      active: true,
      sourceIds: [],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("buildScopeView: linkedBudgetLine is null when the scope item has no allowanceBudgetLineId", () => {
    const model = baseModel({
      scopeItems: { s1: scopeItem("s1") },
      financials: financialsWith({ budgetLines: { line1: budgetLine() } }),
    });
    const row = required(buildScopeView(model).items[0], "items[0]");
    expect(row.linkedBudgetLine).toBeNull();
  });

  it("buildScopeView: linkedBudgetLine is null when financials were never initialized, even if allowanceBudgetLineId is set", () => {
    const model = baseModel({
      scopeItems: {
        s1: scopeItem("s1", { allowanceBudgetLineId: "line1" }),
      },
    });
    const row = required(buildScopeView(model).items[0], "items[0]");
    expect(row.linkedBudgetLine).toBeNull();
  });

  it("buildScopeView: computes the exact $1,000 allowance vs $1,175 actual = -$175 variance example", () => {
    const model = baseModel({
      scopeItems: {
        s1: scopeItem("s1", { allowanceBudgetLineId: "line1" }),
      },
      financials: financialsWith({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
          }),
        },
        actualCosts: {
          a1: {
            id: "a1",
            amount: { amountMinor: 117500, currency: "USD" },
            date: "2026-08-15",
            description: "Fixture selection",
            budgetLineId: "line1",
            status: "RECORDED",
            sourceIds: [],
            createdAt: "2026-08-15T00:00:00.000Z",
            updatedAt: "2026-08-15T00:00:00.000Z",
          },
        },
      }),
    });
    const row = required(buildScopeView(model).items[0], "items[0]");
    expect(row.linkedBudgetLine).toEqual({
      budgetLineId: "line1",
      description: "Kitchen fixtures allowance",
      allowanceAmount: { amountMinor: 100000, currency: "USD" },
      actualTotal: { amountMinor: 117500, currency: "USD" },
      variance: { amountMinor: -17500, currency: "USD" },
    });
  });

  it("buildScopeView: variance is null (Unknown) when the linked line has no baselineAmount, never $0", () => {
    const model = baseModel({
      scopeItems: {
        s1: scopeItem("s1", { allowanceBudgetLineId: "line1" }),
      },
      financials: financialsWith({ budgetLines: { line1: budgetLine() } }),
    });
    const row = required(buildScopeView(model).items[0], "items[0]");
    expect(row.linkedBudgetLine?.allowanceAmount).toBeNull();
    expect(row.linkedBudgetLine?.variance).toBeNull();
    expect(row.linkedBudgetLine?.actualTotal).toEqual({
      amountMinor: 0,
      currency: "USD",
    });
  });

  it("buildScopeEvent SET_ALLOWANCE_BUDGET_LINE: links to a real budget line", () => {
    const model = baseModel({
      scopeItems: { s1: scopeItem("s1") },
      financials: financialsWith({ budgetLines: { line1: budgetLine() } }),
    });
    const { event, clerical } = buildScopeEvent(
      model,
      {
        kind: "SET_ALLOWANCE_BUDGET_LINE",
        scopeItemId: "s1",
        budgetLineId: "line1",
      },
      now,
      uniqueId,
    );
    expect(clerical).toBe(false);
    const mutation = event.mutations.find((m) => m.op === "UPSERT_SCOPE_ITEM");
    expect(
      mutation && "scopeItem" in mutation
        ? mutation.scopeItem.allowanceBudgetLineId
        : undefined,
    ).toBe("line1");
  });

  it("buildScopeEvent SET_ALLOWANCE_BUDGET_LINE: unlinks with budgetLineId null", () => {
    const model = baseModel({
      scopeItems: {
        s1: scopeItem("s1", { allowanceBudgetLineId: "line1" }),
      },
      financials: financialsWith({ budgetLines: { line1: budgetLine() } }),
    });
    const { event } = buildScopeEvent(
      model,
      {
        kind: "SET_ALLOWANCE_BUDGET_LINE",
        scopeItemId: "s1",
        budgetLineId: null,
      },
      now,
      uniqueId,
    );
    const mutation = event.mutations.find((m) => m.op === "UPSERT_SCOPE_ITEM");
    expect(
      mutation && "scopeItem" in mutation
        ? mutation.scopeItem.allowanceBudgetLineId
        : undefined,
    ).toBeUndefined();
  });

  it("buildScopeEvent SET_ALLOWANCE_BUDGET_LINE: rejects an unknown budget line", () => {
    const model = baseModel({
      scopeItems: { s1: scopeItem("s1") },
      financials: financialsWith(),
    });
    expect(() =>
      buildScopeEvent(
        model,
        {
          kind: "SET_ALLOWANCE_BUDGET_LINE",
          scopeItemId: "s1",
          budgetLineId: "missing",
        },
        now,
        uniqueId,
      ),
    ).toThrow("Unknown budget line: missing");
  });
});
