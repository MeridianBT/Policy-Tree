"use client";

/**
 * Admin. Five panels, no wizardry: Ki and version locking, the structure
 * builder, copy-from-previous-Ki, the evaluation scale, and users.
 */

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import type { EvaluationBandSpec } from "@/lib/calc/types";
import { Button } from "@/components/ui/primitives";
import { EvaluationSymbol } from "@/components/sheet/EvaluationSymbol";
import {
  copyStructure,
  createControlItem,
  createDepartment,
  createKi,
  createNode,
  createUser,
  deleteDepartment,
  saveBands,
  setCurrentKi,
  setUserActive,
  setVersionLock,
  type AdminResult,
} from "@/lib/admin/actions";

interface KiRow {
  id: string;
  code: string;
  isCurrent: boolean;
  nodeCount: number;
  versions: Array<{
    id: string;
    code: string;
    label: string;
    sequence: number;
    isActual: boolean;
    lockedAt: string | null;
  }>;
}

interface OrgUnitRow { id: string; code: string; name: string; type: string; parentId: string | null }
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  orgUnitCode: string | null;
}
interface NodeRow { id: string; level: number; kind: string; statement: string; parentId: string | null }

export function AdminScreen({
  kis,
  orgUnits,
  users,
  bands,
  nodes,
}: {
  kis: KiRow[];
  orgUnits: OrgUnitRow[];
  users: UserRow[];
  bands: EvaluationBandSpec[];
  nodes: NodeRow[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<AdminResult | null>(null);
  const [, startTransition] = useTransition();

  function run(action: () => Promise<AdminResult>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <h1 className="text-[15px] font-semibold">Admin</h1>

      {message && (
        <p
          className="mt-2 border px-3 py-2 text-[12px]"
          style={{
            borderColor: message.ok ? "#2F8F5B" : "#B3261E",
            color: message.ok ? "#2F8F5B" : "#B3261E",
          }}
          role="status"
        >
          {message.message}
        </p>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Ki and plan versions" hint="Locking a version makes its cells read-only for every role, including admins.">
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {kis.map((ki) => (
                <tr key={ki.id} className="border-b border-rule align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">
                      {ki.code} {ki.isCurrent && <span className="text-[10px] text-ink-faint">· current</span>}
                    </div>
                    <div className="text-[11px] text-ink-faint">{ki.nodeCount} nodes</div>
                    {!ki.isCurrent && (
                      <div className="mt-1">
                        <Button onClick={() => run(() => setCurrentKi(ki.id))}>Make current</Button>
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {ki.versions.map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => run(() => setVersionLock(version.id, !version.lockedAt))}
                          title={
                            version.lockedAt
                              ? `${version.label} — locked ${new Date(version.lockedAt).toLocaleDateString()}. Click to unlock.`
                              : `${version.label} — open. Click to lock.`
                          }
                          className={`flex items-center gap-1 rounded-sm border px-1.5 py-1 text-[11px] ${
                            version.lockedAt
                              ? "border-rule-strong bg-paper-band-strong text-ink-muted"
                              : "border-rule bg-paper text-ink"
                          }`}
                        >
                          {version.lockedAt ? <Lock size={10} /> : <LockOpen size={10} />}
                          {version.code}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="mt-3 flex items-end gap-2 border-t border-rule pt-3"
            action={(formData) =>
              run(() =>
                createKi({
                  startYear: Number(formData.get("startYear")),
                  makeCurrent: formData.get("makeCurrent") === "on",
                }),
              )
            }
          >
            <Field label="New Ki start year">
              <input name="startYear" type="number" defaultValue={new Date().getFullYear() + 1} className={inputClass} />
            </Field>
            <label className="flex items-center gap-1 pb-1 text-[11px] text-ink-muted">
              <input name="makeCurrent" type="checkbox" defaultChecked /> make current
            </label>
            <Button type="submit" variant="primary">Create Ki</Button>
          </form>
        </Panel>

        <Panel title="Copy structure from a previous Ki" hint="Copies Goals, Themes, Objectives and Control Items. Values are never copied.">
          <form
            className="flex flex-wrap items-end gap-2"
            action={(formData) =>
              run(() => copyStructure(String(formData.get("from")), String(formData.get("to"))))
            }
          >
            <Field label="From">
              <select name="from" className={inputClass}>
                {kis.map((ki) => (
                  <option key={ki.id} value={ki.id}>{ki.code} ({ki.nodeCount} nodes)</option>
                ))}
              </select>
            </Field>
            <Field label="Into">
              <select name="to" className={inputClass}>
                {kis.map((ki) => (
                  <option key={ki.id} value={ki.id}>{ki.code} ({ki.nodeCount} nodes)</option>
                ))}
              </select>
            </Field>
            <Button type="submit" variant="primary">Copy</Button>
          </form>
          <p className="mt-2 text-[11px] text-ink-faint">
            Control Item codes are namespaced with the target Ki, because codes are unique across
            the database and are what formulas address.
          </p>
        </Panel>

        <Panel title="Evaluation scale" hint="Bands must be contiguous and cover the whole number line. A boundary belongs to the upper band.">
          <BandEditor bands={bands} onSave={(next) => run(() => saveBands(next))} />
        </Panel>

        <Panel title="Structure builder" hint="Levels 3 and 4 Objectives must ladder into an Objective above them; the server refuses anything else.">
          <form
            className="grid gap-2 sm:grid-cols-2"
            action={(formData) =>
              run(() =>
                createNode({
                  kiId: kis.find((ki) => ki.isCurrent)?.id ?? kis[0]?.id,
                  parentId: (formData.get("parentId") as string) || null,
                  level: Number(formData.get("level")),
                  kind: formData.get("kind"),
                  statement: String(formData.get("statement")),
                  orgUnitId: (formData.get("orgUnitId") as string) || null,
                }),
              )
            }
          >
            <Field label="Kind">
              <select name="kind" className={inputClass}>
                <option value="GOAL">Goal</option>
                <option value="THEME">Theme</option>
                <option value="OBJECTIVE">Objective</option>
              </select>
            </Field>
            <Field label="Level">
              <select name="level" className={inputClass} defaultValue="2">
                {[1, 2, 3, 4].map((level) => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </Field>
            <Field label="Parent" span>
              <select name="parentId" className={inputClass}>
                <option value="">— none (Level 1 only) —</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    L{node.level} {node.kind[0]}{node.kind.slice(1).toLowerCase()} · {node.statement}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Statement" span>
              <input name="statement" required className={inputClass} />
            </Field>
            <Field label="Org unit">
              <select name="orgUnitId" className={inputClass}>
                <option value="">— none —</option>
                {orgUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary">Add node</Button>
            </div>
          </form>

          <form
            className="mt-4 grid gap-2 border-t border-rule pt-3 sm:grid-cols-2"
            action={(formData) =>
              run(() =>
                createControlItem({
                  nodeId: String(formData.get("nodeId")),
                  code: String(formData.get("code")),
                  name: String(formData.get("name")),
                  measuredAs: (formData.get("measuredAs") as string)?.trim() || null,
                  unit: formData.get("unit"),
                  direction: formData.get("direction"),
                  achievementMethod: formData.get("achievementMethod"),
                  aggregation: formData.get("aggregation"),
                  decimalPlaces: Number(formData.get("decimalPlaces")),
                  dicOrgUnitId: String(formData.get("dicOrgUnitId")),
                  responsibleUserId: (formData.get("responsibleUserId") as string) || null,
                }),
              )
            }
          >
            <Field label="Objective" span>
              <select name="nodeId" className={inputClass}>
                {nodes
                  .filter((node) => node.kind === "OBJECTIVE")
                  .map((node) => (
                    <option key={node.id} value={node.id}>L{node.level} · {node.statement}</option>
                  ))}
              </select>
            </Field>
            <Field label="Code"><input name="code" required className={inputClass} placeholder="AUTO-VOL" /></Field>
            <Field label="Name"><input name="name" required className={inputClass} placeholder="Vehicle sales volume" /></Field>
            <Field label="Control Item" span>
              <input name="measuredAs" className={inputClass} placeholder="Units sold · % of sales · US$ 000" />
              <p className="mt-0.5 text-[10px] text-ink-faint">
                How the target and actual are measured — &ldquo;Units sold&rdquo;, &ldquo;% of sales&rdquo;.
                Left blank, the sheet shows the unit.
              </p>
            </Field>
            <Field label="Unit">
              <select name="unit" className={inputClass}>
                {["PERCENT", "CURRENCY", "COUNT", "RATIO", "DAYS", "INDEX"].map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </Field>
            <Field label="Direction">
              <select name="direction" className={inputClass}>
                <option value="HIGHER_BETTER">Higher is better</option>
                <option value="LOWER_BETTER">Lower is better</option>
              </select>
            </Field>
            <Field label="Achievement method">
              <select name="achievementMethod" className={inputClass}>
                <option value="RATIO">RATIO</option>
                <option value="INVERSE">INVERSE (cost items)</option>
              </select>
            </Field>
            <Field label="Aggregation">
              <select name="aggregation" className={inputClass}>
                <option value="SUM">SUM</option>
                <option value="AVERAGE">AVERAGE</option>
                <option value="LATEST">LATEST</option>
              </select>
            </Field>
            <Field label="Decimal places">
              <input name="decimalPlaces" type="number" min={0} max={4} defaultValue={0} className={inputClass} />
            </Field>
            <Field label="DIC (required)">
              <select name="dicOrgUnitId" className={inputClass}>
                {orgUnits
                  .filter((unit) => unit.type !== "COMPANY")
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>
                  ))}
              </select>
            </Field>
            <Field label="Responsible (optional)">
              <select name="responsibleUserId" className={inputClass}>
                <option value="">— not assigned —</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Button type="submit" variant="primary">Add Control Item</Button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Departments"
          hint="The pick list every Control Item and Level 4 branch is filed under. A department can only be removed once nothing points at it any more."
        >
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {orgUnits
                .filter((unit) => unit.type === "DIVISION")
                .map((division) => (
                  <Fragment key={division.id}>
                    <tr className="border-b border-rule bg-paper-sunken">
                      <td className="py-1.5 pl-1 font-medium" colSpan={2}>
                        {division.code} — {division.name}
                      </td>
                    </tr>
                    {orgUnits
                      .filter((unit) => unit.type === "DEPARTMENT" && unit.parentId === division.id)
                      .map((department) => (
                        <tr key={department.id} className="border-b border-rule">
                          <td className="py-1.5 pl-4">
                            {department.code} — {department.name}
                          </td>
                          <td className="py-1.5 text-right">
                            <Button onClick={() => run(() => deleteDepartment(department.id))}>Remove</Button>
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
            </tbody>
          </table>

          <form
            className="mt-3 flex flex-wrap items-end gap-2 border-t border-rule pt-3"
            action={(formData) =>
              run(() =>
                createDepartment({
                  divisionId: String(formData.get("divisionId")),
                  code: String(formData.get("code")),
                  name: String(formData.get("name")),
                }),
              )
            }
          >
            <Field label="Division">
              <select name="divisionId" className={inputClass}>
                {orgUnits
                  .filter((unit) => unit.type === "DIVISION")
                  .map((division) => (
                    <option key={division.id} value={division.id}>{division.code} — {division.name}</option>
                  ))}
              </select>
            </Field>
            <Field label="Code">
              <input name="code" required className={inputClass} placeholder="AUTO-D2" />
            </Field>
            <Field label="Name">
              <input name="name" required className={inputClass} placeholder="Powertrain Engineering" />
            </Field>
            <Button type="submit" variant="primary">Add department</Button>
          </form>
        </Panel>

                <Panel title="Users" hint="Accountability (DIC) and data entry (responsible) are separate. A division lead can key anything in their own org unit.">
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-rule">
                  <td className="py-1.5">
                    <div className={user.isActive ? "" : "text-ink-faint line-through"}>{user.name}</div>
                    <div className="text-[11px] text-ink-faint">{user.email}</div>
                  </td>
                  <td className="py-1.5 text-[11px] text-ink-muted">{user.role}</td>
                  <td className="py-1.5 text-[11px] text-ink-muted">{user.orgUnitCode ?? "—"}</td>
                  <td className="py-1.5 text-right">
                    <Button onClick={() => run(() => setUserActive(user.id, !user.isActive))}>
                      {user.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="mt-3 grid gap-2 border-t border-rule pt-3 sm:grid-cols-2"
            action={(formData) =>
              run(() =>
                createUser({
                  name: String(formData.get("name")),
                  email: String(formData.get("email")),
                  password: String(formData.get("password")),
                  role: formData.get("role"),
                  orgUnitId: (formData.get("orgUnitId") as string) || null,
                }),
              )
            }
          >
            <Field label="Name"><input name="name" required className={inputClass} /></Field>
            <Field label="Email"><input name="email" type="email" required className={inputClass} /></Field>
            <Field label="Password (min 8)">
              <input name="password" type="password" minLength={8} required className={inputClass} />
            </Field>
            <Field label="Role">
              <select name="role" className={inputClass} defaultValue="OWNER">
                <option value="ADMIN">ADMIN</option>
                <option value="OWNER">OWNER</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </Field>
            <Field label="Org unit" span>
              <select name="orgUnitId" className={inputClass}>
                <option value="">— none —</option>
                {orgUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Button type="submit" variant="primary">Create user</Button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}

const inputClass = "w-full border border-rule bg-paper px-1.5 py-1 text-[12px]";

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-rule-strong bg-paper p-3">
      <h2 className="text-[13px] font-medium">{title}</h2>
      {hint && <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <label className={`block text-[11px] text-ink-muted ${span ? "sm:col-span-2" : ""}`}>
      {label}
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function BandEditor({
  bands,
  onSave,
}: {
  bands: EvaluationBandSpec[];
  onSave: (bands: EvaluationBandSpec[]) => void;
}) {
  const [draft, setDraft] = useState(bands);

  function update(index: number, patch: Partial<EvaluationBandSpec>) {
    setDraft((previous) => previous.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  }

  return (
    <div>
      <table className="w-full border-collapse text-[12px]">
        <thead className="text-[11px] text-ink-muted">
          <tr>
            <th className="pb-1 text-left font-medium">Symbol</th>
            <th className="pb-1 text-left font-medium">Label</th>
            <th className="pb-1 text-right font-medium">From %</th>
            <th className="pb-1 text-right font-medium">To %</th>
            <th className="pb-1 text-left font-medium">Colour</th>
          </tr>
        </thead>
        <tbody>
          {draft.map((band, index) => (
            <tr key={band.symbol} className="border-b border-rule">
              <td className="py-1">
                <EvaluationSymbol symbol={band.symbol} label={band.label} color={band.colorHex} size={16} />
              </td>
              <td className="py-1 pr-2">
                <input
                  value={band.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  className={inputClass}
                />
              </td>
              <td className="py-1">
                <input
                  className={`${inputClass} num`}
                  value={band.minPct === null ? "" : band.minPct * 100}
                  placeholder="unbounded"
                  onChange={(event) =>
                    update(index, {
                      minPct: event.target.value.trim() === "" ? null : Number(event.target.value) / 100,
                    })
                  }
                />
              </td>
              <td className="py-1">
                <input
                  className={`${inputClass} num`}
                  value={band.maxPct === null ? "" : band.maxPct * 100}
                  placeholder="unbounded"
                  onChange={(event) =>
                    update(index, {
                      maxPct: event.target.value.trim() === "" ? null : Number(event.target.value) / 100,
                    })
                  }
                />
              </td>
              <td className="py-1">
                <input
                  type="color"
                  value={band.colorHex}
                  onChange={(event) => update(index, { colorHex: event.target.value })}
                  className="h-6 w-10 border border-rule"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={() => onSave(draft)}>Save scale</Button>
        <Button onClick={() => setDraft(bands)}>Reset</Button>
      </div>
    </div>
  );
}
