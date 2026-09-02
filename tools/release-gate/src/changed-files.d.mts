export function computeChangedFiles(input: {
  diffOutput: string;
  untrackedOutput: string;
}): string[];

export function resolveChangedFiles(input: {
  diffResult: { status: number | null; stdout?: string; stderr?: string };
  untrackedResult: { status: number | null; stdout?: string; stderr?: string };
}): { ok: true; files: string[] } | { ok: false; reason: string };
