export interface DeterministicIds {
  next(): string;
}

export function createDeterministicIds(prefix: string): DeterministicIds {
  let sequence = 0;

  return {
    next: () => {
      sequence += 1;
      return `${prefix}-${String(sequence)}`;
    },
  };
}
