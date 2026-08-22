/**
 * The formula dependency graph, as pure functions over node ids.
 *
 * Two operations matter:
 *   - detecting a cycle when a formula is saved, and naming the cells in it
 *   - ordering the recompute of everything downstream of a changed cell, so
 *     that each cell is evaluated only after the cells it reads
 */

export type EdgeLookup = (id: string) => string[];

/**
 * The cycle a candidate edge would create, or null. `dependenciesOf` returns
 * the cells a given cell reads.
 *
 * Returned as a closed walk - the first cell appears again at the end - so the
 * error message can name the cells in the order they chain.
 */
export function findCycle(start: string, dependenciesOf: EdgeLookup): string[] | null {
  const onStack: string[] = [];
  const inStack = new Set<string>();
  const finished = new Set<string>();

  function visit(node: string): string[] | null {
    if (inStack.has(node)) {
      const from = onStack.indexOf(node);
      return [...onStack.slice(from), node];
    }
    if (finished.has(node)) return null;

    inStack.add(node);
    onStack.push(node);
    for (const next of dependenciesOf(node)) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    onStack.pop();
    inStack.delete(node);
    finished.add(node);
    return null;
  }

  return visit(start);
}

/**
 * Everything downstream of `seeds`, ordered so that a cell always appears
 * after every cell it depends on. `dependentsOf` returns the cells that read a
 * given cell.
 *
 * A cycle among the dependents cannot normally exist - saving rejects those -
 * but if one is somehow present the remaining nodes are appended rather than
 * dropped, so a corrupted graph degrades instead of silently losing cells.
 */
export function topologicalOrder(seeds: string[], dependentsOf: EdgeLookup): string[] {
  const reachable = new Set<string>();
  const stack = [...seeds];
  while (stack.length) {
    const node = stack.pop()!;
    for (const dependent of dependentsOf(node)) {
      if (reachable.has(dependent)) continue;
      reachable.add(dependent);
      stack.push(dependent);
    }
  }

  const indegree = new Map<string, number>();
  for (const node of reachable) indegree.set(node, 0);
  for (const node of [...reachable, ...seeds]) {
    for (const dependent of dependentsOf(node)) {
      if (reachable.has(dependent)) indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1);
    }
  }
  // Seeds are already current, so edges from them do not hold a node back.
  for (const seed of seeds) {
    for (const dependent of dependentsOf(seed)) {
      if (reachable.has(dependent)) indegree.set(dependent, (indegree.get(dependent) ?? 1) - 1);
    }
  }

  const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([node]) => node);
  const ordered: string[] = [];
  const emitted = new Set<string>();

  while (ready.length) {
    const node = ready.shift()!;
    if (emitted.has(node)) continue;
    emitted.add(node);
    ordered.push(node);
    for (const dependent of dependentsOf(node)) {
      if (!reachable.has(dependent)) continue;
      const remaining = (indegree.get(dependent) ?? 1) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  for (const node of reachable) {
    if (!emitted.has(node)) ordered.push(node);
  }
  return ordered;
}
