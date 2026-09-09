import { describe, expect, it } from "vitest";
import {
  buildChangeOrderEvent,
  buildChangeOrdersView,
  ChangeOrderCommandError,
  CLERICAL_CHANGE_ORDER_COMMAND_KINDS,
} from "../../src/operator/change-orders";
import type {
  BudgetCategoryV097,
  BudgetLineV097,
  ChangeOrderV097,
  ProjectFinancialsV097,
  ProjectModelV094,
} from "../../src/domain/types";

function financials(
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

function category(
  overrides: Partial<BudgetCategoryV097> = {},
): BudgetCategoryV097 {
  return {
    id: "cat1",
    name: "Cabinetry",
    isDefault: false,
    active: true,
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function budgetLine(overrides: Partial<BudgetLineV097> = {}): BudgetLineV097 {
  return {
    id: "line1",
    categoryId: "cat1",
    description: "Kitchen cabinets",
    isAllowance: false,
    scopeItemIds: [],
    active: true,
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function changeOrder(
  overrides: Partial<ChangeOrderV097> = {},
): ChangeOrderV097 {
  return {
    id: "co1",
    title: "Cabinetry upgrade",
    status: "DRAFT",
    cost: { amountMinor: 680000, currency: "USD" },
    costAllocations: [],
    scopeItemIds: [],
    activityIds: [],
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function model(overrides: Partial<ProjectModelV094> = {}): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {},
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `id${String(idCounter)}`;
}

describe("buildChangeOrdersView", () => {
  it("reports an uninitialized project honestly", () => {
    const view = buildChangeOrdersView(model());
    expect(view.initialized).toBe(false);
    expect(view.currency).toBeNull();
    expect(view.approvedTotal).toBeNull();
    expect(view.pendingTotal).toBeNull();
    expect(view.changeOrders).toEqual([]);
  });

  it("computes unallocatedAmount as the real remainder for a partially allocated CO", () => {
    const view = buildChangeOrdersView(
      model({
        financials: financials({
          categories: { cat1: category() },
          budgetLines: { line1: budgetLine() },
          changeOrders: {
            co1: changeOrder({
              cost: { amountMinor: 680000, currency: "USD" },
              costAllocations: [
                {
                  budgetLineId: "line1",
                  amount: { amountMinor: 500000, currency: "USD" },
                },
              ],
            }),
          },
        }),
      }),
    );
    expect(view.changeOrders[0]?.unallocatedAmount).toEqual({
      amountMinor: 180000,
      currency: "USD",
    });
  });

  it("agrees with Budget's own approved/pending totals (never a separate, possibly divergent number)", () => {
    const view = buildChangeOrdersView(
      model({
        financials: financials({
          changeOrders: {
            approved: changeOrder({
              id: "approved",
              status: "APPROVED",
              cost: { amountMinor: 1250000, currency: "USD" },
            }),
            pending: changeOrder({
              id: "pending",
              status: "PENDING_APPROVAL",
              cost: { amountMinor: 800000, currency: "USD" },
            }),
          },
        }),
      }),
    );
    expect(view.approvedTotal).toEqual({
      amountMinor: 1250000,
      currency: "USD",
    });
    expect(view.pendingTotal).toEqual({ amountMinor: 800000, currency: "USD" });
  });
});

describe("buildChangeOrderEvent: ADD_CHANGE_ORDER", () => {
  it("always creates a new change order in DRAFT status", () => {
    const built = buildChangeOrderEvent(
      model({ financials: financials() }),
      {
        kind: "ADD_CHANGE_ORDER",
        title: "Cabinetry upgrade",
        cost: { amountMinor: 680000, currency: "USD" },
      },
      "2026-08-26T12:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    expect(
      mutation && "changeOrder" in mutation
        ? mutation.changeOrder.status
        : undefined,
    ).toBe("DRAFT");
    expect(built.clerical).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(() =>
      buildChangeOrderEvent(
        model({ financials: financials() }),
        {
          kind: "ADD_CHANGE_ORDER",
          title: "  ",
          cost: { amountMinor: 100, currency: "USD" },
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(ChangeOrderCommandError);
  });

  it("rejects a cost in a different currency than the project's tracked currency", () => {
    expect(() =>
      buildChangeOrderEvent(
        model({ financials: financials() }),
        {
          kind: "ADD_CHANGE_ORDER",
          title: "Cabinetry upgrade",
          cost: { amountMinor: 680000, currency: "EUR" },
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(ChangeOrderCommandError);
  });

  it("validates cost allocations reference real budget lines in the project's currency", () => {
    expect(() =>
      buildChangeOrderEvent(
        model({ financials: financials() }),
        {
          kind: "ADD_CHANGE_ORDER",
          title: "Cabinetry upgrade",
          cost: { amountMinor: 680000, currency: "USD" },
          costAllocations: [
            {
              budgetLineId: "missing",
              amount: { amountMinor: 500000, currency: "USD" },
            },
          ],
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Unknown budget line: missing");
  });

  it("supports a negative (credit) cost", () => {
    const built = buildChangeOrderEvent(
      model({ financials: financials() }),
      {
        kind: "ADD_CHANGE_ORDER",
        title: "Credit for removed scope",
        cost: { amountMinor: -50000, currency: "USD" },
      },
      "2026-08-26T12:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    expect(
      mutation && "changeOrder" in mutation
        ? mutation.changeOrder.cost.amountMinor
        : undefined,
    ).toBe(-50000);
  });

  it("rejects any command before financials are initialized", () => {
    expect(() =>
      buildChangeOrderEvent(
        model(),
        {
          kind: "ADD_CHANGE_ORDER",
          title: "Cabinetry upgrade",
          cost: { amountMinor: 680000, currency: "USD" },
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Project financials are not yet initialized");
  });
});

describe("buildChangeOrderEvent: lifecycle transitions", () => {
  function withChangeOrder(
    status: ChangeOrderV097["status"],
  ): ProjectModelV094 {
    return model({
      financials: financials({
        changeOrders: { co1: changeOrder({ status }) },
      }),
    });
  }

  it("PROPOSE requires DRAFT and sets proposedAt", () => {
    const built = buildChangeOrderEvent(
      withChangeOrder("DRAFT"),
      { kind: "PROPOSE", changeOrderId: "co1" },
      "2026-09-01T00:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    const co =
      mutation && "changeOrder" in mutation ? mutation.changeOrder : undefined;
    expect(co?.status).toBe("PROPOSED");
    expect(co?.proposedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("PROPOSE rejects a change order that is not in DRAFT", () => {
    expect(() =>
      buildChangeOrderEvent(
        withChangeOrder("PROPOSED"),
        { kind: "PROPOSE", changeOrderId: "co1" },
        "2026-09-01T00:00:00Z",
        newId,
      ),
    ).toThrow(
      "Cannot propose change order co1: it is PROPOSED, expected DRAFT",
    );
  });

  it("SUBMIT_FOR_APPROVAL requires PROPOSED", () => {
    const built = buildChangeOrderEvent(
      withChangeOrder("PROPOSED"),
      { kind: "SUBMIT_FOR_APPROVAL", changeOrderId: "co1" },
      "2026-09-01T00:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    expect(
      mutation && "changeOrder" in mutation
        ? mutation.changeOrder.status
        : undefined,
    ).toBe("PENDING_APPROVAL");
  });

  it("APPROVE requires PENDING_APPROVAL and sets approvedAt", () => {
    const built = buildChangeOrderEvent(
      withChangeOrder("PENDING_APPROVAL"),
      { kind: "APPROVE", changeOrderId: "co1" },
      "2026-09-01T00:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    const co =
      mutation && "changeOrder" in mutation ? mutation.changeOrder : undefined;
    expect(co?.status).toBe("APPROVED");
    expect(co?.approvedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("APPROVE rejects a DRAFT change order (cannot skip straight to approved)", () => {
    expect(() =>
      buildChangeOrderEvent(
        withChangeOrder("DRAFT"),
        { kind: "APPROVE", changeOrderId: "co1" },
        "2026-09-01T00:00:00Z",
        newId,
      ),
    ).toThrow(
      "Cannot approve change order co1: it is DRAFT, expected PENDING_APPROVAL",
    );
  });

  it("REJECT requires PENDING_APPROVAL and sets rejectedAt", () => {
    const built = buildChangeOrderEvent(
      withChangeOrder("PENDING_APPROVAL"),
      { kind: "REJECT", changeOrderId: "co1" },
      "2026-09-01T00:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    const co =
      mutation && "changeOrder" in mutation ? mutation.changeOrder : undefined;
    expect(co?.status).toBe("REJECTED");
    expect(co?.rejectedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("REOPEN_TO_DRAFT accepts PROPOSED or REJECTED", () => {
    const fromRejected = buildChangeOrderEvent(
      withChangeOrder("REJECTED"),
      { kind: "REOPEN_TO_DRAFT", changeOrderId: "co1" },
      "2026-09-01T00:00:00Z",
      newId,
    );
    const mutation = fromRejected.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    expect(
      mutation && "changeOrder" in mutation
        ? mutation.changeOrder.status
        : undefined,
    ).toBe("DRAFT");
  });

  it("REOPEN_TO_DRAFT rejects an APPROVED change order", () => {
    expect(() =>
      buildChangeOrderEvent(
        withChangeOrder("APPROVED"),
        { kind: "REOPEN_TO_DRAFT", changeOrderId: "co1" },
        "2026-09-01T00:00:00Z",
        newId,
      ),
    ).toThrow(ChangeOrderCommandError);
  });

  it("VOID accepts any non-VOID status and sets voidedAt", () => {
    const built = buildChangeOrderEvent(
      withChangeOrder("APPROVED"),
      { kind: "VOID", changeOrderId: "co1" },
      "2026-09-01T00:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    const co =
      mutation && "changeOrder" in mutation ? mutation.changeOrder : undefined;
    expect(co?.status).toBe("VOID");
    expect(co?.voidedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("VOID rejects an already-VOID change order", () => {
    expect(() =>
      buildChangeOrderEvent(
        withChangeOrder("VOID"),
        { kind: "VOID", changeOrderId: "co1" },
        "2026-09-01T00:00:00Z",
        newId,
      ),
    ).toThrow(ChangeOrderCommandError);
  });
});

describe("buildChangeOrderEvent: field edits and schedule-impact boundary", () => {
  it("SET_DECLARED_SCHEDULE_IMPACT only ever declares a fact, never touches Schedule mutations", () => {
    const built = buildChangeOrderEvent(
      model({
        financials: financials({ changeOrders: { co1: changeOrder() } }),
      }),
      {
        kind: "SET_DECLARED_SCHEDULE_IMPACT",
        changeOrderId: "co1",
        declaredScheduleImpactDays: 14,
      },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(
      built.event.mutations.every(
        (m) => m.op === "UPSERT_SOURCE" || m.op === "UPSERT_CHANGE_ORDER",
      ),
    ).toBe(true);
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_CHANGE_ORDER",
    );
    expect(
      mutation && "changeOrder" in mutation
        ? mutation.changeOrder.declaredScheduleImpactDays
        : undefined,
    ).toBe(14);
  });

  it("ASSOCIATE_ACTIVITIES rejects an unknown activity", () => {
    expect(() =>
      buildChangeOrderEvent(
        model({
          financials: financials({ changeOrders: { co1: changeOrder() } }),
        }),
        {
          kind: "ASSOCIATE_ACTIVITIES",
          changeOrderId: "co1",
          activityIds: ["missing"],
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Unknown activity: missing");
  });
});

describe("buildChangeOrderEvent: clerical classification", () => {
  it("marks pure text fields as clerical", () => {
    expect(CLERICAL_CHANGE_ORDER_COMMAND_KINDS.has("SET_TITLE")).toBe(true);
    expect(CLERICAL_CHANGE_ORDER_COMMAND_KINDS.has("SET_NOTES")).toBe(true);
  });

  it("marks money, lifecycle, and association changes as NOT clerical", () => {
    expect(CLERICAL_CHANGE_ORDER_COMMAND_KINDS.has("SET_COST")).toBe(false);
    expect(CLERICAL_CHANGE_ORDER_COMMAND_KINDS.has("APPROVE")).toBe(false);
    expect(
      CLERICAL_CHANGE_ORDER_COMMAND_KINDS.has("ASSOCIATE_SCOPE_ITEMS"),
    ).toBe(false);
    expect(
      CLERICAL_CHANGE_ORDER_COMMAND_KINDS.has("SET_DECLARED_SCHEDULE_IMPACT"),
    ).toBe(false);
  });
});
