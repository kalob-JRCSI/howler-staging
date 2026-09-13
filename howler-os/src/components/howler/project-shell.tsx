import { Link } from "@tanstack/react-router";
import {
  financialSummary,
  integrity,
  nextMovement,
  progressPercent,
  heldPhasesOf,
} from "@/lib/howler/derive";
import { formatMoney } from "@/lib/howler/money";
import { useProject } from "@/lib/howler/store";
import { ActivityModule } from "./activity-module";
import { BudgetModule } from "./budget-module";
import { ChangeOrdersModule } from "./change-orders-module";
import { OverviewModule } from "./overview-module";
import { PlansModule } from "./plans-module";
import { ScheduleModule } from "./schedule-module";
import { ScopeModule } from "./scope-module";
import { DocumentsModule } from "./documents-module";
import { Empty, StatusChip } from "./primitives";
import { TellHowler } from "./tell-howler";
import { HowlerMic } from "./howler-ear";
import {
  InspectionsModule,
  MaterialsModule,
  PhotosModule,
  SelectionsModule,
  TradesModule,
} from "./job-modules";
import { AppFrame, HowlerLockup } from "./chrome";

const MODULES = [
  { id: "overview", label: "Overview" },
  { id: "schedule", label: "Schedule" },
  { id: "scope", label: "Scope" },
  { id: "plans", label: "Plans" },
  { id: "photos", label: "Photos" },
  { id: "budget", label: "Budget" },
  { id: "documents", label: "Documents" },
  { id: "change-orders", label: "COs" },
  { id: "selections", label: "Selections" },
  { id: "trades", label: "Trades" },
  { id: "materials", label: "Materials" },
  { id: "inspections", label: "Inspections" },
  { id: "activity", label: "History" },
] as const;

export function ProjectShell({
  projectId,
  moduleId,
}: {
  projectId: string;
  moduleId: string;
}) {
  const project = useProject(projectId);
  if (!project) {
    return (
      <div className="howler-main">
        <HowlerLockup />
        <Empty>
          Could not load this project.{" "}
          <Link to="/" className="text-accent">
            Return to portfolio
          </Link>
          .
        </Empty>
      </div>
    );
  }

  const health = integrity(project);
  const summary = financialSummary(project);
  const active = MODULES.some((module) => module.id === moduleId)
    ? moduleId
    : "overview";

  return (
    <AppFrame
      rail={
        <>
          <HowlerLockup />
          <div className="howler-rail-meta min-w-0">
            <p className="truncate text-[11px] uppercase tracking-[0.14em] text-subtle">
              {project.clientName}
            </p>
            <p className="mt-1 truncate font-display text-lg leading-tight">{project.name}</p>
          </div>
          <nav className="flex min-w-0 flex-1 flex-col gap-0.5">
            {MODULES.map((module) => (
              <Link
                key={module.id}
                to="/projects/$projectId/$moduleId"
                params={{ projectId, moduleId: module.id }}
                className="howler-rail-link"
                data-active={module.id === active}
              >
                {module.label}
              </Link>
            ))}
          </nav>
          <div className="howler-rail-meta mt-auto space-y-2 border-t border-border pt-3 text-[11px] text-muted">
            <p>
              Integrity {health.score}
              <span className="text-subtle"> / 100</span>
            </p>
            <p>Progress {progressPercent(project)}%</p>
            <p className="font-mono text-fg">
              {summary ? formatMoney(summary.revisedBudget) : "Unknown"}
            </p>
            <p className="text-subtle">Rev {project.revision}</p>
          </div>
        </>
      }
    >
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">
            {project.clientName} · {project.address}
          </p>
          <h1 className="mt-1 font-display text-[32px] font-normal leading-none tracking-[-0.03em]">
            {project.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{project.projectType}</p>
          {heldPhasesOf(project).length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {heldPhasesOf(project).map((phase) => (
                <StatusChip key={phase} tone="warn">
                  {phase} held
                </StatusChip>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <HowlerMic />
          <p className="text-xs text-muted">Next: {nextMovement(project)}</p>
        </div>
      </header>

      <div className="mb-6">
        <TellHowler project={project} compact />
      </div>

      {active === "overview" ? <OverviewModule project={project} /> : null}
      {active === "schedule" ? <ScheduleModule project={project} /> : null}
      {active === "scope" ? <ScopeModule project={project} /> : null}
      {active === "plans" ? <PlansModule project={project} /> : null}
      {active === "budget" ? <BudgetModule project={project} /> : null}
      {active === "change-orders" ? <ChangeOrdersModule project={project} /> : null}
      {active === "activity" ? <ActivityModule project={project} /> : null}
      {active === "documents" ? <DocumentsModule project={project} /> : null}
      {active === "photos" ? <PhotosModule project={project} /> : null}
      {active === "selections" ? <SelectionsModule project={project} /> : null}
      {active === "trades" ? <TradesModule project={project} /> : null}
      {active === "materials" ? <MaterialsModule project={project} /> : null}
      {active === "inspections" ? <InspectionsModule project={project} /> : null}
    </AppFrame>
  );
}
