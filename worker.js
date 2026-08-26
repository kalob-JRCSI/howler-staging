// HOWLER Scheduling Intelligence staging bundle v0.9.0
// Generated from the typed source tree for Cloudflare Dashboard deployment.
const __modules = Object.create(null);
__modules["src/confidence.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeConfidence = computeConfidence;
function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
function average(values, fallback) {
    return values.length === 0 ? fallback : values.reduce((a, b) => a + b, 0) / values.length;
}
function sourceScore(source) {
    return source.supersededBySourceId ? 0.15 : source.authority * source.reliability;
}
function operationalFreshness(source, generatedAt) {
    const staticTypes = new Set(["PLAN", "SCOPE", "ENGINEERING", "CONTRACT"]);
    if (staticTypes.has(source.type))
        return source.supersededBySourceId ? 0.2 : 1;
    const observed = Date.parse(source.observedAt);
    const generated = Date.parse(generatedAt);
    if (!Number.isFinite(observed) || !Number.isFinite(generated) || generated < observed)
        return 0.5;
    const ageDays = (generated - observed) / 86_400_000;
    if (ageDays <= 7)
        return 1;
    if (ageDays <= 30)
        return 0.9;
    if (ageDays <= 90)
        return 0.7;
    if (ageDays <= 180)
        return 0.5;
    return 0.35;
}
function truthStateScore(state) {
    if (state === "SATISFIED") return 1;
    if (state === "COMMITTED") return 0.82;
    if (state === "FORECASTED") return 0.62;
    if (state === "UNVERIFIED") return 0.42;
    if (state === "BLOCKED") return 0;
    return 0.35;
}
function constraintReadiness(constraints, type) {
    const selected = constraints.filter((c) => c.type === type);
    return average(selected.map((c) => truthStateScore(c.state)), 0.72);
}
function computeConfidence(model, activity, generatedAt) {
    const combinedSourceIds = [...new Set([...activity.sourceIds, ...activity.duration.sourceIds])];
    const sources = combinedSourceIds.map((id) => model.sources[id]).filter((s) => Boolean(s));
    const constraints = activity.constraintIds.map((id) => model.constraints[id]).filter((c) => Boolean(c));
    const scopeSources = sources.filter((s) => ["PLAN", "SCOPE", "ENGINEERING"].includes(s.type));
    const incoming = Object.values(model.dependencies).filter((d) => d.active && d.successorId === activity.id && d.hard);
    const dependencySourceScores = incoming.flatMap((d) => d.sourceIds.flatMap((id) => {
        const source = model.sources[id];
        return source ? [sourceScore(source)] : [];
    }));
    const allSourceScores = sources.map(sourceScore);
    const scopeClarity = average(scopeSources.map(sourceScore), 0.45);
    const dependencyClarity = average(dependencySourceScores, incoming.length === 0 ? 0.95 : 0.5);
    const materialReadiness = constraintReadiness(constraints, "MATERIAL");
    const tradeReadiness = constraintReadiness(constraints, "TRADE_AVAILABILITY");
    const inspectionReadiness = constraintReadiness(constraints, "INSPECTION");
    const freshness = average(sources.map((s) => operationalFreshness(s, generatedAt)), 0.55);
    const historicalEvidence = 0.5; // Replaced by calibrated historical feature service when enough verified outcomes exist.
    const fieldVerification = activity.actualFinish ? 1 : activity.actualStart ? 0.95 : average(sources.filter((s) => ["FIELD_REPORT", "PM_INPUT", "TRADE_CONFIRMATION", "ACTUAL_VERIFICATION"].includes(s.type)).map(sourceScore), 0.4);
    const contradictionPenalty = Math.min(0.4, constraints.filter((c) => c.state === "BLOCKED" && ["DOCUMENTATION", "INFORMATION"].includes(c.type)).length * 0.15 +
        sources.filter((s) => Boolean(s.supersededBySourceId)).length * 0.05);
    const weighted = scopeClarity * 0.18 +
        dependencyClarity * 0.16 +
        materialReadiness * 0.14 +
        tradeReadiness * 0.14 +
        inspectionReadiness * 0.1 +
        freshness * 0.1 +
        historicalEvidence * 0.08 +
        fieldVerification * 0.1;
    const overall = clamp01(weighted - contradictionPenalty);
    return {
        scopeClarity: clamp01(scopeClarity),
        dependencyClarity: clamp01(dependencyClarity),
        materialReadiness: clamp01(materialReadiness),
        tradeReadiness: clamp01(tradeReadiness),
        inspectionReadiness: clamp01(inspectionReadiness),
        freshness: clamp01(freshness),
        historicalEvidence,
        fieldVerification: clamp01(fieldVerification),
        contradictionPenalty,
        overall,
    };
}

};
__modules["src/coverage.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityCoverage = activityCoverage;
function average(values, fallback = 0) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : fallback;
}
function sourceQuality(s) {
    return s.supersededBySourceId ? 0.1 : s.authority * s.reliability;
}
function commercialScore(signal) {
    const coverage = signal.scopeCoverage === "FULL" ? 1 : signal.scopeCoverage === "PARTIAL" ? 0.65 : signal.scopeCoverage === "ALLOWANCE" ? 0.45 : 0.25;
    return coverage * (signal.selected ? 1 : 0.7);
}
function constraintScore(constraint) {
    if (constraint.state === "SATISFIED") return 1;
    if (constraint.state === "COMMITTED") return 0.82;
    if (constraint.state === "FORECASTED") return 0.62;
    if (constraint.state === "UNVERIFIED") return 0.42;
    if (constraint.state === "BLOCKED") return 0;
    return 0.35;
}
function activityCoverage(model, activityId) {
    const activity = model.activities[activityId];
    if (!activity)
        throw new Error(`Unknown activity ${activityId}`);
    const sources = activity.sourceIds.map((id) => model.sources[id]).filter((s) => Boolean(s));
    const design = sources.filter((s) => ["PLAN", "SCOPE", "ENGINEERING"].includes(s.type));
    const physicalDefinition = average(design.map(sourceQuality), 0.2);
    const commercial = Object.values(model.commercialSignals ?? {}).filter((s) => s.activityIds.includes(activityId));
    const commercialCoverage = average(commercial.map(commercialScore), 0.15);
    const constraints = activity.constraintIds.map((id) => model.constraints[id]).filter((c) => Boolean(c));
    const material = constraints.filter((c) => c.type === "MATERIAL");
    const trade = constraints.filter((c) => c.type === "TRADE_AVAILABILITY");
    const materialCoverage = average(material.map(constraintScore), 0.35);
    const tradeCoverage = average(trade.map(constraintScore), sources.some((s) => ["CONTRACT", "TRADE_CONFIRMATION"].includes(s.type)) ? 0.8 : 0.35);
    const deps = Object.values(model.dependencies).filter((d) => d.active && d.hard && (d.predecessorId === activityId || d.successorId === activityId));
    const scheduleDefinition = deps.length > 0 || activity.phase.toLowerCase().includes("closeout") ? 0.9 : 0.55;
    const overall = physicalDefinition * 0.3 + commercialCoverage * 0.2 + materialCoverage * 0.18 + tradeCoverage * 0.17 + scheduleDefinition * 0.15;
    const gaps = [];
    if (physicalDefinition < 0.6)
        gaps.push("Physical scope/design evidence is weak or conflicting");
    if (commercialCoverage < 0.55)
        gaps.push("Commercial coverage is incomplete, allowance-only, or unselected");
    if (materialCoverage < 0.55)
        gaps.push("Material readiness/coverage is not sufficiently verified");
    if (tradeCoverage < 0.55)
        gaps.push("Trade assignment or availability is not sufficiently verified");
    if (scheduleDefinition < 0.6)
        gaps.push("Dependency definition is incomplete");
    return { activityId, physicalDefinition, commercialCoverage, materialCoverage, tradeCoverage, scheduleDefinition, overall, gaps };
}

};
__modules["src/date.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertISODate = assertISODate;
exports.isWorkingDay = isWorkingDay;
exports.nextWorkingDay = nextWorkingDay;
exports.addWorkdays = addWorkdays;
exports.minDate = minDate;
exports.maxDate = maxDate;
exports.workdaysBetween = workdaysBetween;
exports.durationFinish = durationFinish;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function assertISODate(date) {
    if (!ISO_DATE_RE.test(date))
        throw new Error(`Invalid ISO schedule date: ${date}`);
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new Error(`Invalid calendar date: ${date}`);
    }
}
function toUTCDate(date) {
    assertISODate(date);
    return new Date(`${date}T00:00:00Z`);
}
function fromUTCDate(date) {
    return date.toISOString().slice(0, 10);
}
function isWorkingDay(date, calendar) {
    const d = toUTCDate(date);
    return calendar.workingWeekdays.includes(d.getUTCDay()) && !calendar.holidays.includes(date);
}
function nextWorkingDay(date, calendar) {
    let d = toUTCDate(date);
    for (let i = 0; i < 370; i += 1) {
        const candidate = fromUTCDate(d);
        if (isWorkingDay(candidate, calendar))
            return candidate;
        d = new Date(d.getTime() + 86_400_000);
    }
    throw new Error("Unable to find next working day within one year");
}
function addWorkdays(date, workdays, calendar) {
    if (!Number.isInteger(workdays))
        throw new Error("workdays must be an integer");
    if (workdays === 0)
        return nextWorkingDay(date, calendar);
    const direction = workdays > 0 ? 1 : -1;
    let remaining = Math.abs(workdays);
    let d = toUTCDate(date);
    while (remaining > 0) {
        d = new Date(d.getTime() + direction * 86_400_000);
        const candidate = fromUTCDate(d);
        if (isWorkingDay(candidate, calendar))
            remaining -= 1;
    }
    return fromUTCDate(d);
}
function minDate(a, b) {
    return a <= b ? a : b;
}
function maxDate(a, b) {
    return a >= b ? a : b;
}
function workdaysBetween(start, end, calendar) {
    if (start === end)
        return 0;
    const direction = start < end ? 1 : -1;
    let d = toUTCDate(start);
    let count = 0;
    while (fromUTCDate(d) !== end) {
        d = new Date(d.getTime() + direction * 86_400_000);
        const candidate = fromUTCDate(d);
        if (isWorkingDay(candidate, calendar))
            count += direction;
        if (Math.abs(count) > 10000)
            throw new Error("workdaysBetween exceeded safety bound");
    }
    return count;
}
function durationFinish(start, durationWorkdays, calendar) {
    if (!Number.isInteger(durationWorkdays) || durationWorkdays < 1) {
        throw new Error(`Duration must be an integer >= 1, got ${durationWorkdays}`);
    }
    const normalized = nextWorkingDay(start, calendar);
    return addWorkdays(normalized, durationWorkdays - 1, calendar);
}

};
__modules["src/engine.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendEvent = appendEvent;
exports.forecastInitial = forecastInitial;
exports.forecastAfterEvent = forecastAfterEvent;
exports.publishForecast = publishForecast;
const graph_js_1 = require("./graph.js");
const oversight_js_1 = require("./oversight.js");
const solver_js_1 = require("./solver.js");
const validation_js_1 = require("./validation.js");
const reducer_js_1 = require("./reducer.js");
function appendEvent(model, event) {
    if (model.eventLedger.some((e) => e.id === event.id))
        throw new Error(`Duplicate event ID: ${event.id}`);
    if (event.projectId !== model.projectId)
        throw new Error(`Event ${event.id} belongs to a different project`);
    if (event.baseRevision !== model.revision) {
        throw new Error(`Stale event ${event.id}: expected baseRevision ${model.revision}, got ${event.baseRevision}`);
    }
    // Append-only with optimistic concurrency. Caller receives a new model revision.
    return { ...model, revision: model.revision + 1, eventLedger: [...model.eventLedger, Object.freeze({ ...event })] };
}
function forecastInitial(model, generatedAt, version = 1) {
    if (!Number.isInteger(version) || version < 1)
        throw new Error("Initial forecast version must be an integer >= 1");
    (0, validation_js_1.validateProjectModel)(model);
    const candidate = (0, solver_js_1.generateForecast)(model, generatedAt, version);
    const oversight = (0, oversight_js_1.runOversightReview)(model, candidate, undefined, generatedAt);
    const proposed = {
        ...candidate,
        status: oversight.decision === "BLOCK" ? "WORKING" : "PROPOSED",
        oversightReviewId: oversight.id,
        publicationGate: { forecastAllowed: true, commitmentEligible: oversight.decision !== "BLOCK", oversightDecision: oversight.decision },
    };
    return { modelAfterEvent: model, candidate: proposed, oversight, forecastable: true, commitmentEligible: oversight.decision !== "BLOCK", publishable: oversight.decision !== "BLOCK" };
}
function forecastAfterEvent(model, event, generatedAt, nextVersion, baseline) {
    if (!Number.isInteger(nextVersion) || nextVersion < 1)
        throw new Error("Forecast version must be an integer >= 1");
    if (baseline && nextVersion <= baseline.version)
        throw new Error(`Forecast version must increase beyond baseline version ${baseline.version}`);
    const mutated = (0, reducer_js_1.applyEventMutations)(model, event);
    const withEvent = appendEvent(mutated, event);
    (0, validation_js_1.validateProjectModel)(withEvent);
    const cone = new Set((0, graph_js_1.impactCone)(withEvent, event.impactSeedActivityIds));
    const candidate = (0, solver_js_1.generateForecast)(withEvent, generatedAt, nextVersion, baseline, cone);
    const oversight = (0, oversight_js_1.runOversightReview)(withEvent, candidate, event, generatedAt);
    const proposed = {
        ...candidate,
        status: oversight.decision === "BLOCK" ? "WORKING" : "PROPOSED",
        oversightReviewId: oversight.id,
        publicationGate: { forecastAllowed: true, commitmentEligible: oversight.decision !== "BLOCK", oversightDecision: oversight.decision },
    };
    return { modelAfterEvent: withEvent, candidate: proposed, oversight, forecastable: true, commitmentEligible: oversight.decision !== "BLOCK", publishable: oversight.decision !== "BLOCK" };
}
function publishForecast(run) {
    if (!run.publishable || run.oversight.decision === "BLOCK") {
        throw new Error("Forecast cannot be published because oversight review blocked it");
    }
    return { ...run.candidate, status: "PUBLISHED" };
}

};
__modules["src/graph.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGraphIndex = buildGraphIndex;
exports.impactCone = impactCone;
function buildGraphIndex(model) {
    const incoming = {};
    const outgoing = {};
    const indegree = {};
    for (const id of Object.keys(model.activities)) {
        incoming[id] = [];
        outgoing[id] = [];
        indegree[id] = 0;
    }
    for (const dep of Object.values(model.dependencies)) {
        if (!dep.active)
            continue;
        if (!model.activities[dep.predecessorId] || !model.activities[dep.successorId]) {
            throw new Error(`Dependency ${dep.id} references unknown activity`);
        }
        if (dep.predecessorId === dep.successorId)
            throw new Error(`Dependency ${dep.id} is self-referential`);
        if (!Number.isInteger(dep.lagWorkdays) || dep.lagWorkdays < 0)
            throw new Error(`Dependency ${dep.id} lag must be a non-negative integer; model overlap with explicit milestone activities`);
        outgoing[dep.predecessorId].push(dep);
        incoming[dep.successorId].push(dep);
        if (dep.hard)
            indegree[dep.successorId] = (indegree[dep.successorId] ?? 0) + 1;
    }
    const queue = Object.keys(indegree).filter((id) => indegree[id] === 0).sort();
    const order = [];
    while (queue.length > 0) {
        const id = queue.shift();
        order.push(id);
        for (const dep of outgoing[id] ?? []) {
            if (!dep.hard)
                continue;
            indegree[dep.successorId]--;
            if (indegree[dep.successorId] === 0) {
                queue.push(dep.successorId);
                queue.sort();
            }
        }
    }
    if (order.length !== Object.keys(model.activities).length) {
        throw new Error("Hard dependency cycle detected. Publishing must be blocked until the cycle is resolved.");
    }
    return { incoming, outgoing, topologicalOrder: order };
}
function impactCone(model, seeds) {
    const index = buildGraphIndex(model);
    const seen = new Set();
    const queue = [...seeds];
    while (queue.length > 0) {
        const id = queue.shift();
        if (!model.activities[id])
            throw new Error(`Impact seed references unknown activity: ${id}`);
        if (seen.has(id))
            continue;
        seen.add(id);
        for (const dep of index.outgoing[id] ?? [])
            queue.push(dep.successorId);
    }
    return index.topologicalOrder.filter((id) => seen.has(id));
}

};
__modules["src/index.js"] = function(module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./types.js"), exports);
__exportStar(require("./date.js"), exports);
__exportStar(require("./graph.js"), exports);
__exportStar(require("./validation.js"), exports);
__exportStar(require("./confidence.js"), exports);
__exportStar(require("./coverage.js"), exports);
__exportStar(require("./metrics.js"), exports);
__exportStar(require("./storage.js"), exports);
__exportStar(require("./solver.js"), exports);
__exportStar(require("./oversight.js"), exports);
__exportStar(require("./learning.js"), exports);
__exportStar(require("./reducer.js"), exports);
__exportStar(require("./engine.js"), exports);

};
__modules["src/learning.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePredictionOutcome = evaluatePredictionOutcome;
exports.calibratedConfidence = calibratedConfidence;
exports.updateLearningRecord = updateLearningRecord;
exports.decayedLearningWeight = decayedLearningWeight;
const date_js_1 = require("./date.js");
function evaluatePredictionOutcome(model, predictionId, activityId, sourceSnapshotId, predicted, actual, confidenceAtPrediction, horizonDays) {
    const pointErrorWorkdays = (0, date_js_1.workdaysBetween)(predicted.likely, actual, model.calendar);
    const rangeHit = actual >= predicted.optimistic && actual <= predicted.conservative;
    return {
        predictionId,
        activityId,
        horizonDays,
        predicted,
        actual,
        pointErrorWorkdays,
        rangeHit,
        confidenceAtPrediction,
        sourceSnapshotId,
    };
}
function calibratedConfidence(records, requestedBin, tolerance = 0.1) {
    const selected = records.filter((r) => Math.abs(r.confidenceAtPrediction - requestedBin) <= tolerance);
    if (selected.length < 5)
        return undefined;
    return selected.filter((r) => r.rangeHit).length / selected.length;
}
function countsForPromotion(kind, hypothesisType) {
    if (kind === "CORRELATION")
        return false;
    if (hypothesisType === "CAUSAL")
        return kind === "VERIFIED_CAUSE";
    return kind === "VERIFIED_OUTCOME" || kind === "VERIFIED_CAUSE";
}
function minimumDistinctProjects(layer, stage) {
    if (layer === "EVENT")
        return Number.POSITIVE_INFINITY;
    if (stage === "EMERGING")
        return ["COMPANY", "PROJECT_TYPE", "TRADE_VENDOR", "HOWLER_SELF"].includes(layer) ? 2 : 1;
    if (stage === "VALIDATED")
        return ["COMPANY", "PROJECT_TYPE", "TRADE_VENDOR", "HOWLER_SELF"].includes(layer) ? 3 : 2;
    if (stage === "OPERATING_RULE")
        return ["COMPANY", "PROJECT_TYPE", "TRADE_VENDOR", "HOWLER_SELF"].includes(layer) ? 4 : 3;
    return 1;
}
function updateLearningRecord(prior, input) {
    const promotable = countsForPromotion(input.evidenceKind, input.hypothesisType);
    const verified = (prior?.verifiedOutcomeCount ?? 0) + (promotable && input.supportsHypothesis ? 1 : 0);
    const contradicting = (prior?.contradictingOutcomeCount ?? 0) + (promotable && !input.supportsHypothesis ? 1 : 0);
    const total = verified + contradicting;
    const empirical = total === 0 ? 0.5 : verified / total;
    const confidence = total === 0 ? 0.5 : (verified + 2) / (total + 4); // Bayesian shrinkage toward 0.5.
    const evidenceProjectIds = [...new Set([...(prior?.evidenceProjectIds ?? []), input.projectId])];
    const distinctProjects = evidenceProjectIds.length;
    const observationCount = (prior?.observationCount ?? 0) + 1;
    let stage = "OBSERVATION";
    if (total >= 3 && confidence >= 0.65 && distinctProjects >= minimumDistinctProjects(input.layer, "EMERGING"))
        stage = "EMERGING";
    if (total >= 6 && confidence >= 0.75 && distinctProjects >= minimumDistinctProjects(input.layer, "VALIDATED"))
        stage = "VALIDATED";
    if (total >= 10 && confidence >= 0.82 && empirical >= 0.8 && distinctProjects >= minimumDistinctProjects(input.layer, "OPERATING_RULE"))
        stage = "OPERATING_RULE";
    return {
        id: prior?.id ?? input.id,
        layer: input.layer,
        hypothesisType: input.hypothesisType,
        subjectKey: input.subjectKey,
        hypothesis: input.hypothesis,
        evidenceEventIds: [...(prior?.evidenceEventIds ?? []), input.eventId],
        evidenceProjectIds,
        observationCount,
        verifiedOutcomeCount: verified,
        contradictingOutcomeCount: contradicting,
        confidence,
        stage,
        lastObservedAt: input.lastObservedAt,
    };
}
function decayedLearningWeight(record, asOf) {
    const ageDays = Math.max(0, (Date.parse(asOf) - Date.parse(record.lastObservedAt)) / 86_400_000);
    const halfLifeDays = record.layer === "TRADE_VENDOR" ? 180 : record.layer === "COMPANY" ? 365 : 270;
    return record.confidence * Math.pow(0.5, ageDays / halfLifeDays);
}

};
__modules["src/metrics.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.horizonBucket = horizonBucket;
exports.summarizeAccuracy = summarizeAccuracy;
exports.compoundImpactRatio = compoundImpactRatio;
function horizonBucket(days) {
    if (days <= 3)
        return "0-3";
    if (days <= 7)
        return "4-7";
    if (days <= 14)
        return "8-14";
    if (days <= 30)
        return "15-30";
    if (days <= 60)
        return "31-60";
    return "61+";
}
function summarizeAccuracy(records) {
    const buckets = ["0-3", "4-7", "8-14", "15-30", "31-60", "61+"];
    return buckets.flatMap((bucket) => {
        const rows = records.filter((r) => horizonBucket(r.horizonDays) === bucket);
        if (!rows.length)
            return [];
        const count = rows.length;
        const maeWorkdays = rows.reduce((sum, r) => sum + Math.abs(r.pointErrorWorkdays), 0) / count;
        const meanBiasWorkdays = rows.reduce((sum, r) => sum + r.pointErrorWorkdays, 0) / count;
        const rangeCoverage = rows.filter((r) => r.rangeHit).length / count;
        const meanConfidence = rows.reduce((sum, r) => sum + r.confidenceAtPrediction, 0) / count;
        return [{
                bucket,
                count,
                maeWorkdays,
                meanBiasWorkdays,
                rangeCoverage,
                meanConfidence,
                calibrationGap: rangeCoverage - meanConfidence,
            }];
    });
}
function compoundImpactRatio(triggerDelayWorkdays, finalCriticalPathImpactWorkdays) {
    if (triggerDelayWorkdays === 0)
        return undefined;
    return Math.abs(finalCriticalPathImpactWorkdays / triggerDelayWorkdays);
}

};
__modules["src/oversight.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOversightReview = runOversightReview;
const graph_js_1 = require("./graph.js");
const date_js_1 = require("./date.js");
function decisionFrom(findings) {
    if (findings.some((f) => f.severity === "BLOCK"))
        return "BLOCK";
    if (findings.some((f) => f.severity === "WARN"))
        return "PASS_WITH_WARNINGS";
    return "PASS";
}
function addFinding(findings, category, severity, message, activityIds, sourceIds) {
    findings.push({ category, severity, message, activityIds, ...(sourceIds ? { sourceIds } : {}) });
}
function runOversightReview(model, candidate, triggeringEvent, createdAt) {
    const findings = [];
    const graph = (0, graph_js_1.buildGraphIndex)(model);
    if (triggeringEvent) {
        if (triggeringEvent.verification === "UNVERIFIED") {
            addFinding(findings, "EVIDENCE", "WARN", "Triggering event is unverified. Forecast may be explored internally but material schedule changes should not be published as fact.", triggeringEvent.impactSeedActivityIds, triggeringEvent.sourceIds);
        }
        if (["SCOPE_CHANGE", "DOCUMENT_REVISION"].includes(triggeringEvent.type) && triggeringEvent.impactSeedActivityIds.length === 0) {
            addFinding(findings, "DOCUMENTATION", "BLOCK", "Scope/document change has no mapped impact seed activities.", []);
        }
    }
    for (const conflict of Object.values(model.conflicts ?? {})) {
        if (conflict.status !== "OPEN")
            continue;
        if (conflict.severity === "HIGH") {
            addFinding(findings, "DOCUMENTATION", "BLOCK", `Open high-severity project truth conflict: ${conflict.description}`, conflict.activityIds, conflict.sourceIds);
        }
        else if (conflict.severity === "MEDIUM") {
            addFinding(findings, "DOCUMENTATION", "WARN", `Open project truth conflict: ${conflict.description}`, conflict.activityIds, conflict.sourceIds);
        }
    }
    for (const activity of Object.values(model.activities)) {
        const forecast = candidate.activityForecasts[activity.id];
        const blockedHard = activity.constraintIds
            .map((id) => model.constraints[id])
            .filter((c) => c && c.hard && c.state === "BLOCKED");
        if (blockedHard.length > 0) {
            addFinding(findings, "DOCUMENTATION", "BLOCK", `Activity has blocked hard constraints: ${blockedHard.map((c) => c.label).join(", ")}`, [activity.id]);
        }
        const unverifiedHard = activity.constraintIds
            .map((id) => model.constraints[id])
            .filter((c) => c && c.hard && c.state === "UNVERIFIED");
        if (unverifiedHard.length > 0 && forecast.critical) {
            addFinding(findings, "CRITICAL_PATH", "WARN", `Critical activity relies on unverified hard constraints: ${unverifiedHard.map((c) => c.label).join(", ")}`, [activity.id]);
        }
        const forecastedHard = activity.constraintIds
            .map((id) => model.constraints[id])
            .filter((c) => c && c.hard && c.state === "FORECASTED");
        if (forecastedHard.length > 0 && forecast.critical) {
            addFinding(findings, "CRITICAL_PATH", "WARN", `Critical activity relies on forecast-only hard constraints: ${forecastedHard.map((c) => c.label).join(", ")}. Forecasting may continue, but do not convert these dates into commitments.`, [activity.id]);
        }
        if (activity.scheduleLock?.finishDate) {
            const forecastStart = forecast.start.likely;
            const earliestLikelyFinish = (0, date_js_1.durationFinish)(forecastStart, activity.duration.likely, model.calendar);
            if (activity.scheduleLock.finishDate < earliestLikelyFinish) {
                addFinding(findings, "CALENDAR", "BLOCK", `PM-locked finish ${activity.scheduleLock.finishDate} is earlier than likely duration permits (${earliestLikelyFinish}).`, [activity.id], [activity.scheduleLock.sourceId]);
            }
        }
        if (activity.scheduleLock?.startDate) {
            let earliestFeasible = model.forecastAnchorDate;
            for (const cId of activity.constraintIds) {
                const c = model.constraints[cId];
                if (c?.hard && c.readiness)
                    earliestFeasible = earliestFeasible > c.readiness.likely ? earliestFeasible : c.readiness.likely;
            }
            for (const dep of graph.incoming[activity.id] ?? []) {
                if (!dep.hard)
                    continue;
                const pred = candidate.activityForecasts[dep.predecessorId];
                const required = dep.type === "FINISH_TO_START"
                    ? (0, date_js_1.addWorkdays)(pred.finish.likely, 1 + dep.lagWorkdays, model.calendar)
                    : (0, date_js_1.addWorkdays)(pred.start.likely, dep.lagWorkdays, model.calendar);
                if (required > earliestFeasible)
                    earliestFeasible = required;
            }
            if (activity.scheduleLock.startDate < earliestFeasible) {
                addFinding(findings, "CALENDAR", "BLOCK", `PM-locked start ${activity.scheduleLock.startDate} is earlier than hard-feasible start ${earliestFeasible}. Keep the lock visible, but do not publish it as feasible.`, [activity.id], [activity.scheduleLock.sourceId]);
            }
        }
        if (activity.actualStart) {
            let modeledEarliest = model.forecastAnchorDate;
            for (const cId of activity.constraintIds) {
                const c = model.constraints[cId];
                if (c?.hard && c.readiness && c.readiness.likely > modeledEarliest)
                    modeledEarliest = c.readiness.likely;
            }
            for (const dep of graph.incoming[activity.id] ?? []) {
                if (!dep.hard)
                    continue;
                const pred = candidate.activityForecasts[dep.predecessorId];
                const required = dep.type === "FINISH_TO_START"
                    ? (0, date_js_1.addWorkdays)(pred.finish.likely, 1 + dep.lagWorkdays, model.calendar)
                    : (0, date_js_1.addWorkdays)(pred.start.likely, dep.lagWorkdays, model.calendar);
                if (required > modeledEarliest)
                    modeledEarliest = required;
            }
            if (activity.actualStart < modeledEarliest) {
                addFinding(findings, "DEPENDENCY", "BLOCK", `Verified actual start ${activity.actualStart} precedes modeled hard-feasible start ${modeledEarliest}. Reconcile the dependency/partial-release model before learning from this outcome.`, [activity.id]);
            }
            const actualSources = (activity.actualStartSourceIds ?? []).map((id) => model.sources[id]).filter(Boolean);
            const hasActualEvidence = actualSources.some((s) => ["FIELD_REPORT", "PM_INPUT", "TRADE_CONFIRMATION", "INSPECTION", "ACTUAL_VERIFICATION"].includes(s.type));
            const actualVerificationAccepted = ["PM_CONFIRMED", "VERIFIED_ACTUAL"].includes(activity.actualStartVerification ?? "UNVERIFIED");
            if (!hasActualEvidence || !actualVerificationAccepted) {
                addFinding(findings, "LEARNING_SAFETY", "BLOCK", "Activity has an actual start without accepted independent evidence and verification. Calendar, unverified statements, or AI forecast must never self-confirm an actual.", [activity.id]);
            }
        }
        const completionEvidence = activity.actualFinishSourceIds ?? [];
        const aiOnly = completionEvidence.length > 0 && completionEvidence.every((id) => model.sources[id]?.type === "AI_FORECAST");
        if (aiOnly && activity.state === "COMPLETE") {
            addFinding(findings, "LEARNING_SAFETY", "BLOCK", "Completed activity is supported only by AI forecast evidence.", [activity.id]);
        }
        if (forecast.confidence.overall < 0.45 && forecast.impactStatus === "SHIFTED") {
            addFinding(findings, "EVIDENCE", "WARN", `Shifted forecast has low confidence (${Math.round(forecast.confidence.overall * 100)}%). Publish as a range/risk, not a precise commitment.`, [activity.id]);
        }
    }
    const criticalShifted = Object.values(candidate.activityForecasts).filter((f) => f.critical && f.impactStatus === "SHIFTED");
    if (criticalShifted.length > 0) {
        addFinding(findings, "CRITICAL_PATH", "WARN", `Critical-path movement detected in ${criticalShifted.length} activities. Recovery alternatives and trade remobilization exposure should be reviewed before publication.`, criticalShifted.map((f) => f.activityId));
    }
    else {
        addFinding(findings, "CRITICAL_PATH", "PASS", "No critical-path activity currently requires a published shift.", []);
    }
    return {
        id: `${candidate.id}-oversight`,
        projectId: model.projectId,
        candidateSnapshotId: candidate.id,
        createdAt,
        findings,
        decision: decisionFrom(findings),
    };
}

};
__modules["src/reducer.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyEventMutations = applyEventMutations;
function cloneActivity(activity) {
    return {
        ...activity,
        duration: { ...activity.duration, sourceIds: [...activity.duration.sourceIds] },
        constraintIds: [...activity.constraintIds],
        sourceIds: [...activity.sourceIds],
        ...(activity.actualStartSourceIds ? { actualStartSourceIds: [...activity.actualStartSourceIds] } : {}),
        ...(activity.actualStartVerification ? { actualStartVerification: activity.actualStartVerification } : {}),
        ...(activity.actualFinishSourceIds ? { actualFinishSourceIds: [...activity.actualFinishSourceIds] } : {}),
        ...(activity.actualFinishVerification ? { actualFinishVerification: activity.actualFinishVerification } : {}),
        ...(activity.scheduleLock ? { scheduleLock: { ...activity.scheduleLock } } : {}),
        ...(activity.tags ? { tags: [...activity.tags] } : {}),
    };
}
function cloneConstraint(constraint) {
    return {
        ...constraint,
        sourceIds: [...constraint.sourceIds],
        ...(constraint.readiness ? { readiness: { ...constraint.readiness } } : {}),
    };
}
function cloneDependency(dependency) {
    return { ...dependency, sourceIds: [...dependency.sourceIds] };
}
function cloneSource(source) { return { ...source }; }
function cloneConflict(conflict) { return { ...conflict, activityIds: [...conflict.activityIds], sourceIds: [...conflict.sourceIds] }; }
function cloneCommercialSignal(signal) { return { ...signal, activityIds: [...signal.activityIds], sourceIds: [...signal.sourceIds] }; }
function cloneWorkloadSignal(signal) { return { ...signal, activityIds: [...signal.activityIds], sourceIds: [...signal.sourceIds] }; }
function applyEventMutations(model, event) {
    const activities = Object.fromEntries(Object.entries(model.activities).map(([id, activity]) => [id, cloneActivity(activity)]));
    const constraints = Object.fromEntries(Object.entries(model.constraints).map(([id, constraint]) => [id, cloneConstraint(constraint)]));
    const dependencies = Object.fromEntries(Object.entries(model.dependencies).map(([id, dependency]) => [id, cloneDependency(dependency)]));
    const sources = Object.fromEntries(Object.entries(model.sources).map(([id, source]) => [id, cloneSource(source)]));
    const conflicts = Object.fromEntries(Object.entries(model.conflicts ?? {}).map(([id, conflict]) => [id, cloneConflict(conflict)]));
    const commercialSignals = Object.fromEntries(Object.entries(model.commercialSignals ?? {}).map(([id, signal]) => [id, cloneCommercialSignal(signal)]));
    const workloadSignals = Object.fromEntries(Object.entries(model.workloadSignals ?? {}).map(([id, signal]) => [id, cloneWorkloadSignal(signal)]));
    for (const mutation of event.mutations) {
        switch (mutation.op) {
            case "SET_ACTUAL_START": {
                const activity = activities[mutation.activityId];
                if (!activity)
                    throw new Error(`Unknown activity in SET_ACTUAL_START: ${mutation.activityId}`);
                activity.actualStart = mutation.date;
                activity.actualStartSourceIds = [...event.sourceIds];
                activity.actualStartVerification = event.verification;
                activity.state = activity.state === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS";
                break;
            }
            case "SET_ACTUAL_FINISH": {
                const activity = activities[mutation.activityId];
                if (!activity)
                    throw new Error(`Unknown activity in SET_ACTUAL_FINISH: ${mutation.activityId}`);
                activity.actualFinish = mutation.date;
                activity.actualFinishSourceIds = [...event.sourceIds];
                activity.actualFinishVerification = event.verification;
                activity.state = "COMPLETE";
                break;
            }
            case "SET_ACTIVITY_STATE": {
                const activity = activities[mutation.activityId];
                if (!activity)
                    throw new Error(`Unknown activity in SET_ACTIVITY_STATE: ${mutation.activityId}`);
                activity.state = mutation.state;
                break;
            }
            case "SET_DURATION": {
                const activity = activities[mutation.activityId];
                if (!activity)
                    throw new Error(`Unknown activity in SET_DURATION: ${mutation.activityId}`);
                activity.duration = { ...mutation.duration, sourceIds: [...mutation.duration.sourceIds] };
                break;
            }
            case "SET_CONSTRAINT_STATE": {
                const constraint = constraints[mutation.constraintId];
                if (!constraint)
                    throw new Error(`Unknown constraint in SET_CONSTRAINT_STATE: ${mutation.constraintId}`);
                constraint.state = mutation.state;
                if (mutation.verification)
                    constraint.verification = mutation.verification;
                break;
            }
            case "SET_CONSTRAINT_READINESS": {
                const constraint = constraints[mutation.constraintId];
                if (!constraint)
                    throw new Error(`Unknown constraint in SET_CONSTRAINT_READINESS: ${mutation.constraintId}`);
                constraint.readiness = { ...mutation.readiness };
                if (mutation.verification)
                    constraint.verification = mutation.verification;
                break;
            }
            case "SET_SCHEDULE_LOCK": {
                const activity = activities[mutation.activityId];
                if (!activity)
                    throw new Error(`Unknown activity in SET_SCHEDULE_LOCK: ${mutation.activityId}`);
                activity.scheduleLock = { ...mutation.lock };
                break;
            }
            case "CLEAR_SCHEDULE_LOCK": {
                const activity = activities[mutation.activityId];
                if (!activity)
                    throw new Error(`Unknown activity in CLEAR_SCHEDULE_LOCK: ${mutation.activityId}`);
                delete activity.scheduleLock;
                break;
            }
            case "UPSERT_SOURCE":
                sources[mutation.source.id] = cloneSource(mutation.source);
                break;
            case "UPSERT_CONFLICT":
                conflicts[mutation.conflict.id] = cloneConflict(mutation.conflict);
                break;
            case "RESOLVE_CONFLICT": {
                const conflict = conflicts[mutation.conflictId];
                if (!conflict)
                    throw new Error(`Unknown conflict in RESOLVE_CONFLICT: ${mutation.conflictId}`);
                conflict.status = "RESOLVED";
                conflict.resolutionNote = mutation.resolutionNote;
                break;
            }
            case "UPSERT_COMMERCIAL_SIGNAL":
                commercialSignals[mutation.signal.id] = cloneCommercialSignal(mutation.signal);
                break;
            case "UPSERT_WORKLOAD_SIGNAL":
                workloadSignals[mutation.signal.id] = cloneWorkloadSignal(mutation.signal);
                break;
            case "UPSERT_ACTIVITY":
                activities[mutation.activity.id] = cloneActivity(mutation.activity);
                break;
            case "UPSERT_CONSTRAINT": {
                constraints[mutation.constraint.id] = cloneConstraint(mutation.constraint);
                const owner = activities[mutation.constraint.activityId];
                if (!owner)
                    throw new Error(`UPSERT_CONSTRAINT references unknown activity ${mutation.constraint.activityId}`);
                if (!owner.constraintIds.includes(mutation.constraint.id))
                    owner.constraintIds.push(mutation.constraint.id);
                break;
            }
            case "UPSERT_DEPENDENCY":
                dependencies[mutation.dependency.id] = cloneDependency(mutation.dependency);
                break;
            case "DEACTIVATE_DEPENDENCY": {
                const dependency = dependencies[mutation.dependencyId];
                if (!dependency)
                    throw new Error(`Unknown dependency in DEACTIVATE_DEPENDENCY: ${mutation.dependencyId}`);
                dependency.active = false;
                break;
            }
            default: {
                const exhaustive = mutation;
                throw new Error(`Unhandled mutation ${exhaustive.op ?? "unknown"}`);
            }
        }
    }
    return { ...model, activities, constraints, dependencies, sources, conflicts, commercialSignals, workloadSignals };
}

};
__modules["src/solver.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateForecast = generateForecast;
const date_js_1 = require("./date.js");
const graph_js_1 = require("./graph.js");
const confidence_js_1 = require("./confidence.js");
function scenarioDuration(activity, scenario) {
    return activity.duration[scenario];
}
function constraintReadinessFor(model, activityId, scenario) {
    let result;
    for (const constraint of Object.values(model.constraints)) {
        if (constraint.activityId !== activityId || !constraint.hard)
            continue;
        if (!constraint.readiness)
            continue;
        const date = constraint.readiness[scenario];
        result = result ? (0, date_js_1.maxDate)(result, date) : date;
    }
    return result;
}
function solveScenario(model, scenario) {
    const graph = (0, graph_js_1.buildGraphIndex)(model);
    const start = {};
    const finish = {};
    for (const id of graph.topologicalOrder) {
        const activity = model.activities[id];
        const duration = scenarioDuration(activity, scenario);
        let candidateStart = model.forecastAnchorDate;
        const constraintDate = constraintReadinessFor(model, id, scenario);
        if (constraintDate)
            candidateStart = (0, date_js_1.maxDate)(candidateStart, constraintDate);
        for (const dep of graph.incoming[id] ?? []) {
            if (!dep.hard)
                continue;
            const predStart = start[dep.predecessorId];
            const predFinish = finish[dep.predecessorId];
            if (!predStart || !predFinish)
                throw new Error(`Predecessor ${dep.predecessorId} was not solved before ${id}`);
            const dependencyDate = dep.type === "FINISH_TO_START"
                ? (0, date_js_1.addWorkdays)(predFinish, 1 + dep.lagWorkdays, model.calendar)
                : (0, date_js_1.addWorkdays)(predStart, dep.lagWorkdays, model.calendar);
            candidateStart = (0, date_js_1.maxDate)(candidateStart, dependencyDate);
        }
        if (activity.actualStart) {
            if (activity.actualStart < candidateStart) {
                // Actual history is evidence, not something the solver is allowed to move. Keep it and let oversight surface the model conflict.
                candidateStart = activity.actualStart;
            }
            else {
                candidateStart = activity.actualStart;
            }
        }
        else if (activity.scheduleLock?.startDate) {
            // Locks are held exactly. Oversight will block publication if the lock violates hard feasibility.
            candidateStart = activity.scheduleLock.startDate;
        }
        start[id] = candidateStart;
        finish[id] = activity.actualFinish ?? activity.scheduleLock?.finishDate ?? (0, date_js_1.durationFinish)(candidateStart, duration, model.calendar);
    }
    return { start, finish };
}
function solveLikelyCpm(model, likely) {
    const graph = (0, graph_js_1.buildGraphIndex)(model);
    const earliestStart = { ...likely.start };
    let projectFinish = model.forecastAnchorDate;
    for (const id of graph.topologicalOrder)
        projectFinish = (0, date_js_1.maxDate)(projectFinish, likely.finish[id]);
    const effectiveDuration = {};
    for (const id of graph.topologicalOrder) {
        effectiveDuration[id] = Math.max(1, (0, date_js_1.workdaysBetween)(likely.start[id], likely.finish[id], model.calendar) + 1);
    }
    const latestStart = {};
    for (const id of graph.topologicalOrder) {
        latestStart[id] = (0, date_js_1.addWorkdays)(projectFinish, -(effectiveDuration[id] - 1), model.calendar);
    }
    for (const id of [...graph.topologicalOrder].reverse()) {
        const activity = model.activities[id];
        let current = latestStart[id];
        for (const dep of graph.outgoing[id] ?? []) {
            if (!dep.hard)
                continue;
            const successorLatest = latestStart[dep.successorId];
            const maxPredStart = dep.type === "FINISH_TO_START"
                ? (0, date_js_1.addWorkdays)(successorLatest, -(effectiveDuration[id] + dep.lagWorkdays), model.calendar)
                : (0, date_js_1.addWorkdays)(successorLatest, -dep.lagWorkdays, model.calendar);
            current = (0, date_js_1.minDate)(current, maxPredStart);
        }
        latestStart[id] = current;
    }
    const float = {};
    for (const id of graph.topologicalOrder) {
        float[id] = Math.max(0, (0, date_js_1.workdaysBetween)(earliestStart[id], latestStart[id], model.calendar));
    }
    return { earliestStart, latestStart, float, projectFinish };
}
function compareImpact(activityId, start, finish, likelyFloatWorkdays, baseline) {
    const prior = baseline?.activityForecasts[activityId];
    if (!prior)
        return "UNCHANGED";
    if (prior.impactStatus === "LOCKED")
        return "LOCKED";
    const shifted = prior.start.likely !== start.likely || prior.finish.likely !== finish.likely;
    if (shifted)
        return "SHIFTED";
    if (likelyFloatWorkdays < prior.likelyFloatWorkdays || likelyFloatWorkdays <= 1)
        return "AT_RISK";
    return "UNCHANGED";
}
function driverSummary(model, activityId) {
    const graph = (0, graph_js_1.buildGraphIndex)(model);
    const drivers = [];
    for (const dep of graph.incoming[activityId] ?? []) {
        drivers.push(`${dep.hard ? "Hard" : "Soft"} ${dep.type}: ${model.activities[dep.predecessorId]?.name ?? dep.predecessorId}`);
    }
    for (const constraintId of model.activities[activityId].constraintIds) {
        const c = model.constraints[constraintId];
        if (c)
            drivers.push(`${c.type}: ${c.label} [${c.state}]`);
    }
    if (model.activities[activityId].scheduleLock)
        drivers.push("PM schedule lock");
    if (model.activities[activityId].actualStart)
        drivers.push("Verified actual start");
    return drivers;
}
function forecastWarnings(model, activityId) {
    const activity = model.activities[activityId];
    const warnings = [];
    for (const constraintId of activity.constraintIds) {
        const c = model.constraints[constraintId];
        if (!c) continue;
        if (c.state === "BLOCKED")
            warnings.push(`Blocked ${c.type.toLowerCase()} constraint: ${c.label}`);
        else if (c.state === "UNVERIFIED" && c.hard)
            warnings.push(`Unverified hard ${c.type.toLowerCase()} constraint: ${c.label}`);
        else if (c.state === "FORECASTED" && c.hard)
            warnings.push(`Forecast-only hard ${c.type.toLowerCase()} constraint: ${c.label}`);
    }
    return warnings;
}
function activityTruthState(activity) {
    if (activity.actualFinish || activity.state === "COMPLETE") return "SATISFIED";
    if (activity.actualStart || activity.state === "IN_PROGRESS") return "SATISFIED";
    if (activity.scheduleLock) return "COMMITTED";
    return "FORECASTED";
}
function evidenceFor(model, activity) {
    const sourceIds = new Set([...activity.sourceIds, ...activity.duration.sourceIds]);
    for (const constraintId of activity.constraintIds) {
        const c = model.constraints[constraintId];
        for (const sourceId of c?.sourceIds ?? []) sourceIds.add(sourceId);
    }
    for (const dep of Object.values(model.dependencies)) {
        if (!dep.active || (dep.predecessorId !== activity.id && dep.successorId !== activity.id)) continue;
        for (const sourceId of dep.sourceIds) sourceIds.add(sourceId);
    }
    return { sourceIds: [...sourceIds], eventIds: model.eventLedger.filter((e) => e.impactSeedActivityIds.includes(activity.id)).map((e) => e.id) };
}
function requiredByFor(model, activity, likelyStart, likelyScenario) {
    const graph = (0, graph_js_1.buildGraphIndex)(model);
    const items = [];
    for (const constraintId of activity.constraintIds) {
        const c = model.constraints[constraintId];
        if (!c || !c.hard || c.state === "SATISFIED") continue;
        const leadWorkdays = c.type === "TRADE_AVAILABILITY" ? 2 : c.type === "INFORMATION" || c.type === "INSPECTION" ? 1 : 0;
        const requiredBy = leadWorkdays > 0 ? (0, date_js_1.addWorkdays)(likelyStart, -leadWorkdays, model.calendar) : likelyStart;
        items.push({
            kind: "CONSTRAINT",
            id: c.id,
            label: c.label,
            constraintType: c.type,
            truthState: c.state,
            requiredBy,
            action: c.state === "COMMITTED" ? `Verify ${c.label} is actually satisfied by ${requiredBy}` : `Resolve/confirm ${c.label} by ${requiredBy}`,
        });
    }
    for (const dep of graph.incoming[activity.id] ?? []) {
        if (!dep.hard) continue;
        const requiredBy = dep.type === "FINISH_TO_START"
            ? (0, date_js_1.addWorkdays)(likelyStart, -(1 + dep.lagWorkdays), model.calendar)
            : (0, date_js_1.addWorkdays)(likelyStart, -dep.lagWorkdays, model.calendar);
        const predecessor = model.activities[dep.predecessorId];
        if (predecessor?.actualFinish || predecessor?.state === "COMPLETE") continue;
        items.push({
            kind: dep.type === "FINISH_TO_START" ? "PREDECESSOR_FINISH" : "PREDECESSOR_START",
            id: dep.id,
            activityId: dep.predecessorId,
            label: predecessor?.name ?? dep.predecessorId,
            truthState: activityTruthState(predecessor),
            requiredBy,
            action: `${predecessor?.name ?? dep.predecessorId} must ${dep.type === "FINISH_TO_START" ? "finish" : "start"} by ${requiredBy} to protect ${activity.name}`,
        });
    }
    return items.sort((a, b) => a.requiredBy.localeCompare(b.requiredBy));
}
function buildPmActions(model, activityForecasts) {
    const actions = [];
    const seen = new Set();
    for (const forecast of Object.values(activityForecasts)) {
        if (!forecast.critical && forecast.likelyFloatWorkdays > 2) continue;
        for (const req of forecast.requiredBy ?? []) {
            if (req.truthState === "SATISFIED" || req.kind !== "CONSTRAINT") continue;
            const key = `${forecast.activityId}:${req.kind}:${req.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const dueStatus = req.requiredBy < model.forecastAnchorDate ? "OVERDUE" : req.requiredBy === model.forecastAnchorDate ? "DUE_NOW" : "UPCOMING";
            actions.push({
                activityId: forecast.activityId,
                priority: forecast.critical ? "CRITICAL" : "WATCH",
                requiredBy: req.requiredBy,
                dueStatus,
                truthState: req.truthState,
                action: req.action,
            });
        }
    }
    return actions.sort((a, b) => a.requiredBy.localeCompare(b.requiredBy) || (a.priority === "CRITICAL" ? -1 : 1)).slice(0, 15);
}
function generateForecast(model, generatedAt, version, baseline, impactedActivityIds) {
    const optimistic = solveScenario(model, "optimistic");
    const likely = solveScenario(model, "likely");
    const conservative = solveScenario(model, "conservative");
    const cpm = solveLikelyCpm(model, likely);
    const activityForecasts = {};
    let completionOptimistic = model.forecastAnchorDate;
    let completionLikely = model.forecastAnchorDate;
    let completionConservative = model.forecastAnchorDate;
    for (const activity of Object.values(model.activities)) {
        const start = {
            optimistic: optimistic.start[activity.id],
            likely: likely.start[activity.id],
            conservative: conservative.start[activity.id],
        };
        const finish = {
            optimistic: optimistic.finish[activity.id],
            likely: likely.finish[activity.id],
            conservative: conservative.finish[activity.id],
        };
        completionOptimistic = (0, date_js_1.maxDate)(completionOptimistic, finish.optimistic);
        completionLikely = (0, date_js_1.maxDate)(completionLikely, finish.likely);
        completionConservative = (0, date_js_1.maxDate)(completionConservative, finish.conservative);
        const inImpactCone = !impactedActivityIds || impactedActivityIds.has(activity.id);
        const impactStatus = inImpactCone
            ? compareImpact(activity.id, start, finish, cpm.float[activity.id] ?? 0, baseline)
            : "UNCHANGED";
        activityForecasts[activity.id] = {
            activityId: activity.id,
            activityName: activity.name,
            phase: activity.phase,
            activityState: activity.state,
            truthState: activityTruthState(activity),
            start,
            finish,
            likelyFloatWorkdays: cpm.float[activity.id] ?? 0,
            critical: (cpm.float[activity.id] ?? 0) === 0,
            impactStatus: activity.scheduleLock ? (impactStatus === "SHIFTED" ? "LOCKED" : impactStatus) : impactStatus,
            confidence: (0, confidence_js_1.computeConfidence)(model, activity, generatedAt),
            evidence: evidenceFor(model, activity),
            requiredBy: requiredByFor(model, activity, start.likely, likely),
            drivers: driverSummary(model, activity.id),
            warnings: forecastWarnings(model, activity.id),
        };
    }
    return {
        id: `${model.projectId}-forecast-v${version}`,
        modelRevision: model.revision,
        projectId: model.projectId,
        version,
        status: "WORKING",
        generatedAt,
        basedOnEventIds: model.eventLedger.map((e) => e.id),
        basedOnSourceIds: Object.keys(model.sources),
        evidenceRevision: model.revision,
        activityForecasts,
        pmActions: buildPmActions(model, activityForecasts),
        completion: {
            optimistic: completionOptimistic,
            likely: completionLikely,
            conservative: completionConservative,
        },
        ...(baseline ? { deltaFromSnapshotId: baseline.id } : {}),
    };
}

};
__modules["src/storage.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevisionConflictError = void 0;
class RevisionConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = "RevisionConflictError";
    }
}
exports.RevisionConflictError = RevisionConflictError;

};
__modules["src/types.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

};
__modules["src/validation.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProjectModel = validateProjectModel;
const date_js_1 = require("./date.js");
const graph_js_1 = require("./graph.js");
function assertUnitInterval(value, label) {
    if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new Error(`${label} must be between 0 and 1`);
}
function validateProjectModel(model) {
    if (!model.projectId)
        throw new Error("projectId is required");
    if (!Number.isInteger(model.revision) || model.revision < 0)
        throw new Error("project revision must be an integer >= 0");
    if (!model.name)
        throw new Error("project name is required");
    (0, date_js_1.assertISODate)(model.forecastAnchorDate);
    if (model.calendar.workingWeekdays.length === 0)
        throw new Error("Work calendar must contain at least one working weekday");
    if (new Set(model.calendar.workingWeekdays).size !== model.calendar.workingWeekdays.length || model.calendar.workingWeekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new Error("Work calendar weekdays must be unique integers from 0 through 6");
    }
    for (const holiday of model.calendar.holidays)
        (0, date_js_1.assertISODate)(holiday);
    for (const source of Object.values(model.sources)) {
        assertUnitInterval(source.authority, `source ${source.id} authority`);
        assertUnitInterval(source.reliability, `source ${source.id} reliability`);
        if (source.supersededBySourceId && !model.sources[source.supersededBySourceId]) {
            throw new Error(`Source ${source.id} references unknown superseding source ${source.supersededBySourceId}`);
        }
    }
    for (const activity of Object.values(model.activities)) {
        const d = activity.duration;
        for (const [label, value] of Object.entries(d)) {
            if (label === "sourceIds")
                continue;
            if (!Number.isInteger(value) || value < 1) {
                throw new Error(`Activity ${activity.id} duration ${label} must be an integer >= 1`);
            }
        }
        if (!(d.optimistic <= d.likely && d.likely <= d.conservative)) {
            throw new Error(`Activity ${activity.id} duration estimates must satisfy optimistic <= likely <= conservative`);
        }
        for (const constraintId of activity.constraintIds) {
            const c = model.constraints[constraintId];
            if (!c)
                throw new Error(`Activity ${activity.id} references unknown constraint ${constraintId}`);
            if (c.activityId !== activity.id)
                throw new Error(`Constraint ${constraintId} is attached to the wrong activity`);
        }
        for (const sourceId of [...activity.sourceIds, ...activity.duration.sourceIds]) {
            if (!model.sources[sourceId])
                throw new Error(`Activity ${activity.id} references unknown source ${sourceId}`);
        }
        if (activity.actualStart)
            (0, date_js_1.assertISODate)(activity.actualStart);
        if (activity.actualFinish)
            (0, date_js_1.assertISODate)(activity.actualFinish);
        for (const sourceId of activity.actualStartSourceIds ?? []) {
            if (!model.sources[sourceId])
                throw new Error(`Activity ${activity.id} actualStart references unknown source ${sourceId}`);
        }
        for (const sourceId of activity.actualFinishSourceIds ?? []) {
            if (!model.sources[sourceId])
                throw new Error(`Activity ${activity.id} actualFinish references unknown source ${sourceId}`);
        }
        if (activity.actualStart && !activity.actualStartVerification)
            throw new Error(`Activity ${activity.id} actualStart is missing verification status`);
        if (activity.actualFinish && !activity.actualFinishVerification)
            throw new Error(`Activity ${activity.id} actualFinish is missing verification status`);
        if (activity.actualFinish && !activity.actualStart)
            throw new Error(`Activity ${activity.id} has actualFinish without actualStart`);
        if (activity.actualStart && activity.actualFinish && activity.actualFinish < activity.actualStart) {
            throw new Error(`Activity ${activity.id} actualFinish is before actualStart`);
        }
        if (activity.scheduleLock?.startDate)
            (0, date_js_1.assertISODate)(activity.scheduleLock.startDate);
        if (activity.scheduleLock?.finishDate)
            (0, date_js_1.assertISODate)(activity.scheduleLock.finishDate);
        if (activity.scheduleLock?.startDate && activity.scheduleLock.finishDate && activity.scheduleLock.finishDate < activity.scheduleLock.startDate) {
            throw new Error(`Activity ${activity.id} schedule lock finish precedes start`);
        }
        if (activity.scheduleLock && !model.sources[activity.scheduleLock.sourceId]) {
            throw new Error(`Activity ${activity.id} schedule lock references unknown source ${activity.scheduleLock.sourceId}`);
        }
    }
    for (const constraint of Object.values(model.constraints)) {
        if (!model.activities[constraint.activityId])
            throw new Error(`Constraint ${constraint.id} references unknown activity`);
        for (const sourceId of constraint.sourceIds) {
            if (!model.sources[sourceId])
                throw new Error(`Constraint ${constraint.id} references unknown source ${sourceId}`);
        }
        if (constraint.readiness) {
            (0, date_js_1.assertISODate)(constraint.readiness.optimistic);
            (0, date_js_1.assertISODate)(constraint.readiness.likely);
            (0, date_js_1.assertISODate)(constraint.readiness.conservative);
            if (!(constraint.readiness.optimistic <= constraint.readiness.likely && constraint.readiness.likely <= constraint.readiness.conservative)) {
                throw new Error(`Constraint ${constraint.id} readiness window is out of order`);
            }
        }
    }
    for (const dependency of Object.values(model.dependencies)) {
        for (const sourceId of dependency.sourceIds) {
            if (!model.sources[sourceId])
                throw new Error(`Dependency ${dependency.id} references unknown source ${sourceId}`);
        }
    }
    if (model.revision !== model.eventLedger.length) {
        throw new Error(`Project revision ${model.revision} does not match immutable event ledger length ${model.eventLedger.length}`);
    }
    const eventIds = new Set();
    for (const conflict of Object.values(model.conflicts ?? {})) {
        for (const activityId of conflict.activityIds)
            if (!model.activities[activityId])
                throw new Error(`Conflict ${conflict.id} references unknown activity ${activityId}`);
        for (const sourceId of conflict.sourceIds)
            if (!model.sources[sourceId])
                throw new Error(`Conflict ${conflict.id} references unknown source ${sourceId}`);
    }
    for (const signal of Object.values(model.commercialSignals ?? {})) {
        if (!Number.isFinite(signal.amount) || signal.amount < 0)
            throw new Error(`Commercial signal ${signal.id} has invalid amount`);
        for (const activityId of signal.activityIds)
            if (!model.activities[activityId])
                throw new Error(`Commercial signal ${signal.id} references unknown activity ${activityId}`);
        for (const sourceId of signal.sourceIds)
            if (!model.sources[sourceId])
                throw new Error(`Commercial signal ${signal.id} references unknown source ${sourceId}`);
    }
    for (const signal of Object.values(model.workloadSignals ?? {})) {
        if (!Number.isFinite(signal.value) || signal.value < 0)
            throw new Error(`Workload signal ${signal.id} has invalid value`);
        for (const activityId of signal.activityIds)
            if (!model.activities[activityId])
                throw new Error(`Workload signal ${signal.id} references unknown activity ${activityId}`);
        for (const sourceId of signal.sourceIds)
            if (!model.sources[sourceId])
                throw new Error(`Workload signal ${signal.id} references unknown source ${sourceId}`);
    }
    for (const [eventIndex, event] of model.eventLedger.entries()) {
        if (eventIds.has(event.id))
            throw new Error(`Duplicate event ID in ledger: ${event.id}`);
        eventIds.add(event.id);
        if (!Number.isFinite(Date.parse(event.occurredAt)) || !Number.isFinite(Date.parse(event.receivedAt)))
            throw new Error(`Event ${event.id} has invalid timestamps`);
        if (event.projectId !== model.projectId)
            throw new Error(`Event ${event.id} belongs to a different project`);
        if (!Number.isInteger(event.baseRevision) || event.baseRevision < 0)
            throw new Error(`Event ${event.id} has invalid baseRevision`);
        if (event.baseRevision !== eventIndex)
            throw new Error(`Event ${event.id} baseRevision ${event.baseRevision} does not match ledger position ${eventIndex}`);
        for (const sourceId of event.sourceIds) {
            if (!model.sources[sourceId])
                throw new Error(`Event ${event.id} references unknown source ${sourceId}`);
        }
        for (const activityId of event.impactSeedActivityIds) {
            if (!model.activities[activityId])
                throw new Error(`Event ${event.id} references unknown impact seed ${activityId}`);
        }
    }
    (0, graph_js_1.buildGraphIndex)(model);
}

};
__modules["src/worker/admin.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminHtml = adminHtml;
exports.adminPage = adminPage;
function adminHtml(version) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler Staging Control</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: max(18px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom)); background: #111318; color: #f4f6f8; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .sub { color: #b8c0cc; margin: 0 0 20px; line-height: 1.45; }
    .notice { border: 1px solid #805f00; background: #2d250d; padding: 13px; border-radius: 12px; margin-bottom: 18px; line-height: 1.4; }
    .card { background: #1b1f27; border: 1px solid #303744; border-radius: 14px; padding: 16px; margin: 14px 0; }
    label { display: block; font-weight: 700; margin-bottom: 8px; }
    input { box-sizing: border-box; width: 100%; font-size: 17px; padding: 12px; border-radius: 10px; border: 1px solid #4b5565; background: #0f1217; color: #fff; }
    .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    button { min-height: 48px; border: 0; border-radius: 10px; padding: 11px 12px; font-size: 16px; font-weight: 700; background: #315efb; color: #fff; }
    button.secondary { background: #3a4250; }
    button.danger { background: #8f2c2c; }
    button:disabled { opacity: 0.55; }
    .status { font-size: 14px; color: #b8c0cc; margin-top: 10px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; min-height: 160px; max-height: 55vh; overflow: auto; background: #090b0e; border: 1px solid #303744; border-radius: 12px; padding: 14px; font-size: 13px; line-height: 1.45; }
    @media (max-width: 520px) { .buttons { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>Howler Staging Control</h1>
  <p class="sub">Scheduling Intelligence v${version}. This page controls only the staging Worker.</p>
  <div class="notice"><strong>Shadow mode safety:</strong> forecast publishing remains disabled. This screen cannot change the live calendar, live dashboard, or the live jarvis-voice Worker.</div>

  <section class="card">
    <label for="key">HOWLER_ADMIN_KEY</label>
    <input id="key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste the staging admin key">
    <div class="status">The key stays in this browser tab only and is never placed in the URL.</div>
  </section>

  <section class="card">
    <div class="buttons">
      <button id="health">Check Setup</button>
      <button id="initDb" class="danger">Initialize Database</button>
      <button id="seed" class="danger">Seed DeBoard v0.9</button>
      <button id="forecast" class="secondary">View v0.9 Forecast</button>
      <button id="forecastHealth" class="secondary">v0.9 Forecast Health</button>
      <button id="events" class="secondary">View v0.9 Evidence Events</button>
      <button id="baseline" class="secondary">View v0.8 Baseline</button>
      <button id="copy" class="secondary">Copy Result</button>
    </div>
  </section>

  <pre id="output">Tap Check Setup.</pre>
</main>
<script>
(() => {
  const keyInput = document.getElementById('key');
  const output = document.getElementById('output');
  const buttons = Array.from(document.querySelectorAll('button'));
  const saved = sessionStorage.getItem('howler_admin_key');
  if (saved) keyInput.value = saved;

  function show(value) {
    output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  async function api(path, options = {}, needsKey = true) {
    const key = keyInput.value.trim();
    if (needsKey && !key) {
      show('Paste HOWLER_ADMIN_KEY first.');
      return;
    }
    if (key) sessionStorage.setItem('howler_admin_key', key);
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (needsKey) headers.set('Authorization', 'Bearer ' + key);
    if (options.body) headers.set('Content-Type', 'application/json');
    buttons.forEach((button) => button.disabled = true);
    show('Working...');
    try {
      const response = await fetch(path, { ...options, headers });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      show({ httpStatus: response.status, ok: response.ok, response: body });
    } catch (error) {
      show({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      buttons.forEach((button) => button.disabled = false);
    }
  }

  document.getElementById('health').addEventListener('click', () => api('/health', {}, false));
  document.getElementById('initDb').addEventListener('click', () => {
    if (!confirm('Initialize/repair the Howler staging database schema? Existing data will not be deleted.')) return;
    api('/v1/admin/init-db', { method: 'POST' });
  });
  document.getElementById('seed').addEventListener('click', () => {
    if (!confirm('Seed the DeBoard v0.9 evidence/truth-layer model? The v0.8 baseline will remain untouched.')) return;
    api('/v1/projects/deboard-v09/seed', { method: 'POST' });
  });
  document.getElementById('forecast').addEventListener('click', () => api('/v1/projects/deboard-v09/forecast'));
  document.getElementById('forecastHealth').addEventListener('click', () => api('/v1/projects/deboard-v09/forecast/health'));
  document.getElementById('events').addEventListener('click', () => api('/v1/projects/deboard-v09/events?limit=100'));
  document.getElementById('baseline').addEventListener('click', () => api('/v1/projects/deboard/forecast'));
  document.getElementById('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.textContent || ''); show('Result copied.'); }
    catch { show('Copy was blocked by the browser. Touch and hold the result to copy it.'); }
  });

  api('/health', {}, false);
})();
</script>
</body>
</html>`;
}
function adminPage(version) {
    return new Response(adminHtml(version), {
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
        },
    });
}

};
__modules["src/worker/deboard-seed.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeboardSeed = createDeboardSeed;
const dt = "2026-08-26T18:00:00-04:00";
const w = (optimistic, likely, conservative) => ({ optimistic, likely, conservative });
function createDeboardSeed() {
    const projectId = "deboard-v09";
    const sources = {
        "src-plans": { id: "src-plans", type: "PLAN", label: "DeBoard Tradewalk Plans - June 12, 2025", observedAt: dt, authority: 0.9, reliability: 0.85 },
        "src-scope": { id: "src-scope", type: "SCOPE", label: "Scope of Work and Rules - includes Footer -> Block -> Framing dry-in -> slab sequence", observedAt: dt, authority: 0.95, reliability: 0.9 },
        "src-engineering": { id: "src-engineering", type: "ENGINEERING", label: "DeBoard LVL calculations - Aug 17, 2026", observedAt: dt, authority: 0.98, reliability: 0.95 },
        "src-budget": { id: "src-budget", type: "BUDGET", label: "DeBoard Trade Budget & Estimate Tracker", observedAt: dt, authority: 0.85, reliability: 0.8 },
        "src-dashboard": { id: "src-dashboard", type: "PM_INPUT", label: "KF Live PM Intelligence Dashboard - DeBoard current status", observedAt: dt, authority: 0.9, reliability: 0.9 },
        "src-building-package": { id: "src-building-package", type: "CALENDAR", label: "Walls/subfloor building package committed for Aug 28; receipt still requires field verification", observedAt: dt, effectiveDate: "2026-08-28", authority: 0.9, reliability: 0.9 },
        "src-roof-action": { id: "src-roof-action", type: "CALENDAR", label: "Roof package vendor analysis / Tony - Aug 26", observedAt: dt, effectiveDate: "2026-08-26", authority: 0.8, reliability: 0.85 },
        "src-masonry-calendar": { id: "src-masonry-calendar", type: "CALENDAR", label: "Prior masonry target Aug 24; no independent field start verification attached", observedAt: dt, effectiveDate: "2026-08-24", authority: 0.65, reliability: 0.65 },
        "src-hvac": { id: "src-hvac", type: "ESTIMATE", label: "Revised multi-zone mini-split - $7,366", observedAt: dt, authority: 0.9, reliability: 0.9 },
        "src-plumbing": { id: "src-plumbing", type: "ESTIMATE", label: "Medyna Plumbing selected/comparable estimate - $7,800", observedAt: dt, authority: 0.85, reliability: 0.85 },
        "src-trades": { id: "src-trades", type: "PM_INPUT", label: "Current trade assignments: Elizabeth masonry; Jason Bonham electrical; Medina plumbing; Anthony Parker HVAC; Dylan Jasper paint", observedAt: dt, authority: 0.9, reliability: 0.85 },
        "src-brick-risk": { id: "src-brick-risk", type: "PM_INPUT", label: "Brick veneer matching discrepancy / Lee Block match task not verified; quote requires refresh", observedAt: dt, authority: 0.92, reliability: 0.9 },
        "src-material-quotes": { id: "src-material-quotes", type: "MATERIAL_ORDER", label: "Builders Choice / Lee material quotes and documented package contents; some quotes expired and require refresh", observedAt: dt, authority: 0.85, reliability: 0.78 },
    };
    const activities = {
        masonry: { id: "masonry", name: "CMU foundation walls", phase: "Foundation", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-masonry-calendar"] }, constraintIds: ["masonry-material", "masonry-trade"], sourceIds: ["src-plans", "src-scope", "src-dashboard"] },
        structural_release: { id: "structural_release", name: "CMU structural release / anchors / elevations", phase: "Foundation", state: "NOT_STARTED", duration: { optimistic: 1, likely: 1, conservative: 2, sourceIds: ["src-plans", "src-scope", "src-engineering"] }, constraintIds: ["structural-release-verify"], sourceIds: ["src-plans", "src-scope", "src-engineering"] },
        structural_reconcile: { id: "structural_reconcile", name: "Plan / LVL engineering reconciliation", phase: "Framing Readiness", state: "NOT_STARTED", duration: { optimistic: 1, likely: 1, conservative: 2, sourceIds: ["src-plans", "src-engineering"] }, constraintIds: ["engineering-reconcile"], sourceIds: ["src-plans", "src-engineering", "src-dashboard"] },
        building_delivery: { id: "building_delivery", name: "Walls and subfloor package delivery", phase: "Procurement", state: "NOT_STARTED", duration: { optimistic: 1, likely: 1, conservative: 1, sourceIds: ["src-building-package"] }, constraintIds: ["building-delivery-ready"], sourceIds: ["src-building-package", "src-dashboard"] },
        framing: { id: "framing", name: "Structural framing + second-floor/loft system", phase: "Framing", state: "NOT_STARTED", duration: { optimistic: 7, likely: 9, conservative: 12, sourceIds: ["src-plans", "src-scope", "src-budget"] }, constraintIds: ["framer-availability", "framing-material"], sourceIds: ["src-plans", "src-scope", "src-engineering", "src-budget"] },
        roof_procurement: { id: "roof_procurement", name: "Roof package selection / refresh / release", phase: "Procurement", state: "NOT_STARTED", duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: ["src-roof-action", "src-material-quotes"] }, constraintIds: ["roof-vendor"], sourceIds: ["src-roof-action", "src-material-quotes"] },
        roofing: { id: "roofing", name: "Roof underlayment / shingles / flashings", phase: "Envelope", state: "NOT_STARTED", duration: { optimistic: 3, likely: 4, conservative: 6, sourceIds: ["src-scope", "src-material-quotes"] }, constraintIds: ["roof-material"], sourceIds: ["src-scope", "src-material-quotes"] },
        opening_protection: { id: "opening_protection", name: "Weather protection at windows / service door / garage openings", phase: "Envelope", state: "NOT_STARTED", duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: ["src-scope"] }, constraintIds: ["opening-protection-material"], sourceIds: ["src-scope", "src-material-quotes"] },
        dry_in_release: { id: "dry_in_release", name: "Weather dry-in release", phase: "Envelope", state: "NOT_STARTED", duration: { optimistic: 1, likely: 1, conservative: 2, sourceIds: ["src-scope"] }, constraintIds: [], sourceIds: ["src-scope"] },
        windows_ext_doors: { id: "windows_ext_doors", name: "Windows and exterior service door install", phase: "Envelope", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-material-quotes"] }, constraintIds: ["windows-doors-material"], sourceIds: ["src-scope", "src-material-quotes"] },
        brick_veneer: { id: "brick_veneer", name: "Brick veneer / soldier courses / quoins", phase: "Exterior", state: "NOT_STARTED", duration: { optimistic: 5, likely: 7, conservative: 10, sourceIds: ["src-scope", "src-brick-risk"] }, constraintIds: ["brick-match", "brick-material"], sourceIds: ["src-scope", "src-brick-risk", "src-material-quotes"] },
        underslab_mep: { id: "underslab_mep", name: "Under-slab plumbing/electrical routing", phase: "MEP", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-plumbing"] }, constraintIds: ["mep-routing"], sourceIds: ["src-scope", "src-plumbing"] },
        slab_prep: { id: "slab_prep", name: "Slab stone / vapor / reinforcement / concealed inspection", phase: "Concrete", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-budget"] }, constraintIds: ["slab-inspection"], sourceIds: ["src-scope", "src-budget"] },
        slab: { id: "slab", name: "Garage and mower-storage slab pour / finish / cure release", phase: "Concrete", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-budget"] }, constraintIds: ["concrete-trade"], sourceIds: ["src-scope", "src-budget", "src-dashboard"] },
        electrical_rough: { id: "electrical_rough", name: "Electrical service and rough-in", phase: "MEP Rough", state: "NOT_STARTED", duration: { optimistic: 4, likely: 6, conservative: 9, sourceIds: ["src-scope", "src-trades"] }, constraintIds: ["electrical-trade"], sourceIds: ["src-scope", "src-trades"] },
        plumbing_rough: { id: "plumbing_rough", name: "Half-bath plumbing rough-in", phase: "MEP Rough", state: "NOT_STARTED", duration: { optimistic: 3, likely: 4, conservative: 7, sourceIds: ["src-scope", "src-plumbing"] }, constraintIds: ["plumbing-trade"], sourceIds: ["src-scope", "src-plumbing", "src-trades"] },
        hvac_rough: { id: "hvac_rough", name: "Multi-zone mini-split rough-in / lines / condensate", phase: "MEP Rough", state: "NOT_STARTED", duration: { optimistic: 3, likely: 5, conservative: 8, sourceIds: ["src-scope", "src-hvac"] }, constraintIds: ["hvac-trade", "hvac-equipment"], sourceIds: ["src-scope", "src-hvac", "src-trades"] },
        rough_inspection: { id: "rough_inspection", name: "MEP rough inspections", phase: "Inspection", state: "NOT_STARTED", duration: { optimistic: 1, likely: 2, conservative: 4, sourceIds: ["src-scope"] }, constraintIds: ["inspection-ready"], sourceIds: ["src-scope"] },
        insulation: { id: "insulation", name: "Insulation and air sealing", phase: "Close-In", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope"] }, constraintIds: ["insulation-trade"], sourceIds: ["src-scope", "src-dashboard"] },
        drywall_hang: { id: "drywall_hang", name: "Drywall hang", phase: "Close-In", state: "NOT_STARTED", duration: { optimistic: 3, likely: 4, conservative: 6, sourceIds: ["src-scope", "src-budget"] }, constraintIds: ["drywall-trade"], sourceIds: ["src-scope", "src-budget"] },
        drywall_finish: { id: "drywall_finish", name: "Drywall tape / finish / sand", phase: "Close-In", state: "NOT_STARTED", duration: { optimistic: 4, likely: 6, conservative: 9, sourceIds: ["src-scope", "src-budget"] }, constraintIds: [], sourceIds: ["src-scope", "src-budget"] },
        prime_paint: { id: "prime_paint", name: "Prime and interior paint", phase: "Finishes", state: "NOT_STARTED", duration: { optimistic: 4, likely: 6, conservative: 9, sourceIds: ["src-scope", "src-budget"] }, constraintIds: ["paint-trade"], sourceIds: ["src-scope", "src-budget", "src-trades"] },
        finish_carpentry: { id: "finish_carpentry", name: "Interior doors / trim / stair finish / vanity setting", phase: "Finishes", state: "NOT_STARTED", duration: { optimistic: 4, likely: 6, conservative: 9, sourceIds: ["src-scope", "src-budget"] }, constraintIds: ["finish-carpentry-trade"], sourceIds: ["src-scope", "src-budget"] },
        flooring: { id: "flooring", name: "Second-floor flooring / transitions / stair finish", phase: "Finishes", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-budget"] }, constraintIds: ["flooring-trade"], sourceIds: ["src-scope", "src-budget"] },
        half_bath_finish: { id: "half_bath_finish", name: "Half-bath vanity / top / fixtures / mirror / accessories", phase: "Finishes", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-plumbing"] }, constraintIds: ["bath-finish-materials"], sourceIds: ["src-scope", "src-plumbing"] },
        garage_doors: { id: "garage_doors", name: "Overhead garage doors / openers / controls", phase: "Exterior", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope"] }, constraintIds: ["garage-door-package"], sourceIds: ["src-scope", "src-budget"] },
        electrical_final: { id: "electrical_final", name: "Electrical trim / devices / lighting / testing", phase: "MEP Final", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope", "src-trades"] }, constraintIds: [], sourceIds: ["src-scope", "src-trades"] },
        plumbing_final: { id: "plumbing_final", name: "Plumbing fixtures / trim / testing", phase: "MEP Final", state: "NOT_STARTED", duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: ["src-scope", "src-plumbing"] }, constraintIds: [], sourceIds: ["src-scope", "src-plumbing"] },
        hvac_startup: { id: "hvac_startup", name: "HVAC startup / commissioning", phase: "MEP Final", state: "NOT_STARTED", duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: ["src-scope", "src-hvac"] }, constraintIds: [], sourceIds: ["src-scope", "src-hvac"] },
        exterior_closeout: { id: "exterior_closeout", name: "Exterior trim / caulk / gutters / weatherproof closeout", phase: "Exterior", state: "NOT_STARTED", duration: { optimistic: 3, likely: 4, conservative: 6, sourceIds: ["src-scope"] }, constraintIds: [], sourceIds: ["src-scope"] },
        final_grading_cleanup: { id: "final_grading_cleanup", name: "Final grading / lawn restoration / cleanup", phase: "Closeout", state: "NOT_STARTED", duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: ["src-scope"] }, constraintIds: [], sourceIds: ["src-scope"] },
        final_inspection: { id: "final_inspection", name: "Final inspections / punch release", phase: "Closeout", state: "NOT_STARTED", duration: { optimistic: 1, likely: 2, conservative: 4, sourceIds: ["src-scope"] }, constraintIds: ["final-inspection"], sourceIds: ["src-scope"] },
        homeowner_walkthrough: { id: "homeowner_walkthrough", name: "Systems demonstration / homeowner walkthrough / closeout package", phase: "Closeout", state: "NOT_STARTED", duration: { optimistic: 1, likely: 1, conservative: 2, sourceIds: ["src-scope"] }, constraintIds: [], sourceIds: ["src-scope"] },
    };
    const constraints = {
        "masonry-material": { id: "masonry-material", activityId: "masonry", type: "MATERIAL", label: "Correct CMU/block package on site and verified", state: "UNVERIFIED", hard: true, sourceIds: ["src-dashboard", "src-material-quotes"], verification: "UNVERIFIED" },
        "masonry-trade": { id: "masonry-trade", activityId: "masonry", type: "TRADE_AVAILABILITY", label: "Masonry crew mobilization after stale Aug 24 target", state: "UNVERIFIED", hard: true, sourceIds: ["src-masonry-calendar", "src-trades"], verification: "UNVERIFIED" },
        "structural-release-verify": { id: "structural-release-verify", activityId: "structural_release", type: "INFORMATION", label: "Anchor / elevation / bearing conditions field-verified", state: "UNVERIFIED", hard: true, sourceIds: ["src-engineering", "src-dashboard"], verification: "UNVERIFIED" },
        "engineering-reconcile": { id: "engineering-reconcile", activityId: "structural_reconcile", type: "INFORMATION", label: "Plan/LVL/post condition reconciled for field framing", state: "BLOCKED", hard: true, readiness: w("2026-08-26", "2026-08-27", "2026-08-28"), sourceIds: ["src-plans", "src-engineering", "src-dashboard"], verification: "CORROBORATED" },
        "building-delivery-ready": { id: "building-delivery-ready", activityId: "building_delivery", type: "MATERIAL", label: "Walls/subfloor delivery Aug 28", state: "COMMITTED", hard: true, readiness: w("2026-08-28", "2026-08-28", "2026-08-28"), sourceIds: ["src-building-package"], verification: "PM_CONFIRMED" },
        "framer-availability": { id: "framer-availability", activityId: "framing", type: "TRADE_AVAILABILITY", label: "Framer mobilization", state: "UNVERIFIED", hard: true, sourceIds: ["src-dashboard", "src-budget"], verification: "UNVERIFIED" },
        "framing-material": { id: "framing-material", activityId: "framing", type: "MATERIAL", label: "Walls/subfloor/LVL framing package received, counted, undamaged, staged", state: "COMMITTED", hard: true, readiness: w("2026-08-28", "2026-08-28", "2026-08-31"), sourceIds: ["src-building-package", "src-engineering"], verification: "PM_CONFIRMED" },
        "roof-vendor": { id: "roof-vendor", activityId: "roof_procurement", type: "INFORMATION", label: "Roof vendor/package decision and release", state: "COMMITTED", hard: true, readiness: w("2026-08-26", "2026-08-27", "2026-08-28"), sourceIds: ["src-roof-action"], verification: "PM_CONFIRMED" },
        "roof-material": { id: "roof-material", activityId: "roofing", type: "MATERIAL", label: "Roof package refreshed, ordered and available", state: "UNVERIFIED", hard: true, sourceIds: ["src-material-quotes", "src-roof-action"], verification: "UNVERIFIED" },
        "opening-protection-material": { id: "opening-protection-material", activityId: "opening_protection", type: "MATERIAL", label: "Temporary/permanent opening protection available", state: "UNVERIFIED", hard: true, sourceIds: ["src-scope", "src-material-quotes"], verification: "UNVERIFIED" },
        "windows-doors-material": { id: "windows-doors-material", activityId: "windows_ext_doors", type: "MATERIAL", label: "Window/service-door package availability and opening counts verified", state: "UNVERIFIED", hard: true, sourceIds: ["src-material-quotes", "src-scope"], verification: "UNVERIFIED" },
        "brick-match": { id: "brick-match", activityId: "brick_veneer", type: "MATERIAL", label: "Brick veneer match approved against existing residence", state: "BLOCKED", hard: true, sourceIds: ["src-brick-risk", "src-scope"], verification: "UNVERIFIED" },
        "brick-material": { id: "brick-material", activityId: "brick_veneer", type: "MATERIAL", label: "Lee masonry material quote refreshed / package released", state: "UNVERIFIED", hard: true, sourceIds: ["src-brick-risk", "src-material-quotes"], verification: "UNVERIFIED" },
        "mep-routing": { id: "mep-routing", activityId: "underslab_mep", type: "INFORMATION", label: "Under-slab plumbing/electrical routing field-confirmed", state: "UNVERIFIED", hard: true, sourceIds: ["src-scope", "src-plumbing", "src-trades"], verification: "UNVERIFIED" },
        "slab-inspection": { id: "slab-inspection", activityId: "slab_prep", type: "INSPECTION", label: "Required under-slab/concealed inspection release", state: "UNVERIFIED", hard: true, sourceIds: ["src-scope"], verification: "UNVERIFIED" },
        "concrete-trade": { id: "concrete-trade", activityId: "slab", type: "TRADE_AVAILABILITY", label: "Concrete crew remobilization after dry-in", state: "FORECASTED", hard: true, sourceIds: ["src-dashboard", "src-budget"], verification: "CORROBORATED" },
        "electrical-trade": { id: "electrical-trade", activityId: "electrical_rough", type: "TRADE_AVAILABILITY", label: "Jason Bonham electrical rough-in mobilization", state: "COMMITTED", hard: true, sourceIds: ["src-trades"], verification: "PM_CONFIRMED" },
        "plumbing-trade": { id: "plumbing-trade", activityId: "plumbing_rough", type: "TRADE_AVAILABILITY", label: "Medina plumbing rough-in mobilization", state: "COMMITTED", hard: true, sourceIds: ["src-trades", "src-plumbing"], verification: "PM_CONFIRMED" },
        "hvac-trade": { id: "hvac-trade", activityId: "hvac_rough", type: "TRADE_AVAILABILITY", label: "Anthony Parker HVAC rough-in mobilization", state: "COMMITTED", hard: true, sourceIds: ["src-trades", "src-hvac"], verification: "PM_CONFIRMED" },
        "hvac-equipment": { id: "hvac-equipment", activityId: "hvac_rough", type: "MATERIAL", label: "Multi-zone HVAC equipment / route / condensate plan ready", state: "UNVERIFIED", hard: true, sourceIds: ["src-hvac", "src-scope"], verification: "CORROBORATED" },
        "inspection-ready": { id: "inspection-ready", activityId: "rough_inspection", type: "INSPECTION", label: "All rough trades inspection-ready and inspection slot confirmed", state: "UNVERIFIED", hard: true, sourceIds: ["src-scope"], verification: "UNVERIFIED" },
        "insulation-trade": { id: "insulation-trade", activityId: "insulation", type: "TRADE_AVAILABILITY", label: "Insulation trade quote / mobilization", state: "UNVERIFIED", hard: true, sourceIds: ["src-dashboard"], verification: "UNVERIFIED" },
        "drywall-trade": { id: "drywall-trade", activityId: "drywall_hang", type: "TRADE_AVAILABILITY", label: "Drywall crew mobilization", state: "UNVERIFIED", hard: true, sourceIds: ["src-budget", "src-dashboard"], verification: "UNVERIFIED" },
        "paint-trade": { id: "paint-trade", activityId: "prime_paint", type: "TRADE_AVAILABILITY", label: "Dylan Jasper painting mobilization", state: "COMMITTED", hard: true, sourceIds: ["src-trades", "src-budget"], verification: "PM_CONFIRMED" },
        "finish-carpentry-trade": { id: "finish-carpentry-trade", activityId: "finish_carpentry", type: "TRADE_AVAILABILITY", label: "Finish carpentry labor mobilization", state: "FORECASTED", hard: true, sourceIds: ["src-budget"], verification: "CORROBORATED" },
        "flooring-trade": { id: "flooring-trade", activityId: "flooring", type: "TRADE_AVAILABILITY", label: "Flooring labor mobilization", state: "COMMITTED", hard: true, sourceIds: ["src-budget"], verification: "PM_CONFIRMED" },
        "bath-finish-materials": { id: "bath-finish-materials", activityId: "half_bath_finish", type: "MATERIAL", label: "Vanity/top/fixtures/mirror/accessories ready", state: "UNVERIFIED", hard: false, sourceIds: ["src-scope", "src-plumbing"], verification: "UNVERIFIED" },
        "garage-door-package": { id: "garage-door-package", activityId: "garage_doors", type: "MATERIAL", label: "Double + single overhead door/openers package ordered and available", state: "UNVERIFIED", hard: true, sourceIds: ["src-scope", "src-budget"], verification: "UNVERIFIED" },
        "final-inspection": { id: "final-inspection", activityId: "final_inspection", type: "INSPECTION", label: "Final inspection availability", state: "UNVERIFIED", hard: true, sourceIds: ["src-scope"], verification: "UNVERIFIED" },
    };
    const dependencies = {};
    const add = (id, predecessorId, successorId, type = "FINISH_TO_START", lagWorkdays = 0, reason = "Required construction sequence", sourceIds = ["src-scope"]) => { dependencies[id] = { id, active: true, predecessorId, successorId, type, lagWorkdays, hard: true, reason, sourceIds }; };
    add("d01","masonry","structural_release","FINISH_TO_START",0,"CMU walls must complete before anchor/elevation release",["src-scope","src-engineering"]);
    add("d02","structural_release","framing","FINISH_TO_START",0,"Framing bears on released CMU/anchors",["src-plans","src-scope"]);
    add("d03","structural_reconcile","framing","FINISH_TO_START",0,"LVL/post condition must be reconciled before framing",["src-plans","src-engineering"]);
    add("d04","building_delivery","framing","FINISH_TO_START",0,"Framing package must be received before mobilization",["src-building-package"]);
    add("d05","framing","roofing","START_TO_START",6,"Roofing can start after sufficient roof framing release",["src-scope"]);
    add("d06","roof_procurement","roofing","FINISH_TO_START",0,"Roof package must be released before install",["src-roof-action","src-material-quotes"]);
    add("d07","framing","opening_protection","START_TO_START",5,"Openings can be weather-protected as framing advances",["src-scope"]);
    add("d08","roofing","dry_in_release","FINISH_TO_START",0,"Roof completion is required for dry-in release",["src-scope"]);
    add("d09","opening_protection","dry_in_release","FINISH_TO_START",0,"Openings must be weather-protected for dry-in release",["src-scope"]);
    add("d10","framing","windows_ext_doors","FINISH_TO_START",0,"Permanent openings follow completed structural framing",["src-scope"]);
    add("d11","windows_ext_doors","brick_veneer","FINISH_TO_START",0,"Brick detailing requires opening geometry/flashing coordination",["src-scope"]);
    add("d12","dry_in_release","underslab_mep","FINISH_TO_START",0,"Scope requires framing dried-in before slab sequence",["src-scope"]);
    add("d13","underslab_mep","slab_prep","FINISH_TO_START",0,"Concealed MEP routing must release slab preparation",["src-scope"]);
    add("d14","slab_prep","slab","FINISH_TO_START",0,"Prepared/inspected slab base releases pour",["src-scope"]);
    add("d15","dry_in_release","electrical_rough","FINISH_TO_START",0,"Interior electrical rough follows dry-in",["src-scope"]);
    add("d16","dry_in_release","plumbing_rough","FINISH_TO_START",0,"Interior plumbing rough follows dry-in",["src-scope"]);
    add("d17","dry_in_release","hvac_rough","FINISH_TO_START",0,"HVAC rough follows dry-in",["src-scope"]);
    add("d18","electrical_rough","rough_inspection","FINISH_TO_START",0,"Electrical rough must complete before combined rough inspection",["src-scope"]);
    add("d19","plumbing_rough","rough_inspection","FINISH_TO_START",0,"Plumbing rough must complete before combined rough inspection",["src-scope"]);
    add("d20","hvac_rough","rough_inspection","FINISH_TO_START",0,"HVAC rough must complete before combined rough inspection",["src-scope"]);
    add("d21","rough_inspection","insulation","FINISH_TO_START",0,"Rough inspection release required before close-in",["src-scope"]);
    add("d22","insulation","drywall_hang","FINISH_TO_START",0,"Insulation and air sealing precede drywall",["src-scope"]);
    add("d23","slab","drywall_hang","FINISH_TO_START",0,"Garage slab must be released before garage drywall close-in",["src-scope"]);
    add("d24","drywall_hang","drywall_finish","FINISH_TO_START",0,"Board hang precedes tape/finish",["src-scope"]);
    add("d25","drywall_finish","prime_paint","FINISH_TO_START",0,"Finished drywall releases prime/paint",["src-scope"]);
    add("d26","prime_paint","finish_carpentry","FINISH_TO_START",0,"Base paint releases finished carpentry",["src-scope"]);
    add("d27","finish_carpentry","flooring","FINISH_TO_START",0,"Trim/stair substrate coordination precedes flooring closeout",["src-scope"]);
    add("d28","finish_carpentry","half_bath_finish","FINISH_TO_START",0,"Vanity/trim readiness precedes half-bath finish",["src-scope"]);
    add("d29","slab","garage_doors","FINISH_TO_START",0,"Finished/cured slab supports garage-door install access",["src-scope"]);
    add("d30","framing","garage_doors","FINISH_TO_START",0,"Garage-door openings must be structurally complete",["src-scope"]);
    add("d31","finish_carpentry","electrical_final","FINISH_TO_START",0,"Trim/paint surfaces must be ready for electrical devices/fixtures",["src-scope"]);
    add("d32","half_bath_finish","plumbing_final","FINISH_TO_START",0,"Bath finish must be ready for plumbing trim/testing",["src-scope"]);
    add("d33","electrical_final","hvac_startup","FINISH_TO_START",0,"HVAC startup requires final electrical power/disconnect",["src-scope"]);
    add("d34","roofing","exterior_closeout","FINISH_TO_START",0,"Roof edge details precede exterior closeout",["src-scope"]);
    add("d35","brick_veneer","exterior_closeout","FINISH_TO_START",0,"Brick veneer precedes exterior caulk/trim closeout",["src-scope"]);
    add("d36","garage_doors","exterior_closeout","FINISH_TO_START",0,"Garage doors/openers are part of envelope closeout",["src-scope"]);
    add("d37","exterior_closeout","final_grading_cleanup","FINISH_TO_START",0,"Exterior work should be substantially complete before final restoration",["src-scope"]);
    add("d38","slab","final_grading_cleanup","FINISH_TO_START",0,"Concrete operations complete before final grading/cleanup",["src-scope"]);
    add("d39","flooring","final_inspection","FINISH_TO_START",0,"Interior flooring/trim must be complete for final",["src-scope"]);
    add("d40","plumbing_final","final_inspection","FINISH_TO_START",0,"Plumbing final must complete before final inspection",["src-scope"]);
    add("d41","electrical_final","final_inspection","FINISH_TO_START",0,"Electrical final must complete before final inspection",["src-scope"]);
    add("d42","hvac_startup","final_inspection","FINISH_TO_START",0,"HVAC startup/testing must complete before final inspection",["src-scope"]);
    add("d43","final_grading_cleanup","final_inspection","FINISH_TO_START",0,"Closeout site conditions precede final inspection",["src-scope"]);
    add("d44","final_inspection","homeowner_walkthrough","FINISH_TO_START",0,"Final inspection/punch release precedes homeowner closeout",["src-scope"]);
    const conflicts = {
        "conf-plan-engineering": { id: "conf-plan-engineering", category: "PLAN_ENGINEERING", description: "Tradewalk plan set and newer LVL/post engineering must be reconciled before framing commitment.", activityIds: ["structural_reconcile","framing"], sourceIds: ["src-plans","src-engineering","src-dashboard"], severity: "HIGH", status: "OPEN" },
        "conf-brick-match": { id: "conf-brick-match", category: "MATERIAL_SELECTION", description: "Brick veneer match task is not verified against the existing residence and the Lee material quote requires refresh.", activityIds: ["brick_veneer"], sourceIds: ["src-brick-risk","src-material-quotes"], severity: "HIGH", status: "OPEN" },
    };
    const commercialSignals = {
        "sig-framing": { id: "sig-framing", kind: "ESTIMATE", activityIds: ["framing"], workPackage: "Rough carpentry labor", amount: 13500.72, currency: "USD", selected: true, scopeCoverage: "FULL", sourceIds: ["src-budget"] },
        "sig-building-material": { id: "sig-building-material", kind: "ESTIMATE", activityIds: ["building_delivery","framing","opening_protection"], workPackage: "Builders Choice multi-trade building package", amount: 17692.84, currency: "USD", selected: false, scopeCoverage: "PARTIAL", sourceIds: ["src-budget","src-material-quotes"] },
        "sig-brick-material": { id: "sig-brick-material", kind: "ESTIMATE", activityIds: ["brick_veneer"], workPackage: "Lee Building Products brick/masonry materials - expired quote", amount: 12409.21, currency: "USD", selected: true, scopeCoverage: "PARTIAL", sourceIds: ["src-budget","src-material-quotes"] },
        "sig-roof-material": { id: "sig-roof-material", kind: "ESTIMATE", activityIds: ["roof_procurement","roofing"], workPackage: "Builders Choice shingles package - expired quote", amount: 2936.45, currency: "USD", selected: false, scopeCoverage: "PARTIAL", sourceIds: ["src-budget","src-material-quotes"] },
        "sig-plumbing": { id: "sig-plumbing", kind: "ESTIMATE", activityIds: ["underslab_mep","plumbing_rough","plumbing_final"], workPackage: "Medina Plumbing", amount: 7800, currency: "USD", selected: true, scopeCoverage: "FULL", sourceIds: ["src-plumbing","src-budget"] },
        "sig-hvac": { id: "sig-hvac", kind: "ESTIMATE", activityIds: ["hvac_rough","hvac_startup"], workPackage: "Multi-zone mini-split", amount: 7366, currency: "USD", selected: true, scopeCoverage: "FULL", sourceIds: ["src-hvac"] },
        "sig-floor": { id: "sig-floor", kind: "ESTIMATE", activityIds: ["flooring"], workPackage: "Flooring labor", amount: 2700, currency: "USD", selected: true, scopeCoverage: "FULL", sourceIds: ["src-budget"] },
        "sig-paint": { id: "sig-paint", kind: "ESTIMATE", activityIds: ["prime_paint"], workPackage: "Painting labor", amount: 4000, currency: "USD", selected: true, scopeCoverage: "FULL", sourceIds: ["src-budget","src-trades"] },
    };
    const workloadSignals = {
        "work-floor": { id: "work-floor", activityIds: ["flooring"], dimension: "AREA", value: 900, unit: "SF", label: "Documented flooring labor area", sourceIds: ["src-budget"] },
        "work-floor-joists": { id: "work-floor-joists", activityIds: ["framing"], dimension: "COUNT", value: 70, unit: "pieces", label: "Approximate 2x12 floor joist package count", sourceIds: ["src-building-package"] },
        "work-roof-rafters": { id: "work-roof-rafters", activityIds: ["framing","roofing"], dimension: "COUNT", value: 97, unit: "pieces", label: "Documented roof framing members in material package", sourceIds: ["src-building-package"] },
    };
    const impactSeedActivityIds = Object.keys(activities);
    const bootstrapEvent = {
        id: "deboard-v09-baseline-evidence-2026-08-26",
        baseRevision: 0,
        projectId,
        type: "BASELINE_EVIDENCE",
        occurredAt: dt,
        receivedAt: dt,
        sourceIds: Object.keys(sources),
        verification: "PM_CONFIRMED",
        impactSeedActivityIds,
        mutations: [],
        payload: {
            purpose: "v0.9 evidence/truth-layer baseline",
            rule: "Calendar commitments are not actual starts; future deliveries are COMMITTED until field-verified; forecast dates remain distinct from production commitments.",
        },
        note: "Bootstrap provenance event. No live system is modified.",
    };
    return {
        projectId,
        revision: 1,
        name: "DeBoard - 227 Marengo Dr - v0.9 truth-layer shadow",
        projectType: "Detached garage + mower storage + conditioned second-floor office/flex + half bath",
        timezone: "America/New_York",
        forecastAnchorDate: "2026-08-26",
        calendar: { workingWeekdays: [1,2,3,4,5], holidays: [] },
        sources, activities, constraints, dependencies, conflicts, commercialSignals, workloadSignals,
        eventLedger: [bootstrapEvent],
    };
}

};
__modules["src/worker/hash.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stableStringify = stableStringify;
exports.sha256Hex = sha256Hex;
function normalize(value) {
    if (Array.isArray(value))
        return value.map(normalize);
    if (value && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            out[key] = normalize(value[key]);
        }
        return out;
    }
    return value;
}
function stableStringify(value) {
    return JSON.stringify(normalize(value));
}
async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(stableStringify(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

};
__modules["src/worker/health.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectHealth = projectHealth;
const coverage_js_1 = require("../coverage.js");
const metrics_js_1 = require("../metrics.js");
async function projectHealth(repo, model, forecast) {
    const coverage = Object.keys(model.activities).map((id) => (0, coverage_js_1.activityCoverage)(model, id));
    const outcomes = await repo.loadPredictionOutcomes(model.projectId);
    const accuracy = (0, metrics_js_1.summarizeAccuracy)(outcomes);
    const openConflicts = Object.values(model.conflicts ?? {}).filter((c) => c.status === "OPEN");
    const blockedConstraints = Object.values(model.constraints).filter((c) => c.state === "BLOCKED");
    const unverifiedHardConstraints = Object.values(model.constraints).filter((c) => c.hard && c.state === "UNVERIFIED");
    const lowCoverage = coverage.filter((c) => c.overall < 0.6).sort((a, b) => a.overall - b.overall);
    const confidence = forecast
        ? Object.values(forecast.activityForecasts).reduce((sum, f) => sum + f.confidence.overall, 0) / Math.max(1, Object.keys(forecast.activityForecasts).length)
        : 0;
    return {
        projectId: model.projectId,
        revision: model.revision,
        forecastVersion: forecast?.version ?? null,
        completion: forecast?.completion ?? null,
        meanForecastConfidence: confidence,
        openConflicts,
        blockedConstraints,
        unverifiedHardConstraints,
        lowCoverage,
        accuracyByHorizon: accuracy,
    };
}

};
__modules["src/worker/http.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.json = json;
exports.readJson = readJson;
exports.requireAdmin = requireAdmin;
const MAX_JSON_BYTES = 256 * 1024;
const encoder = new TextEncoder();
function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
    });
}
async function readBodyText(request) {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
        throw new HttpError(413, `JSON body exceeds ${MAX_JSON_BYTES} bytes`);
    }
    if (!request.body)
        return "";
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            total += value.byteLength;
            if (total > MAX_JSON_BYTES) {
                await reader.cancel("request body too large");
                throw new HttpError(413, `JSON body exceeds ${MAX_JSON_BYTES} bytes`);
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
}
async function readJson(request) {
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("application/json")) {
        throw new HttpError(415, "Content-Type must be application/json");
    }
    const text = await readBodyText(request);
    if (!text.trim())
        throw new HttpError(400, "JSON body is required");
    try {
        return JSON.parse(text);
    }
    catch {
        throw new HttpError(400, "Invalid JSON body");
    }
}
class HttpError extends Error {
    status;
    details;
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
        this.name = "HttpError";
    }
}
exports.HttpError = HttpError;
async function timingSafeTokenEqual(actual, expected) {
    const [actualHash, expectedHash] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(actual)),
        crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    ]);
    return crypto.subtle.timingSafeEqual(actualHash, expectedHash);
}
async function requireAdmin(request, expected) {
    if (!expected)
        throw new HttpError(500, "HOWLER_ADMIN_KEY is not configured");
    const authorization = request.headers.get("authorization") ?? "";
    const actual = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!(await timingSafeTokenEqual(actual, expected)))
        throw new HttpError(401, "Unauthorized");
}

};
__modules["src/worker/index.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_js_1 = require("../engine.js");
const validation_js_1 = require("../validation.js");
const storage_js_1 = require("../storage.js");
const deboard_seed_js_1 = require("./deboard-seed.js");
const admin_js_1 = require("./admin.js");
const health_js_1 = require("./health.js");
const hash_js_1 = require("./hash.js");
const http_js_1 = require("./http.js");
const repository_js_1 = require("./repository.js");
const understanding_js_1 = require("./understanding.js");
const SERVICE_VERSION = "0.9.0";
const SCHEMA_TABLES = ["projects","project_events","forecast_snapshots","oversight_reviews","learning_records","prediction_outcomes"];
const SCHEMA_STATEMENTS = [
`CREATE TABLE IF NOT EXISTS projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0), current_model_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS project_events (project_id TEXT NOT NULL, event_id TEXT NOT NULL, base_revision INTEGER NOT NULL, new_revision INTEGER NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, event_json TEXT NOT NULL, model_after_json TEXT NOT NULL, PRIMARY KEY (project_id, event_id), UNIQUE (project_id, new_revision), FOREIGN KEY (project_id) REFERENCES projects(project_id))`,
`CREATE TRIGGER IF NOT EXISTS project_events_revision_guard BEFORE INSERT ON project_events BEGIN SELECT CASE WHEN (SELECT revision FROM projects WHERE project_id = NEW.project_id) IS NULL THEN RAISE(ABORT, 'HOWLER_PROJECT_NOT_FOUND') WHEN (SELECT revision FROM projects WHERE project_id = NEW.project_id) <> NEW.base_revision THEN RAISE(ABORT, 'HOWLER_REVISION_CONFLICT') WHEN NEW.new_revision <> NEW.base_revision + 1 THEN RAISE(ABORT, 'HOWLER_INVALID_REVISION_INCREMENT') END; END`,
`CREATE TRIGGER IF NOT EXISTS project_events_apply_model AFTER INSERT ON project_events BEGIN UPDATE projects SET revision = NEW.new_revision, current_model_json = NEW.model_after_json, updated_at = NEW.received_at WHERE project_id = NEW.project_id; END`,
`CREATE TRIGGER IF NOT EXISTS project_events_no_update BEFORE UPDATE ON project_events BEGIN SELECT RAISE(ABORT, 'project_events is append-only'); END`,
`CREATE TRIGGER IF NOT EXISTS project_events_no_delete BEFORE DELETE ON project_events BEGIN SELECT RAISE(ABORT, 'project_events is append-only'); END`,
`CREATE TABLE IF NOT EXISTS forecast_snapshots (snapshot_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, model_revision INTEGER NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('WORKING','PROPOSED','PUBLISHED')), snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (project_id, version), FOREIGN KEY (project_id) REFERENCES projects(project_id))`,
`CREATE TABLE IF NOT EXISTS oversight_reviews (review_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, candidate_snapshot_id TEXT NOT NULL, decision TEXT NOT NULL CHECK (decision IN ('PASS','PASS_WITH_WARNINGS','BLOCK')), review_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(project_id), FOREIGN KEY (candidate_snapshot_id) REFERENCES forecast_snapshots(snapshot_id))`,
`CREATE TABLE IF NOT EXISTS learning_records (learning_id TEXT PRIMARY KEY, layer TEXT NOT NULL, subject_key TEXT NOT NULL, hypothesis_type TEXT NOT NULL, record_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS prediction_outcomes (prediction_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, activity_id TEXT NOT NULL, source_snapshot_id TEXT NOT NULL, horizon_days INTEGER NOT NULL, point_error_workdays REAL NOT NULL, range_hit INTEGER NOT NULL CHECK (range_hit IN (0,1)), confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1), outcome_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(project_id), FOREIGN KEY (source_snapshot_id) REFERENCES forecast_snapshots(snapshot_id))`,
`CREATE INDEX IF NOT EXISTS idx_project_events_revision ON project_events(project_id, new_revision)`,
`CREATE INDEX IF NOT EXISTS idx_forecast_project_status ON forecast_snapshots(project_id, status, version)`,
`CREATE INDEX IF NOT EXISTS idx_outcomes_project_activity ON prediction_outcomes(project_id, activity_id)`,
`CREATE TRIGGER IF NOT EXISTS forecast_snapshots_no_update BEFORE UPDATE ON forecast_snapshots BEGIN SELECT RAISE(ABORT, 'forecast_snapshots is append-only'); END`,
`CREATE TRIGGER IF NOT EXISTS forecast_snapshots_no_delete BEFORE DELETE ON forecast_snapshots BEGIN SELECT RAISE(ABORT, 'forecast_snapshots is append-only'); END`,
`CREATE TRIGGER IF NOT EXISTS oversight_reviews_no_update BEFORE UPDATE ON oversight_reviews BEGIN SELECT RAISE(ABORT, 'oversight_reviews is append-only'); END`,
`CREATE TRIGGER IF NOT EXISTS oversight_reviews_no_delete BEFORE DELETE ON oversight_reviews BEGIN SELECT RAISE(ABORT, 'oversight_reviews is append-only'); END`,
`CREATE TRIGGER IF NOT EXISTS prediction_outcomes_no_update BEFORE UPDATE ON prediction_outcomes BEGIN SELECT RAISE(ABORT, 'prediction_outcomes is append-only'); END`,
`CREATE TRIGGER IF NOT EXISTS prediction_outcomes_no_delete BEFORE DELETE ON prediction_outcomes BEGIN SELECT RAISE(ABORT, 'prediction_outcomes is append-only'); END`
];
async function initializeSchema(db) {
  if (!db) throw new http_js_1.HttpError(500, "HOWLER_DB is not bound");
  const results = [];
  for (let i = 0; i < SCHEMA_STATEMENTS.length; i += 1) {
    try {
      const result = await db.prepare(SCHEMA_STATEMENTS[i]).run();
      results.push({ statement: i + 1, ok: Boolean(result.success ?? true) });
    } catch (error) {
      throw new http_js_1.HttpError(500, `Schema initialization failed at statement ${i + 1}`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }
  const placeholders = SCHEMA_TABLES.map(() => '?').join(',');
  const found = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders}) ORDER BY name`).bind(...SCHEMA_TABLES).all();
  const tableNames = (found.results ?? []).map((row) => row.name);
  return { ok: tableNames.length === SCHEMA_TABLES.length, expected: SCHEMA_TABLES, found: tableNames, statementsApplied: results.length };
}
function route(pathname) {
    return pathname.split("/").filter(Boolean);
}
function nextVersion(latest) {
    return (latest?.version ?? 0) + 1;
}
async function reviewedRun(repo, projectId, event) {
    const model = await repo.loadProject(projectId);
    if (!model)
        throw new http_js_1.HttpError(404, `Project ${projectId} not found`);
    if (event.projectId !== projectId)
        throw new http_js_1.HttpError(400, "Event projectId does not match URL project ID");
    const [baseline, latest] = await Promise.all([
        repo.loadLatestPublishedForecast(projectId),
        repo.loadLatestForecast(projectId),
    ]);
    const run = (0, engine_js_1.forecastAfterEvent)(model, event, event.receivedAt, nextVersion(latest), baseline);
    const reviewToken = await (0, hash_js_1.sha256Hex)({
        projectRevision: model.revision,
        latestForecastVersion: latest?.version ?? 0,
        event,
        candidate: run.candidate,
        oversight: run.oversight,
    });
    return { model, baseline, latest, run, reviewToken };
}
async function handle(request, env) {
    const url = new URL(request.url);
    const parts = route(url.pathname);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/admin")) {
        return (0, admin_js_1.adminPage)(SERVICE_VERSION);
    }
    if (request.method === "GET" && url.pathname === "/health") {
        const databaseBound = Boolean(env.HOWLER_DB);
        let schemaReady = false;
        let databaseError;
        if (databaseBound) {
            try {
                const placeholders = SCHEMA_TABLES.map(() => '?').join(',');
                const rows = await env.HOWLER_DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`).bind(...SCHEMA_TABLES).all();
                schemaReady = (rows.results ?? []).length === SCHEMA_TABLES.length;
            }
            catch (error) {
                databaseError = error instanceof Error ? error.message : String(error);
            }
        }
        const adminConfigured = Boolean(env.HOWLER_ADMIN_KEY);
        const database = databaseError
            ? { bound: databaseBound, schemaReady, error: databaseError }
            : { bound: databaseBound, schemaReady };
        return (0, http_js_1.json)({
            ok: databaseBound && schemaReady && adminConfigured,
            service: "howler-scheduling-staging",
            mode: env.HOWLER_MODE ?? "shadow",
            version: SERVICE_VERSION,
            database,
            adminConfigured,
            liveSystemsConnected: false,
        });
    }
    if (parts[0] !== "v1")
        throw new http_js_1.HttpError(404, "Not found");
    await (0, http_js_1.requireAdmin)(request, env.HOWLER_ADMIN_KEY);
    if (request.method === "POST" && parts.join("/") === "v1/admin/init-db") {
        const result = await initializeSchema(env.HOWLER_DB);
        return (0, http_js_1.json)({ ...result, stagingOnly: true }, result.ok ? 200 : 500);
    }
    const repo = new repository_js_1.D1HowlerRepository(env.HOWLER_DB);
    if (request.method === "POST" && parts.join("/") === "v1/projects/deboard-v09/seed") {
        if (await repo.projectExists("deboard-v09"))
            throw new http_js_1.HttpError(409, "DeBoard v0.9 is already seeded");
        const model = (0, deboard_seed_js_1.createDeboardSeed)();
        (0, validation_js_1.validateProjectModel)(model);
        const initial = (0, engine_js_1.forecastInitial)(model, new Date().toISOString(), 1);
        // Do not bypass oversight. A blocked seed remains WORKING, never force-labeled PUBLISHED.
        await repo.createProject(model, initial.candidate, initial.oversight);
        return (0, http_js_1.json)({
            project: model,
            initialForecast: initial.candidate,
            oversight: initial.oversight,
            forecastable: initial.forecastable,
            commitmentEligible: initial.commitmentEligible,
            publishable: initial.publishable,
            stagingOnly: true,
        }, 201);
    }
    if (parts[1] !== "projects" || !parts[2])
        throw new http_js_1.HttpError(404, "Not found");
    const projectId = parts[2];
    if (request.method === "GET" && parts.length === 4 && parts[3] === "forecast") {
        const model = await repo.loadProject(projectId);
        if (!model)
            throw new http_js_1.HttpError(404, `Project ${projectId} not found`);
        const [latest, published] = await Promise.all([
            repo.loadLatestForecast(projectId),
            repo.loadLatestPublishedForecast(projectId),
        ]);
        return (0, http_js_1.json)({ modelRevision: model.revision, latest, published });
    }
    if (request.method === "GET" && parts.length === 5 && parts[3] === "forecast" && parts[4] === "health") {
        const model = await repo.loadProject(projectId);
        if (!model)
            throw new http_js_1.HttpError(404, `Project ${projectId} not found`);
        const latest = await repo.loadLatestForecast(projectId);
        return (0, http_js_1.json)(await (0, health_js_1.projectHealth)(repo, model, latest));
    }
    if (request.method === "GET" && parts.length === 4 && parts[3] === "events") {
        const limit = Number(url.searchParams.get("limit") ?? "100");
        return (0, http_js_1.json)({ events: await repo.loadEvents(projectId, Number.isFinite(limit) ? limit : 100) });
    }
    if (request.method === "GET" && parts.length === 4 && parts[3] === "learning") {
        return (0, http_js_1.json)({ learning: await repo.loadLearningRecords(url.searchParams.get("subjectKey") ?? undefined) });
    }
    if (request.method === "POST" && parts.length === 5 && parts[3] === "understanding" && parts[4] === "preview") {
        const input = await (0, http_js_1.readJson)(request);
        if (input.projectId !== projectId)
            throw new http_js_1.HttpError(400, "Understanding proposal projectId does not match URL project ID");
        return (0, http_js_1.json)((0, understanding_js_1.validateUnderstandingProposal)(input));
    }
    if (request.method === "POST" && parts.length === 5 && parts[3] === "events" && parts[4] === "preview") {
        const event = await (0, http_js_1.readJson)(request);
        const result = await reviewedRun(repo, projectId, event);
        return (0, http_js_1.json)({
            projectRevision: result.model.revision,
            baselineVersion: result.baseline?.version ?? null,
            latestVersion: result.latest?.version ?? null,
            candidate: result.run.candidate,
            oversight: result.run.oversight,
            forecastable: result.run.forecastable,
            commitmentEligible: result.run.commitmentEligible,
            publishable: result.run.publishable,
            reviewToken: result.reviewToken,
            persisted: false,
            mode: env.HOWLER_MODE ?? "shadow",
        });
    }
    if (request.method === "POST" && parts.length === 5 && parts[3] === "events" && parts[4] === "publish") {
        if ((env.HOWLER_MODE ?? "shadow") !== "controlled") {
            throw new http_js_1.HttpError(403, "Publishing is disabled while HOWLER_MODE=shadow");
        }
        const body = await (0, http_js_1.readJson)(request);
        const result = await reviewedRun(repo, projectId, body.event);
        if (result.reviewToken !== body.reviewToken) {
            throw new http_js_1.HttpError(409, "Preview no longer matches the current project state. Re-preview before publishing.");
        }
        if (!result.run.publishable) {
            throw new http_js_1.HttpError(409, "Oversight blocked publication", result.run.oversight);
        }
        const published = (0, engine_js_1.publishForecast)(result.run);
        await repo.commitForecastTransition({
            expectedRevision: result.model.revision,
            modelAfterEvent: result.run.modelAfterEvent,
            event: body.event,
            candidate: result.run.candidate,
            oversight: result.run.oversight,
            published,
        });
        return (0, http_js_1.json)({ published, oversight: result.run.oversight }, 201);
    }
    throw new http_js_1.HttpError(404, "Not found");
}
exports.default = {
    async fetch(request, env) {
        const requestId = crypto.randomUUID();
        try {
            return await handle(request, env);
        }
        catch (error) {
            if (error instanceof http_js_1.HttpError)
                return (0, http_js_1.json)({ error: error.message, details: error.details }, error.status);
            if (error instanceof storage_js_1.RevisionConflictError)
                return (0, http_js_1.json)({ error: error.message, code: "REVISION_CONFLICT" }, 409);
            const message = error instanceof Error ? error.message : String(error);
            console.error(JSON.stringify({
                level: "error",
                service: "howler-scheduling-staging",
                requestId,
                method: request.method,
                path: new URL(request.url).pathname,
                message,
            }));
            return (0, http_js_1.json)({ error: "Internal server error", requestId }, 500);
        }
    },
};

};
__modules["src/worker/repository.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.D1HowlerRepository = void 0;
const storage_js_1 = require("../storage.js");
function parseJson(value, label) {
    try {
        return JSON.parse(value);
    }
    catch {
        throw new Error(`Invalid persisted JSON for ${label}`);
    }
}
class D1HowlerRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async projectExists(projectId) {
        const row = await this.db.prepare("SELECT project_id FROM projects WHERE project_id = ? LIMIT 1")
            .bind(projectId)
            .first();
        return Boolean(row?.project_id);
    }
    async createProject(model, initial, oversight) {
        if (model.eventLedger.length > 1 || model.revision !== model.eventLedger.length) {
            throw new Error("Seed project supports zero or one bootstrap evidence event and revision must match the ledger");
        }
        if (initial.projectId !== model.projectId || initial.modelRevision !== model.revision) {
            throw new Error("Initial forecast does not match seed project revision");
        }
        if (oversight.candidateSnapshotId !== initial.id) {
            throw new Error("Initial oversight review does not reference the initial forecast");
        }
        const now = initial.generatedAt;
        const baseModel = { ...model, revision: 0, eventLedger: [] };
        const statements = [
            this.db.prepare(`INSERT INTO projects (project_id, name, revision, current_model_json, updated_at)
        VALUES (?, ?, 0, ?, ?)`)
                .bind(model.projectId, model.name, JSON.stringify(baseModel), now),
        ];
        const bootstrap = model.eventLedger[0];
        if (bootstrap) {
            statements.push(this.db.prepare(`INSERT INTO project_events
        (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .bind(model.projectId, bootstrap.id, 0, 1, bootstrap.type, bootstrap.occurredAt, bootstrap.receivedAt, JSON.stringify(bootstrap), JSON.stringify(model)));
        }
        statements.push(
            this.db.prepare(`INSERT INTO forecast_snapshots
        (snapshot_id, project_id, model_revision, version, status, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .bind(initial.id, initial.projectId, initial.modelRevision, initial.version, initial.status, JSON.stringify(initial), initial.generatedAt),
            this.db.prepare(`INSERT INTO oversight_reviews
        (review_id, project_id, candidate_snapshot_id, decision, review_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
                .bind(oversight.id, oversight.projectId, oversight.candidateSnapshotId, oversight.decision, JSON.stringify(oversight), oversight.createdAt),
        );
        await this.db.batch(statements);
    }
    async loadProject(projectId) {
        const row = await this.db.prepare("SELECT project_id, revision, current_model_json FROM projects WHERE project_id = ? LIMIT 1")
            .bind(projectId)
            .first();
        if (!row)
            return undefined;
        const model = parseJson(row.current_model_json, `project ${projectId}`);
        if (model.revision !== row.revision)
            throw new Error(`Persisted project ${projectId} revision mismatch`);
        return model;
    }
    async loadLatestPublishedForecast(projectId) {
        const row = await this.db.prepare(`SELECT snapshot_json AS json FROM forecast_snapshots
      WHERE project_id = ? AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1`)
            .bind(projectId)
            .first();
        return row ? parseJson(row.json, `published forecast ${projectId}`) : undefined;
    }
    async loadLatestForecast(projectId) {
        const row = await this.db.prepare(`SELECT snapshot_json AS json FROM forecast_snapshots
      WHERE project_id = ? ORDER BY version DESC LIMIT 1`)
            .bind(projectId)
            .first();
        return row ? parseJson(row.json, `forecast ${projectId}`) : undefined;
    }
    async loadEvents(projectId, limit = 100) {
        const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
        const result = await this.db.prepare(`SELECT event_json AS json FROM project_events
      WHERE project_id = ? ORDER BY new_revision DESC LIMIT ?`)
            .bind(projectId, safeLimit)
            .all();
        return (result.results ?? []).map((r) => parseJson(r.json, `event ${projectId}`)).reverse();
    }
    async loadLearningRecords(subjectKey) {
        const stmt = subjectKey
            ? this.db.prepare("SELECT record_json AS json FROM learning_records WHERE subject_key = ? ORDER BY updated_at DESC").bind(subjectKey)
            : this.db.prepare("SELECT record_json AS json FROM learning_records ORDER BY updated_at DESC LIMIT 250");
        const result = await stmt.all();
        return (result.results ?? []).map((r) => parseJson(r.json, "learning record"));
    }
    async commitForecastTransition(transition) {
        const { expectedRevision, modelAfterEvent, event, candidate, oversight, published } = transition;
        if (!published || published.status !== "PUBLISHED")
            throw new Error("Production transition requires a published snapshot");
        if (modelAfterEvent.revision !== expectedRevision + 1)
            throw new Error("Transition revision increment is invalid");
        if (event.baseRevision !== expectedRevision)
            throw new Error("Event baseRevision does not match expectedRevision");
        if (candidate.id !== published.id || candidate.version !== published.version) {
            throw new Error("Published snapshot must be the reviewed candidate version");
        }
        if (oversight.candidateSnapshotId !== candidate.id)
            throw new Error("Oversight review does not reference candidate snapshot");
        const statements = [
            this.db.prepare(`INSERT INTO project_events
        (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .bind(event.projectId, event.id, event.baseRevision, modelAfterEvent.revision, event.type, event.occurredAt, event.receivedAt, JSON.stringify(event), JSON.stringify(modelAfterEvent)),
            this.db.prepare(`INSERT INTO forecast_snapshots
        (snapshot_id, project_id, model_revision, version, status, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?)`)
                .bind(published.id, published.projectId, published.modelRevision, published.version, JSON.stringify(published), published.generatedAt),
            this.db.prepare(`INSERT INTO oversight_reviews
        (review_id, project_id, candidate_snapshot_id, decision, review_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
                .bind(oversight.id, oversight.projectId, oversight.candidateSnapshotId, oversight.decision, JSON.stringify(oversight), oversight.createdAt),
        ];
        try {
            await this.db.batch(statements);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("HOWLER_REVISION_CONFLICT") || message.includes("UNIQUE constraint failed: project_events.project_id, project_events.new_revision")) {
                throw new storage_js_1.RevisionConflictError(`Project ${event.projectId} changed before this update could publish`);
            }
            throw error;
        }
    }
    async saveLearningRecord(record) {
        await this.db.prepare(`INSERT INTO learning_records
      (learning_id, layer, subject_key, hypothesis_type, record_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(learning_id) DO UPDATE SET
        layer = excluded.layer,
        subject_key = excluded.subject_key,
        hypothesis_type = excluded.hypothesis_type,
        record_json = excluded.record_json,
        updated_at = excluded.updated_at`)
            .bind(record.id, record.layer, record.subjectKey, record.hypothesisType, JSON.stringify(record), record.lastObservedAt)
            .run();
    }
    async savePredictionOutcome(outcome) {
        const snapshotRow = await this.db.prepare("SELECT project_id FROM forecast_snapshots WHERE snapshot_id = ? LIMIT 1")
            .bind(outcome.sourceSnapshotId)
            .first();
        if (!snapshotRow)
            throw new Error(`Unknown source snapshot ${outcome.sourceSnapshotId}`);
        await this.db.prepare(`INSERT INTO prediction_outcomes
      (prediction_id, project_id, activity_id, source_snapshot_id, horizon_days, point_error_workdays, range_hit, confidence, outcome_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(outcome.predictionId, snapshotRow.project_id, outcome.activityId, outcome.sourceSnapshotId, outcome.horizonDays, outcome.pointErrorWorkdays, outcome.rangeHit ? 1 : 0, outcome.confidenceAtPrediction, JSON.stringify(outcome), new Date().toISOString())
            .run();
    }
    async loadPredictionOutcomes(projectId) {
        const stmt = projectId
            ? this.db.prepare("SELECT outcome_json AS json FROM prediction_outcomes WHERE project_id = ? ORDER BY created_at DESC").bind(projectId)
            : this.db.prepare("SELECT outcome_json AS json FROM prediction_outcomes ORDER BY created_at DESC LIMIT 1000");
        const result = await stmt.all();
        return (result.results ?? []).map((r) => parseJson(r.json, "prediction outcome"));
    }
}
exports.D1HowlerRepository = D1HowlerRepository;

};
__modules["src/worker/understanding.js"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUnderstandingProposal = validateUnderstandingProposal;
function validateUnderstandingProposal(input) {
    const errors = [];
    const warnings = [];
    if (!input.eventId)
        errors.push("eventId is required");
    if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0)
        errors.push("baseRevision must be an integer >= 0");
    if (!input.projectId)
        errors.push("projectId is required");
    if (!Number.isFinite(Date.parse(input.occurredAt)))
        errors.push("occurredAt must be an ISO timestamp");
    if (!Number.isFinite(Date.parse(input.receivedAt)))
        errors.push("receivedAt must be an ISO timestamp");
    if (!input.sourceIds.length)
        warnings.push("No evidence source IDs were supplied; confidence should be low until evidence is attached");
    if (!input.mutations.length)
        warnings.push("Proposal contains no typed mutations; it will be audit-only and cannot alter the forecast");
    if ((input.eventType === "ACTUAL_START" || input.eventType === "ACTUAL_FINISH") && input.verification !== "VERIFIED_ACTUAL") {
        errors.push("Actual start/finish events require VERIFIED_ACTUAL verification");
    }
    if (input.causeVerification === "VERIFIED" && !input.causeCode)
        errors.push("Verified cause requires a causeCode");
    if (errors.length)
        return { valid: false, errors, warnings };
    const event = {
        id: input.eventId,
        baseRevision: input.baseRevision,
        projectId: input.projectId,
        type: input.eventType,
        occurredAt: input.occurredAt,
        receivedAt: input.receivedAt,
        sourceIds: input.sourceIds,
        verification: input.verification,
        impactSeedActivityIds: input.impactSeedActivityIds,
        mutations: input.mutations,
        payload: input.extractedFacts ?? {},
        ...(input.note ? { note: input.note } : {}),
        ...(input.causeCode ? { causeCode: input.causeCode } : {}),
        ...(input.causeVerification ? { causeVerification: input.causeVerification } : {}),
    };
    return { valid: true, errors, warnings, event };
}

};

const __cache = Object.create(null);
function __normalize(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}
function __resolve(from, specifier) {
  if (!specifier.startsWith('.')) throw new Error(`Unsupported external module: ${specifier}`);
  const base = from.slice(0, from.lastIndexOf('/') + 1);
  return __normalize(base + specifier);
}
function __require(id) {
  const cached = __cache[id];
  if (cached) return cached.exports;
  const factory = __modules[id];
  if (!factory) throw new Error(`Bundled module not found: ${id}`);
  const module = { exports: {} };
  __cache[id] = module;
  factory(module, module.exports, (specifier) => __require(__resolve(id, specifier)));
  return module.exports;
}
const __worker = __require('src/worker/index.js').default;
export default __worker;
