import { useState } from "react";
import { Button } from "@/components/ui/button";
import { financialSummary } from "@/lib/howler/derive";
import {
  LIFECYCLE,
  previewCoLifecycle,
  previewCreateChangeOrder,
  previewPatchChangeOrder,
} from "@/lib/howler/engine";
import { formatMoney, parseMoneyDecimal } from "@/lib/howler/money";
import { useHowlerStore } from "@/lib/howler/store";
import { annotatePreview, livesIn } from "@/lib/howler/ripple";
import type { ChangeOrder, CommandPreview, Project } from "@/lib/howler/types";
import { PreviewConfirm } from "./preview-confirm";
import { Empty, Expandable, Field, inputClass, Panel, Stat, StatusChip } from "./primitives";


const STATUS_TONE: Record<ChangeOrder["status"], "ok" | "warn" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  PROPOSED: "warn",
  PENDING_APPROVAL: "warn",
  APPROVED: "ok",
  REJECTED: "danger",
  VOID: "neutral",
};

const NEXT_ACTION: Partial<Record<ChangeOrder["status"], keyof typeof LIFECYCLE>> = {
  DRAFT: "PROPOSE",
  PROPOSED: "SUBMIT_FOR_APPROVAL",
  PENDING_APPROVAL: "APPROVE",
};

export function ChangeOrdersModule({ project }: { project: Project }) {
  const applyPreview = useHowlerStore((state) => state.applyPreview);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const summary = financialSummary(project);
  const fin = project.financials;

  if (!fin) {
    return (
      <Panel>
        <h3 className="font-display text-xl">Change Orders</h3>
        <Empty>Initialize Budget before recording Change Orders.</Empty>
      </Panel>
    );
  }

  const show = (next: CommandPreview) => setPreview(annotatePreview(project, next));
  const orders = Object.values(fin.changeOrders);
  const currency = fin.currency;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel>
          <Stat label="Original" value={formatMoney(summary?.baseline ?? null)} />
        </Panel>
        <Panel>
          <Stat
            label="Revised (approved only)"
            value={formatMoney(summary?.revisedBudget ?? null)}
          />
        </Panel>
        <Panel>
          <Stat
            label="Pending exposure"
            value={formatMoney(summary?.pendingChangeOrderTotal ?? null)}
            hint="Never added into revised budget"
          />
        </Panel>
      </div>



      {orders.length === 0 ? <Empty>No change orders yet.</Empty> : null}
      {orders.map((co) => (
        <Expandable
          key={co.id}
          open={openId === co.id}
          onToggle={() => setOpenId(openId === co.id ? null : co.id)}
          title={
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted">{co.number}</p>
              <p className="font-medium">{co.title}</p>
              <StatusChip tone={STATUS_TONE[co.status]}>{co.status.replaceAll("_", " ")}</StatusChip>
            </div>
          }
          meta={
            <p className="mt-1 text-xs text-muted">
              {formatMoney(co.cost)}
              {co.declaredScheduleDays != null ? ` · +${co.declaredScheduleDays} days declared` : ""}
              {livesIn(project, "co", co.id).length
                ? ` · ${livesIn(project, "co", co.id).join(" · ")}`
                : ""}
            </p>
          }
        >
          <p className="mb-3 text-sm text-muted">{co.description}</p>
          {co.declaredScheduleDays ? (
            <p className="mb-3 text-xs text-subtle">
              Declared +{co.declaredScheduleDays} days does not rewrite Schedule. Use the
              Schedule module for date changes.
            </p>
          ) : null}
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const cost = parseMoneyDecimal(String(data.get("cost") ?? ""), currency);
              const daysRaw = String(data.get("declaredScheduleDays") ?? "");
              try {
                const next = previewPatchChangeOrder(co.id, {
                  title: String(data.get("title")),
                  description: String(data.get("description")),
                  reason: String(data.get("reason")),
                  notes: String(data.get("notes") || "") || null,
                  cost: cost ?? co.cost,
                  declaredScheduleDays: daysRaw === "" ? null : Number(daysRaw),
                  scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean),
                });
                if (next.clerical) applyPreview(project.id, next);
                else show(next);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Could not update.");
              }
            }}
          >
            <Field label="Title">
              <input name="title" className={inputClass} defaultValue={co.title} />
            </Field>
            <Field label="Cost">
              <input
                name="cost"
                className={inputClass}
                defaultValue={(co.cost.amountMinor / 100).toFixed(2)}
              />
            </Field>
            <Field label="Description">
              <input
                name="description"
                className={inputClass}
                defaultValue={co.description}
              />
            </Field>
            <Field label="Reason">
              <input name="reason" className={inputClass} defaultValue={co.reason} />
            </Field>
            <Field label="Declared schedule days">
              <input
                name="declaredScheduleDays"
                className={inputClass}
                defaultValue={co.declaredScheduleDays ?? ""}
              />
            </Field>
            <Field label="Scope">
              <select
                name="scopeItemIds"
                multiple
                className={`${inputClass} min-h-24 py-2`}
                defaultValue={co.scopeItemIds}
              >
                {Object.values(project.scopeItems).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.description}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit">Review edit</Button>
              {NEXT_ACTION[co.status] ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    show(
                      previewCoLifecycle(co.id, NEXT_ACTION[co.status] as keyof typeof LIFECYCLE),
                    )
                  }
                >
                  {LIFECYCLE[NEXT_ACTION[co.status]!].label}
                </Button>
              ) : null}
              {co.status === "PENDING_APPROVAL" || co.status === "PROPOSED" || co.status === "DRAFT" ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => show(previewCoLifecycle(co.id, "REJECT"))}
                >
                  Reject
                </Button>
              ) : null}
              {co.status !== "VOID" ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => show(previewCoLifecycle(co.id, "VOID"))}
                >
                  Void
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => show(previewCoLifecycle(co.id, "REOPEN"))}
                >
                  Reopen
                </Button>
              )}
            </div>
          </form>
        </Expandable>
      ))}

      <Panel>
        <h3 className="font-display text-xl">New Change Order</h3>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const cost =
              parseMoneyDecimal(String(data.get("cost") ?? ""), currency) ?? {
                amountMinor: 0,
                currency,
              };
            const daysRaw = String(data.get("declaredScheduleDays") ?? "");
            show(
              previewCreateChangeOrder({
                title: String(data.get("title")),
                description: String(data.get("description")),
                reason: String(data.get("reason") || "PM-reported"),
                cost,
                declaredScheduleDays: daysRaw === "" ? null : Number(daysRaw),
                scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean),
                activityIds: data.getAll("activityIds").map(String).filter(Boolean),
                budgetLineId: String(data.get("budgetLineId") || "") || null,
              }),
            );
          }}
        >
          <Field label="Title">
            <input name="title" className={inputClass} required />
          </Field>
          <Field label="Cost">
            <input name="cost" className={inputClass} placeholder="0.00 if unpriced" />
          </Field>
          <Field label="Description">
            <input name="description" className={inputClass} required />
          </Field>
          <Field label="Reason">
            <input name="reason" className={inputClass} />
          </Field>
          <Field label="Declared +days">
            <input name="declaredScheduleDays" className={inputClass} />
          </Field>
          <Field label="Allocate to budget line">
            <select name="budgetLineId" className={inputClass}>
              <option value="">Unallocated</option>
              {Object.values(fin.lines)
                .filter((line) => line.active)
                .map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.description}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Scope">
            <select name="scopeItemIds" multiple className={`${inputClass} min-h-24 py-2`}>
              {Object.values(project.scopeItems).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.description}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Button variant="primary" type="submit">
              Review draft
            </Button>
          </div>
        </form>
      </Panel>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {preview ? (
        <PreviewConfirm
          preview={preview}
          onConfirm={() => {
            try {
              applyPreview(project.id, preview);
              setPreview(null);
              setError(null);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Apply failed.");
            }
          }}
          onCancel={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
