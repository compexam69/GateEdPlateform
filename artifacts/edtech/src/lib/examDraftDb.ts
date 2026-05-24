import { openDB, type DBSchema, type IDBPDatabase } from "idb";

type QuestionStatus = "not-visited" | "unanswered" | "answered" | "marked" | "answered-marked";

export interface DraftState {
  quizId: string;
  attempt_id: string;
  questions: Array<{
    question_id: string;
    selectedOption: string | null;
    isMarked: boolean;
    timeSpentMs: number;
    status: QuestionStatus;
  }>;
  currentIdx: number;
  timeLeft: number;
  pauseCount: number;
  savedAt: number;
}

interface ExamDraftsDB extends DBSchema {
  drafts: {
    key: string;
    value: DraftState;
  };
}

const DRAFT_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

let dbPromise: Promise<IDBPDatabase<ExamDraftsDB>> | null = null;

function getDb(): Promise<IDBPDatabase<ExamDraftsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ExamDraftsDB>("exam-drafts", 1, {
      upgrade(db) {
        db.createObjectStore("drafts", { keyPath: "quizId" });
      },
    });
  }
  return dbPromise;
}

export async function saveDraftIdb(draft: DraftState): Promise<void> {
  try {
    const db = await getDb();
    await db.put("drafts", draft);
  } catch { /* non-critical, fail silently */ }
}

export async function loadDraftIdb(quizId: string): Promise<DraftState | null> {
  try {
    const db = await getDb();
    const draft = await db.get("drafts", quizId);
    if (!draft) return null;
    if (Date.now() - draft.savedAt > DRAFT_EXPIRY_MS) {
      await db.delete("drafts", quizId);
      return null;
    }
    return draft;
  } catch { return null; }
}

export async function clearDraftIdb(quizId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete("drafts", quizId);
  } catch { /* non-critical */ }
}
