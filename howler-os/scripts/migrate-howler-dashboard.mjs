/**
 * Additive howler-dashboard migrate. Never DROP. Never write howler-intelligence-staging.
 *
 * Adds project_id, revision, current_model_json if missing, then backfills the
 * eight live rows (stewart, swiderski, pratt, carver, ciurlizza, deboard,
 * mcmillan, craven). Smith Residence and deboard-v09 / deboard-v091 are not
 * copied as rows. If the v091 snapshot has a job book, it is folded into the
 * single deboard row.
 */
const DASHBOARD_ID = "eb2ed8a9-63dd-490d-966b-3afbeb6b89ca";
const STAGING_ID = "b1049979-11cc-4faa-9a94-a0f42f9f4f23";
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";

const LIVE_PROJECT_IDS = [
  "stewart",
  "swiderski",
  "pratt",
  "carver",
  "ciurlizza",
  "deboard",
  "mcmillan",
  "craven",
];

const SKIP_NAMES = [/smith/, /deboard-v09\b/, /deboard-v091/];

function slugFromName(name) {
  const n = String(name ?? "").toLowerCase();
  if (SKIP_NAMES.some((re) => re.test(n))) return null;
  if (n.includes("stewart")) return "stewart";
  if (n.includes("swider")) return "swiderski";
  if (n.includes("pratt")) return "pratt";
  if (n.includes("carver") || n.includes("julian")) return "carver";
  if (n.includes("ciurlizza")) return "ciurlizza";
  if (n.includes("deboard") || n.includes("de board") || n.includes("debord")) return "deboard";
  if (n.includes("mcmillan") || n.includes("macmillan")) return "mcmillan";
  if (n.includes("craven")) return "craven";
  return null;
}

function slugFromProjectId(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "deboard-v09" || raw === "deboard-v091") return "deboard";
  if (LIVE_PROJECT_IDS.includes(raw)) return raw;
  return slugFromName(raw.replace(/-v\d+$/, ""));
}

function healthFromStatus(status, blocker) {
  const s = String(status ?? "").toUpperCase();
  if (/\bRED\b/.test(s) || s.includes("BLOCKED")) return "RED";
  if (/\bGREEN\b/.test(s)) return "GREEN";
  if (/\bYELLOW\b/.test(s)) return "YELLOW";
  if (String(blocker ?? "").trim()) return "YELLOW";
  return "YELLOW";
}

function dashboardNote(row) {
  const parts = [row.status_note, row.blocker, row.action, row.next_call]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function modelFromRow(row, slug) {
  const name = String(row.name ?? slug).trim() || slug;
  const phone = String(row.phone ?? "").trim();
  const address = String(row.address ?? "").trim() || "Unknown";
  const projectType = String(row.project_type ?? "").trim() || "Unknown";
  return {
    id: slug,
    name,
    clientName: name,
    address,
    projectType,
    timezone: "America/New_York",
    revision: typeof row.revision === "number" ? row.revision : 0,
    healthBand: healthFromStatus(row.status, row.blocker),
    paused: false,
    heldPhases: [],
    dashboardNote: dashboardNote(row),
    officialStart: null,
    intendedFinish: null,
    sourceLabel: "howler-dashboard",
    activities: {},
    scopeItems: {},
    financials: null,
    blueprint: { evidence: [] },
    job: {
      permitStatus: "NOT_FILED",
      permitNumber: null,
      inspections: {},
      contacts: phone
        ? {
            "ct-site": { id: "ct-site", name, trade: "Site", phone, notes: null },
          }
        : {},
      selections: {},
      photos: {},
      rules: [],
    },
    events: [
      {
        id: `evt-${slug}-dashboard`,
        revision: 0,
        type: "DASHBOARD_INGESTED",
        occurredAt: row.updated_at || new Date().toISOString(),
        note: "Loaded from howler-dashboard. Howler will not invent missing fields.",
        clerical: true,
      },
    ],
  };
}

function extractProject(raw, slug) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.projects && typeof parsed.projects === "object") {
    return (
      parsed.projects[slug] ||
      parsed.projects["deboard-v091"] ||
      parsed.projects["deboard-v09"] ||
      parsed.projects.deboard ||
      null
    );
  }
  if (parsed.id || parsed.activities) return parsed;
  return null;
}

function foldInto(row, slug, storedJson) {
  const fromRow = modelFromRow(row, slug);
  const stored = extractProject(storedJson, slug);
  if (!stored) return fromRow;
  const address = fromRow.address !== "Unknown" ? fromRow.address : stored.address || "Unknown";
  const projectType = fromRow.projectType !== "Unknown" ? fromRow.projectType : stored.projectType || "Unknown";
  return {
    ...stored,
    ...fromRow,
    id: slug,
    name: fromRow.name || stored.name,
    address,
    projectType,
    healthBand: row.status ? fromRow.healthBand : stored.healthBand || fromRow.healthBand,
    dashboardNote: fromRow.dashboardNote || stored.dashboardNote,
    activities: stored.activities && Object.keys(stored.activities).length ? stored.activities : fromRow.activities,
    scopeItems: stored.scopeItems && Object.keys(stored.scopeItems).length ? stored.scopeItems : fromRow.scopeItems,
    financials: stored.financials ?? fromRow.financials,
    job: stored.job ?? fromRow.job,
    blueprint: stored.blueprint ?? fromRow.blueprint,
    events: Array.isArray(stored.events) && stored.events.length > 1 ? stored.events : fromRow.events,
  };
}

async function query(databaseId, sql, params = []) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.success) {
    const message = (body.errors || []).map((error) => error.message).join("; ") || `D1 ${response.status}`;
    throw new Error(message);
  }
  return body.result?.[0]?.results ?? [];
}

async function exec(sql, params = []) {
  return query(DASHBOARD_ID, sql, params);
}

async function addColumn(name, ddl, existing) {
  if (existing.has(name)) {
    console.log(`column ${name} already present — skip`);
    return;
  }
  await exec(`ALTER TABLE projects ADD COLUMN ${ddl}`);
  console.log(`added column ${name}`);
}

function displayName(slug) {
  return {
    stewart: "Stewart",
    swiderski: "Swiderski",
    pratt: "Pratt",
    carver: "Carver",
    ciurlizza: "Ciurlizza",
    deboard: "DeBoard",
    mcmillan: "McMillan",
    craven: "Craven",
  }[slug];
}

async function insertMissing(slug, info) {
  const columns = new Map(info.map((row) => [String(row.name), row]));
  const now = new Date().toISOString();
  const name = displayName(slug);
  const model = modelFromRow({ name, updated_at: now }, slug);
  const values = { name, project_id: slug, revision: 0, current_model_json: JSON.stringify(model), updated_at: now };
  if (columns.get("id") && Number(columns.get("id").notnull) === 1 && columns.get("id").pk && !columns.get("id").dflt_value) {
    values.id = slug;
  }
  const keys = Object.keys(values).filter((key) => columns.has(key));
  const placeholders = keys.map(() => "?");
  await exec(
    `INSERT INTO projects (${keys.join(", ")}) VALUES (${placeholders.join(", ")})`,
    keys.map((key) => values[key]),
  );
  console.log(`inserted missing live row ${slug}`);
}

async function main() {
  if (!ACCOUNT || !TOKEN) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");

  const info = await exec("PRAGMA table_info(projects)");
  console.log(
    "howler-dashboard projects columns:",
    info.map((row) => row.name).join(", "),
  );
  const existing = new Set(info.map((row) => String(row.name ?? "")));
  const required = ["id", "name", "status", "blocker", "action", "next_call", "updated_at", "address", "phone", "project_type", "status_note", "completed_at"];
  for (const column of required) {
    if (!existing.has(column)) {
      console.log(`note: existing column ${column} not present (not adding — additive-only for the three new columns)`);
    }
  }
  await addColumn("project_id", "project_id TEXT", existing);
  await addColumn("revision", "revision INTEGER DEFAULT 0", existing);
  await addColumn("current_model_json", "current_model_json TEXT", existing);

  const rows = await exec("SELECT * FROM projects");
  console.log(`howler-dashboard rows: ${rows.length}`);
  for (const row of rows) {
    console.log(`  row name=${row.name} project_id=${row.project_id ?? ""} status=${row.status ?? ""}`);
  }

  let deboardFold = null;
  try {
    const staging = await query(
      STAGING_ID,
      "SELECT project_id, name, revision, current_model_json FROM projects WHERE project_id IN ('deboard-v091', 'deboard-v09', 'deboard') OR lower(name) LIKE '%deboard%' ORDER BY revision DESC LIMIT 8",
    );
    console.log(
      "intelligence-staging deboard rows (read-only):",
      staging.map((row) => `${row.project_id}@${row.revision}`).join(", ") || "none",
    );
    const v091 = staging.find((row) => row.project_id === "deboard-v091") || staging[0];
    if (v091?.current_model_json && String(v091.current_model_json).length > 40) {
      deboardFold = String(v091.current_model_json);
      console.log("folding snapshot length", deboardFold.length, "into deboard — not copied as its own row");
    }
    const extras = staging.filter((row) => /smith|v09/.test(String(row.project_id ?? "").toLowerCase()) || /smith/.test(String(row.name ?? "").toLowerCase()));
    if (extras.length) {
      console.log(
        "not carrying over:",
        extras.map((row) => row.project_id || row.name).join(", "),
      );
    }
  } catch (error) {
    console.log("intelligence-staging read skipped:", error instanceof Error ? error.message : error);
  }

  const matched = new Map();
  for (const row of rows) {
    const slug = slugFromProjectId(row.project_id) ?? slugFromName(row.name);
    if (!slug) {
      console.log("skip non-live row", row.name, row.project_id);
      continue;
    }
    matched.set(slug, row);
  }

  const refreshed = await exec("PRAGMA table_info(projects)");
  for (const slug of LIVE_PROJECT_IDS) {
    if (!matched.has(slug)) {
      console.log(`WARNING: ${slug} has no howler-dashboard row — inserting a live placeholder`);
      await insertMissing(slug, refreshed);
      const inserted = await exec("SELECT * FROM projects WHERE project_id = ?", [slug]);
      if (inserted[0]) matched.set(slug, inserted[0]);
    }
  }

  for (const slug of LIVE_PROJECT_IDS) {
    const row = matched.get(slug);
    if (!row) throw new Error(`live project ${slug} is still missing after insert`);
    const key = row.id ?? row.project_id ?? row.name;
    const stored = slug === "deboard" && deboardFold && (!row.current_model_json || String(row.current_model_json).length < 40)
      ? deboardFold
      : row.current_model_json;
    const project = foldInto({ ...row, current_model_json: stored }, slug, stored);
    await exec(
      `UPDATE projects
       SET project_id = ?, revision = COALESCE(revision, 0), current_model_json = ?
       WHERE id = ? OR project_id = ? OR name = ?`,
      [slug, JSON.stringify(project), key, row.project_id, row.name],
    );
    console.log(`backfilled ${slug} (${row.name})`);
  }

  const after = await exec("SELECT name, project_id FROM projects WHERE project_id IS NOT NULL");
  const live = after.filter((row) => LIVE_PROJECT_IDS.includes(String(row.project_id)));
  const extras = after.filter((row) => !LIVE_PROJECT_IDS.includes(String(row.project_id)));
  console.log("live project_ids:", live.map((row) => `${row.project_id}=${row.name}`).join(" | "));
  if (extras.length) {
    console.log("non-live project_id rows left untouched:", extras.map((row) => `${row.project_id}=${row.name}`).join(" | "));
  }
  const ids = new Set(live.map((row) => String(row.project_id)));
  const missing = LIVE_PROJECT_IDS.filter((id) => !ids.has(id));
  if (missing.length) throw new Error(`missing live project_ids: ${missing.join(", ")}`);
  if ([...ids].some((id) => /smith|v091|v09/.test(id))) throw new Error("Smith or DeBoard snapshot ids leaked onto the board");
  if (!ids.has("craven")) throw new Error("Craven is missing");
  console.log("howler-dashboard migrate ok: 8 live rows, Craven present, Smith absent");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
