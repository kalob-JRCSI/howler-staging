import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/howler-mic")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
