import { describe, expect, it } from "vitest";
import { buildAttendanceExportRows } from "@/exporters/attendanceExport";
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
  hireDate: "",
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
      "الدخول",
      "الخروج",
      "ساعات العمل",
      "الإضافي",
      "نوع اليوم",
      "حضر في الإجازة الرسمية؟",
      "يوم بالبدل",
      "الحالة",
      "تأخير",
      "انصراف مبكر",
      "سهو بصمة",
      "غياب",
      "غياب بعذر",
      "إجازة بالخصم",
      "فترة الترك",
      "إجمالي الجزاءات",
      "ملاحظات",
    ]);

    expect(summaryHeaders[0]).toBe("الكود");
    expect(summaryHeaders[1]).toBe("الاسم");
    expect(summaryHeaders).toEqual([
      "الكود",
      "الاسم",
      "عدد أيام العمل",
      "عدد أيام الجمعة",
      "عدد أيام حضور الجمعة",
      "عدد أيام الإجازات الرسمية",
      "عدد أيام الإجازات (المحددة)",
      "عدد أيام الغياب",
      "عدد أيام الغياب بعذر",
      "عدد أيام الإجازة بالخصم",
      "فترة الترك",
      "إجمالي الغياب (بالخصم)",
      "اجمالي الاجازات الرسمية",
      "اجمالي حضور الاجازات الرسمية",
      "بدل يوم الجمع",
      "بدل الإجازات الرسمية",
      "بدل مكتسب",
      "بدل مستخدم",
      "رصيد البدل",
      "إجمالي التأخيرات",
      "إجمالي الانصراف المبكر",
      "إجمالي سهو البصمة",
      "إجمالي الجزاءات",
      "آخر يوم بصمة",
    ]);
    expect(summaryRows.length).toBeGreaterThan(1);
    expect(detailRows.length).toBeGreaterThan(1);

    const firstDetail = detailRows[1];
    expect(firstDetail[2]).toBe("EMP1");
    expect(String(firstDetail[3]).trim().length).toBeGreaterThan(0);

    const summaryRow = summaryRows[1];
    expect(summaryRow[0]).toBe("EMP1");
    expect(String(summaryRow[1]).trim().length).toBeGreaterThan(0);
    expect(typeof summaryRow[23]).toBe("number");
    expect(summaryRow[23]).toBeGreaterThan(0);

    // Absence weighting in summary: absenceDays * 2 + excusedAbsenceDays
    expect(summaryRow[7]).toBe(1); // absenceDays
    expect(summaryRow[11]).toBe(2); // weighted absence total

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
