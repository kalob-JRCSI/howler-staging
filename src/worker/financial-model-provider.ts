// Phase 4 (Howler Recovery Directive, Budget + Change Orders, Task 11): the one place that
// decides which CallFinancialModel implementation a given environment actually runs --
// env-var-driven per the Stage C authorization ("HOWLER_AI_PROVIDER / HOWLER_AI_MODEL as env
// vars, not hardcoded... browser must never choose arbitrary models"). This is the seam Task 10's
// own header comment already anticipated: the deterministic double it wired directly into the
// route now lives behind this selection function instead, with no change to the route's own
// call site beyond swapping which function it calls.
//
// Defaults to the deterministic double whenever HOWLER_AI_PROVIDER is not explicitly "openai" --
// never a silent, accidental live API call from an environment (a fresh clone, CI, an unconfigured
// preview) that never opted in. This is a deliberate default, not a placeholder: the deterministic
// double is a real, honestly-labeled, permanently-supported mode (CI, unit tests, integration
// fixtures, explicit fast-path commands -- see its own file's header), never a fake stand-in for
// live AI.

import type { CallFinancialModel } from "../operator/financial-interpreter";
import { buildFieldTestCallFinancialModel } from "./financial-conversation-field-model";
import { buildOpenAIStagingFinancialModel } from "./openai-financial-provider";

export function selectCallFinancialModel(env: {
  HOWLER_AI_PROVIDER?: string;
  HOWLER_AI_MODEL?: string;
  HOWLER_OPENAI_API_KEY?: string;
}): CallFinancialModel {
  if (env.HOWLER_AI_PROVIDER === "openai") {
    return buildOpenAIStagingFinancialModel(env);
  }
  return buildFieldTestCallFinancialModel();
}
