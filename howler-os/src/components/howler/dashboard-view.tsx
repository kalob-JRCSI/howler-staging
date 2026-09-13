import { Link } from "@tanstack/react-router";
import {
  cardGlance,
  contractDates,
  heldPhasesOf,
} from "@/lib/howler/derive";
import { Atmosphere, BoardAddress, HowlerLockup, IphoneActionSetup } from "./chrome";
import { KF_SOURCE } from "@/lib/howler/kf-portfolio";
import { useHowlerStore } from "@/lib/howler/store";
import type { HealthBand, Project } from "@/lib/howler/types";
import { DriveLibrary } from "./drive-library";
import { HowlerMic } from "./howler-ear";
import { Stat, StatusChip } from "./primitives";
import { TellHowler } from "./tell-howler";

const BAND_TONE: Record<HealthBand, "ok" | "warn" | "danger"> = {
  GREEN: "ok",
  YELLOW: "warn",
  RED: "danger",
};

function sortPortfolio(projects: Project[]) {
  const rank = (project: Project) =>
    project.healthBand === "RED" ? 0 : project.paused ? 1 : project.healthBand === "YELLOW" ? 2 : 3;
  return [...projects].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function DashboardView() {
  const projectsMap = useHowlerStore((state) => state.projects);
  const restoreSeed = useHowlerStore((state) => state.restoreSeed);
  const projects = sortPortfolio(Object.values(projectsMap));
  const redJobs = projects.filter((project) => project.healthBand === "RED");
  const yellow = projects.filter((project) => project.healthBand === "YELLOW").length;
  const green = projects.filter((project) => project.healthBand === "GREEN").length;
  const redHint = redJobs[0]
    ? `${redJobs[0].name} — ${redJobs[0].dashboardNote?.split(/[.\n]/)[0]?.slice(0, 72) || "needs attention"}`
    : undefined;

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <HowlerLockup />
        <div className="flex flex-wrap items-center gap-3">
          <HowlerMic />
        </div>
      </header>

      <Atmosphere
        greeting="KF Live"
        command="Eight jobs."
        statement="This board is Howler. Grok is the workshop we build it in."
      />

      <BoardAddress />

      <div className="mt-6">
        <TellHowler compact />
      </div>

      <div className="howler-metrics mt-6">
        <Stat label="Active" value={String(projects.length)} />
        <Stat label="Green" value={String(green)} />
        <Stat label="Yellow" value={String(yellow)} />
        <Stat label="Red" value={String(redJobs.length)} hint={redHint} />
      </div>
      <p className="howler-desk-only mt-3 text-[11px] text-subtle">{KF_SOURCE}</p>

      <p className="mt-8 text-[11px] uppercase tracking-[0.16em] text-subtle">Index cards</p>
      <h2 className="mt-1 font-display text-[22px] font-normal">Live portfolio</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {projects.map((project) => {
          const held = heldPhasesOf(project);
          const calendar = contractDates(project);
          const glance = cardGlance(project);
          return (
            <Link
              key={project.id}
              to="/projects/$projectId/$moduleId"
              params={{ projectId: project.id, moduleId: "overview" }}
              className="block rounded-lg bg-surface p-4 shadow-[var(--shadow-border)] transition-[box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-smooth)] hover:shadow-[var(--shadow-border-hover)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                  {project.clientName}
                  {project.address !== "Unknown" ? ` · ${project.address}` : ""}
                </p>
                <StatusChip tone={BAND_TONE[project.healthBand]}>{project.healthBand}</StatusChip>
                {project.paused ? <StatusChip tone="warn">Paused</StatusChip> : null}
                {!project.paused && held.length
                  ? held.map((phase) => (
                      <StatusChip key={phase} tone="warn">
                        {phase} held
                      </StatusChip>
                    ))
                  : null}
                <span className="ml-auto font-mono text-[12px] text-muted">{glance.progress}%</span>
              </div>
              <h3 className="mt-1 font-display text-xl font-normal">{project.name}</h3>
              <p className="mt-2 text-sm text-fg">{glance.now}</p>

              <div className="howler-card-block">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Next 14 days</p>
                {glance.window.length ? (
                  <ul className="howler-card-list">
                    {glance.window.map((item) => (
                      <li key={item.id}>
                        <span className="font-mono text-[12px] text-accent">{item.when}</span>
                        <span>{item.name}</span>
                        <span className="text-subtle">{item.mark}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted">{glance.windowHint}</p>
                )}
              </div>

              <div className="howler-card-block howler-card-solve">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Next call to action</p>
                <ol className="howler-card-solve-list">
                  {glance.solve.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>

              <div className="howler-card-dates">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Official start</p>
                  <p className={`mt-1 font-mono text-[13px] ${calendar.startKnown ? "text-fg" : "text-muted"}`}>
                    {calendar.officialStart}
                  </p>
                </div>
                <div className="howler-card-finish">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Intended finish</p>
                  <p className={`mt-1 font-mono text-[13px] ${calendar.finishKnown ? "text-fg" : "text-muted"}`}>
                    {calendar.intendedFinish}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <IphoneActionSetup />
      <div className="howler-desk-only">
        <DriveLibrary />
      </div>

      <p className="howler-desk-only mt-6 text-[11px] text-subtle">
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => {
            if (window.confirm("This reloads the KF seed and wipes live updates on this Howler. Continue?")) {
              restoreSeed();
            }
          }}
        >
          Reload KF seed
        </button>
        <span className="text-muted"> — wipes live updates.</span>
      </p>
    </div>
  );
}
