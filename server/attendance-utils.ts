export const ADJUSTMENT_TYPES = ["اذن صباحي", "اذن مسائي", "إجازة نص يوم", "مأمورية"] as const;

export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export type AdjustmentInput = {
  type: AdjustmentType;
  fromTime: string;
  toTime: string;
};

export const normalizeTimeToHms = (value: string) => {
  const parts = value.trim().split(":");
  const [rawH = "0", rawM = "0", rawS = "0"] = parts;
  const h = String(Number(rawH)).padStart(2, "0");
  const m = String(Number(rawM)).padStart(2, "0");
  const s = String(Number(rawS)).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

export const timeStringToSeconds = (value: string) => {
  const normalized = normalizeTimeToHms(value);
  const [h, m, s] = normalized.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

export const secondsToHms = (value: number) => {
  const total = Math.max(0, Math.floor(value));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

export const computeAdjustmentEffects = ({
  shiftStart,
  shiftEnd,
  adjustments,
  checkInSeconds,
  checkOutSeconds,
}: {
  shiftStart: string;
  shiftEnd: string;
  adjustments: AdjustmentInput[];
  checkInSeconds?: number | null;
  checkOutSeconds?: number | null;
}) => {
  const shiftStartSeconds = timeStringToSeconds(shiftStart);
  const shiftEndSeconds = timeStringToSeconds(shiftEnd);
  let effectiveShiftStartSeconds = shiftStartSeconds;
  let effectiveShiftEndSeconds = shiftEndSeconds;
  let missionStartSeconds: number | null = null;
  let missionEndSeconds: number | null = null;
  let suppressPenalties = false;
  let halfDayExcused = false;

  for (const adjustment of adjustments) {
    const fromSeconds = timeStringToSeconds(adjustment.fromTime);
    const toSeconds = timeStringToSeconds(adjustment.toTime);
    if (adjustment.type === "اذن صباحي") {
      effectiveShiftStartSeconds += Math.max(0, toSeconds - fromSeconds);
    }
    if (adjustment.type === "اذن مسائي") {
      effectiveShiftEndSeconds -= Math.max(0, toSeconds - fromSeconds);
    }
    if (adjustment.type === "إجازة نص يوم") {
      if (fromSeconds === shiftStartSeconds) {
        effectiveShiftStartSeconds = toSeconds;
        halfDayExcused = true;
      }
      if (toSeconds === shiftEndSeconds) {
        effectiveShiftEndSeconds = fromSeconds;
        halfDayExcused = true;
      }
    }
    if (adjustment.type === "مأمورية") {
      missionStartSeconds = missionStartSeconds === null ? fromSeconds : Math.min(missionStartSeconds, fromSeconds);
      missionEndSeconds = missionEndSeconds === null ? toSeconds : Math.max(missionEndSeconds, toSeconds);
      suppressPenalties = true;
    }
  }

  const allFirstCandidates = [checkInSeconds ?? null, missionStartSeconds].filter(
    (value): value is number => value !== null && value !== undefined
  );
  const allLastCandidates = [checkOutSeconds ?? null, missionEndSeconds].filter(
    (value): value is number => value !== null && value !== undefined
  );
  const firstStampSeconds = allFirstCandidates.length > 0 ? Math.min(...allFirstCandidates) : null;
  const lastStampSeconds = allLastCandidates.length > 0 ? Math.max(...allLastCandidates) : null;

  return {
    effectiveShiftStartSeconds,
    effectiveShiftEndSeconds,
    missionStartSeconds,
    missionEndSeconds,
    suppressPenalties,
    halfDayExcused,
    firstStampSeconds,
    lastStampSeconds,
  };
};

export const appendNotes = (existingNotes: string | null | undefined, additions: string[]) => {
  const existing = (existingNotes || "")
    .split(/[،,]/)
    .map((note) => note.trim())
    .filter(Boolean);
  const set = new Set(existing);
  additions.forEach((note) => set.add(note));
  return Array.from(set).join("، ");
};

export const computeAutomaticNotes = ({
  existingNotes,
  checkInExists,
  checkOutExists,
  missingStampExcused,
  earlyLeaveExcused,
  checkOutBeforeEarlyLeave,
}: {
  existingNotes?: string | null;
  checkInExists: boolean;
  checkOutExists: boolean;
  missingStampExcused: boolean;
  earlyLeaveExcused: boolean;
  checkOutBeforeEarlyLeave: boolean;
}) => {
  const notes: string[] = [];
  if (checkInExists && !checkOutExists && !missingStampExcused) {
    notes.push("سهو بصمة");
  }
  if (!checkInExists && checkOutExists && !missingStampExcused) {
    notes.push("سهو بصمة دخول");
  }
  if (checkOutExists && checkOutBeforeEarlyLeave && !earlyLeaveExcused) {
    notes.push("انصراف مبكر");
  }
  return appendNotes(existingNotes, notes);
};

export const computePenaltyEntries = ({
  isExcused,
  latePenaltyValue,
  lateMinutes,
  missingCheckout,
  earlyLeaveTriggered,
}: {
  isExcused: boolean;
  latePenaltyValue: number;
  lateMinutes: number;
  missingCheckout: boolean;
  earlyLeaveTriggered: boolean;
}) => {
  if (isExcused) return [];
  const entries: { type: string; value: number; minutes?: number }[] = [];
  if (latePenaltyValue > 0) {
    entries.push({ type: "تأخير", value: latePenaltyValue, minutes: lateMinutes });
  }
  if (missingCheckout) {
    entries.push({ type: "سهو بصمة", value: 0.5 });
  } else if (earlyLeaveTriggered) {
    entries.push({ type: "انصراف مبكر", value: 0.5 });
  }
  return entries;
};

export const computeOvertimeHours = ({
  shiftEnd,
  checkOutSeconds,
}: {
  shiftEnd: string;
  checkOutSeconds: number | null;
}) => {
  if (checkOutSeconds === null) return 0;
  const shiftEndSeconds = timeStringToSeconds(shiftEnd);
  const overtimeStartSeconds = shiftEndSeconds + 60 * 60;
  if (checkOutSeconds <= overtimeStartSeconds) return 0;
  const eligibleMinutes = Math.floor((checkOutSeconds - overtimeStartSeconds) / 60);
  return Math.floor(eligibleMinutes / 60);
};
