import assert from "node:assert/strict";
import test from "node:test";
import { interpretFinancial, interpretUpload } from "./interpret.ts";
import { countyCriteria, KY_COUNTIES, tabulatedJoistSpanIn } from "./ky-code.ts";
import { openingSchedule, unresolvedRegister } from "./layout.ts";
import {
  CODE_BASIS,
  codeBasisSummary,
  designCriteria,
  formatCodeNote,
  sheetKeynotes,
  sharePacketLines,
  submittalChecklist,
} from "./code-notes.ts";
import { KY_STAIR, minRisersForRise, proposedStairFromWalls, stairCodeSummary } from "./ky-stairs.ts";
import { createSeedState } from "./seed.ts";
import { contractDates, formatDay, progressPercent, cardGlance } from "./derive.ts";
import { previewIssueDrawingSet } from "./engine.ts";
import { parseOpeningTag } from "./commands.ts";
import { SB3621 } from "./tradewalk.ts";
import { SHEETS } from "./types.ts";
import { ensureProjectShape } from "./store.ts";
import { annotatePreview } from "./ripple.ts";
import { placeLine } from "./learn.ts";
import { decideHeardAction, HOWLER_ACKS, isSleepCommand, isSelfTalk, isVoiceCancel, isVoiceConfirm, isJobNameDump, matchWake, pickHowlerAck, pickHowlerVoice } from "./voice.ts";
import { joinUtterance } from "./field-ear.ts";
import { runFieldCommand, talkRecorded } from "./field-command.ts";
import { boardHrefFromHost, isHowlerHttps } from "./board-address.ts";
import { interpretUtterance, resolveProjectMention } from "./ear.ts";

test("Kentucky has 120 counties and Boone is 20 psf", () => {
  assert.equal(KY_COUNTIES.length, 120);
  assert.equal(countyCriteria("Boone")?.snowPsf, 20);
  assert.equal(countyCriteria("Madison")?.snowPsf, 15);
});

test("2x10 16 OC joist table is under 16 feet", () => {
  const span = tabulatedJoistSpanIn("2x10", 16);
  assert.ok(span != null && span < 16 * 12);
});

test("Tell Howler records 24 by 32 and 8/12 without inventing money", () => {
  const project = createSeedState().projects.carver;
  const result = interpretFinancial(project, "24 by 32 garage, 9 foot walls, 8/12 roof");
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  const next = result.preview.apply(project);
  assert.equal(next.blueprint.widthIn, 288);
  assert.equal(next.blueprint.depthIn, 384);
  assert.equal(next.blueprint.eaveHeightIn, 108);
  assert.equal(next.blueprint.roofRise, 8);
  assert.equal(next.blueprint.roofRun, 12);
  assert.equal(next.financials, null);
});

test("garbage dimensions stay a clarification", () => {
  const project = createSeedState().projects.carver;
  const result = interpretFinancial(project, "make it bigger");
  assert.equal(result.outcome, "CLARIFICATION");
});

test("scale talk records a plotted scale without inventing envelope", () => {
  const project = createSeedState().projects.carver;
  const result = interpretFinancial(project, "plot at 1/4 inch equals a foot");
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  const next = result.preview.apply(project);
  assert.equal(next.blueprint.drawingScale, "1/4");
  assert.equal(next.blueprint.widthIn, null);
});

test("Boone County sets 20 psf snow and does not guess from the street", () => {
  const project = createSeedState().projects.carver;
  const result = interpretFinancial(project, "this is Boone County");
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  const next = result.preview.apply(project);
  assert.equal(next.blueprint.county, "Boone");
  assert.equal(next.blueprint.groundSnowLoadPsf, 20);
});

test("2x6 lumber does not overwrite a 24x32 envelope", () => {
  const project = createSeedState().projects.carver;
  const envelope = interpretFinancial(project, "24 by 32 garage, 9 foot walls, 8/12 roof");
  assert.equal(envelope.outcome, "RESOLVED");
  if (envelope.outcome !== "RESOLVED") return;
  const withEnv = envelope.preview.apply(project);
  const lumber = interpretFinancial(withEnv, "2x6 studs 16 on center");
  assert.equal(lumber.outcome, "RESOLVED");
  if (lumber.outcome !== "RESOLVED") return;
  const next = lumber.preview.apply(withEnv);
  assert.equal(next.blueprint.widthIn, 288);
  assert.equal(next.blueprint.studSize, "2x6");
  assert.equal(next.blueprint.studSpacingIn, 16);
});

test("use the Tradewalk plans records the L-shape from Drive, not a 24x32 box", () => {
  const project = createSeedState().projects["deboard-v091"];
  const result = interpretFinancial(project, "use the Tradewalk plans");
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  const next = result.preview.apply(project);
  assert.ok((next.blueprint.widthIn ?? 0) > 400);
  assert.notEqual(next.blueprint.widthIn, 288);
  assert.match(next.blueprint.notes ?? "", /tradewalk/i);
});

test("the working set has a sheet for each Tradewalk trade plus wall framing", () => {
  assert.deepEqual(
    SHEETS.map((sheet) => sheet.number),
    ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A15"],
  );
});

test("Tradewalk opening schedule and unresolved register stay honest", () => {
  const project = createSeedState().projects["deboard-v091"];
  const result = interpretFinancial(project, "use the Tradewalk plans");
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  const next = result.preview.apply(project);
  const rows = openingSchedule(next.blueprint);
  assert.ok(rows.some((row) => row.mark.startsWith("2868")));
  assert.ok(rows.some((row) => row.mark.startsWith("2840DH")));
  assert.ok(rows.some((row) => row.kind === "OHD" && row.missing && row.provenance === "UNKNOWN"));
  const unresolved = unresolvedRegister(next.blueprint);
  assert.ok(unresolved.some((item) => item.id === "ohd-leaf" && item.blocking));
  assert.ok(unresolved.some((item) => /stair/i.test(item.title) && item.blocking));
  assert.ok(unresolved.some((item) => item.id === "sb3621"));
  assert.ok(rows.some((row) => row.mark.startsWith("SB3621") && row.wall === "Unknown"));
  assert.equal(SB3621.widthIn, 42);
  assert.equal(SB3621.heightIn, 25);
  assert.ok(!unresolved.some((item) => item.id === "env-unknown"));
});

test("issue the drawings writes ISSUED and lists unresolved items", () => {
  const project = createSeedState().projects["deboard-v091"];
  const adopted = interpretFinancial(project, "use the Tradewalk plans");
  assert.equal(adopted.outcome, "RESOLVED");
  if (adopted.outcome !== "RESOLVED") return;
  const withPlans = adopted.preview.apply(project);
  const issued = previewIssueDrawingSet(withPlans);
  const next = issued.apply(withPlans);
  assert.equal(next.blueprint.drawingStatus, "ISSUED");
});

test("verbal 24 by 32 is proposed, not a verified field measurement", () => {
  const project = createSeedState().projects.carver;
  const result = interpretFinancial(project, "24 by 32 garage");
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  const next = result.preview.apply(project);
  assert.equal(next.blueprint.envelopeProvenance, "PROPOSED");
});

test("Tradewalk callouts cite 2018 KRC sections and do not invent frost", () => {
  const project = createSeedState().projects["deboard-v091"];
  const adopted = interpretFinancial(project, "use the Tradewalk plans");
  assert.equal(adopted.outcome, "RESOLVED");
  if (adopted.outcome !== "RESOLVED") return;
  const bp = adopted.preview.apply(project).blueprint;
  assert.match(CODE_BASIS, /2018/);
  const notes = sheetKeynotes(bp, "L1").map((note) => formatCodeNote(note)).join(" ");
  assert.match(notes, /R302/);
  const criteria = designCriteria(bp);
  assert.ok(criteria.some((row) => /frost/i.test(row.label) && /Unknown/i.test(row.value)));
  assert.ok(submittalChecklist(bp).some((item) => item.id === "site"));
  assert.ok(sharePacketLines(adopted.preview.apply(project)).length > 3);
});

test("what's the code basis is a clarification, not a mutation", () => {
  const project = createSeedState().projects["deboard-v091"];
  const result = interpretFinancial(project, "what's the code basis");
  assert.equal(result.outcome, "CLARIFICATION");
  if (result.outcome !== "CLARIFICATION") return;
  assert.match(result.message, /2018 Kentucky Residential Code/);
  assert.match(codeBasisSummary(project.blueprint), /815 KAR/);
});

test("Kentucky stairs are 8¼ / 9, not IRC 7¾ / 10", () => {
  assert.equal(KY_STAIR.maxRiserIn, 8.25);
  assert.equal(KY_STAIR.minTreadIn, 9);
  assert.equal(minRisersForRise(131.25), 16);
  const project = createSeedState().projects["deboard-v091"];
  const adopted = interpretFinancial(project, "use the Tradewalk plans");
  assert.equal(adopted.outcome, "RESOLVED");
  if (adopted.outcome !== "RESOLVED") return;
  const bp = adopted.preview.apply(project).blueprint;
  const proposed = proposedStairFromWalls(bp);
  assert.ok(proposed);
  assert.match(stairCodeSummary(bp), /8¼/);
  assert.match(stairCodeSummary(bp), /not vanilla IRC/);
});

test("Tell Howler commands match the manual buttons and do not invent an OHD", () => {
  const project = createSeedState().projects["deboard-v091"];
  const adopted = interpretFinancial(project, "use the Tradewalk plans");
  assert.equal(adopted.outcome, "RESOLVED");
  if (adopted.outcome !== "RESOLVED") return;
  const withPlans = adopted.preview.apply(project);

  const draw = interpretFinancial(withPlans, "draw the working set");
  assert.equal(draw.outcome, "RESOLVED");

  const pdf = interpretFinancial(withPlans, "export the PDF");
  assert.equal(pdf.outcome, "ACTION");
  if (pdf.outcome !== "ACTION") return;
  assert.equal(pdf.action, "EXPORT_PDF");

  const ohd = interpretFinancial(withPlans, "put an overhead door on the front");
  assert.equal(ohd.outcome, "CLARIFICATION");
  if (ohd.outcome !== "CLARIFICATION") return;
  assert.match(ohd.message, /will not invent/i);

  const sized = interpretFinancial(withPlans, "16 by 7 overhead on the front");
  assert.equal(sized.outcome, "RESOLVED");
  if (sized.outcome !== "RESOLVED") return;
  const withOhd = sized.preview.apply(withPlans);
  const leaf = withOhd.blueprint.openings.find((item) => item.kind === "OHD");
  assert.equal(leaf?.widthIn, 192);
  assert.equal(leaf?.heightIn, 84);

  const tagged = interpretFinancial(withPlans, "man door 2868 on the left");
  assert.equal(tagged.outcome, "RESOLVED");
  if (tagged.outcome !== "RESOLVED") return;
  const withMan = tagged.preview.apply(withPlans);
  const man = withMan.blueprint.openings.find((item) => item.kind === "MAN" && item.wall === "LEFT");
  assert.equal(man?.tag, "2868");
  assert.equal(man?.widthIn, 32);
  assert.equal(man?.heightIn, 80);

  const upload = interpretUpload(withPlans, { name: "Deboard Tradewalk Plans.pdf" });
  assert.equal(upload.outcome, "RESOLVED");
});

test("SB3621 is a 3'-6\" × 2'-1\" window tag, not a Simpson holdown", () => {
  const parsed = parseOpeningTag("SB3621");
  assert.equal(parsed?.prefix, "SB");
  assert.equal(parsed?.widthIn, 42);
  assert.equal(parsed?.heightIn, 25);
  assert.equal(parseOpeningTag("2868")?.widthIn, 32);
  assert.equal(parseOpeningTag("2840DH")?.suffix, "DH");

  const project = createSeedState().projects["deboard-v091"];
  const adopted = interpretFinancial(project, "use the Tradewalk plans");
  assert.equal(adopted.outcome, "RESOLVED");
  if (adopted.outcome !== "RESOLVED") return;
  const withPlans = adopted.preview.apply(project);

  const ask = interpretFinancial(withPlans, "what's SB3621");
  assert.equal(ask.outcome, "CLARIFICATION");
  if (ask.outcome !== "CLARIFICATION") return;
  assert.match(ask.message, /3'-6"/);
  assert.match(ask.message, /not a structural connector/i);
  assert.match(ask.message, /SSTB36/);

  const place = interpretFinancial(withPlans, "SB3621 on the left");
  assert.equal(place.outcome, "RESOLVED");
  if (place.outcome !== "RESOLVED") return;
  const next = place.preview.apply(withPlans);
  const win = next.blueprint.openings.find((item) => item.tag === "SB3621");
  assert.equal(win?.kind, "WINDOW");
  assert.equal(win?.wall, "LEFT");
  assert.equal(win?.widthIn, 42);
  assert.equal(win?.heightIn, 25);
  assert.equal(win?.provenance, "INFERRED");
});

test("job book inspections and contacts are commands, not placeholders", () => {
  const project = createSeedState().projects["deboard-v091"];
  assert.equal(project.job.permitStatus, "NOT_FILED");
  assert.equal(project.job.inspections["insp-footing"]?.status, "READY");
  assert.ok(Object.values(project.job.contacts).some((item) => item.name === "John Marr"));

  const pass = interpretFinancial(project, "footing inspection passed");
  assert.equal(pass.outcome, "RESOLVED");
  if (pass.outcome !== "RESOLVED") return;
  const next = pass.preview.apply(project);
  assert.equal(next.job.inspections["insp-footing"]?.status, "PASSED");
  assert.equal(next.financials?.baseline?.amountMinor, project.financials?.baseline?.amountMinor);

  const permit = interpretFinancial(next, "permit submitted");
  assert.equal(permit.outcome, "RESOLVED");
  if (permit.outcome !== "RESOLVED") return;
  assert.equal(permit.preview.apply(next).job.permitStatus, "SUBMITTED");

  const contact = interpretFinancial(project, "add contact Apex Electrical electrical");
  assert.equal(contact.outcome, "RESOLVED");
  if (contact.outcome !== "RESOLVED") return;
  const withContact = contact.preview.apply(project);
  assert.ok(Object.values(withContact.job.contacts).some((item) => /Apex/i.test(item.name)));
});

test("project shape is stable so the index card does not infinite-loop", () => {
  const project = createSeedState().projects["deboard-v091"];
  assert.equal(ensureProjectShape(project), project);
});

test("adding scope drafts an unpriced CO and does not move Revised", () => {
  const project = createSeedState().projects["deboard-v091"];
  const before = project.financials?.baseline?.amountMinor;
  const result = interpretFinancial(project, "add scope mini split for the office");
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  assert.equal(result.preview.clerical, false);
  assert.ok(result.preview.ripple?.some((hop) => hop.ledger === "Change Orders" && hop.status === "WILL_WRITE"));
  assert.ok(result.preview.ripple?.some((hop) => hop.ledger === "Budget" && hop.status === "UNCHANGED"));
  const next = result.preview.apply(project);
  assert.ok(Object.values(next.scopeItems).some((item) => /mini split/i.test(item.description) && !item.fromBaseline));
  const draft = Object.values(next.financials?.changeOrders ?? {}).find((co) => /mini split/i.test(co.title));
  assert.equal(draft?.status, "DRAFT");
  assert.equal(draft?.cost.amountMinor, 0);
  assert.equal(next.financials?.baseline?.amountMinor, before);
});

test("voice confirm and cancel are exact spoken replies, not job talk", () => {
  assert.equal(isVoiceConfirm("confirm"), true);
  assert.equal(isVoiceConfirm("yes"), true);
  assert.equal(isVoiceConfirm("confirm it"), true);
  assert.equal(isVoiceConfirm("yes please"), true);
  assert.equal(isVoiceCancel("cancel"), true);
  assert.equal(isVoiceCancel("cancel that"), true);
  assert.equal(isVoiceConfirm("add scope mini split"), false);
  assert.equal(isVoiceCancel("no landing at the garage"), false);
});

test("once armed, Hey Howler is required — after wake, the next utterance is a command", () => {
  assert.equal(decideHeardAction("howler is armed. say hey howler.", { state: "ARMED", hasPreview: false }).kind, "ignore");
  assert.equal(decideHeardAction("McMillan exterior is closing out", { state: "ARMED", hasPreview: false }).kind, "ignore");
  assert.deepEqual(decideHeardAction("hey howler, how's McMillan", { state: "ARMED", hasPreview: false }), {
    kind: "command",
    text: "how's McMillan",
  });
  assert.equal(decideHeardAction("howler", { state: "ARMED", hasPreview: false }).kind, "wake-only");
  assert.equal(decideHeardAction("McMillan exterior is closing out", { state: "AWAKE", hasPreview: false }).kind, "command");
  assert.equal(decideHeardAction("McMillan exterior is closing out", { state: "READY", hasPreview: false }).kind, "ignore");
  assert.ok(HOWLER_ACKS.includes(pickHowlerAck()));
  assert.equal(
    pickHowlerVoice([
      { name: "Google US English", lang: "en-US" },
      { name: "Google UK English Male", lang: "en-GB" },
      { name: "Google UK English Female", lang: "en-GB" },
      { name: "Microsoft David", lang: "en-US" },
    ] as SpeechSynthesisVoice[])?.name,
    "Google UK English Female",
  );
  assert.equal(isSelfTalk("Go ahead, boss."), true);
  assert.equal(isSelfTalk("What can I do for you?"), true);
  assert.equal(isSelfTalk("Howler is listening. Say Hey Howler."), true);
  assert.equal(isJobNameDump("Howler McMillan DeBoard Ciurlizza Carver"), true);
  assert.equal(isJobNameDump("McMillan exterior is closing out"), false);
  assert.equal(decideHeardAction("Which job: McMillan; DeBoard; Ciurlizza?", { state: "AWAKE", hasPreview: false }).kind, "ignore");
});

test("index cards list official start and intended finish without inventing them", () => {
  const { projects } = createSeedState();
  assert.equal(formatDay("2026-08-18"), "Aug 18, 2026");
  assert.equal(contractDates(projects["deboard-v091"]!).officialStart, "Aug 18, 2026");
  assert.equal(contractDates(projects["deboard-v091"]!).finishKnown, false);
  assert.equal(contractDates(projects.carver!).startKnown, false);
  assert.equal(contractDates(projects["mcmillan-v1"]!).officialStart, "Unknown");
  const preview = interpretFinancial(projects["deboard-v091"]!, "intended finish October 15, 2026");
  assert.equal(preview.outcome, "RESOLVED");
  if (preview.outcome !== "RESOLVED") return;
  const next = preview.preview.apply(projects["deboard-v091"]!);
  assert.equal(next.intendedFinish, "2026-10-15");
  assert.equal(contractDates(next).intendedFinish, "Oct 15, 2026");
});

test("index card glance is now, 14-day window, then at most three things to solve", () => {
  const { projects } = createSeedState();
  const asOf = "2026-09-12";
  const ciurlizza = cardGlance(projects["ciurlizza-v1"]!, asOf);
  assert.ok(/FAILED/i.test(ciurlizza.now));
  assert.ok(ciurlizza.window.some((item) => item.name === "31-W fire stop" && item.when === "Sep 15"));
  assert.ok(ciurlizza.window.some((item) => item.name === "Fayette County reinspection" && item.when === "Sep 17"));
  assert.ok(ciurlizza.solve.length <= 3);
  assert.ok(ciurlizza.solve.some((item) => /framing fail/i.test(item)));
  const deboard = cardGlance(projects["deboard-v091"]!, asOf);
  assert.ok(deboard.window.some((item) => /Concrete slab/i.test(item.name)));
  assert.ok(deboard.window.some((item) => /Framing/i.test(item.name) && item.when === "Sep 14"));
  const mcmillan = cardGlance(projects["mcmillan-v1"]!, asOf);
  assert.equal(mcmillan.windowHint, "Nothing dated in the next 14 days");
  assert.ok(mcmillan.solve.some((item) => /Interior held/i.test(item)));
  assert.ok(mcmillan.now.includes("closing out"));
});

test("KF live dashboard injects seven index cards without inventing money", () => {
  const { projects } = createSeedState();
  assert.equal(Object.keys(projects).length, 7);
  assert.equal(projects["ciurlizza-v1"]?.healthBand, "RED");
  assert.equal(projects["mcmillan-v1"]?.paused, false);
  assert.ok(projects["mcmillan-v1"]?.heldPhases.includes("Interior"));
  assert.equal(projects.carver?.financials, null);
  assert.equal(projects["pratt-v1"]?.financials, null);
  assert.ok(projects["deboard-v091"]?.financials);
  assert.equal(projects.carver?.activities["act-elec"]?.state, "NOT_STARTED");
  assert.match(projects["ciurlizza-v1"]?.job.inspections["insp-framing"]?.status ?? "", /FAILED/);
});

test("McMillan progress reads exterior closeout, not the held interior", () => {
  const mcmillan = createSeedState().projects["mcmillan-v1"];
  assert.ok(mcmillan);
  assert.equal(mcmillan.paused, false);
  assert.equal(mcmillan.healthBand, "GREEN");
  const pct = progressPercent(mcmillan);
  assert.ok(pct > 0 && pct < 80, `expected live closeout progress, got ${pct}`);
  assert.ok(Object.values(mcmillan.scopeItems).some((item) => /porch/i.test(item.description) && item.included));
  assert.ok(Object.values(mcmillan.scopeItems).every((item) => /interior/i.test(item.phase) ? !item.included : true));
  assert.match(mcmillan.activities["act-porch"]?.state ?? "", /IN_PROGRESS/);
  assert.equal(mcmillan.financials?.changeOrders["co-bonham"]?.status, "PROPOSED");
  assert.equal(mcmillan.financials?.changeOrders["co-bonham"]?.cost.amountMinor, 60000);
});

test("Hey Howler wake phrase strips and routes to the named job", () => {
  assert.deepEqual(matchWake("hey howler"), { woke: true, rest: "" });
  assert.deepEqual(matchWake("Howler we're updating"), { woke: true, rest: "" });
  assert.deepEqual(matchWake("Howler we have an update"), { woke: true, rest: "" });
  assert.deepEqual(matchWake("Howler we're updating McMillan concrete is done"), {
    woke: true,
    rest: "McMillan concrete is done",
  });
  assert.equal(matchWake("blah blah blah the concrete").woke, false);
  assert.deepEqual(matchWake("Howler, McMillan exterior is closing out"), {
    woke: true,
    rest: "McMillan exterior is closing out",
  });
  assert.equal(matchWake("McMillan exterior is closing out").woke, false);
  assert.deepEqual(matchWake("Hey Howler, McMillan exterior is closing out"), {
    woke: true,
    rest: "McMillan exterior is closing out",
  });
  assert.equal(matchWake("start the footer").woke, false);
  assert.equal(isSleepCommand("go to sleep"), true);
  assert.equal(isSleepCommand("end"), true);
  assert.equal(isSleepCommand("end update"), true);
  assert.equal(isVoiceConfirm("confirm"), true);
  assert.equal(isVoiceConfirm("done"), false);
  assert.equal(decideHeardAction("hey howler", { state: "AWAKE", hasPreview: false }).kind, "ignore");
  assert.equal(decideHeardAction("confirm", { state: "AWAKE", hasPreview: true }).kind, "confirm");
  assert.equal(decideHeardAction("end", { state: "AWAKE", hasPreview: true }).kind, "sleep");
  assert.equal(decideHeardAction("end update", { state: "LISTENING", hasPreview: false }).kind, "sleep");
  assert.equal(decideHeardAction("done", { state: "AWAKE", hasPreview: false }).kind, "command");
  assert.equal(isSleepCommand("done"), false);
  assert.equal(decideHeardAction("hey howler", { state: "ARMED", hasPreview: false }).kind, "wake-only");
  assert.equal(decideHeardAction("Howler", { state: "ARMED", hasPreview: false }).kind, "wake-only");
  assert.equal(
    decideHeardAction("McMillan exterior is closing out", { state: "LISTENING", hasPreview: false }).kind,
    "command",
  );
  assert.equal(
    decideHeardAction("McMillan exterior is closing out", { state: "ARMED", hasPreview: false }).kind,
    "ignore",
  );
  assert.equal(decideHeardAction("apply", { state: "LISTENING", hasPreview: true }).kind, "confirm");

  const { projects } = createSeedState();
  assert.equal(resolveProjectMention("mcmillan porch", projects).projectId, "mcmillan-v1");
  const status = interpretUtterance(projects, "how's McMillan", null);
  assert.equal(status.projectId, "mcmillan-v1");
  assert.equal(status.result.outcome, "CLARIFICATION");
  if (status.result.outcome !== "CLARIFICATION") return;
  assert.match(status.result.message, /McMillan/);
  assert.match(status.result.message, /GREEN/);

  const close = interpretUtterance(projects, "hey howler, McMillan exterior is closing out", null);
  assert.equal(close.projectId, "mcmillan-v1");
  assert.equal(close.result.outcome, "RESOLVED");
  if (close.result.outcome === "RESOLVED") assert.equal(close.result.preview.clerical, true);
  const update = interpretUtterance(
    projects,
    "hey howler McMillan porch ceiling is going in this week no budget change",
    null,
  );
  assert.equal(update.projectId, "mcmillan-v1");
  assert.equal(update.result.outcome, "RESOLVED");
  if (update.result.outcome === "RESOLVED") {
    assert.equal(update.result.preview.clerical, true);
    assert.equal(update.result.preview.changes.includes("Budget"), false);
    assert.match(update.result.preview.understood, /porch ceiling/i);
  }
  const concrete = interpretUtterance(projects, "hey howler McMillan concrete is done", null);
  assert.equal(concrete.projectId, "mcmillan-v1");
  assert.equal(concrete.result.outcome, "RESOLVED");
  if (concrete.result.outcome === "RESOLVED") {
    const next = concrete.result.preview.apply(projects["mcmillan-v1"]!);
    assert.equal(next.activities["act-concrete"]?.state, "COMPLETE");
    assert.match(next.dashboardNote ?? "", /complete/i);
    assert.match(next.dashboardNote ?? "", /Next call/i);
    const glance = cardGlance(next);
    assert.ok(/complete/i.test(glance.now));
    assert.ok(!glance.solve.some((item) => /Keep Concrete platform/i.test(item)));
  }
  const withNext = interpretUtterance(
    projects,
    "hey howler McMillan concrete is done next porch ceiling",
    null,
  );
  assert.equal(withNext.result.outcome, "RESOLVED");
  if (withNext.result.outcome === "RESOLVED") {
    const next = withNext.result.preview.apply(projects["mcmillan-v1"]!);
    assert.equal(next.activities["act-concrete"]?.state, "COMPLETE");
    assert.notEqual(next.activities["act-ceiling"]?.state, "COMPLETE");
    assert.match(next.dashboardNote ?? "", /porch ceiling/i);
  }
  const field = interpretUtterance(
    projects,
    "update McMillan, concrete is done, Jason Bonham is completing the exterior light pole, we are awaiting David Stanfield's estimate approval by Paul and Jeff via email",
    null,
  );
  assert.equal(field.projectId, "mcmillan-v1");
  assert.equal(field.result.outcome, "RESOLVED");
  if (field.result.outcome === "RESOLVED") {
    assert.equal(field.result.preview.clerical, true);
    assert.equal(field.result.preview.eventType, "JOB_STATUS_UPDATED");
    const next = field.result.preview.apply(projects["mcmillan-v1"]!);
    assert.equal(next.activities["act-concrete"]?.state, "COMPLETE");
    assert.notEqual(next.activities["act-elec"]?.state, "COMPLETE");
    assert.match(next.dashboardNote ?? "", /Stanfield|estimate|Next call/i);
    const glance = cardGlance(next);
    assert.ok(!glance.solve.some((item) => /concrete/i.test(item)));
    assert.doesNotMatch(field.result.preview.understood, /width by depth|envelope|invent a size/i);
  }
  const poured = interpretUtterance(projects, "hey howler McMillan concrete is poured", null);
  assert.equal(poured.result.outcome, "RESOLVED");
  if (poured.result.outcome === "RESOLVED") {
    const next = poured.result.preview.apply(projects["mcmillan-v1"]!);
    assert.equal(next.activities["act-concrete"]?.state, "COMPLETE");
  }
  const studs = interpretUtterance(projects, "hey howler DeBoard studs are done", null);
  assert.equal(studs.projectId, "deboard-v091");
  assert.equal(studs.result.outcome, "RESOLVED");
  if (studs.result.outcome === "RESOLVED") {
    assert.equal(studs.result.preview.eventType, "JOB_STATUS_UPDATED");
  }
  assert.equal(decideHeardAction("confirm it", { state: "AWAKE", hasPreview: true }).kind, "confirm");
  assert.equal(
    joinUtterance(["Hey Howler", "McMillan exterior is closing out", "and the porch ceiling is next"]),
    "Hey Howler McMillan exterior is closing out and the porch ceiling is next",
  );
});

test("Carver progress reads the SOW, not leftover punch", () => {
  const carver = createSeedState().projects.carver;
  assert.ok(carver);
  assert.match(carver.address, /Wil Rose/);
  assert.ok(progressPercent(carver) >= 70);
  assert.ok(Object.values(carver.scopeItems).some((item) => /glass/i.test(item.description) && !item.complete));
  assert.ok(Object.values(carver.scopeItems).some((item) => item.complete));
  assert.ok(carver.blueprint.evidence.some((item) => /hall design/i.test(item.name)));
  assert.ok(carver.blueprint.evidence.some((item) => item.storedSrc?.includes("/evidence/carver/")));
  assert.ok((carver.job.rules?.length ?? 0) > 0);
});

test("Deboard contracted scope is the garage SOW, not three leftover cards", () => {
  const deboard = createSeedState().projects["deboard-v091"];
  assert.ok(deboard);
  const included = Object.values(deboard.scopeItems).filter((item) => item.included);
  assert.ok(included.length >= 10);
  assert.ok(included.some((item) => /footing|stem wall/i.test(item.description) && item.complete));
  assert.ok(included.some((item) => /framing|garage structure/i.test(item.description) && !item.complete));
  const pct = progressPercent(deboard);
  assert.ok(pct > 0 && pct < 50);
});

test("approve, finish, door, and inspection each carry a ripple", () => {
  const project = createSeedState().projects["deboard-v091"];

  const finish = interpretFinancial(project, "finish footer");
  if (finish.outcome === "CLARIFICATION") {
    const dated = interpretFinancial(project, "finish footer 2026-09-12");
    assert.equal(dated.outcome, "RESOLVED");
    if (dated.outcome !== "RESOLVED") return;
    const hops = annotatePreview(project, dated.preview).ripple ?? [];
    assert.ok(hops.some((hop) => hop.ledger === "Schedule" && hop.status === "WILL_WRITE"));
  }

  const door = interpretFinancial(project, "16 by 7 overhead on the front");
  assert.equal(door.outcome, "RESOLVED");
  if (door.outcome !== "RESOLVED") return;
  const doorHops = annotatePreview(project, door.preview).ripple ?? [];
  assert.ok(doorHops.some((hop) => hop.ledger === "Plans" && hop.status === "WILL_WRITE"));
  assert.ok(doorHops.some((hop) => hop.ledger === "Budget" && hop.status === "UNCHANGED"));

  const card = interpretFinancial(project, "footing inspection passed");
  assert.equal(card.outcome, "RESOLVED");
  if (card.outcome !== "RESOLVED") return;
  const cardHops = annotatePreview(project, card.preview).ripple ?? [];
  assert.ok(cardHops.some((hop) => hop.ledger === "Inspections" && hop.status === "WILL_WRITE"));
  assert.ok(cardHops.some((hop) => hop.ledger === "Budget" && hop.status === "UNCHANGED"));
});

test("DeBoard trade tracker is the real baseline and maps to trades", () => {
  const { projects } = createSeedState();
  const deboard = projects["deboard-v091"]!;
  assert.equal(deboard.financials?.baseline?.amountMinor, 16555228);
  assert.ok(deboard.financials?.lines["line-06-101"]?.vendorRef?.includes("Stanfield"));
  assert.equal(deboard.financials?.lines["line-15-401"]?.trade, "Plumbing");
  assert.equal(deboard.financials?.lines["line-15-401"]?.activityId, "act-mech");
  assert.equal(projects["ciurlizza-v1"]?.financials?.baseline?.amountMinor, 8188700);
  assert.equal(projects["pratt-v1"]?.financials, null);
  const place = placeLine(deboard, deboard.financials!.lines["line-06-101"]!);
  assert.ok(place.conflict);
});

test("Siri field command writes the job and speaks recorded, not confirm", () => {
  const { projects } = createSeedState();
  const result = runFieldCommand(projects, "McMillan concrete is done");
  assert.equal(result.applied, true);
  assert.equal(result.job, "McMillan");
  assert.equal(result.projects["mcmillan-v1"]?.activities["act-concrete"]?.state, "COMPLETE");
  assert.match(result.say, /McMillan/i);
  assert.match(result.say, /Recorded/i);
  assert.doesNotMatch(result.say, /Confirm\?/i);
  const ask = runFieldCommand(projects, "how's McMillan");
  assert.equal(ask.applied, false);
  assert.match(ask.say, /McMillan/i);
  assert.match(talkRecorded("McMillan", "Concrete's done."), /Recorded/);
});

test("Howler's address is https, never the word Howler", () => {
  assert.equal(isHowlerHttps("Howler"), false);
  assert.equal(isHowlerHttps("howler"), false);
  assert.equal(boardHrefFromHost("howler"), "https://jarvis-voice-staging.kalob.workers.dev/");
  assert.equal(isHowlerHttps("https://jarvis-voice-staging.kalob.workers.dev/"), true);
});


