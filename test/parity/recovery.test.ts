/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { forecastAfterEvent, forecastInitial } from "../../src/engine/engine";
import type {
  ProjectEventV094,
  ProjectModelV094,
} from "../../src/domain/types";

const fixtureSources = import.meta.glob<string>("../fixtures/v094/*.json", {
  eager: true,
  import: "default",
  query: "?raw",
});

function fixtureName(modulePath: string): string {
  return modulePath.slice(modulePath.lastIndexOf("/") + 1);
}

function fixture(fileName: string): unknown {
  const entry = Object.entries(fixtureSources).find(
    ([modulePath]) => fixtureName(modulePath) === fileName,
  );
  if (!entry) {
    throw new Error(`missing fixture ${fileName}`);
  }
  return JSON.parse(entry[1]);
}

const GENERATED_AT = "2026-08-27T12:00:00.000Z";

describe("forecastAfterEvent + analyzeRecovery: DeBoard masonry-event golden parity", () => {
  const seed = fixture("deboard-seed.json") as {
    response: { body: { project: ProjectModelV094 } };
  };
  const applyShadow = fixture("masonry-apply-shadow.json") as {
    request: { body: { event: ProjectEventV094 } };
    response: { body: { candidate: unknown; oversight: unknown } };
  };
  const recoveryFixture = fixture("recovery.json") as {
    response: {
      body: {
        recovery: unknown;
        projectRevision: number;
        latestVersion: number;
        baselineVersion: number;
      };
    };
  };

  const model = seed.response.body.project;
  const event = applyShadow.request.body.event;

  const initialRun = forecastInitial(model, GENERATED_AT, 1);
  const nextRun = forecastAfterEvent(
    model,
    event,
    GENERATED_AT,
    2,
    initialRun.candidate,
  );

  it("matches the golden v2 candidate forecast snapshot exactly", () => {
    expect(nextRun.candidate).toEqual(applyShadow.response.body.candidate);
  });

  it("matches the golden v2 oversight review exactly", () => {
    expect(nextRun.oversight).toEqual(applyShadow.response.body.oversight);
  });

  it("matches the golden recovery analysis exactly", () => {
    expect(nextRun.candidate.recoveryAnalysis).toEqual(
      recoveryFixture.response.body.recovery,
    );
  });

  it("matches the golden project revision and version numbers", () => {
    expect(nextRun.modelAfterEvent.revision).toBe(
      recoveryFixture.response.body.projectRevision,
    );
    expect(nextRun.candidate.version).toBe(
      recoveryFixture.response.body.latestVersion,
    );
    expect(initialRun.candidate.version).toBe(
      recoveryFixture.response.body.baselineVersion,
    );
  });
});
