import { format } from "date-fns";
import type { AttendanceRecord, Employee } from "@shared/schema";
import { parseTimeToSeconds } from "@/lib/datetime";

const dayNames = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];


const toExcelDateSerial = (value: string) => {
  const [yearRaw, monthRaw, dayRaw] = value.split("-").map(Number);
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw) || !Number.isFinite(dayRaw)) return "";
  return (Date.UTC(yearRaw, monthRaw - 1, dayRaw) - Date.UTC(1899, 11, 30)) / 86400000;
};

const toTimeText = (value: unknown) => {
  if (!value) return "";
  if (value instanceof Date) {
    const h = String(value.getHours()).padStart(2, "0");
    const m = String(value.getMinutes()).padStart(2, "0");
    const s = String(value.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  const text = String(value);
  if (text.includes("T")) return text.split("T")[1].slice(0, 8);
  return text.slice(0, 8);
};

export type AttendanceExportResult = {
  detailHeaders: string[];
  detailRows: any[][];
  summaryHeaders: string[];
  summaryRows: any[][];
};

export const buildAttendanceExportRows = ({
  records,
  employees,
}: {
  records: AttendanceRecord[];
  employees: Employee[];
}): AttendanceExportResult => {
  const employeeMap = new Map(employees.map((emp) => [emp.code, emp.nameAr]));

  const detailHeaders = [
    "التاريخ",
    "اليوم",
    "الكود",
    "اسم الموظف",
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
  ];

  const detailRows: any[][] = [detailHeaders];

  const summaryByEmployee = new Map<string, {
    code: string;
    name: string;
    workDays: number;
    fridays: number;
    fridayAttendance: number;
    officialLeaves: number;
    hrLeaves: number;
    officialHolidayDays: number;
    officialHolidayAttendance: number;
    compDayCredits: number;
    absenceDays: number;
    excusedAbsenceDays: number;
    leaveDeductionDays: number;
    terminationPeriodDays: number;
    compDaysFriday: number;
    compDaysOfficial: number;
    compDaysTotal: number;
    compDaysUsed: number;
    lastPunchDate: string;
    totalLate: number;
    totalEarlyLeave: number;
    totalMissingStamp: number;
    totalAbsencePenalty: number;
    totalPenalties: number;
  }>();

  records.forEach((record) => {
    const [yearRaw, monthRaw, dayRaw] = String(record.date || "").split("-").map(Number);
    const year = Number.isFinite(yearRaw) ? yearRaw : 1970;
    const monthIndex = Number.isFinite(monthRaw) ? monthRaw - 1 : 0;
    const dayOfMonth = Number.isFinite(dayRaw) ? dayRaw : 1;
    const dateObj = new Date(year, monthIndex, dayOfMonth);
    const dayIndex = dateObj.getDay();
    const excelDateSerial = (Date.UTC(year, monthIndex, dayOfMonth) - Date.UTC(1899, 11, 30)) / 86400000;
    const isFriday = dayIndex === 5;
    const attendedFriday = record.status === "Friday Attended";
    const isCompDay = record.status === "Comp Day";
    const isOfficialHoliday = Boolean(record.isOfficialHoliday);
    const isOfficialLeave = isCompDay && record.notes === "Official Leave";
    const isHrLeave = isCompDay && !isOfficialLeave;
    const leaveDeductionDays = Number(record.leaveDeductionDays || 0);
    const excusedAbsenceDays = Number(record.excusedAbsenceDays || 0);
    const terminationPeriodDays = Number(record.terminationPeriodDays || 0);
    const dayType = terminationPeriodDays > 0
      ? "فترة ترك"
      : leaveDeductionDays > 0
      ? "إجازة بالخصم"
      : excusedAbsenceDays > 0
      ? "غياب بعذر"
      : record.status === "Leave"
      ? "إجازة"
      : isFriday
      ? "جمعة"
      : isOfficialHoliday
        ? "إجازة رسمية"
        : isOfficialLeave
        ? "إجازة رسمية"
        : isHrLeave
          ? "إجازة"
          : "عمل";
    const autoWorkedOnHoliday = Boolean(record.checkIn || record.checkOut)
      || (typeof record.totalHours === "number" && record.totalHours > 0)
      || Boolean(record.missionStart && record.missionEnd);
    const workedOnHoliday = record.workedOnOfficialHoliday ?? autoWorkedOnHoliday;
    const status = terminationPeriodDays > 0
      ? "إجازة بالخصم (فترة ترك)"
      : leaveDeductionDays > 0
      ? "إجازة بالخصم"
      : excusedAbsenceDays > 0
      ? "غياب بعذر"
      : isFriday
      ? (attendedFriday ? "حضور" : "إجازة")
      : record.status === "Late"
        ? "تأخير"
        : record.status === "Absent"
          ? "غياب"
          : record.status === "Leave" || isCompDay
            ? "إجازة"
            : "حضور";

    let lateValue = 0;
    let earlyLeaveValue = 0;
    let missingStampValue = 0;
    let absenceValue = 0;
    let totalPenalties = 0;
    const notesTokens: string[] = [];
    const penalties = Array.isArray(record.penalties) ? (record.penalties as any[]) : [];
    const hasPenalties = penalties.length > 0;

    if (!isFriday && hasPenalties) {
      penalties.forEach((penalty: any) => {
        const value = Number(penalty.value);
        if (!Number.isFinite(value)) return;
        if (penalty.type === "تأخير") {
          lateValue = value;
          notesTokens.push("تأخير");
        } else if (penalty.type === "انصراف مبكر") {
          earlyLeaveValue = value;
          notesTokens.push("انصراف مبكر");
        } else if (penalty.type === "سهو بصمة") {
          missingStampValue = value;
          notesTokens.push("سهو بصمة");
        } else if (penalty.type === "غياب") {
          absenceValue = value;
          notesTokens.push("غياب");
        }
      });
      const computedPenaltySum =
        lateValue + earlyLeaveValue + missingStampValue + absenceValue * 2;
      totalPenalties = computedPenaltySum;
    }

    if (record.notes?.includes("مبيت")) {
      missingStampValue = 0;
      earlyLeaveValue = 0;
    }

    totalPenalties += excusedAbsenceDays;

    const notes = notesTokens.length > 0
      ? Array.from(new Set(notesTokens)).join(" + ")
      : (record.notes || "").replace(/[\r\n]+/g, " ").trim();

    const detailRow = [
      excelDateSerial,
      dayNames[dayIndex],
      record.employeeCode,
      employeeMap.get(record.employeeCode) || "(غير موجود بالماستر)",
      record.checkIn ? parseTimeToSeconds(toTimeText(record.checkIn)) / 86400 : 0,
      record.checkOut ? parseTimeToSeconds(toTimeText(record.checkOut)) / 86400 : 0,
      typeof record.totalHours === "number" ? Number(record.totalHours.toFixed(2)) : 0,
      typeof record.overtimeHours === "number" ? Number(record.overtimeHours.toFixed(2)) : 0,
      dayType,
      status,
      lateValue,
      earlyLeaveValue,
      missingStampValue,
      absenceValue,
      totalPenalties,
      notes,
    ];

    detailRows.push(detailRow);

    const summary = summaryByEmployee.get(record.employeeCode) || {
      code: record.employeeCode,
      name: employeeMap.get(record.employeeCode) || "(غير موجود بالماستر)",
      workDays: 0,
      fridays: 0,
      fridayAttendance: 0,
      officialLeaves: 0,
      hrLeaves: 0,
      officialHolidayDays: 0,
      officialHolidayAttendance: 0,
      compDayCredits: 0,
      absenceDays: 0,
      excusedAbsenceDays: 0,
      leaveDeductionDays: 0,
      terminationPeriodDays: 0,
      compDaysFriday: 0,
      compDaysOfficial: 0,
      compDaysTotal: 0,
      compDaysUsed: 0,
      lastPunchDate: "",
      totalLate: 0,
      totalEarlyLeave: 0,
      totalMissingStamp: 0,
      totalAbsencePenalty: 0,
      totalPenalties: 0,
    };

    if (dayType === "عمل") summary.workDays += 1;
    if (dayType === "جمعة") summary.fridays += 1;
    if (isFriday && attendedFriday) summary.fridayAttendance += 1;
    if (isOfficialHoliday) summary.officialHolidayDays += 1;
    if (isOfficialHoliday && workedOnHoliday) summary.officialHolidayAttendance += 1;
    if (isOfficialHoliday && workedOnHoliday) summary.compDayCredits += 1;
    if (dayType === "إجازة رسمية" && !isOfficialHoliday) summary.officialLeaves += 1;
    if (dayType === "إجازة") summary.hrLeaves += 1;
    if (!isFriday && record.status === "Absent") summary.absenceDays += 1;
    if (excusedAbsenceDays > 0) summary.excusedAbsenceDays += excusedAbsenceDays;
    if (leaveDeductionDays > 0) summary.leaveDeductionDays += leaveDeductionDays;
    if (terminationPeriodDays > 0) summary.terminationPeriodDays += terminationPeriodDays;
    summary.compDaysFriday += Number(record.compDaysFriday || 0);
    summary.compDaysOfficial += Number(record.compDaysOfficial || 0);
    summary.compDaysTotal += Number(record.compDaysTotal || 0);
    summary.compDaysUsed += Number((record as any).compDaysUsed || 0);
    if (record.checkIn || record.checkOut) {
      const candidate = record.checkOut || record.checkIn;
      if (candidate) {
        const key = format(candidate, "yyyy-MM-dd");
        if (!summary.lastPunchDate || key > summary.lastPunchDate) summary.lastPunchDate = key;
      }
    }

    if (!isFriday && hasPenalties) {
      penalties.forEach((penalty: any) => {
        const value = Number(penalty.value);
        if (!Number.isFinite(value)) return;
        summary.totalPenalties += value;
        if (penalty.type === "تأخير") summary.totalLate += value;
        if (penalty.type === "انصراف مبكر") summary.totalEarlyLeave += value;
        if (penalty.type === "سهو بصمة") summary.totalMissingStamp += value;
        if (penalty.type === "غياب") summary.totalAbsencePenalty += value;
      });
    }

    summaryByEmployee.set(record.employeeCode, summary);
  });

  const summaryHeaders = [
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
  ];

  const summaryRows: any[][] = [summaryHeaders];
  Array.from(summaryByEmployee.values()).forEach((summary) => {
    const summaryAbsenceTotal =
      summary.absenceDays * 2 +
      summary.excusedAbsenceDays +
      summary.leaveDeductionDays +
      summary.terminationPeriodDays;
    const summaryPenaltiesTotal = summary.totalLate + summary.totalEarlyLeave + summary.totalMissingStamp + summaryAbsenceTotal;
    const compEarned = summary.compDaysTotal;
    const compUsed = summary.compDaysUsed;
    const compBalance = compEarned - compUsed;
    summaryRows.push([
      summary.code,
      summary.name,
      summary.workDays,
      summary.fridays,
      summary.fridayAttendance,
      summary.officialLeaves,
      summary.hrLeaves,
      summary.absenceDays,
      summary.excusedAbsenceDays,
      summary.leaveDeductionDays,
      summary.terminationPeriodDays,
      summaryAbsenceTotal,
      summary.officialHolidayDays,
      summary.officialHolidayAttendance,
      summary.compDaysFriday,
      summary.compDaysOfficial,
      compEarned,
      compUsed,
      compBalance,
      summary.totalLate,
      summary.totalEarlyLeave,
      summary.totalMissingStamp,
      summaryPenaltiesTotal,
      summary.lastPunchDate ? toExcelDateSerial(summary.lastPunchDate) : 0,
    ]);
  });

  return { detailHeaders, detailRows, summaryHeaders, summaryRows };
};
