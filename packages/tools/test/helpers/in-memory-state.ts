import type {
  StateStore,
  Goal,
  Task,
  JournalEntry,
} from '@metaplex-foundation/agent-runtime';

export interface InMemoryState {
  goals: Goal[];
  tasks: Task[];
  journal: JournalEntry[];
  paused: boolean;
}

/**
 * In-memory `StateStore` implementation for tests. No file IO, no env reads.
 *
 * Returns `{ store, state }`:
 *   - `store` is the StateStore the tools see via context.
 *   - `state` is the raw mutable record — assert against it directly.
 */
export function createInMemoryStateStore(initial?: Partial<InMemoryState>): {
  store: StateStore;
  state: InMemoryState;
} {
  const state: InMemoryState = {
    goals: initial?.goals ?? [],
    tasks: initial?.tasks ?? [],
    journal: initial?.journal ?? [],
    paused: initial?.paused ?? false,
  };
  let counter = 0;
  const newId = (prefix: string) =>
    `${prefix}_${(++counter).toString(16).padStart(8, '0')}`;

  const store: StateStore = {
    addGoal(description) {
      const g: Goal = {
        id: newId('g'),
        description,
        createdAt: new Date().toISOString(),
        status: 'active',
      };
      state.goals.push(g);
      return g;
    },
    closeGoal(id, status) {
      const i = state.goals.findIndex((g) => g.id === id);
      if (i === -1) return null;
      state.goals[i] = { ...state.goals[i]!, status };
      return state.goals[i]!;
    },
    getGoalById(id) {
      return state.goals.find((g) => g.id === id) ?? null;
    },
    addTask(description, goalId) {
      const t: Task = {
        id: newId('t'),
        goalId,
        description,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        result: null,
      };
      state.tasks.push(t);
      return t;
    },
    closeTask(id, status, result) {
      const i = state.tasks.findIndex((t) => t.id === id);
      if (i === -1) return null;
      state.tasks[i] = {
        ...state.tasks[i]!,
        status,
        result,
        completedAt: new Date().toISOString(),
      };
      return state.tasks[i]!;
    },
    setPaused(paused, reason) {
      if (state.paused === paused) return;
      state.paused = paused;
      state.journal.push({
        ts: new Date().toISOString(),
        kind: paused ? 'pause' : 'unpause',
        summary: reason ?? (paused ? 'paused' : 'unpaused'),
        txSigs: [],
      });
    },
    appendJournal(entry) {
      const e: JournalEntry = {
        ts: entry.ts ?? new Date().toISOString(),
        kind: entry.kind,
        summary: entry.summary,
        txSigs: entry.txSigs ?? [],
      };
      state.journal.push(e);
      return e;
    },
  };
  return { store, state };
}
