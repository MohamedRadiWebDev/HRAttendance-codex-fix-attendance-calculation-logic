import { describe, expect, it } from "vitest";
import { buildAttendanceExportRows } from "@/exporters/attendanceExport";
import type { AttendanceRecord, Employee } from "@shared/schema";

describe("export workbook checks", () => {
  it("builds detail + summary and avoids 1970 dates", () => {
    const employee: Employee = {
      id: 1, code: "EMP1", nameAr: "Test", sector: "", department: "", section: "", jobTitle: "", branch: "", governorate: "", hireDate: "", terminationDate: "", terminationReason: "", serviceDuration: "", directManager: "", deptManager: "", nationalId: "", birthDate: "", address: "", birthPlace: "", personalPhone: "", emergencyPhone: "", shiftStart: "09:00"
    };
    const record: AttendanceRecord = {
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
    };
    const rows = buildAttendanceExportRows({ records: [record], employees: [employee] });
    expect(rows.detailRows[0][0]).toBe("التاريخ");
    expect(rows.summaryRows[0][0]).toBe("الكود");
    expect(rows.detailRows.length).toBeGreaterThan(1);
    expect(rows.summaryRows.length).toBeGreaterThan(1);
    expect(JSON.stringify(rows).includes("1970-01-01")).toBe(false);
  });
});
