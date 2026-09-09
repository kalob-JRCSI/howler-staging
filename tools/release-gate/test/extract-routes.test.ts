import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMutationRoutes } from "../src/extract-routes";
import { checkNoLegacyMutationRoute } from "../src/gates";

// Avoids `new URL(...)` here on purpose -- with worker-configuration.d.ts included (needed
// elsewhere in this tsconfig for D1Database/Env), the ambient global `URL` it declares collides
// with Node's own `URL` type from @types/node.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// The exact accepted mutation routes as extractMutationRoutes represents them: literal paths for
// `url.pathname ===`/`parts.join("/") ===` style guards, and a stable "SEGMENTS(...)" fingerprint
// for the segment-index style (parts.length + parts[k] === "literal" checks) this repo also uses.
// Not a fragile full router parser -- this covers exactly the shapes src/worker/index.ts uses.
const ACCEPTED_MUTATION_ROUTES = [
  "/v1/admin/init-db",
  "/v1/projects/deboard-v091/seed",
  "/v1/intents",
  "SEGMENTS(len=4){1=workflows,3=resume}",
  // Conversational PM layer (Task 13): POST /v1/projects/:id/import — generalizes the
  // deboard-v091/seed route above into a reusable, projectId-parameterized onboarding path.
  // Reuses repo.createProject/validateProjectModel/forecastInitial verbatim; no new domain
  // mutation mechanism.
  "SEGMENTS(len=4){1=projects,3=import}",
  "SEGMENTS(len=5){3=understanding,4=preview}",
  "SEGMENTS(len=5){3=events,4=preview}",
  "SEGMENTS(len=5){3=events,4=apply-shadow}",
  "SEGMENTS(len=5){3=events,4=publish}",
  // Field-readiness blocker fix: POST /v1/projects/:id/conversation/turn — the first real
  // production entry point into the conversational PM path. Not a new mutation mechanism: it
  // constructs the same IntentV1 shape POST /v1/intents validates and executes it through the
  // exact same canonical executeWorkflow, via buildServerFieldVoiceBridge in src/worker/index.ts.
  "SEGMENTS(len=5){3=conversation,4=turn}",
  // v0.9.6 Task 3 (Project Genesis): POST /v1/projects/genesis/preview is pure analysis (zero
  // D1 writes -- it never constructs a repository instance) but is still a POST route guard, so
  // the extractor (correctly) surfaces it here for deliberate acknowledgment.
  "/v1/projects/genesis/preview",
  // v0.9.6 Task 3 (Project Genesis): POST /v1/projects/genesis/commit is the one-time,
  // revision-0 canonical creation path. Not a new mutation mechanism: it reuses
  // validateGenesisProposal/buildProjectFromGenesis/validateProjectModel/forecastInitial/
  // repo.createProject verbatim, the same machinery the deboard-v091/seed and :id/import routes
  // above already use.
  "/v1/projects/genesis/commit",
  // Phase 2 (Editable Project Schedule): POST /v1/projects/:id/schedule/commands/preview is
  // pure analysis, exactly like understanding/preview and events/preview above -- it never
  // constructs a repository write. It translates a typed ScheduleCommandV096 into a
  // ProjectEventV094 (src/operator/schedule.ts's buildScheduleEvent) and hands it to the same
  // reviewedRun every other preview route already uses. Not a new mutation mechanism, and not a
  // second schedule source of truth: the actual write still only ever happens through the
  // existing events/apply-shadow route above.
  "SEGMENTS(len=6){3=schedule,4=commands,5=preview}",
  // Phase 3 (Functional Project Scope Workspace): POST /v1/projects/:id/scope/commands/preview
  // follows the exact same pattern as schedule/commands/preview above -- pure analysis, never a
  // repository write. It translates a typed ScopeCommandV096 into a ProjectEventV094
  // (src/operator/scope.ts's buildScopeEvent) and hands it to the same reviewedRun. The actual
  // write still only ever happens through the existing events/apply-shadow route above.
  "SEGMENTS(len=6){3=scope,4=commands,5=preview}",
  // Phase 4 (Budget + Change Orders): POST /v1/projects/:id/budget/commands/preview and
  // .../change-orders/commands/preview follow the exact same pattern as schedule/scope above --
  // pure analysis, never a repository write. Each translates a typed BudgetCommandV097 /
  // ChangeOrderCommandV097 (src/operator/budget.ts / src/operator/change-orders.ts) into a
  // ProjectEventV094 and hands it to the same reviewedRun. The actual write still only ever
  // happens through the existing events/apply-shadow route above.
  "SEGMENTS(len=6){3=budget,4=commands,5=preview}",
  "SEGMENTS(len=6){3=change-orders,4=commands,5=preview}",
  // Phase 4 (Budget + Change Orders, Task 10): POST /v1/projects/:id/financial-conversation/turn
  // is the deterministic conversational financial path -- pure analysis, never a repository
  // write. A CallFinancialModel supplies only free-text spans; interpretFinancialTurn
  // (src/operator/financial-interpreter.ts) resolves them into a typed BudgetCommandV097 /
  // ChangeOrderCommandV097 and hands it to the same buildBudgetEvent/buildChangeOrderEvent +
  // reviewedRun every other preview route above already uses. The actual write still only ever
  // happens through the existing events/apply-shadow route above.
  "SEGMENTS(len=5){3=financial-conversation,4=turn}",
];

describe("extractMutationRoutes: fixture behavior", () => {
  it("extracts a literal url.pathname mutation route", () => {
    const source = `
      if (request.method === "POST" && url.pathname === "/v1/widgets") {
        return doSomething();
      }
    `;
    expect(extractMutationRoutes(source)).toEqual([
      { method: "POST", path: "/v1/widgets" },
    ]);
  });

  it("extracts a parts.join mutation route", () => {
    const source = `
      if (request.method === "POST" && parts.join("/") === "v1/admin/init-db") {
        return doSomething();
      }
    `;
    expect(extractMutationRoutes(source)).toEqual([
      { method: "POST", path: "/v1/admin/init-db" },
    ]);
  });

  it("extracts a multi-line segment-index mutation route", () => {
    const source = `
      if (
        request.method === "POST" &&
        parts.length === 4 &&
        parts[1] === "workflows" &&
        parts[2] &&
        parts[3] === "resume"
      ) {
        return doSomething();
      }
    `;
    expect(extractMutationRoutes(source)).toEqual([
      { method: "POST", path: "SEGMENTS(len=4){1=workflows,3=resume}" },
    ]);
  });

  it("never extracts a GET route (harmless routes do not trigger mutation checks at all)", () => {
    const source = `
      if (request.method === "GET" && url.pathname === "/health") {
        return doSomething();
      }
    `;
    expect(extractMutationRoutes(source)).toEqual([]);
  });

  it("a mutation guard with no recognized path expression is still surfaced (fails closed, not silently dropped)", () => {
    const source = `
      if (request.method === "POST" && someWeirdNewCheck(request)) {
        return doSomethingUnsafe();
      }
    `;
    const routes = extractMutationRoutes(source);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.method).toBe("POST");
  });
});

describe("real repo: src/worker/index.ts's mutation routes, extracted from actual source", () => {
  const indexSource = readFileSync(`${repoRoot}/src/worker/index.ts`, "utf8");

  it("extracts exactly the accepted mutation route set, nothing more, nothing less", () => {
    const observed = extractMutationRoutes(indexSource);
    const observedPaths = observed.map((r) => `${r.method} ${r.path}`).sort();
    const acceptedPaths = ACCEPTED_MUTATION_ROUTES.map(
      (p) => `POST ${p}`,
    ).sort();
    expect(observedPaths).toEqual(acceptedPaths);
  });

  it("the real accepted route set passes checkNoLegacyMutationRoute", () => {
    const observed = extractMutationRoutes(indexSource);
    const result = checkNoLegacyMutationRoute(
      observed,
      ACCEPTED_MUTATION_ROUTES,
    );
    expect(result.pass).toBe(true);
  });

  it("a synthetic unsafe mutation route injected into the real source is detected and fails", () => {
    const tampered = `${indexSource}\n  if (request.method === "POST" && url.pathname === "/v1/projects/:id/secret-mutate") { return doUnsafe(); }\n`;
    const observed = extractMutationRoutes(tampered);
    const result = checkNoLegacyMutationRoute(
      observed,
      ACCEPTED_MUTATION_ROUTES,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("/v1/projects/:id/secret-mutate");
  });

  it("a harmless new GET route injected into the real source never triggers a mutation violation", () => {
    const tampered = `${indexSource}\n  if (request.method === "GET" && url.pathname === "/v1/projects/:id/report") { return json({}); }\n`;
    const observed = extractMutationRoutes(tampered);
    const result = checkNoLegacyMutationRoute(
      observed,
      ACCEPTED_MUTATION_ROUTES,
    );
    expect(result.pass).toBe(true);
  });
});
