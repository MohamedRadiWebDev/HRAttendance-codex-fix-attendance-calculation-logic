import { create } from "zustand";

export type Effect = {
  id: string;
  employeeCode: string;
  employeeName?: string;
  date: string;
  from?: string;
  to?: string;
  type: string;
  status?: string;
  note?: string;
  createdAt: string;
};

type EffectsState = {
  effects: Effect[];
  setEffects: (rows: Effect[]) => void;
  addEffects: (rows: Effect[]) => void;
  clearEffects: () => void;
  removeEffect: (id: string) => void;
};

const STORAGE_KEY = "hr_effects_v1";

const effectKey = (row: Pick<Effect, "employeeCode" | "date" | "type" | "from" | "to">) =>
  `${row.employeeCode}|${row.date}|${row.type}|${row.from || ""}|${row.to || ""}`;

const loadEffects = (): Effect[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row.employeeCode === "string" && typeof row.date === "string");
  } catch {
    return [];
  }
};

const persistEffects = (effects: Effect[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(effects));
};

export const useEffectsStore = create<EffectsState>((set) => ({
  effects: loadEffects(),
  setEffects: (rows) => {
    const next = [...rows];
    persistEffects(next);
    set({ effects: next });
  },
  addEffects: (rows) =>
    set((state) => {
      const map = new Map<string, Effect>();
      state.effects.forEach((row) => map.set(effectKey(row), row));
      rows.forEach((row) => map.set(effectKey(row), row));
      const next = Array.from(map.values());
      persistEffects(next);
      return { effects: next };
    }),
  clearEffects: () => {
    persistEffects([]);
    set({ effects: [] });
  },
  removeEffect: (id) =>
    set((state) => {
      const next = state.effects.filter((row) => row.id !== id);
      persistEffects(next);
      return { effects: next };
    }),
}));
