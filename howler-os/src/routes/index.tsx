import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/components/howler/dashboard-view";
import { useHowlerHydrated } from "@/components/howler/hydrate";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  useHowlerHydrated();
  return <DashboardView />;
}
