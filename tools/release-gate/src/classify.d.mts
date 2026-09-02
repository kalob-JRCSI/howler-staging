export interface KnownDefect {
  id: string;
  fileSuffix: string;
  fullName: string;
  fingerprint: string;
  sourceLocation: string;
  note: string;
}

export interface ClassifiedFailure {
  file: string;
  description: string;
}

export interface ClassificationResult {
  pass: boolean;
  knownDefectsMatched: KnownDefect[];
  unknownFailures: ClassifiedFailure[];
}

export function classifyVitestRun(input: {
  exitCode: number | null;
  signal?: string | null;
  report: unknown;
  knownDefects: KnownDefect[];
}): ClassificationResult;
