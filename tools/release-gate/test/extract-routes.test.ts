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
