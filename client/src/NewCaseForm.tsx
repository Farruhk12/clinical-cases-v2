type Department = { id: string; name: string };
type Faculty = { id: string; name: string };
type CourseLevel = { id: string; name: string; sort: number };
import { apiFetch } from "@/lib/api-fetch";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200/50";

export function NewCaseForm({
  departments,
  faculties,
  courseLevels,
  fixedDepartmentId,
}: {
  departments: Department[];
  faculties: Faculty[];
  courseLevels: CourseLevel[];
  fixedDepartmentId?: string | null;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState(
    fixedDepartmentId ?? departments[0]?.id ?? "",
  );
  const [facultyIds, setFacultyIds] = useState<Set<string>>(() => {
    const id = faculties[0]?.id;
    return id ? new Set([id]) : new Set();
  });
  const [courseLevelIds, setCourseLevelIds] = useState<Set<string>>(() => {
    const id = courseLevels[0]?.id;
    return id ? new Set([id]) : new Set();
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      title.trim().length > 0 &&
      departmentId &&
      facultyIds.size > 0 &&
      courseLevelIds.size > 0
    );
  }, [title, departmentId, facultyIds, courseLevelIds]);

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        departmentId,
        facultyIds: [...facultyIds],
        courseLevelIds: [...courseLevelIds],
        published: false,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Ошибка сохранения");
      return;
    }
    const data = (await res.json()) as { case: { id: string } };
    navigate(`/cases/${data.case.id}/edit`);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-card backdrop-blur-sm sm:p-8"
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">Название</span>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Введите название кейса"
          required
        />
      </label>

      {!fixedDepartmentId && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Кафедра</span>
          <select
            className={inputClass}
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-600">
          Факультеты (можно несколько)
        </legend>
        <p className="text-xs text-slate-400">
          Сессию можно запустить с группой, чей факультет входит в этот список.
        </p>
        <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          {faculties.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={facultyIds.has(f.id)}
                onChange={() => toggle(setFacultyIds, f.id)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-300"
              />
              {f.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-600">
          Курсы (можно несколько)
        </legend>
        <p className="text-xs text-slate-400">
          Курс группы тоже должен входить в выбранные уровни.
        </p>
        <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          {courseLevels.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={courseLevelIds.has(c.id)}
                onChange={() => toggle(setCourseLevelIds, c.id)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-300"
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? "Создание..." : "Создать и перейти к этапам"}
      </button>
    </form>
  );
}
