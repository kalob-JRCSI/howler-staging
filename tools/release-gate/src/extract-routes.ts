// Task 17 correction: a deterministic, mechanical extractor over src/worker/index.ts's own
// route-registration source -- not a general router parser. It recognizes exactly the three
// route-guard shapes this repository's router actually uses:
//
//  - `url.pathname === "X"` (and `A || B` variants) -- an exact-path literal
//  - `parts.join("/") === "X"` -- a segment-joined literal (rendered as `/X`)
//  - `parts.length === N` + one or more `parts[k] === "literal"` checks -- a segment-index guard,
//    rendered as a stable `SEGMENTS(len=N){k=literal,...}` fingerprint (not a pretty URL, just a
//    canonical identity for that exact guard shape)
//
// A mutation-method `if` block matching none of these shapes is still surfaced as its own
// distinct, unmatchable route rather than silently dropped -- an unrecognized shape can never
// equal anything in an accepted-routes allowlist, so it fails the gate closed by construction.

import type { RouteDescriptor } from "./schemas";

function extractBalancedParens(source: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return source.slice(openParenIndex, i + 1);
    }
  }
  return source.slice(openParenIndex);
}

/** Extracts every mutation-method (POST/PUT/PATCH/DELETE) route guard from raw worker source
 * text. Read-only (GET/HEAD) guards are never returned -- they are out of scope for a
 * mutation-introduction check by construction, not filtered after the fact. */
export function extractMutationRoutes(source: string): RouteDescriptor[] {
  const routes: RouteDescriptor[] = [];
  const seen = new Set<string>();

  function record(method: string, path: string): void {
    const key = `${method} ${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push({ method, path });
  }

  for (const match of source.matchAll(/\bif\s*\(/g)) {
    const openIndex = source.indexOf("(", match.index);
    const block = extractBalancedParens(source, openIndex);

    const methodMatch =
      /request\.method\s*===\s*"(POST|PUT|PATCH|DELETE)"/.exec(block);
    if (!methodMatch?.[1]) continue;
    const method = methodMatch[1];

    const pathnameMatches = [
      ...block.matchAll(/url\.pathname\s*===\s*"([^"]+)"/g),
    ];
    if (pathnameMatches.length > 0) {
      for (const m of pathnameMatches) {
        const path = m[1];
        if (path) record(method, path);
      }
      continue;
    }

    const joinMatch = /parts\.join\("\/"\)\s*===\s*"([^"]+)"/.exec(block);
    if (joinMatch?.[1]) {
      record(method, `/${joinMatch[1]}`);
      continue;
    }

    const lengthMatch = /parts\.length\s*===\s*(\d+)/.exec(block);
    const segmentMatches = [
      ...block.matchAll(/parts\[(\d+)\]\s*===\s*"([^"]+)"/g),
    ];
    if (lengthMatch?.[1] && segmentMatches.length > 0) {
      const length = lengthMatch[1];
      const clauses = segmentMatches
        .map((m) => `${m[1] ?? ""}=${m[2] ?? ""}`)
        .sort((a, b) => a.localeCompare(b));
      record(method, `SEGMENTS(len=${length}){${clauses.join(",")}}`);
      continue;
    }

    // A mutation-method guard using a shape this extractor does not recognize -- surface it as
    // its own distinct route (using the guard text itself as an opaque identity) so it can never
    // be silently ignored, and can never accidentally match an accepted-routes entry either.
    record(method, `UNRECOGNIZED_ROUTE_SHAPE(${block.slice(0, 80)})`);
  }

  return routes;
}
