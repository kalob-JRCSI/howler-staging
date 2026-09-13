import { createFileRoute } from "@tanstack/react-router";
import { boardHrefFromHost } from "@/lib/howler/board-address";

async function handle({ request }: { request: Request }) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const url = boardHrefFromHost(host);
  return Response.json(
    {
      ok: Boolean(url),
      url,
      command: url ? `${url.replace(/\/$/, "")}/api/howler-command` : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const Route = createFileRoute("/api/howler-where")({
  server: { handlers: { GET: handle } },
});
