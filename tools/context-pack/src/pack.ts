import { defaultRepoRoot, loadCatalog } from "./catalog.js";
import { sha256Hex } from "./hash.js";
import { measurePack } from "./measure.js";
import { selectForPack } from "./select.js";
import type {
  CanonicalPack,
  CatalogFile,
  PackInput,
  PackOutput,
} from "./schemas.js";

const ACCEPTED_HISTORY_KINDS = new Set(["receipt"]);

export async function buildPack(
  input: PackInput,
  options: { repoRoot?: string; catalog?: CatalogFile; now?: () => Date } = {},
): Promise<PackOutput> {
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const catalog = options.catalog ?? loadCatalog(repoRoot);
  const now = options.now ?? (() => new Date());

  const { selected, omitted } = selectForPack(catalog, input, repoRoot);

  const acceptedHistoryIds = new Set(
    catalog.entries
      .filter((entry) => ACCEPTED_HISTORY_KINDS.has(entry.kind))
      .map((entry) => entry.id),
  );
  const measurement = measurePack(selected, omitted, acceptedHistoryIds);

  const canonical: CanonicalPack = {
    schemaVersion: "1",
    input,
    selected,
    omitted,
    measurement,
  };
  const hash = await sha256Hex(canonical);

  return {
    ...canonical,
    hash,
    generatedAt: now().toISOString(),
  };
}
