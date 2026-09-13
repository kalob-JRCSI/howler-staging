import nitro from "./index.mjs";
import { handlePilotGate } from "./pilot-gate.mjs";

export default {
  async fetch(request, env, ctx) {
    globalThis.__HOWLER_ENV = env;
    globalThis.__env__ = env;
    const gated = await handlePilotGate(request, env);
    if (gated) return gated;
    return nitro.fetch(request, env, ctx);
  },
};
