import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogEntry, CatalogFile, TagIndexFile } from "./schemas.js";

/** This file lives at tools/context-pack/src/catalog.ts — three levels below the repo root. */
export function defaultRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "..");
}

export function loadCatalog(repoRoot: string = defaultRepoRoot()): CatalogFile {
  const raw = readFileSync(
    join(repoRoot, "context", "catalog", "index.json"),
    "utf-8",
  );
  return JSON.parse(raw) as CatalogFile;
}

export function loadTagIndex(
  repoRoot: string = defaultRepoRoot(),
): TagIndexFile {
  const raw = readFileSync(
    join(repoRoot, "context", "catalog", "tags.json"),
    "utf-8",
  );
  return JSON.parse(raw) as TagIndexFile;
}

/** True if the catalog entry's target actually exists on disk under `repoRoot`. */
export function entryExistsOnDisk(
  entry: Pick<CatalogEntry, "path">,
  repoRoot: string,
): boolean {
  return existsSync(join(repoRoot, entry.path));
}

/**
 * Reads a catalog entry's textual content for measurement, or `undefined` for a directory entry
 * (e.g. a `test-dir` pointing at `test/parity/`) — directories are referenced, not char-counted.
 */
export function readEntryContent(
  entry: Pick<CatalogEntry, "path">,
  repoRoot: string,
): string | undefined {
  const fullPath = join(repoRoot, entry.path);
  if (!existsSync(fullPath)) return undefined;
  if (statSync(fullPath).isDirectory()) return undefined;
  return readFileSync(fullPath, "utf-8");
}
