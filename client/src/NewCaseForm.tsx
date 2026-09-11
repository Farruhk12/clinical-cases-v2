type Department = { id: string; name: string };
type Faculty = { id: string; name: string };
type CourseLevel = { id: string; name: string; sort: number };
import { apiFetch } from "@/lib/api-fetch";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";

const inputClass = "ui-input";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const defaultFacultyId = faculties[0]?.id ?? "";
  const defaultCourseId = courseLevels[0]?.id ?? "";

  const canSubmit = useMemo(() => {
    return (
      title.trim().length > 0 &&
      Boolean(departmentId) &&
      Boolean(defaultFacultyId) &&
      Boolean(defaultCourseId)
    );
  }, [title, departmentId, defaultFacultyId, defaultCourseId]);

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
        facultyIds: [defaultFacultyId],
        courseLevelIds: [defaultCourseId],
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
    <form onSubmit={submit} className="ui-card space-y-5 p-6 sm:p-8">
      <p className="text-sm text-ink-soft">
        Достаточно названия. Факультеты, курсы, этапы и эталон настроите в
        редакторе.
      </p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">
          Название
        </span>
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
          <span className="mb-1.5 block text-sm font-medium text-slate-600">
            Кафедра
          </span>
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

      {error && <p className="ui-alert-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="ui-btn-primary"
      >
        Создать и перейти к этапам
      </button>

      {loading && <LoadingOverlay label="Создаём кейс…" />}
    </form>
  );
}
