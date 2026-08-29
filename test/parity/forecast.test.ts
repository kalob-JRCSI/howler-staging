/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { forecastInitial } from "../../src/engine/engine";
import type { ProjectModelV094 } from "../../src/domain/types";

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

describe("forecastInitial: DeBoard golden parity", () => {
  const seed = fixture("deboard-seed.json") as {
    response: { body: { project: ProjectModelV094 } };
  };
  const goldenForecast = fixture("initial-forecast.json") as {
    response: {
      body: {
        initialForecast: unknown;
        oversight: unknown;
        forecastable: boolean;
        commitmentEligible: boolean;
        oversightPublishable: boolean;
      };
    };
  };

  const model = seed.response.body.project;
  const run = forecastInitial(model, GENERATED_AT, 1);
  const golden = goldenForecast.response.body;

  it("matches the golden candidate forecast snapshot exactly", () => {
    expect(run.candidate).toEqual(golden.initialForecast);
  });

  it("matches the golden oversight review exactly", () => {
    expect(run.oversight).toEqual(golden.oversight);
  });

  it("matches the golden forecastable/commitmentEligible/publishable flags", () => {
    expect(run.forecastable).toBe(golden.forecastable);
    expect(run.commitmentEligible).toBe(golden.commitmentEligible);
    expect(run.publishable).toBe(golden.oversightPublishable);
  });
});
