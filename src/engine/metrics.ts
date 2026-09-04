export type HorizonBucketV094 =
  "0-3" | "4-7" | "8-14" | "15-30" | "31-60" | "61+";

export interface PredictionAccuracyRecordV094 {
  horizonDays: number;
  pointErrorWorkdays: number;
  rangeHit: boolean;
  confidenceAtPrediction: number;
}

export interface AccuracySummaryV094 {
  bucket: HorizonBucketV094;
  count: number;
  maeWorkdays: number;
  meanBiasWorkdays: number;
  rangeCoverage: number;
  meanConfidence: number;
  calibrationGap: number;
}

export function horizonBucket(days: number): HorizonBucketV094 {
  if (days <= 3) return "0-3";
  if (days <= 7) return "4-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  if (days <= 60) return "31-60";
  return "61+";
}

export function summarizeAccuracy(
  records: PredictionAccuracyRecordV094[],
): AccuracySummaryV094[] {
  const buckets: HorizonBucketV094[] = [
    "0-3",
    "4-7",
    "8-14",
    "15-30",
    "31-60",
    "61+",
  ];
  return buckets.flatMap((bucket) => {
    const rows = records.filter((r) => horizonBucket(r.horizonDays) === bucket);
    if (!rows.length) return [];
    const count = rows.length;
    const maeWorkdays =
      rows.reduce((sum, r) => sum + Math.abs(r.pointErrorWorkdays), 0) / count;
    const meanBiasWorkdays =
      rows.reduce((sum, r) => sum + r.pointErrorWorkdays, 0) / count;
    const rangeCoverage = rows.filter((r) => r.rangeHit).length / count;
    const meanConfidence =
      rows.reduce((sum, r) => sum + r.confidenceAtPrediction, 0) / count;
    return [
      {
        bucket,
        count,
        maeWorkdays,
        meanBiasWorkdays,
        rangeCoverage,
        meanConfidence,
        calibrationGap: rangeCoverage - meanConfidence,
      },
    ];
  });
}

export function compoundImpactRatio(
  triggerDelayWorkdays: number,
  finalCriticalPathImpactWorkdays: number,
): number | undefined {
  if (triggerDelayWorkdays === 0) return undefined;
  return Math.abs(finalCriticalPathImpactWorkdays / triggerDelayWorkdays);
}
