import assert from "node:assert/strict";
import {
  computeAdjustmentEffects,
  computeAutomaticNotes,
  computeOvertimeHours,
  computePenaltyEntries,
} from "./attendance-utils";

const toSeconds = (value: string) => {
  const [h, m, s] = value.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

(() => {
  const result = computeAdjustmentEffects({
    shiftStart: "09:00",
    shiftEnd: "17:00",
    adjustments: [{ type: "اذن صباحي", fromTime: "09:00", toTime: "11:00" }],
  });
  assert.equal(result.effectiveShiftStartSeconds, toSeconds("11:00:00"));
})();

(() => {
  const result = computeAdjustmentEffects({
    shiftStart: "09:00",
    shiftEnd: "17:00",
    adjustments: [{ type: "اذن مسائي", fromTime: "15:00", toTime: "17:00" }],
  });
  assert.equal(result.effectiveShiftEndSeconds, toSeconds("15:00:00"));
})();

(() => {
  const resultStart = computeAdjustmentEffects({
    shiftStart: "09:00",
    shiftEnd: "17:00",
    adjustments: [{ type: "إجازة نص يوم", fromTime: "09:00", toTime: "13:00" }],
  });
  assert.equal(resultStart.effectiveShiftStartSeconds, toSeconds("13:00:00"));
  assert.equal(resultStart.halfDayExcused, true);

  const resultEnd = computeAdjustmentEffects({
    shiftStart: "09:00",
    shiftEnd: "17:00",
    adjustments: [{ type: "إجازة نص يوم", fromTime: "13:00", toTime: "17:00" }],
  });
  assert.equal(resultEnd.effectiveShiftEndSeconds, toSeconds("13:00:00"));
  assert.equal(resultEnd.halfDayExcused, true);
})();

(() => {
  const result = computeAdjustmentEffects({
    shiftStart: "09:00",
    shiftEnd: "17:00",
    adjustments: [{ type: "مأمورية", fromTime: "09:00", toTime: "17:00" }],
    checkInSeconds: toSeconds("10:00:00"),
    checkOutSeconds: toSeconds("16:00:00"),
  });
  assert.equal(result.firstStampSeconds, toSeconds("09:00:00"));
  assert.equal(result.lastStampSeconds, toSeconds("17:00:00"));
  assert.equal(result.suppressPenalties, true);
})();

(() => {
  const notes = computeAutomaticNotes({
    existingNotes: "",
    checkInExists: true,
    checkOutExists: false,
    missingStampExcused: false,
    earlyLeaveExcused: false,
    checkOutBeforeEarlyLeave: false,
  });
  assert.ok(notes.includes("سهو بصمة"));
})();

(() => {
  const notes = computeAutomaticNotes({
    existingNotes: "",
    checkInExists: false,
    checkOutExists: true,
    missingStampExcused: false,
    earlyLeaveExcused: false,
    checkOutBeforeEarlyLeave: false,
  });
  assert.ok(notes.includes("سهو بصمة دخول"));
})();

(() => {
  const notes = computeAutomaticNotes({
    existingNotes: "",
    checkInExists: true,
    checkOutExists: true,
    missingStampExcused: false,
    earlyLeaveExcused: false,
    checkOutBeforeEarlyLeave: true,
  });
  assert.ok(notes.includes("انصراف مبكر"));
})();

(() => {
  const penalties = computePenaltyEntries({
    isExcused: false,
    latePenaltyValue: 0.25,
    lateMinutes: 10,
    missingCheckout: true,
    earlyLeaveTriggered: false,
  });
  const totalPenalty = penalties.reduce((sum, penalty) => sum + penalty.value, 0);
  assert.equal(totalPenalty, 0.75);
})();

(() => {
  const penalties = computePenaltyEntries({
    isExcused: false,
    latePenaltyValue: 0,
    lateMinutes: 0,
    missingCheckout: false,
    earlyLeaveTriggered: true,
  });
  assert.deepEqual(penalties, [{ type: "انصراف مبكر", value: 0.5 }]);
})();

(() => {
  const penalties = computePenaltyEntries({
    isExcused: false,
    latePenaltyValue: 0,
    lateMinutes: 0,
    missingCheckout: true,
    earlyLeaveTriggered: true,
  });
  assert.deepEqual(penalties, [{ type: "سهو بصمة", value: 0.5 }]);
})();

(() => {
  const penalties = computePenaltyEntries({
    isExcused: true,
    latePenaltyValue: 0.25,
    lateMinutes: 20,
    missingCheckout: true,
    earlyLeaveTriggered: true,
  });
  assert.deepEqual(penalties, []);
})();

(() => {
  assert.equal(
    computeOvertimeHours({ shiftEnd: "17:00", checkOutSeconds: 17 * 3600 + 59 * 60 }),
    0
  );
})();

(() => {
  assert.equal(
    computeOvertimeHours({ shiftEnd: "17:00", checkOutSeconds: 18 * 3600 }),
    0
  );
})();

(() => {
  assert.equal(
    computeOvertimeHours({ shiftEnd: "17:00", checkOutSeconds: 18 * 3600 + 59 * 60 }),
    0
  );
})();

(() => {
  assert.equal(
    computeOvertimeHours({ shiftEnd: "17:00", checkOutSeconds: 19 * 3600 }),
    1
  );
})();

(() => {
  assert.equal(
    computeOvertimeHours({ shiftEnd: "17:00", checkOutSeconds: 19 * 3600 + 5 * 60 }),
    1
  );
})();

(() => {
  assert.equal(
    computeOvertimeHours({ shiftEnd: "17:00", checkOutSeconds: 20 * 3600 + 10 * 60 }),
    2
  );
})();

(() => {
  assert.equal(
    computeOvertimeHours({ shiftEnd: "17:00", checkOutSeconds: 19 * 3600 }),
    1
  );
})();

console.log("attendance-utils tests passed");
