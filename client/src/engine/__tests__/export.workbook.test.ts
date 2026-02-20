import { describe, expect, it } from "vitest";
import {
  buildAttendanceExportRows,
  calculateOnboardingDays,
  calculateTerminationPeriodDays,
  summaryFormulaByRow,
} from "@/exporters/attendanceExport";
import type { AttendanceRecord, Employee } from "@shared/schema";

const employee: Employee = {
  id: 1,
  code: "EMP1",
  nameAr: "موظف اختبار",
  sector: "",
  department: "",
  section: "",
  jobTitle: "",
  branch: "",
  governorate: "",
  hireDate: "2024-06-02",
  terminationDate: "2024-06-04",
  terminationReason: "",
  serviceDuration: "",
  directManager: "",
  deptManager: "",
  nationalId: "",
  birthDate: "",
  address: "",
  birthPlace: "",
  personalPhone: "",
  emergencyPhone: "",
  shiftStart: "09:00",
};

describe("export workbook checks", () => {
  it("builds تفصيلي + ملخص with expected columns and valid values", () => {
    const records: AttendanceRecord[] = [
      {
        id: 1,
        employeeCode: "EMP1",
        date: "2024-06-03",
        checkIn: new Date("2024-06-03T09:00:00"),
        checkOut: new Date("2024-06-03T17:00:00"),
        totalHours: 8,
        overtimeHours: 0,
        status: "Present",
        penalties: [],
        isOvernight: false,
        notes: null,
        missionStart: null,
        missionEnd: null,
        halfDayExcused: false,
        isOfficialHoliday: false,
        workedOnOfficialHoliday: null,
        compDayCredit: 0,
        leaveDeductionDays: 0,
        excusedAbsenceDays: 0,
        terminationPeriodDays: 0,
        compDaysFriday: 0,
        compDaysOfficial: 0,
        compDaysTotal: 0,
        compDaysUsed: 0,
      },
    ];

    const { detailHeaders, detailRows, summaryHeaders, summaryRows } = buildAttendanceExportRows({
      records,
      employees: [employee],
      reportStartDate: "2024-06-01",
      reportEndDate: "2024-06-10",
    });

    expect(detailRows.length).toBeGreaterThan(1);
    expect(summaryRows.length).toBeGreaterThan(1);

    ["تاريخ التعيين", "تاريخ ترك العمل", "فترة الالتحاق", "فترة الترك"].forEach((header) => {
      expect(detailHeaders).toContain(header);
      expect(summaryHeaders).toContain(header);
    });

    const detailFirst = detailRows[1];
    expect(String(detailFirst[2]).trim().length).toBeGreaterThan(0);
    expect(String(detailFirst[3]).trim().length).toBeGreaterThan(0);
    expect(typeof detailFirst[7]).toBe("number");
    expect(detailFirst[7]).toBeGreaterThanOrEqual(0);
    expect(typeof detailFirst[8]).toBe("number");
    expect(detailFirst[8]).toBeGreaterThanOrEqual(0);

    const summaryFirst = summaryRows[1];
    expect(String(summaryFirst[0]).trim().length).toBeGreaterThan(0);
    expect(String(summaryFirst[1]).trim().length).toBeGreaterThan(0);
    expect(typeof summaryFirst[5]).toBe("number");
    expect(summaryFirst[5]).toBeGreaterThanOrEqual(0);
    expect(typeof summaryFirst[11]).toBe("number");
    expect(summaryFirst[11]).toBeGreaterThanOrEqual(0);

    const flat = JSON.stringify({ detailRows, summaryRows });
    expect(flat.includes("1970-01-01")).toBe(false);

    const formulas = summaryFormulaByRow(2);
    expect(formulas.G).toBe("SUMIF(تفصيلي!$C:$C,$A2,تفصيلي!$N:$N)");
    expect(formulas.J).toBe("SUMIF(تفصيلي!$C:$C,$A2,تفصيلي!$Q:$Q)*2");
    expect(formulas.M).toBe('COUNTIFS(تفصيلي!$C:$C,$A2,تفصيلي!$L:$L,"جمعة",تفصيلي!$M:$M,"حضور")');
    expect(formulas.N).toBe('COUNTIFS(تفصيلي!$C:$C,$A2,تفصيلي!$L:$L,"إجازة رسمية",تفصيلي!$M:$M,"حضور")');
  });

  it("calculates onboarding and termination periods and clamps to zero", () => {
    expect(calculateOnboardingDays("2025-02-09", "2025-02-01")).toBe(8);
    expect(calculateOnboardingDays("2025-02-01", "2025-02-01")).toBe(0);
    expect(calculateOnboardingDays("2025-01-20", "2025-02-01")).toBe(0);

    expect(calculateTerminationPeriodDays("2025-02-10", "2025-02-23")).toBe(13);
    expect(calculateTerminationPeriodDays("2025-02-23", "2025-02-23")).toBe(0);
    expect(calculateTerminationPeriodDays("2025-03-01", "2025-02-23")).toBe(0);
    expect(calculateTerminationPeriodDays("", "2025-02-23")).toBe(0);
  });
});
