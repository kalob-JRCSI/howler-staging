import type { Blueprint, CommandPreview, DrawingScaleId, LumberSize, OccupancyClass, Project } from "./types";
import { ensureBlueprint } from "./types";

const STORAGE_KEY = "howler-memory-v1";

export interface HowlerMemory {
  lastCounty: string | null;
  typicalStudSize: LumberSize | null;
  typicalStudSpacingIn: number | null;
  typicalJoistSize: LumberSize | null;
  typicalJoistSpacingIn: number | null;
  typicalRafterSize: LumberSize | null;
  typicalRafterSpacingIn: number | null;
  typicalPitchRise: number | null;
  typicalPitchRun: number | null;
  typicalOccupancy: OccupancyClass | null;
  typicalScale: DrawingScaleId | null;
  lastUtterances: { at: string; understood: string; eventType: string }[];
}

const EMPTY: HowlerMemory = {
  lastCounty: null,
  typicalStudSize: null,
  typicalStudSpacingIn: null,
  typicalJoistSize: null,
  typicalJoistSpacingIn: null,
  typicalRafterSize: null,
  typicalRafterSpacingIn: null,
  typicalPitchRise: null,
  typicalPitchRun: null,
  typicalOccupancy: null,
  typicalScale: null,
  lastUtterances: [],
};

function canStore(): boolean {
  return typeof window !== "undefined";
}

export function readMemory(): HowlerMemory {
  if (!canStore()) return { ...EMPTY, lastUtterances: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY, lastUtterances: [] };
    return { ...EMPTY, ...(JSON.parse(raw) as HowlerMemory) };
  } catch {
    return { ...EMPTY, lastUtterances: [] };
  }
}

export function writeMemory(next: HowlerMemory): void {
  if (!canStore()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function rememberFromPreview(preview: CommandPreview, project: Project): HowlerMemory {
  const memory = readMemory();
  const bp = ensureBlueprint(project);
  if (preview.eventType.startsWith("BLUEPRINT") || preview.eventType === "BLUEPRINT_UPDATED") {
    if (bp.county) memory.lastCounty = bp.county;
    if (bp.studSize) memory.typicalStudSize = bp.studSize;
    if (bp.studSpacingIn) memory.typicalStudSpacingIn = bp.studSpacingIn;
    if (bp.joistSize) memory.typicalJoistSize = bp.joistSize;
    if (bp.joistSpacingIn) memory.typicalJoistSpacingIn = bp.joistSpacingIn;
    if (bp.rafterSize) memory.typicalRafterSize = bp.rafterSize;
    if (bp.rafterSpacingIn) memory.typicalRafterSpacingIn = bp.rafterSpacingIn;
    if (bp.roofRise) memory.typicalPitchRise = bp.roofRise;
    if (bp.roofRun) memory.typicalPitchRun = bp.roofRun;
    if (bp.occupancy) memory.typicalOccupancy = bp.occupancy;
    if (bp.drawingScale) memory.typicalScale = bp.drawingScale;
  }
  memory.lastUtterances = [
    { at: new Date().toISOString(), understood: preview.understood, eventType: preview.eventType },
    ...memory.lastUtterances,
  ].slice(0, 24);
  writeMemory(memory);
  return memory;
}

export function memoryFramingPatch(memory = readMemory()): Partial<Blueprint> {
  const patch: Partial<Blueprint> = {};
  if (memory.typicalStudSize) patch.studSize = memory.typicalStudSize;
  if (memory.typicalStudSpacingIn) patch.studSpacingIn = memory.typicalStudSpacingIn;
  if (memory.typicalJoistSize) patch.joistSize = memory.typicalJoistSize;
  if (memory.typicalJoistSpacingIn) patch.joistSpacingIn = memory.typicalJoistSpacingIn;
  if (memory.typicalRafterSize) patch.rafterSize = memory.typicalRafterSize;
  if (memory.typicalRafterSpacingIn) patch.rafterSpacingIn = memory.typicalRafterSpacingIn;
  if (memory.lastCounty) patch.county = memory.lastCounty;
  if (memory.typicalPitchRise && memory.typicalPitchRun) {
    patch.roofRise = memory.typicalPitchRise;
    patch.roofRun = memory.typicalPitchRun;
  }
  if (memory.typicalOccupancy) patch.occupancy = memory.typicalOccupancy;
  if (memory.typicalScale) patch.drawingScale = memory.typicalScale;
  return patch;
}

export function memorySummary(memory = readMemory()): string {
  const bits: string[] = [];
  if (memory.lastCounty) bits.push(`${memory.lastCounty} County`);
  if (memory.typicalStudSize && memory.typicalStudSpacingIn) {
    bits.push(`${memory.typicalStudSize} @ ${memory.typicalStudSpacingIn}"`);
  }
  if (memory.typicalPitchRise && memory.typicalPitchRun) {
    bits.push(`${memory.typicalPitchRise}/${memory.typicalPitchRun}`);
  }
  if (bits.length === 0) return "No personal framing habits recorded yet. Confirm a drawing and Howler will remember how you build.";
  return `Howler remembers: ${bits.join(" · ")}. Say “same as last time” to reuse. Dimensions are never guessed.`;
}
