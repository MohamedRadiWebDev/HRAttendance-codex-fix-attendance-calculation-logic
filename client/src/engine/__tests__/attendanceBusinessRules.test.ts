import { describe, expect, it } from "vitest";
import { processAttendanceRecords } from "@/engine/attendanceEngine";
import type { Adjustment, Employee, OfficialHoliday } from "@shared/schema";

const baseEmployee: Employee = {
  id: 1,
  code: "101",
  nameAr: "أحمد محمود",
  sector: null,
  department: null,
  section: null,
  jobTitle: null,
  branch: null,
  governorate: null,
  hireDate: null,
  terminationDate: null,
  terminationReason: null,
  serviceDuration: null,
  directManager: null,
  deptManager: null,
  nationalId: null,
  birthDate: null,
  address: null,
  birthPlace: null,
  personalPhone: null,
  emergencyPhone: null,
  shiftStart: "09:00",
};

const buildAdjustment = (date: string, type: Adjustment["type"]): Adjustment => ({
  id: 1,
  employeeCode: "101",
  date,
  type,
  fromTime: "00:00",
  toTime: "23:59",
  source: "manual",
  sourceFileName: null,
  importedAt: new Date(),
  note: null,
});

describe("attendance business rules", () => {
  it("marks absent day as غياب with penalty 2 in summary math", () => {
    const records = processAttendanceRecords({
      employees: [baseEmployee],
      punches: [],
      rules: [],
      leaves: [],
      officialHolidays: [],
      adjustments: [],
      startDate: "2024-03-04",
      endDate: "2024-03-04",
    });
    expect(records[0].status).toBe("Absent");
    expect(records[0].penalties?.length).toBeGreaterThan(0);
  });

  it("marks غياب بعذر with deduction 1 and no penalties", () => {
    const records = processAttendanceRecords({
      employees: [baseEmployee],
      punches: [],
      rules: [],
      leaves: [],
      officialHolidays: [],
      adjustments: [buildAdjustment("2024-03-04", "غياب بعذر")],
      startDate: "2024-03-04",
      endDate: "2024-03-04",
    });
    expect(records[0].status).toBe("Excused Absence");
    expect(records[0].excusedAbsenceDays).toBe(1);
    expect(records[0].penalties?.length).toBe(0);
  });

  it("marks إجازة بالخصم with deduction and no penalties", () => {
    const records = processAttendanceRecords({
      employees: [baseEmployee],
      punches: [],
      rules: [],
      leaves: [],
      officialHolidays: [],
      adjustments: [buildAdjustment("2024-03-04", "إجازة بالخصم")],
      startDate: "2024-03-04",
      endDate: "2024-03-04",
    });
    expect(records[0].status).toBe("Leave Deduction");
    expect(records[0].leaveDeductionDays).toBe(1);
    expect(records[0].penalties?.length).toBe(0);
  });

  it("treats days after termination date as فترة ترك", () => {
    const employee = { ...baseEmployee, terminationDate: "2024-03-04" };
    const records = processAttendanceRecords({
      employees: [employee],
      punches: [],
      rules: [],
      leaves: [],
      officialHolidays: [],
      adjustments: [],
      startDate: "2024-03-04",
      endDate: "2024-03-05",
    });
    expect(records[1].status).toBe("Termination Period");
    expect(records[1].terminationPeriodDays).toBe(1);
    expect(records[1].leaveDeductionDays).toBe(1);
  });

  it("counts comp days for Friday and official holidays when worked", () => {
    const punches = [
      {
        id: 1,
        employeeCode: "101",
        punchDatetime: new Date("2024-03-01T12:00:00Z"),
      },
      {
        id: 2,
        employeeCode: "101",
        punchDatetime: new Date("2024-03-02T12:00:00Z"),
      },
    ];
    const officialHolidays: OfficialHoliday[] = [{ id: 1, date: "2024-03-02", name: "إجازة" }];
    const records = processAttendanceRecords({
      employees: [baseEmployee],
      punches,
      rules: [],
      leaves: [],
      officialHolidays,
      adjustments: [],
      startDate: "2024-03-01",
      endDate: "2024-03-02",
    });
    const fridayRecord = records.find((record) => record.date === "2024-03-01");
    const holidayRecord = records.find((record) => record.date === "2024-03-02");
    expect(fridayRecord?.compDaysFriday).toBe(1);
    expect(holidayRecord?.compDaysOfficial).toBe(1);
  });
});
