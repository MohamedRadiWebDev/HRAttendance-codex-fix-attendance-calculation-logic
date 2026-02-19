import { describe, expect, it } from "vitest";
import { buildAttendanceExportRows, summaryFormulaByRow } from "@/exporters/attendanceExport";
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
  hireDate: "2020-01-15",
  terminationDate: "",
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
  it("builds تفصيلي + ملخص with stable Arabic headers and no 1970 dates", () => {
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
      {
        id: 2,
        employeeCode: "EMP1",
        date: "2024-06-04",
        checkIn: null,
        checkOut: null,
        totalHours: 0,
        overtimeHours: 0,
        status: "Absent",
        penalties: [{ type: "غياب", value: 1 }] as any,
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
      {
        id: 3,
        employeeCode: " EMP1 ",
        date: "2024-06-05",
        checkIn: new Date("2024-06-05T09:00:00"),
        checkOut: new Date("2024-06-05T17:00:00"),
        totalHours: 8,
        overtimeHours: 0,
        status: "Official Holiday",
        penalties: [],
        isOvernight: false,
        notes: "إجازة رسمية",
        missionStart: null,
        missionEnd: null,
        halfDayExcused: false,
        isOfficialHoliday: true,
        workedOnOfficialHoliday: true,
        compDayCredit: 1,
        leaveDeductionDays: 0,
        excusedAbsenceDays: 0,
        terminationPeriodDays: 0,
        compDaysFriday: 0,
        compDaysOfficial: 1,
        compDaysTotal: 1,
        compDaysUsed: 0,
      },
    ];

    const { detailHeaders, detailRows, summaryHeaders, summaryRows } = buildAttendanceExportRows({
      records,
      employees: [employee],
    });

    expect(detailHeaders).toEqual([
      "التاريخ",
      "اليوم",
      "الكود",
      "اسم الموظف",
      "القسم",
      "تاريخ التعيين",
      "الدخول",
      "الخروج",
      "ساعات العمل",
      "الإضافي",
      "نوع اليوم",
      "الحالة",
      "تأخير",
      "انصراف مبكر",
      "سهو بصمة",
      "غياب",
      "إجمالي الجزاءات",
      "ملاحظات",
    ]);

    expect(summaryHeaders[0]).toBe("الكود");
    expect(summaryHeaders[1]).toBe("اسم الموظف");
    expect(summaryHeaders).toEqual([
      "الكود",
      "اسم الموظف",
      "القسم",
      "تاريخ التعيين",
      "فترة الالتحاق",
      "إجمالي التأخيرات",
      "إجمالي الانصراف المبكر",
      "إجمالي سهو البصمة",
      "إجمالي الغياب",
      "إجمالي الجزاءات",
      "فترة الترك",
      "بدل يوم الجمع",
      "بدل أيام الإجازات الرسمية",
      "إجمالي أيام البدل",
    ]);
    expect(summaryRows.length).toBeGreaterThan(1);
    expect(detailRows.length).toBeGreaterThan(1);

    const firstDetail = detailRows[1];
    expect(firstDetail[2]).toBe("EMP1");
    expect(String(firstDetail[3]).trim().length).toBeGreaterThan(0);
    expect(firstDetail[4]).toBe("غير مسجل");
    expect(typeof firstDetail[5] === "number" || firstDetail[5] === "").toBe(true);

    const summaryRow = summaryRows[1];
    expect(summaryRow[0]).toBe("EMP1");
    expect(String(summaryRow[1]).trim().length).toBeGreaterThan(0);
    expect(summaryRow[2]).toBe("غير مسجل");
    expect(summaryRow[3]).toBeGreaterThan(0);
    expect(summaryRow[4]).toBe(0);
    expect(summaryRow[5]).toBe(0);
    expect(summaryRow[6]).toBe(0);

    // Absence weighting in summary: absenceDays * 2 + excused + leave deduction + termination
    expect(summaryRow[8]).toBe(2);
    expect(summaryRow[11]).toBe(0);
    expect(summaryRow[12]).toBe(1);
    expect(summaryRow[13]).toBe(1);

    const formulas = summaryFormulaByRow(2);
    expect(formulas.E).toBe('IF($D2="","",IF($D2<=$O$1,0,IF($D2>$O$2,$O$2-$O$1+1,$D2-$O$1)))');
    expect(formulas.F).toBe('SUMIF(تفصيلي!$C:$C,$A2,تفصيلي!$M:$M)');
    expect(formulas.I).toBe('SUMIF(تفصيلي!$C:$C,$A2,تفصيلي!$P:$P)*2');
    expect(formulas.L).toBe('COUNTIFS(تفصيلي!$C:$C,$A2,تفصيلي!$K:$K,"جمعة",تفصيلي!$L:$L,"حضور")');
    expect(formulas.M).toBe('COUNTIFS(تفصيلي!$C:$C,$A2,تفصيلي!$K:$K,"إجازة رسمية",تفصيلي!$L:$L,"حضور")');

    const holidayDetailRow = detailRows.find((row) => row[0] !== "التاريخ" && row[10] === "إجازة رسمية");
    expect(holidayDetailRow).toBeTruthy();

    detailRows.flat().forEach((cell) => {
      if (typeof cell === "string") {
        expect(cell.startsWith("=")).toBe(false);
      }
    });
    summaryRows.flat().forEach((cell) => {
      if (typeof cell === "string") {
        expect(cell.startsWith("=")).toBe(false);
      }
    });

    const flat = JSON.stringify({ detailHeaders, detailRows, summaryHeaders, summaryRows });
    expect(flat.includes("1970-01-01")).toBe(false);
    expect(summaryHeaders).toBeDefined();
  });
});
