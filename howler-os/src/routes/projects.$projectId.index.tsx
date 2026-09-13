import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/$moduleId",
      params: { projectId: params.projectId, moduleId: "overview" },
    });
  },
  component: () => null,
});
