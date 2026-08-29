export interface FixedClock {
  now(): Date;
}

export function createFixedClock(instant: string): FixedClock {
  const fixedTime = new Date(instant).getTime();

  return {
    now: () => new Date(fixedTime),
  };
}
