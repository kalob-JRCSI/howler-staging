import { describe, expect, it } from "vitest";
import { buildPilotSeedSql } from "../../scripts/pilot-remote-sql";

const PILOT_PROJECT_IDS = [
  "deboard-v091",
  "stewart-v1",
  "swiderski-v1",
  "pratt-v1",
  "carver-v1",
  "ciurlizza-v1",
  "mcmillan-v1",
] as const;

describe("pilot remote seed SQL", () => {
  it("contains the seven authoritative pilot projects and DeBoard reconciliation without destructive project deletion", () => {
    const sql = buildPilotSeedSql("2026-09-04T01:15:00.000Z");

    expect(sql).toContain("BEGIN IMMEDIATE;");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("INSERT INTO projects");
    expect(sql).toContain("INSERT INTO forecast_snapshots");
    expect(sql).toContain("INSERT INTO oversight_reviews");
    expect(sql).toContain("deboard-v091-reconciliation-2026-09-03");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+projects/i);

    for (const projectId of PILOT_PROJECT_IDS) {
      expect(sql).toContain(projectId);
    }
  });
});
