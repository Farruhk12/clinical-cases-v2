import type { BlockType } from "~types/db";

export type ApiBlock = {
  id: string;
  blockType: BlockType;
  rawText: string | null;
  formattedContent: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type ApiStage = {
  id: string;
  order: number;
  title: string;
  isFinalReveal: boolean;
  learningGoals: string | null;
  blocks: ApiBlock[];
};

export type HypoRow = { id: string; text: string; lineageId: string };
export type QuestionRow = { id: string; text: string; lineageId: string };

export type TimelineRow = {
  stageOrder: number;
  stageTitle: string;
  learningGoals?: string | null;
  submittedAt: string | null;
  openedAt: string | null;
  hypotheses: HypoRow[];
  questions: QuestionRow[];
};

export type LeaderCandidate = {
  id: string;
  name: string | null;
  login: string | null;
};

export type DraftItem = { text: string; lineageId?: string };

export type GuestIdeaJson = {
  id: string;
  caseStageId: string;
  guestKey?: string;
  displayName: string;
  kind: "HYPOTHESIS" | "QUESTION";
  text: string;
  createdAt: string;
  takenAt: string | null;
  stageOrder?: number;
  stageTitle?: string;
};

export type SessionPayload = {
  session: {
    id: string;
    status: string;
    currentStageOrder: number;
    joinToken?: string | null;
    startedAt: string;
    completedAt: string | null;
    caseVersionSnapshot: number;
    totalStages: number;
    case: { id: string; title: string; teacherKey?: string | null };
    studyGroup: {
      id: string;
      name: string;
      faculty: { name: string };
      courseLevel: { name: string };
    };
    leader: { id: string; name: string | null; login: string | null };
    outcome: {
      aiAnalysis: string | null;
      aiModel: string | null;
      aiPreliminaryScores?: unknown | null;
      teacherGrade: string | null;
      teacherComment: string | null;
      finalizedAt: string | null;
    } | null;
  };
  /** Не состав учебной группы — преподаватели/админы кафедры, доступные как ведущий. */
  leaderCandidates: LeaderCandidate[];
  canEditSessionSettings: boolean;
  currentStage: ApiStage | null;
  visibleStages: ApiStage[];
  draft: {
    submissionId: string;
    hypotheses: HypoRow[];
    questions: QuestionRow[];
  } | null;
  timeline: TimelineRow[];
  canEdit: boolean;
  guestIdeas: GuestIdeaJson[];
  analytics: {
    stageOrder: number;
    openedAt: string | null;
    submittedAt: string | null;
  }[];
};
