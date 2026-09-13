import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  computeFindings,
  financialSummary,
  lineActual,
  lineCommitted,
  lineRevised,
} from "@/lib/howler/derive";
import {
  previewAddActual,
  previewAddCategory,
  previewAddCommitment,
  previewAddLine,
  previewInitialize,
  previewPatchLine,
  previewSetBaseline,
} from "@/lib/howler/engine";
import { formatMoney, parseMoneyDecimal } from "@/lib/howler/money";
import { placeLine } from "@/lib/howler/learn";
import { useHowlerStore } from "@/lib/howler/store";
import type { CommandPreview, Project } from "@/lib/howler/types";
import { PreviewConfirm } from "./preview-confirm";
import { Empty, Expandable, Field, inputClass, Panel, Stat, StatusChip } from "./primitives";


function runOrPreview(
  projectId: string,
  preview: CommandPreview,
  applyPreview: (projectId: string, preview: CommandPreview) => void,
  setPreview: (preview: CommandPreview | null) => void,
) {
  if (preview.clerical) applyPreview(projectId, preview);
  else setPreview(preview);
}

export function BudgetModule({ project }: { project: Project }) {
  const applyPreview = useHowlerStore((state) => state.applyPreview);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const summary = financialSummary(project);
  const findings = computeFindings(project);
  const fin = project.financials;

  if (!fin) {
    return (
      <div className="space-y-5">
        <Panel>
          <h3 className="font-display text-xl">Budget</h3>
          <p className="mt-2 text-sm text-muted">
            Financials are not initialized. That is Unknown, not $0.
          </p>
          <Button
            className="mt-4"
            variant="primary"
            onClick={() =>
              setPreview(previewInitialize("USD"))
            }
          >
            Initialize financials
          </Button>
          {preview ? (
            <PreviewConfirm
              preview={preview}
              onConfirm={() => {
                applyPreview(project.id, preview);
                setPreview(null);
              }}
              onCancel={() => setPreview(null)}
            />
          ) : null}
        </Panel>
      </div>
    );
  }

  const categories = Object.values(fin.categories)
    .filter((category) => category.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const lines = Object.values(fin.lines).filter((line) => line.active);
  const currency = fin.currency;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel>
          <Stat label="Original" value={formatMoney(summary?.baseline ?? null)} />
        </Panel>
        <Panel>
          <Stat
            label="Approved changes"
            value={formatMoney(summary?.approvedChangeOrderTotal ?? null)}
          />
        </Panel>
        <Panel>
          <Stat
            label="Revised"
            value={formatMoney(summary?.revisedBudget ?? null)}
            hint={`Pending ${formatMoney(summary?.pendingChangeOrderTotal ?? null)} stays out`}
          />
        </Panel>
        <Panel>
          <Stat
            label="Committed / actual"
            value={`${formatMoney(summary?.committedTotal ?? null)} / ${formatMoney(summary?.actualTotal ?? null)}`}
            hint={`Remaining ${formatMoney(summary?.remaining ?? null)}`}
          />
        </Panel>
      </div>

      {findings.length > 0 ? (
        <Panel>
          <h3 className="font-display text-xl">Findings</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {findings.map((finding) => (
              <li key={`${finding.kind}-${finding.budgetLineId}-${finding.scopeItemId}-${finding.changeOrderId}`}>
                {finding.message}
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Empty>No financial findings on this revision.</Empty>
      )}



      <Panel>
        <h3 className="font-display text-xl">Original budget</h3>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = parseMoneyDecimal(
              String(new FormData(event.currentTarget).get("baseline") ?? ""),
              currency,
            );
            if (!amount) {
              setError("Enter a valid amount with at most two decimals.");
              return;
            }
            setError(null);
            setPreview(previewSetBaseline(amount));
          }}
        >
          <Field label={`Amount (${currency})`}>
            <input name="baseline" className={inputClass} placeholder="400000.00" />
          </Field>
          <Button variant="primary" type="submit">
            Review
          </Button>
        </form>
      </Panel>

      <Panel>
        <h3 className="font-display text-xl">Categories</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <li
              key={category.id}
              className="rounded-sm bg-surface-2 px-3 py-2 text-sm text-muted"
            >
              {category.name}
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
            if (!name) return;
            applyPreview(project.id, previewAddCategory(name));
            event.currentTarget.reset();
          }}
        >
          <Field label="New category">
            <input name="name" className={inputClass} required />
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Panel>

      <Panel>
        <h3 className="font-display text-xl">Lines</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="py-2">Line</th>
                <th>Lives in</th>
                <th>Baseline</th>
                <th>Revised</th>
                <th>Committed</th>
                <th>Actual</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const category = fin.categories[line.categoryId];
                const place = placeLine(project, line);
                return (
                  <tr key={line.id} className="border-t border-border align-top">
                    <td className="py-3">
                      {line.description}{" "}
                      {line.isAllowance ? (
                        <StatusChip tone="warn">Allowance</StatusChip>
                      ) : null}
                      <p className="text-xs text-muted">
                        {category?.name}
                        {line.costCode ? ` · ${line.costCode}` : ""}
                      </p>
                    </td>
                    <td className="py-3 text-xs text-muted">
                      {[place.trade, place.vendor, place.activityName].filter(Boolean).join(" · ") || "Unplaced"}
                      {place.conflict ? (
                        <p className="mt-1 text-warn">{place.conflict}</p>
                      ) : null}
                    </td>
                    <td className="py-3 font-mono tabular-nums">
                      {formatMoney(line.baselineAmount)}
                    </td>
                    <td className="py-3 font-mono tabular-nums">
                      {formatMoney(lineRevised(project, line.id))}
                    </td>
                    <td className="py-3 font-mono tabular-nums">
                      {formatMoney(lineCommitted(project, line.id))}
                    </td>
                    <td className="py-3 font-mono tabular-nums">
                      {formatMoney(lineActual(project, line.id))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {lines.map((line) => (
          <div key={`edit-${line.id}`} className="mt-4">
            <Expandable
              open={openLineId === line.id}
              onToggle={() => setOpenLineId(openLineId === line.id ? null : line.id)}
              title={
                <p className="font-medium">
                  {line.description}{" "}
                  {line.isAllowance ? <StatusChip tone="warn">Allowance</StatusChip> : null}
                </p>
              }
              meta={
                <p className="mt-1 text-xs text-muted">
                  {formatMoney(line.baselineAmount)} baseline · edit to change description,
                  amount, scope, trade, or notes
                </p>
              }
            >
              <form
                className="grid gap-3 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const baseline = parseMoneyDecimal(String(data.get("baseline") ?? ""), currency);
                  const next = previewPatchLine(line.id, {
                    description: String(data.get("description")),
                    notes: String(data.get("notes") || "") || null,
                    trade: String(data.get("trade") || "") || null,
                    costCode: String(data.get("costCode") || "") || null,
                    vendorRef: String(data.get("vendorRef") || "") || null,
                    categoryId: String(data.get("categoryId")),
                    isAllowance: data.get("isAllowance") === "on",
                    baselineAmount: String(data.get("baseline") || "") === "" ? null : baseline,
                    scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean),
                  });
                  runOrPreview(project.id, next, applyPreview, setPreview);
                }}
              >
                <Field label="Description">
                  <input
                    name="description"
                    className={inputClass}
                    defaultValue={line.description}
                    required
                  />
                </Field>
                <Field label="Baseline amount">
                  <input
                    name="baseline"
                    className={inputClass}
                    defaultValue={
                      line.baselineAmount
                        ? (line.baselineAmount.amountMinor / 100).toFixed(2)
                        : ""
                    }
                    placeholder="Unknown if blank"
                  />
                </Field>
                <Field label="Category">
                  <select
                    name="categoryId"
                    className={inputClass}
                    defaultValue={line.categoryId}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Trade">
                  <input name="trade" className={inputClass} defaultValue={line.trade ?? ""} />
                </Field>
                <Field label="Cost code">
                  <input
                    name="costCode"
                    className={inputClass}
                    defaultValue={line.costCode ?? ""}
                  />
                </Field>
                <Field label="Vendor">
                  <input
                    name="vendorRef"
                    className={inputClass}
                    defaultValue={line.vendorRef ?? ""}
                  />
                </Field>
                <Field label="Associated scope">
                  <select
                    name="scopeItemIds"
                    multiple
                    className={`${inputClass} min-h-24 py-2`}
                    defaultValue={line.scopeItemIds}
                  >
                    {Object.values(project.scopeItems)
                      .filter((item) => item.included)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.description}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Notes">
                  <input name="notes" className={inputClass} defaultValue={line.notes ?? ""} />
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                  <input type="checkbox" name="isAllowance" defaultChecked={line.isAllowance} />
                  Allowance
                </label>
                <div className="flex gap-2">
                  <Button type="submit">Review</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setPreview(previewPatchLine(line.id, { active: false }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </form>
            </Expandable>
          </div>
        ))}

        <form
          className="mt-6 grid gap-3 border-t border-border pt-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const amount = parseMoneyDecimal(String(data.get("baseline") ?? ""), currency);
            const next = previewAddLine({
              categoryId: String(data.get("categoryId")),
              description: String(data.get("description")),
              baselineAmount: String(data.get("baseline") || "") === "" ? null : amount,
              isAllowance: data.get("isAllowance") === "on",
              trade: String(data.get("trade") || "") || undefined,
              scopeItemIds: data.getAll("scopeItemIds").map(String).filter(Boolean),
            });
            runOrPreview(project.id, next, applyPreview, setPreview);
            event.currentTarget.reset();
          }}
        >
          <h4 className="md:col-span-2 text-sm font-medium">Add line</h4>
          <Field label="Description">
            <input name="description" className={inputClass} required />
          </Field>
          <Field label="Category">
            <select name="categoryId" className={inputClass} required>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Baseline">
            <input name="baseline" className={inputClass} placeholder="optional" />
          </Field>
          <Field label="Scope">
            <select name="scopeItemIds" multiple className={`${inputClass} min-h-24 py-2`}>
              {Object.values(project.scopeItems)
                .filter((item) => item.included)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.description}
                  </option>
                ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="isAllowance" /> Allowance
          </label>
          <div>
            <Button variant="primary" type="submit">
              Review
            </Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <h3 className="font-display text-xl">Commitments</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.values(fin.commitments)
            .filter((item) => item.status === "ACTIVE")
            .map((item) => (
              <li key={item.id}>
                {formatMoney(item.amount)} · {item.vendorRef ?? "No vendor"} ·{" "}
                {item.reference ?? "No PO"}
              </li>
            ))}
        </ul>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const amount = parseMoneyDecimal(String(data.get("amount") ?? ""), currency);
            if (!amount) {
              setError("Enter a valid commitment amount.");
              return;
            }
            setPreview(
              previewAddCommitment({
                amount,
                vendorRef: String(data.get("vendorRef") ?? ""),
                budgetLineId: String(data.get("budgetLineId")),
                reference: String(data.get("reference") || "") || undefined,
              }),
            );
          }}
        >
          <Field label="Amount">
            <input name="amount" className={inputClass} required />
          </Field>
          <Field label="Vendor">
            <input name="vendorRef" className={inputClass} />
          </Field>
          <Field label="Budget line">
            <select name="budgetLineId" className={inputClass} required>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.description}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PO / reference">
            <input name="reference" className={inputClass} />
          </Field>
          <div>
            <Button variant="primary" type="submit">
              Review
            </Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <h3 className="font-display text-xl">Actual recorded</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.values(fin.actualCosts)
            .filter((item) => item.status === "RECORDED")
            .map((item) => (
              <li key={item.id}>
                {formatMoney(item.amount)} · {item.date} · {item.description}
              </li>
            ))}
        </ul>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const amount = parseMoneyDecimal(String(data.get("amount") ?? ""), currency);
            if (!amount) {
              setError("Enter a valid actual amount.");
              return;
            }
            setPreview(
              previewAddActual({
                amount,
                date: String(data.get("date")),
                description: String(data.get("description")),
                budgetLineId: String(data.get("budgetLineId")),
              }),
            );
          }}
        >
          <Field label="Amount">
            <input name="amount" className={inputClass} required />
          </Field>
          <Field label="Date">
            <input
              name="date"
              type="date"
              className={inputClass}
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>
          <Field label="Description">
            <input name="description" className={inputClass} required />
          </Field>
          <Field label="Budget line">
            <select name="budgetLineId" className={inputClass} required>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.description}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <Button variant="primary" type="submit">
              Review
            </Button>
          </div>
        </form>
      </Panel>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {preview ? (
        <PreviewConfirm
          preview={preview}
          onConfirm={() => {
            applyPreview(project.id, preview);
            setPreview(null);
          }}
          onCancel={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
