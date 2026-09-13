import { createFileRoute, Link } from "@tanstack/react-router";
import { DrawingSessionPage } from "@/components/howler/drawing-session";

export const Route = createFileRoute("/draw/$token")({
  component: DrawRoute,
});

function DrawRoute() {
  const { token } = Route.useParams();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(token)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <p className="font-display text-2xl">This drawing link is not valid.</p>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-sm text-accent">
          Leave
        </Link>
      </div>
    );
  }
  return <DrawingSessionPage token={token} />;
}
