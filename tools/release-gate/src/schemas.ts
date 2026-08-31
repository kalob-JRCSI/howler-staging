// Task 17: shared types for the release-gate tool. Mirrors tools/context-pack/src/schemas.ts's
// pattern of one small, explicit types file separate from the check implementations.

export interface GateResult {
  id: string;
  pass: boolean;
  reason: string;
  location?: string;
}

export interface RouteDescriptor {
  method: string;
  path: string;
}
