import type { DependencyV094, ProjectModelV094 } from "../domain/types";

export interface GraphIndexV094 {
  incoming: Record<string, DependencyV094[]>;
  outgoing: Record<string, DependencyV094[]>;
  topologicalOrder: string[];
}

export function buildGraphIndex(model: ProjectModelV094): GraphIndexV094 {
  const incoming: Record<string, DependencyV094[]> = {};
  const outgoing: Record<string, DependencyV094[]> = {};
  const indegree: Record<string, number> = {};
  for (const id of Object.keys(model.activities)) {
    incoming[id] = [];
    outgoing[id] = [];
    indegree[id] = 0;
  }
  for (const dep of Object.values(model.dependencies)) {
    if (!dep.active) continue;
    if (
      !model.activities[dep.predecessorId] ||
      !model.activities[dep.successorId]
    ) {
      throw new Error(`Dependency ${dep.id} references unknown activity`);
    }
    if (dep.predecessorId === dep.successorId)
      throw new Error(`Dependency ${dep.id} is self-referential`);
    if (!Number.isInteger(dep.lagWorkdays) || dep.lagWorkdays < 0) {
      throw new Error(
        `Dependency ${dep.id} lag must be a non-negative integer; model overlap with explicit milestone activities`,
      );
    }
    outgoing[dep.predecessorId]?.push(dep);
    incoming[dep.successorId]?.push(dep);
    if (dep.hard)
      indegree[dep.successorId] = (indegree[dep.successorId] ?? 0) + 1;
  }
  const queue = Object.keys(indegree)
    .filter((id) => indegree[id] === 0)
    .sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    order.push(id);
    for (const dep of outgoing[id] ?? []) {
      if (!dep.hard) continue;
      const nextIndegree = (indegree[dep.successorId] ?? 0) - 1;
      indegree[dep.successorId] = nextIndegree;
      if (nextIndegree === 0) {
        queue.push(dep.successorId);
        queue.sort();
      }
    }
  }
  if (order.length !== Object.keys(model.activities).length) {
    throw new Error(
      "Hard dependency cycle detected. Publishing must be blocked until the cycle is resolved.",
    );
  }
  return { incoming, outgoing, topologicalOrder: order };
}

export function impactCone(model: ProjectModelV094, seeds: string[]): string[] {
  const index = buildGraphIndex(model);
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (!model.activities[id])
      throw new Error(`Impact seed references unknown activity: ${id}`);
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of index.outgoing[id] ?? []) queue.push(dep.successorId);
  }
  return index.topologicalOrder.filter((id) => seen.has(id));
}
