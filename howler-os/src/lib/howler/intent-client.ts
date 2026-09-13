import { HOWLER_CLOUD } from "./cloud";

export async function rewriteHowlerIntent(input: {
  text: string;
  activeProjectId: string | null;
  jobs: { id: string; name: string; clientName: string; note: string }[];
  picture?: string | null;
}): Promise<{ rewrite: string; projectId: string | null; kind: string; say: string | null } | null> {
  try {
    const res = await fetch(HOWLER_CLOUD.intent, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      rewrite?: string;
      projectId?: string | null;
      kind?: string;
      say?: string | null;
    };
    if (!json.ok || !json.rewrite) return null;
    return {
      rewrite: json.rewrite,
      projectId: json.projectId ?? null,
      kind: json.kind ?? "progress",
      say: json.say ?? null,
    };
  } catch {
    return null;
  }
}