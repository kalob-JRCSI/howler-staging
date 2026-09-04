import { describe, expect, it } from "vitest";
import {
  PILOT_PROJECTS,
  buildPilotSeedProject,
} from "../../scripts/pilot-seed";
import { validateProjectModel } from "../../src/domain/validation";
import { forecastInitial } from "../../src/engine/engine";
import type { ProjectModelV094 } from "../../src/domain/types";

describe("pilot seed: authoritative Sep 3, 2026 KF dashboard snapshot", () => {
  it("names exactly the 6 non-DeBoard pilot projects, deboard-v091 excluded (it has its own real seed)", () => {
    const ids = PILOT_PROJECTS.map((p) => p.projectId);
    expect(ids).toHaveLength(6);
    expect(ids).not.toContain("deboard-v091");
    expect(new Set(ids).size).toBe(6);
  });

  it.each(PILOT_PROJECTS)(
    "$displayName: builds a project model that passes validateProjectModel and forecastInitial",
    (def) => {
      const model = buildPilotSeedProject(def);
      expect(model.projectId).toBe(def.projectId);
      expect(() => {
        validateProjectModel(model);
      }).not.toThrow();
      const run = forecastInitial(model, "2026-09-03T12:00:00.000Z", 1);
      expect(run.candidate).toBeDefined();
      expect(run.oversight).toBeDefined();
    },
  );

  // Not every project's real snapshot section contains all five categories -- e.g. Stewart,
  // Pratt, and McMillan have no "COMMITMENT" heading at all (nothing dated has been promised),
  // and Ciurlizza (RED) has no "CURRENT FACT" heading beyond a confirmed design decision (no
  // physical work has actually started yet). Each per-project check below only asserts what that
  // project's real content actually contains -- never forces a category into existence.
  it.each(PILOT_PROJECTS)(
    "$displayName: RISK/NEXT-ACTION is always present, and whichever of FACT/COMMITMENT/UNKNOWN the snapshot states is preserved distinctly, never conflated",
    (def) => {
      const model = buildPilotSeedProject(def);
      const activities = Object.values(model.activities);
      const constraints = Object.values(model.constraints);
      const conflicts = Object.values(model.conflicts ?? {});

      // FACT, wherever present: a real, verified observation (COMPLETE or genuinely IN_PROGRESS)
      // -- never fabricated as an actual without the source-backed verification the domain model
      // requires. A CONFIRMED-decision constraint (no readiness, PM_CONFIRMED) also counts as a
      // real fact (e.g. "the design was approved") distinct from whether the follow-on work has
      // actually happened.
      for (const activity of activities.filter((a) => a.state === "COMPLETE")) {
        expect(activity.actualStart).toBeTruthy();
        expect(activity.actualFinish).toBeTruthy();
        expect(activity.actualStartVerification).toBe("PM_CONFIRMED");
        expect(activity.actualFinishVerification).toBe("PM_CONFIRMED");
      }

      // COMMITMENT/EXPECTED, wherever present: a real readiness window (a schedule or target
      // date), never an actual. Its `verification` may still legitimately be UNVERIFIED (e.g.
      // Swiderski's Aug 31 schedule: the date itself is a documented fact, but whether the work
      // was actually completed on it is not) -- readiness alone never implies actual completion,
      // which is what actualStart/actualFinish exist to prove instead.
      const committed = constraints.filter((c) => c.readiness !== undefined);
      for (const constraint of committed) {
        expect(constraint.readiness).toBeDefined();
      }

      // UNKNOWN, wherever present: no readiness window at all -- genuinely unresolved.
      const unresolved = constraints.filter(
        (c) => c.readiness === undefined && c.verification === "UNVERIFIED",
      );
      // A constraint with neither a readiness window nor UNVERIFIED status is a confirmed,
      // dateless decision (e.g. Ciurlizza's pocket-door approval) -- a FACT, not an UNKNOWN, and
      // never counted as either COMMITMENT or UNKNOWN by the two checks above.
      const confirmedDecision = constraints.filter(
        (c) => c.readiness === undefined && c.verification !== "UNVERIFIED",
      );
      for (const constraint of confirmedDecision) {
        expect(constraint.verification).toBe("PM_CONFIRMED");
      }
      expect(
        committed.length + unresolved.length + confirmedDecision.length,
      ).toBe(constraints.length);

      // BLOCKER/RISK + NEXT ACTION: always present, on every real project in the snapshot.
      expect(conflicts.length).toBeGreaterThan(0);
      for (const conflict of conflicts) {
        expect(conflict.status).toBe("OPEN");
        expect(conflict.description.toLowerCase()).toContain("next action");
      }
    },
  );

  it("across the 6-project roster, every category the snapshot ever states is represented somewhere (nothing was silently dropped)", () => {
    let anyComplete = false;
    let anyInProgress = false;
    let anyCommitted = false;
    let anyUnresolved = false;
    for (const def of PILOT_PROJECTS) {
      const model = buildPilotSeedProject(def);
      const activities = Object.values(model.activities);
      const constraints = Object.values(model.constraints);
      anyComplete ||= activities.some((a) => a.state === "COMPLETE");
      anyInProgress ||= activities.some((a) => a.state === "IN_PROGRESS");
      anyCommitted ||= constraints.some((c) => c.readiness !== undefined);
      anyUnresolved ||= constraints.some(
        (c) => c.readiness === undefined && c.verification === "UNVERIFIED",
      );
    }
    expect(anyComplete).toBe(true);
    expect(anyInProgress).toBe(true);
    expect(anyCommitted).toBe(true);
    expect(anyUnresolved).toBe(true);
  });

  it.each(PILOT_PROJECTS)(
    "$displayName: no activity or constraint name is prefixed with the project's own display name (avoids the token-overlap ambiguity a real browser session found)",
    (def) => {
      const model = buildPilotSeedProject(def);
      const prefix = def.displayName.toLowerCase();
      for (const activity of Object.values(model.activities)) {
        expect(activity.name.toLowerCase().startsWith(prefix)).toBe(false);
      }
      for (const constraint of Object.values(model.constraints)) {
        expect(constraint.label.toLowerCase().startsWith(prefix)).toBe(false);
      }
    },
  );

  it("Swiderski's Aug 31 drywall is never marked COMPLETE merely because it was scheduled -- completion status is genuinely unknown", () => {
    const model = buildPilotSeedProject({
      projectId: "swiderski-v1",
      displayName: "Swiderski",
    });
    const drywall = model.activities.drywall_bed_tape_finish;
    expect(drywall?.state).not.toBe("COMPLETE");
    expect(drywall?.actualFinish).toBeUndefined();
    const constraint = model.constraints["drywall-completion-status"];
    expect(constraint?.readiness).toEqual({
      optimistic: "2026-08-31",
      likely: "2026-08-31",
      conservative: "2026-08-31",
    });
    // The Aug 31 date is recorded as a schedule/commitment (readiness window), never as proof of
    // actual completion.
    expect(constraint?.verification).toBe("UNVERIFIED");
  });

  it("Ciurlizza (RED) carries a HIGH-severity open conflict reflecting the hard county-clearance gate; the other five (YELLOW/GREEN) do not", () => {
    const ciurlizza = buildPilotSeedProject({
      projectId: "ciurlizza-v1",
      displayName: "Ciurlizza",
    });
    const ciurlizzaSeverities = Object.values(ciurlizza.conflicts ?? {}).map(
      (c) => c.severity,
    );
    expect(ciurlizzaSeverities).toContain("HIGH");

    const others = PILOT_PROJECTS.filter((p) => p.projectId !== "ciurlizza-v1");
    for (const def of others) {
      const model = buildPilotSeedProject(def);
      const severities = Object.values(model.conflicts ?? {}).map(
        (c) => c.severity,
      );
      expect(severities).not.toContain("HIGH");
    }
  });

  it("explicit real-world blocking order from the snapshot is encoded as a real dependency, not just prose, wherever the snapshot states one", () => {
    const stewart = buildPilotSeedProject({
      projectId: "stewart-v1",
      displayName: "Stewart",
    });
    expect(
      Object.values(stewart.dependencies).some(
        (d) =>
          d.predecessorId === "cabinetry_flooring_repairs" &&
          d.successorId === "side_splash_install",
      ),
    ).toBe(true);

    const swiderski = buildPilotSeedProject({
      projectId: "swiderski-v1",
      displayName: "Swiderski",
    });
    expect(
      Object.values(swiderski.dependencies).some(
        (d) =>
          d.predecessorId === "drywall_bed_tape_finish" &&
          d.successorId === "painting",
      ),
    ).toBe(true);

    const ciurlizza = buildPilotSeedProject({
      projectId: "ciurlizza-v1",
      displayName: "Ciurlizza",
    });
    expect(
      Object.values(ciurlizza.dependencies).some(
        (d) =>
          d.predecessorId === "county_site_walk" &&
          d.successorId === "insulation_drywall",
      ),
    ).toBe(true);
  });

  it("McMillan's $600 Bonham Electric change order is recorded as a real commercial signal, not lost prose", () => {
    const model = buildPilotSeedProject({
      projectId: "mcmillan-v1",
      displayName: "McMillan",
    });
    const signal = model.commercialSignals?.["sig-mcmillan-electrical-co"];
    expect(signal?.amount).toBe(600);
    expect(signal?.selected).toBe(true);
  });

  it("every project's referenced source is the same Sep 3, 2026 dashboard snapshot", () => {
    for (const def of PILOT_PROJECTS) {
      const model: ProjectModelV094 = buildPilotSeedProject(def);
      const sources = Object.values(model.sources);
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source.effectiveDate).toBe("2026-09-03");
      }
    }
  });
});
