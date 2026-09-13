import { createFileRoute } from "@tanstack/react-router";
import { useHowlerHydrated } from "@/components/howler/hydrate";
import { ProjectShell } from "@/components/howler/project-shell";

export const Route = createFileRoute("/projects/$projectId/$moduleId")({
  component: ProjectModule,
});

function ProjectModule() {
  const { projectId, moduleId } = Route.useParams();
  useHowlerHydrated();
  return <ProjectShell projectId={projectId} moduleId={moduleId} />;
}
