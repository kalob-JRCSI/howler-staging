import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "test-admin-key-change-orders-routes";

function adminEnv(): Env {
  return { ...env, HOWLER_ADMIN_KEY: ADMIN_KEY };
}

function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  authed = true,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authed) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function plainRequest(method: string, path: string, authed = true): Request {
  const headers = new Headers();
  if (authed) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, { method, headers });
}

async function jsonBody(response: Response): Promise<unknown> {
  return response.json();
}

async function seedProject(): Promise<void> {
  const response = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
    adminEnv(),
  );
  expect(response.status).toBe(201);
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
  await seedProject();
});

interface CommandPreviewResponse {
  reviewToken: string;
  event: { id: string; baseRevision: number };
}

interface ChangeOrdersView {
  initialized: boolean;
  approvedTotal: { amountMinor: number; currency: string } | null;
  pendingTotal: { amountMinor: number; currency: string } | null;
  changeOrders: { id: string; title: string; status: string }[];
}

async function previewAndApply(
  path: string,
  command: unknown,
): Promise<{ preview: CommandPreviewResponse; applyStatus: number }> {
  const previewResponse = await worker.fetch(
    jsonRequest("POST", `/v1/projects/deboard-v091/${path}`, { command }),
    adminEnv(),
  );
  expect(previewResponse.status).toBe(200);
  const preview = (await jsonBody(previewResponse)) as CommandPreviewResponse;
  const applyResponse = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
      event: preview.event,
      reviewToken: preview.reviewToken,
    }),
    adminEnv(),
  );
  return { preview, applyStatus: applyResponse.status };
}

describe("GET /v1/projects/:id/change-orders", () => {
  it("reports an uninitialized project honestly", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/change-orders"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as ChangeOrdersView;
    expect(body.initialized).toBe(false);
    expect(body.approvedTotal).toBeNull();
  });
});

describe("preview -> apply-shadow: Change Order lifecycle", () => {
  it("creates a DRAFT change order and carries it through PROPOSE -> SUBMIT_FOR_APPROVAL -> APPROVE, updating the approved total exactly once", async () => {
    await previewAndApply("budget/commands/preview", {
      kind: "INITIALIZE_FINANCIALS",
      currency: "USD",
    });

    const created = await previewAndApply("change-orders/commands/preview", {
      kind: "ADD_CHANGE_ORDER",
      title: "Cabinetry upgrade",
      cost: { amountMinor: 680000, currency: "USD" },
    });
    expect(created.applyStatus).toBe(201);

    const afterCreate = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/change-orders"),
        adminEnv(),
      ),
    )) as ChangeOrdersView;
    expect(afterCreate.initialized).toBe(true);
    const changeOrderId = afterCreate.changeOrders.find(
      (co) => co.title === "Cabinetry upgrade",
    )?.id;
    expect(changeOrderId).toBeDefined();
    expect(
      afterCreate.changeOrders.find((co) => co.id === changeOrderId)?.status,
    ).toBe("DRAFT");
    expect(afterCreate.approvedTotal).toEqual({
      amountMinor: 0,
      currency: "USD",
    });

    await previewAndApply("change-orders/commands/preview", {
      kind: "PROPOSE",
      changeOrderId,
    });
    await previewAndApply("change-orders/commands/preview", {
      kind: "SUBMIT_FOR_APPROVAL",
      changeOrderId,
    });

    const afterSubmit = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/change-orders"),
        adminEnv(),
      ),
    )) as ChangeOrdersView;
    expect(afterSubmit.approvedTotal).toEqual({
      amountMinor: 0,
      currency: "USD",
    });
    expect(afterSubmit.pendingTotal).toEqual({
      amountMinor: 680000,
      currency: "USD",
    });

    const approve = await previewAndApply("change-orders/commands/preview", {
      kind: "APPROVE",
      changeOrderId,
    });
    expect(approve.applyStatus).toBe(201);

    const afterApprove = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/change-orders"),
        adminEnv(),
      ),
    )) as ChangeOrdersView;
    expect(afterApprove.approvedTotal).toEqual({
      amountMinor: 680000,
      currency: "USD",
    });
    expect(afterApprove.pendingTotal).toEqual({
      amountMinor: 0,
      currency: "USD",
    });
  });

  it("rejects approving a DRAFT change order directly (cannot skip PENDING_APPROVAL), with a clean 400", async () => {
    await previewAndApply("budget/commands/preview", {
      kind: "INITIALIZE_FINANCIALS",
      currency: "USD",
    });
    const created = await previewAndApply("change-orders/commands/preview", {
      kind: "ADD_CHANGE_ORDER",
      title: "Cabinetry upgrade",
      cost: { amountMinor: 680000, currency: "USD" },
    });
    expect(created.applyStatus).toBe(201);
    const view = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/change-orders"),
        adminEnv(),
      ),
    )) as ChangeOrdersView;
    const changeOrderId = view.changeOrders[0]?.id;

    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/change-orders/commands/preview",
        { command: { kind: "APPROVE", changeOrderId } },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an invalid change order command shape with 400, never a raw 500", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/change-orders/commands/preview",
        { command: { kind: "NOT_A_REAL_COMMAND" } },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("requires the same Bearer admin key as every other /v1 route", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/change-orders/commands/preview",
        { command: { kind: "PROPOSE", changeOrderId: "irrelevant" } },
        false,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });
});
