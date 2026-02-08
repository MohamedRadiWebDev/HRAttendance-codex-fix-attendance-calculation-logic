import { create } from "zustand";
import type {
  Adjustment,
  AttendanceRecord,
  BiometricPunch,
  Employee,
  InsertAdjustment,
  InsertEmployee,
  InsertLeave,
  InsertSpecialRule,
  Leave,
  SpecialRule,
} from "@shared/schema";
import { processAttendanceRecords } from "@/engine/attendanceEngine";

const byCode = (employees: Employee[]) => new Map(employees.map((emp) => [emp.code, emp]));

export type AttendanceStoreState = {
  employees: Employee[];
  punches: BiometricPunch[];
  rules: SpecialRule[];
  adjustments: Adjustment[];
  leaves: Leave[];
  attendanceRecords: AttendanceRecord[];
  nextIds: {
    employee: number;
    rule: number;
    adjustment: number;
    leave: number;
    record: number;
  };
  importEmployees: (rows: InsertEmployee[]) => { count: number };
  createEmployee: (row: InsertEmployee) => Employee;
  updateEmployee: (id: number, updates: Partial<InsertEmployee>) => Employee | null;
  importPunches: (rows: { employeeCode: string; punchDatetime: string }[]) => { count: number };
  createRule: (row: InsertSpecialRule) => SpecialRule;
  updateRule: (id: number, updates: Partial<InsertSpecialRule>) => SpecialRule | null;
  deleteRule: (id: number) => void;
  importRules: (rows: InsertSpecialRule[]) => { count: number };
  createAdjustment: (row: InsertAdjustment) => Adjustment;
  importAdjustments: (rows: InsertAdjustment[]) => { inserted: number; invalid: { rowIndex?: number; reason?: string }[] };
  createLeave: (row: InsertLeave) => Leave;
  deleteLeave: (id: number) => void;
  importLeaves: (rows: InsertLeave[]) => { inserted: number; invalid: { rowIndex?: number; reason?: string }[] };
  processAttendance: (params: { startDate: string; endDate: string; timezoneOffsetMinutes?: number }) => {
    message: string;
    processedCount: number;
  };
  wipeData: () => void;
};

export const useAttendanceStore = create<AttendanceStoreState>((set, get) => ({
  employees: [],
  punches: [],
  rules: [],
  adjustments: [],
  leaves: [],
  attendanceRecords: [],
  nextIds: { employee: 1, rule: 1, adjustment: 1, leave: 1, record: 1 },
  importEmployees: (rows) => {
    const state = get();
    const existingMap = byCode(state.employees);
    const nextEmployees = [...state.employees];
    let inserted = 0;
    rows.forEach((row) => {
      if (!row.code || existingMap.has(row.code)) return;
      const employee: Employee = {
        id: state.nextIds.employee + inserted,
        ...row,
        shiftStart: row.shiftStart || "09:00",
      } as Employee;
      nextEmployees.push(employee);
      existingMap.set(employee.code, employee);
      inserted += 1;
    });
    set({
      employees: nextEmployees,
      nextIds: {
        ...state.nextIds,
        employee: state.nextIds.employee + inserted,
      },
    });
    return { count: inserted };
  },
  createEmployee: (row) => {
    const state = get();
    if (state.employees.some((employee) => employee.code === row.code)) {
      throw new Error("Employee code already exists");
    }
    const employee: Employee = {
      id: state.nextIds.employee,
      ...row,
      shiftStart: row.shiftStart || "09:00",
    } as Employee;
    set({
      employees: [...state.employees, employee],
      nextIds: { ...state.nextIds, employee: state.nextIds.employee + 1 },
    });
    return employee;
  },
  updateEmployee: (id, updates) => {
    const state = get();
    let updatedEmployee: Employee | null = null;
    const employees = state.employees.map((employee) => {
      if (employee.id !== id) return employee;
      updatedEmployee = { ...employee, ...updates } as Employee;
      return updatedEmployee;
    });
    if (!updatedEmployee) return null;
    set({ employees });
    return updatedEmployee;
  },
  importPunches: (rows) => {
    const state = get();
    const nextPunches = [...state.punches];
    rows.forEach((row) => {
      const punchDatetime = new Date(row.punchDatetime);
      if (!row.employeeCode || Number.isNaN(punchDatetime.getTime())) return;
      nextPunches.push({
        id: nextPunches.length + 1,
        employeeCode: row.employeeCode,
        punchDatetime,
      } as BiometricPunch);
    });
    set({ punches: nextPunches });
    return { count: nextPunches.length - state.punches.length };
  },
  createRule: (row) => {
    const state = get();
    const rule: SpecialRule = {
      id: state.nextIds.rule,
      ...row,
    } as SpecialRule;
    set({
      rules: [...state.rules, rule],
      nextIds: { ...state.nextIds, rule: state.nextIds.rule + 1 },
    });
    return rule;
  },
  updateRule: (id, updates) => {
    const state = get();
    let updatedRule: SpecialRule | null = null;
    const rules = state.rules.map((rule) => {
      if (rule.id !== id) return rule;
      updatedRule = { ...rule, ...updates } as SpecialRule;
      return updatedRule;
    });
    if (!updatedRule) return null;
    set({ rules });
    return updatedRule;
  },
  deleteRule: (id) => {
    const state = get();
    set({ rules: state.rules.filter((rule) => rule.id !== id) });
  },
  importRules: (rows) => {
    const state = get();
    let inserted = 0;
    const rules = [...state.rules];
    rows.forEach((row) => {
      const rule: SpecialRule = {
        id: state.nextIds.rule + inserted,
        ...row,
      } as SpecialRule;
      rules.push(rule);
      inserted += 1;
    });
    set({
      rules,
      nextIds: { ...state.nextIds, rule: state.nextIds.rule + inserted },
    });
    return { count: inserted };
  },
  createAdjustment: (row) => {
    const state = get();
    const adjustment: Adjustment = {
      id: state.nextIds.adjustment,
      ...row,
    } as Adjustment;
    set({
      adjustments: [...state.adjustments, adjustment],
      nextIds: { ...state.nextIds, adjustment: state.nextIds.adjustment + 1 },
    });
    return adjustment;
  },
  importAdjustments: (rows) => {
    const state = get();
    const adjustments = [...state.adjustments];
    let inserted = 0;
    rows.forEach((row) => {
      const adjustment: Adjustment = {
        id: state.nextIds.adjustment + inserted,
        ...row,
      } as Adjustment;
      adjustments.push(adjustment);
      inserted += 1;
    });
    set({
      adjustments,
      nextIds: { ...state.nextIds, adjustment: state.nextIds.adjustment + inserted },
    });
    return { inserted, invalid: [] };
  },
  createLeave: (row) => {
    const state = get();
    const leave: Leave = {
      id: state.nextIds.leave,
      ...row,
    } as Leave;
    set({
      leaves: [...state.leaves, leave],
      nextIds: { ...state.nextIds, leave: state.nextIds.leave + 1 },
    });
    return leave;
  },
  deleteLeave: (id) => {
    const state = get();
    set({ leaves: state.leaves.filter((leave) => leave.id !== id) });
  },
  importLeaves: (rows) => {
    const state = get();
    let inserted = 0;
    const leaves = [...state.leaves];
    rows.forEach((row) => {
      const leave: Leave = {
        id: state.nextIds.leave + inserted,
        ...row,
      } as Leave;
      leaves.push(leave);
      inserted += 1;
    });
    set({
      leaves,
      nextIds: { ...state.nextIds, leave: state.nextIds.leave + inserted },
    });
    return { inserted, invalid: [] };
  },
  processAttendance: ({ startDate, endDate, timezoneOffsetMinutes }) => {
    const state = get();
    const records = processAttendanceRecords({
      employees: state.employees,
      punches: state.punches,
      rules: state.rules,
      leaves: state.leaves,
      adjustments: state.adjustments,
      startDate,
      endDate,
      timezoneOffsetMinutes,
    });

    const nextRecordIdStart = state.nextIds.record;
    const withIds = records.map((record, index) => ({
      ...record,
      id: nextRecordIdStart + index,
    }));

    const recordKey = (record: AttendanceRecord) => `${record.employeeCode}__${record.date}`;
    const remaining = state.attendanceRecords.filter((record) => {
      return !(record.date >= startDate && record.date <= endDate);
    });
    const merged = new Map<string, AttendanceRecord>();
    remaining.forEach((record) => merged.set(recordKey(record), record));
    withIds.forEach((record) => merged.set(recordKey(record), record));

    const updatedRecords = Array.from(merged.values());

    set({
      attendanceRecords: updatedRecords,
      nextIds: { ...state.nextIds, record: nextRecordIdStart + withIds.length },
    });

    return { message: "Processing completed", processedCount: withIds.length };
  },
  wipeData: () => {
    set({
      employees: [],
      punches: [],
      rules: [],
      adjustments: [],
      leaves: [],
      attendanceRecords: [],
      nextIds: { employee: 1, rule: 1, adjustment: 1, leave: 1, record: 1 },
    });
  },
}));
