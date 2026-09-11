export type GuestIdeaForScore = {
  guestKey?: string;
  displayName: string;
  kind: "HYPOTHESIS" | "QUESTION";
  text: string;
  takenAt: string | null;
  caseStageId: string;
  stageOrder?: number;
};

export type GuestStudentSummary = {
  guestKey: string;
  displayName: string;
  score: number;
  hypothesisCount: number;
  questionCount: number;
  takenCount: number;
  stageCount: number;
  ideas: GuestIdeaForScore[];
};

function ideaKey(idea: GuestIdeaForScore): string {
  const key = idea.guestKey?.trim();
  if (key) return key;
  return `name:${idea.displayName.trim().toLowerCase()}`;
}

/**
 * Балл студента по своим ответам с телефона.
 * Взятие в общий список не обязательно — только небольшой плюс, если взяли.
 */
export function scoreGuestStudent(ideas: GuestIdeaForScore[]): number {
  const hypos = ideas.filter(
    (i) => i.kind === "HYPOTHESIS" && i.text.trim().length > 0,
  );
  const questions = ideas.filter(
    (i) => i.kind === "QUESTION" && i.text.trim().length > 0,
  );
  const h = hypos.length;
  const q = questions.length;
  if (h === 0 && q === 0) return 0;

  let score: number;
  if (h >= 1 && h <= 2 && q === 0) {
    score = 10 + h * 5;
  } else if (h >= 3 && q === 0) {
    score = Math.min(40, 28 + (h - 3) * 3);
  } else if (h === 0 && q >= 1) {
    score = Math.min(28, 15 + (q - 1) * 4);
  } else {
    score = Math.min(78, 48 + Math.min(h, 5) * 4 + Math.min(q, 4) * 3);
  }

  const stages = new Set(
    ideas.map((i) => i.caseStageId || String(i.stageOrder ?? "")).filter(Boolean),
  );
  score += Math.min(Math.max(0, stages.size - 1), 3) * 4;
  const taken = ideas.filter((i) => i.takenAt).length;
  score += Math.min(taken, 3) * 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function groupGuestStudents(
  ideas: GuestIdeaForScore[],
): GuestStudentSummary[] {
  const buckets = new Map<string, GuestIdeaForScore[]>();
  ideas.forEach((idea) => {
    const key = ideaKey(idea);
    const list = buckets.get(key) ?? [];
    list.push(idea);
    buckets.set(key, list);
  });

  const students: GuestStudentSummary[] = [];
  for (const [guestKey, list] of buckets) {
    const lastName = [...list].reverse().find((i) => i.displayName.trim())?.displayName
      ?? "Без имени";
    students.push({
      guestKey,
      displayName: lastName,
      score: scoreGuestStudent(list),
      hypothesisCount: list.filter((i) => i.kind === "HYPOTHESIS").length,
      questionCount: list.filter((i) => i.kind === "QUESTION").length,
      takenCount: list.filter((i) => i.takenAt).length,
      stageCount: new Set(list.map((i) => i.caseStageId).filter(Boolean)).size,
      ideas: list,
    });
  }

  return students.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.displayName.localeCompare(b.displayName, "ru");
  });
}
