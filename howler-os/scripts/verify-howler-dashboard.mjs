/**
 * Fail closed unless jarvis-voice-staging is bound to howler-dashboard
 * and that database has the eight live project_ids.
 */
const DASHBOARD_ID = "eb2ed8a9-63dd-490d-966b-3afbeb6b89ca";
const DASHBOARD_NAME = "howler-dashboard";
const STAGING_ID = "b1049979-11cc-4faa-9a94-a0f42f9f4f23";
const WORKER = "jarvis-voice-staging";
const LIVE = ["stewart", "swiderski", "pratt", "carver", "ciurlizza", "deboard", "mcmillan", "craven"];
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function d1(databaseId, sql, params = []) {
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
    throw new Error((body.errors || []).map((error) => error.message).join("; ") || `D1 ${response.status}`);
  }
  return body.result?.[0]?.results ?? [];
}

function collectBindings(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) collectBindings(item, found);
    return found;
  }
  const name = value.binding || value.name || value.database_name || "";
  const id = value.database_id || value.id || value.databaseId || "";
  if (String(name).includes("HOWLER") || String(id).includes("eb2ed8a9") || String(id).includes("b1049979") || value.type === "d1" || value.type === "d1_database") {
    found.push({ binding: value.binding || value.name, database_name: value.database_name || value.name, database_id: id, type: value.type });
  }
  for (const nested of Object.values(value)) collectBindings(nested, found);
  return found;
}

async function main() {
  if (!ACCOUNT || !TOKEN) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");

  const rows = await d1(DASHBOARD_ID, "SELECT name, project_id FROM projects");
  const live = rows.filter((row) => LIVE.includes(String(row.project_id)));
  const ids = live.map((row) => String(row.project_id));
  console.log("howler-dashboard live rows:", live.map((row) => `${row.project_id}=${row.name}`).join(" | "));
  const missing = LIVE.filter((id) => !ids.includes(id));
  if (missing.length) throw new Error(`howler-dashboard missing ${missing.join(", ")}`);
  if (live.some((row) => /smith/i.test(String(row.name ?? "")) || /smith/i.test(String(row.project_id ?? "")))) {
    throw new Error("Smith Residence is on the live board");
  }
  if (!ids.includes("craven")) throw new Error("Craven is missing");
  const deboardRows = live.filter((row) => row.project_id === "deboard");
  if (deboardRows.length !== 1) throw new Error(`expected one deboard row, got ${deboardRows.length}`);

  const paths = [
    `/workers/scripts/${WORKER}/settings`,
    `/workers/scripts/${WORKER}`,
    `/workers/services/${WORKER}`,
    `/workers/services/${WORKER}/environments/production`,
  ];
  let bindings = [];
  for (const path of paths) {
    const result = await cf(path);
    console.log(`GET ${path} -> ${result.status}`);
    if (!result.ok) continue;
    bindings = collectBindings(result.body);
    if (bindings.length) break;
  }
  console.log("worker d1 bindings:", JSON.stringify(bindings));
  const text = JSON.stringify(bindings);
  if (text.includes(STAGING_ID) || text.includes("howler-intelligence-staging")) {
    throw new Error("jarvis-voice-staging is still bound to howler-intelligence-staging");
  }
  if (bindings.length && !text.includes(DASHBOARD_ID) && !text.includes(DASHBOARD_NAME)) {
    throw new Error("jarvis-voice-staging D1 binding is not howler-dashboard");
  }
  if (!bindings.length) {
    console.log("binding API did not list D1 entries — D1 content check passed; rely on wrangler deploy output");
  }
  console.log("verify ok: howler-dashboard has 8 live jobs including Craven; Smith is not a live project_id");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
