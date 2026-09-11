export type AnalyticsFilterOption = {
  id: string;
  label: string;
};

export type TeacherAnalyticsKpis = {
  departmentId: string;
  departmentName: string;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsInProgress: number;
  needGrade: number;
  uniqueStudyGroups: number;
  casesTotal: number;
  sessionsWithTeacherGrade: number;
  sessionsWithAiAnalysis: number;
  avgTeacherScore: number | null;
  avgAiScore: number | null;
  guestStudents: number;
  guestIdeas: number;
  takenIdeas: number;
  avgStudentScore: number | null;
  avgDurationMin: number | null;
};

export type TeacherSessionRow = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt: string;
  completedAt: string | null;
  durationMin: number | null;
  caseId: string;
  caseTitle: string;
  studyGroupId: string;
  groupName: string;
  teacherGrade: number | null;
  aiScore: number | null;
  officialHypos: number;
  officialQuestions: number;
  guestStudents: number;
  guestIdeas: number;
  takenIdeas: number;
  avgStudentScore: number | null;
};

export type TeacherStudentRow = {
  displayName: string;
  sessionCount: number;
  hypothesisCount: number;
  questionCount: number;
  takenCount: number;
  avgScore: number;
  lastSessionAt: string | null;
  lastCaseTitle: string | null;
};

export type TeacherStageRow = {
  caseId: string;
  caseTitle: string;
  stageOrder: number;
  stageTitle: string;
  sessions: number;
  avgDurationMin: number | null;
  avgOfficialHypos: number;
  avgOfficialQuestions: number;
  guestIdeas: number;
  takenIdeas: number;
};

export type GradeBucket = {
  label: string;
  teacher: number;
  ai: number;
  student: number;
};

export type TeacherAnalyticsPayload = {
  kpis: TeacherAnalyticsKpis;
  filters: {
    groups: AnalyticsFilterOption[];
    cases: AnalyticsFilterOption[];
  };
  sessions: TeacherSessionRow[];
  students: TeacherStudentRow[];
  stages: TeacherStageRow[];
  gradeBuckets: GradeBucket[];
};

export type AnalyticsSessionStudent = {
  guestKey: string;
  displayName: string;
  score: number;
  hypothesisCount: number;
  questionCount: number;
  takenCount: number;
  ideas: {
    kind: "HYPOTHESIS" | "QUESTION";
    text: string;
    takenAt: string | null;
    stageOrder?: number;
    stageTitle?: string;
  }[];
};

export type AnalyticsSessionStage = {
  stageOrder: number;
  stageTitle: string;
  openedAt: string | null;
  submittedAt: string | null;
  durationMin: number | null;
  officialHypos: number;
  officialQuestions: number;
  guestIdeas: number;
  takenIdeas: number;
};

export type AnalyticsSessionDetail = {
  session: TeacherSessionRow;
  students: AnalyticsSessionStudent[];
  stages: AnalyticsSessionStage[];
};
