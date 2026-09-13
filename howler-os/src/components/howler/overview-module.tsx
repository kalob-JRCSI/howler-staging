import { Link } from "@tanstack/react-router";
import {
  computeFindings,
  contractDates,
  financialSummary,
  findingNextAction,
  forecastActivity,
  jobBrief,
  priorityActions,
  progressPercent,
  scopeStatus,
} from "@/lib/howler/derive";
import { plansStatusLine } from "@/lib/howler/ky-code";
import { formatMoney } from "@/lib/howler/money";
import { liveFacts } from "@/lib/howler/ripple";
import { ensureJob } from "@/lib/howler/job";
import type { Project } from "@/lib/howler/types";
import { Empty, Panel, Stat, StatusChip } from "./primitives";
import { DocsWizard } from "./docs-wizard";

export function OverviewModule({ project }: { project: Project }) {
  const summary = financialSummary(project);
  const findings = computeFindings(project);
  const actions = priorityActions(project);
  const facts = liveFacts(project);
  const job = ensureJob(project);
  const included = Object.values(project.scopeItems).filter((item) => item.included);
  const complete = included.filter((item) => item.complete).length;
  const brief = jobBrief(project);

  return (
    <div className="space-y-5">
      <Panel>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">Project status</p>
        <p className="mt-2 text-lg leading-snug">{brief.now}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Last week</p>
            {brief.last.length ? (
              <ul className="mt-2 space-y-2">
                {brief.last.map((item) => (
                  <li key={`${item.when}-${item.text.slice(0, 24)}`} className="text-sm">
                    <span className="font-mono text-[12px] text-accent">{item.when}</span>
                    <span className="mt-0.5 block text-muted">{item.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No field updates recorded in the last seven days.</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Next call to action</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
              {brief.next.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      </Panel>
      <div className="howler-card-dates rounded-lg bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Official start</p>
          <p className={`mt-1 font-mono text-[15px] ${contractDates(project).startKnown ? "text-fg" : "text-muted"}`}>
            {contractDates(project).officialStart}
          </p>
          {contractDates(project).startKnown ? null : (
            <p className="mt-1 text-xs text-subtle">Not on the contract record</p>
          )}
        </div>
        <div className="howler-card-finish">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Intended finish</p>
          <p className={`mt-1 font-mono text-[15px] ${contractDates(project).finishKnown ? "text-fg" : "text-muted"}`}>
            {contractDates(project).intendedFinish}
          </p>
          {contractDates(project).finishKnown ? null : (
            <p className="mt-1 text-xs text-subtle">A trade target is not this date</p>
          )}
        </div>
      </div>
      <div className="howler-metrics">
        <Stat
          label="Original budget"
          value={summary ? formatMoney(summary.baseline) : "Unknown"}
        />
        <Stat
          label="Approved changes"
          value={summary ? formatMoney(summary.approvedChangeOrderTotal) : "Unknown"}
        />
        <Stat
          label="Revised budget"
          value={summary ? formatMoney(summary.revisedBudget) : "Unknown"}
          hint={
            summary
              ? `Pending exposure ${formatMoney(summary.pendingChangeOrderTotal)}`
              : "Budget not initialized"
          }
        />
        <Stat
          label="Committed / actual"
          value={
            summary
              ? `${formatMoney(summary.committedTotal)} / ${formatMoney(summary.actualTotal)}`
              : "Unknown"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="font-display text-xl">Priority actions</h3>
          <ul className="mt-4 space-y-3">
            {actions.length === 0 ? <Empty>No priority actions identified.</Empty> : null}
            {actions.map((action) => (
              <li key={action.id} className="border-b border-border pb-3 last:border-0">
                <StatusChip tone={action.priority === "CRITICAL" ? "danger" : "warn"}>
                  {action.priority}
                </StatusChip>
                <p className="mt-1 text-sm">{action.action}</p>
                {action.requiredBy ? (
                  <p className="mt-1 text-xs text-muted">Required by {action.requiredBy}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h3 className="font-display text-xl">Live facts</h3>
          <p className="mt-1 text-sm text-muted">
            One index. A change in the command bar is supposed to land here
            everywhere it belongs — not only in the module you were looking at.
          </p>
          <ul className="mt-4">
            {facts.map((fact) => (
              <li key={fact.id} className="grid grid-cols-[88px_1fr] gap-2 border-b border-border py-2 last:border-0 sm:grid-cols-[110px_1fr]">
                <Link
                  to="/projects/$projectId/$moduleId"
                  params={{ projectId: project.id, moduleId: fact.moduleId }}
                  className="text-[11px] uppercase tracking-[0.08em] text-subtle hover:text-fg"
                >
                  {fact.ledger}
                </Link>
                <div>
                  <StatusChip tone={fact.tone}>{fact.label}</StatusChip>
                  <p className="mt-1 text-sm">{fact.value}</p>
                </div>
              </li>
            ))}
          </ul>
          {findings.length ? (
            <p className="mt-3 text-xs text-muted">
              {findings[0]?.message} {findingNextAction(findings[0]!)}
            </p>
          ) : null}
        </Panel>
      </div>

      <DocsWizard project={project} />

      <Panel>
        <h3 className="font-display text-xl">Contracted scope</h3>
        <p className="mt-1 text-sm text-muted">
          Progress is released contracted scope. Complete counts full, in-progress closeout counts half, held interior is excluded. {complete} of {included.length} marked complete · {progressPercent(project)}%.
        </p>
        <ul className="mt-4 space-y-2">
          {included.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-sm last:border-0">
              <span>
                {item.description}
                {item.trade ? <span className="text-muted"> · {item.trade}</span> : null}
              </span>
              <StatusChip tone={scopeStatus(project, item).tone}>{scopeStatus(project, item).label}</StatusChip>
            </li>
          ))}
        </ul>
      </Panel>

      {job.rules.length ? (
        <Panel>
          <h3 className="font-display text-xl">Job rules</h3>
          <p className="mt-1 text-sm text-muted">Copied from this job's Scope of Work and Rules. Drive original not deleted.</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
            {job.rules.map((rule) => (
              <li key={rule.slice(0, 40)}>{rule}</li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <Panel>
        <h3 className="font-display text-xl">Plans</h3>
        <p className="mt-2 text-sm">{plansStatusLine(project)}</p>
        <p className="mt-2 text-xs text-muted">
          Working drawings, not a sealed set. Source PDFs from Drive are on{" "}
          <Link
            className="text-accent"
            to="/projects/$projectId/$moduleId"
            params={{ projectId: project.id, moduleId: "documents" }}
          >
            Documents
          </Link>
          .{" "}
          <Link
            className="text-accent"
            to="/projects/$projectId/$moduleId"
            params={{ projectId: project.id, moduleId: "plans" }}
          >
            Open Plans
          </Link>
        </p>
      </Panel>

      <Panel>
        <h3 className="font-display text-xl">Live path</h3>
        <ol className="mt-4 space-y-2">
          {Object.values(project.activities).map((activity) => {
            const forecast = forecastActivity(project, activity);
            return (
              <li key={activity.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  {activity.name}{" "}
                  <span className="text-muted">
                    · {activity.state.replace("_", " ").toLowerCase()}
                  </span>
                </span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {forecast.start ?? "—"} → {forecast.finish ?? "—"}
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}
