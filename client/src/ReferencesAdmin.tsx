import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { IconPencil, IconTrash } from "@/components/icons";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { apiFetch } from "@/lib/api-fetch";

type Department = { id: string; name: string };
type Faculty = { id: string; name: string };
type CourseLevel = { id: string; name: string; sort: number };

type RefKind = "department" | "faculty" | "courseLevel";

type EditingRow =
  | { kind: "department" | "faculty"; id: string; name: string }
  | { kind: "courseLevel"; id: string; name: string; sort: number };

const btnPrimaryGreenClass = "ui-btn-primary shrink-0";

async function readError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return typeof j.error === "string" ? j.error : "Ошибка";
}

export function ReferencesAdmin({
  departments,
  faculties,
  courseLevels,
}: {
  departments: Department[];
  faculties: Faculty[];
  courseLevels: CourseLevel[];
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deptName, setDeptName] = useState("");
  const [facName, setFacName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [editing, setEditing] = useState<EditingRow | null>(null);

  async function add(
    kind: "department" | "faculty" | "courseLevel",
    name: string,
  ) {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/admin/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: n }),
      });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      if (kind === "department") setDeptName("");
      if (kind === "faculty") setFacName("");
      if (kind === "courseLevel") setCourseName("");
      navigate(0);
    } catch {
      setErr("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const n = editing.name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    try {
      const body =
        editing.kind === "courseLevel"
          ? { name: n, sort: editing.sort }
          : { name: n };
      const res = await apiFetch(
        `/api/admin/reference/${editing.kind}/${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      setEditing(null);
      navigate(0);
    } catch {
      setErr("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(
    kind: RefKind,
    row: { id: string; name: string },
  ) {
    if (
      !window.confirm(
        `Удалить «${row.name}»? Действие нельзя отменить.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/api/admin/reference/${kind}/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      if (editing?.id === row.id && editing.kind === kind) setEditing(null);
      navigate(0);
    } catch {
      setErr("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  function RefRow({
    kind,
    row,
  }: {
    kind: "department" | "faculty";
    row: { id: string; name: string };
  }) {
    const isEditing = editing?.kind === kind && editing.id === row.id;
    if (isEditing) {
      return (
        <li className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-brand-200 bg-brand-50/50 px-3 py-2">
          <input
            className="ui-input rounded-md"
            value={editing.name}
            onChange={(e) =>
              setEditing({ ...editing, name: e.target.value })
            }
            autoFocus
            disabled={busy}
          />
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              className={btnPrimaryGreenClass}
              onClick={() => void saveEdit()}
            >
              Сохранить
            </button>
            <button
              type="button"
              disabled={busy}
              className="ui-btn-secondary"
              onClick={() => setEditing(null)}
            >
              Отмена
            </button>
          </div>
        </li>
      );
    }
    return (
      <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-transparent px-2 py-1.5 hover:bg-surface">
        <span className="min-w-0 flex-1 text-sm text-ink-soft">{row.name}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            title="Редактировать"
            aria-label={`Редактировать: ${row.name}`}
            className="inline-flex items-center justify-center rounded-lg p-2 text-brand-600 transition hover:bg-brand-100 hover:text-brand-800 disabled:opacity-50"
            onClick={() =>
              setEditing({ kind, id: row.id, name: row.name })
            }
          >
            <IconPencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            title="Удалить"
            aria-label={`Удалить: ${row.name}`}
            className="inline-flex items-center justify-center rounded-lg p-2 text-[var(--color-danger)] transition hover:bg-[var(--color-danger-bg)] disabled:opacity-50"
            onClick={() => void removeRow(kind, row)}
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  }

  function CourseLevelRow({ row }: { row: CourseLevel }) {
    const isEditing =
      editing?.kind === "courseLevel" && editing.id === row.id;
    if (isEditing) {
      return (
        <li className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-brand-200 bg-brand-50/50 px-3 py-2">
          <input
            className="ui-input rounded-md"
            value={editing.name}
            onChange={(e) =>
              setEditing({ ...editing, name: e.target.value })
            }
            autoFocus
            disabled={busy}
            placeholder="Название"
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
            Порядок сортировки (sort)
            <input
              type="number"
              min={0}
              step={1}
              className="ui-input max-w-[12rem] rounded-md"
              value={editing.sort}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                setEditing({
                  ...editing,
                  sort: Number.isFinite(v) ? v : 0,
                });
              }}
              disabled={busy}
            />
          </label>
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              className={btnPrimaryGreenClass}
              onClick={() => void saveEdit()}
            >
              Сохранить
            </button>
            <button
              type="button"
              disabled={busy}
              className="ui-btn-secondary"
              onClick={() => setEditing(null)}
            >
              Отмена
            </button>
          </div>
        </li>
      );
    }
    return (
      <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-transparent px-2 py-1.5 hover:bg-surface">
        <span className="min-w-0 flex-1 text-sm text-ink-soft">
          {row.name}
          <span className="ml-2 text-xs font-normal text-faint">
            sort {row.sort}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            title="Редактировать"
            aria-label={`Редактировать: ${row.name}`}
            className="inline-flex items-center justify-center rounded-lg p-2 text-brand-600 transition hover:bg-brand-100 hover:text-brand-800 disabled:opacity-50"
            onClick={() =>
              setEditing({
                kind: "courseLevel",
                id: row.id,
                name: row.name,
                sort: row.sort,
              })
            }
          >
            <IconPencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            title="Удалить"
            aria-label={`Удалить: ${row.name}`}
            className="inline-flex items-center justify-center rounded-lg p-2 text-[var(--color-danger)] transition hover:bg-[var(--color-danger-bg)] disabled:opacity-50"
            onClick={() => void removeRow("courseLevel", row)}
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-8">
      {err ? <p className="ui-alert-danger">{err}</p> : null}

      <section className="ui-card p-5">
        <h2 className="text-sm font-semibold text-ink">Кафедры</h2>
        <ul className="mt-3 space-y-1">
          {departments.map((d) => (
            <RefRow key={d.id} kind="department" row={d} />
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <input
            className="ui-input min-w-[12rem] flex-1"
            placeholder="Название кафедры"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            className={btnPrimaryGreenClass}
            onClick={() => void add("department", deptName)}
          >
            Добавить
          </button>
        </div>
      </section>

      <section className="ui-card p-5">
        <h2 className="text-sm font-semibold text-ink">Факультеты</h2>
        <ul className="mt-3 space-y-1">
          {faculties.map((f) => (
            <RefRow key={f.id} kind="faculty" row={f} />
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <input
            className="ui-input min-w-[12rem] flex-1"
            placeholder="Название факультета"
            value={facName}
            onChange={(e) => setFacName(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            className={btnPrimaryGreenClass}
            onClick={() => void add("faculty", facName)}
          >
            Добавить
          </button>
        </div>
      </section>

      <section className="ui-card p-5">
        <h2 className="text-sm font-semibold text-ink">Курсы (уровни)</h2>
        <ul className="mt-3 space-y-1">
          {courseLevels.map((c) => (
            <CourseLevelRow key={c.id} row={c} />
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <input
            className="ui-input min-w-[12rem] flex-1"
            placeholder="Например, 5 курс"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            className={btnPrimaryGreenClass}
            onClick={() => void add("courseLevel", courseName)}
          >
            Добавить
          </button>
        </div>
      </section>

      {busy && <LoadingOverlay label="Сохраняем…" />}
    </div>
  );
}
