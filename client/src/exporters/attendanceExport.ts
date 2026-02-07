import type { AttendanceRecord, Employee } from "@shared/schema";

const dayNames = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const toExcelTime = (value: Date) => {
  const seconds = value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  return seconds / 86400;
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
    absenceDays: number;
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
    const isOfficialLeave = isCompDay && record.notes === "Official Leave";
    const isHrLeave = isCompDay && !isOfficialLeave;
    const dayType = isFriday
      ? "جمعة"
      : isOfficialLeave
        ? "إجازة رسمية"
        : isHrLeave
          ? "إجازة"
          : "عمل";
    const status = isFriday
      ? (attendedFriday ? "حضور" : "إجازة")
      : record.status === "Late"
        ? "تأخير"
        : record.status === "Absent"
          ? "غياب"
          : isCompDay
            ? "إجازة"
            : "حضور";

    let lateValue: number | string = "";
    let earlyLeaveValue: number | string = "";
    let missingStampValue: number | string = "";
    let absenceValue: number | string = "";
    let totalPenalties: number | string = "";
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
        (typeof lateValue === "number" ? lateValue : 0) +
        (typeof earlyLeaveValue === "number" ? earlyLeaveValue : 0) +
        (typeof missingStampValue === "number" ? missingStampValue : 0) +
        (typeof absenceValue === "number" ? absenceValue * 2 : 0);
      if (computedPenaltySum > 0) {
        totalPenalties = computedPenaltySum;
      }
    }

    const notes = notesTokens.length > 0
      ? Array.from(new Set(notesTokens)).join(" + ")
      : (record.notes || "").replace(/[\r\n]+/g, " ").trim();

    const isZero = (value: number | string) => typeof value === "number" && value === 0;

    const detailRow = [
      excelDateSerial,
      dayNames[dayIndex],
      record.employeeCode,
      employeeMap.get(record.employeeCode) || "(غير موجود بالماستر)",
      record.checkIn ? toExcelTime(new Date(record.checkIn)) : "-",
      record.checkOut ? toExcelTime(new Date(record.checkOut)) : "-",
      typeof record.totalHours === "number" ? Number(record.totalHours.toFixed(2)) : "-",
      record.overtimeHours && record.overtimeHours > 0 ? Number(record.overtimeHours.toFixed(2)) : "-",
      dayType,
      status,
      isZero(lateValue) ? "" : lateValue,
      isZero(earlyLeaveValue) ? "" : earlyLeaveValue,
      isZero(missingStampValue) ? "" : missingStampValue,
      isZero(absenceValue) ? "" : absenceValue,
      isZero(totalPenalties) ? "" : totalPenalties,
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
      absenceDays: 0,
      totalLate: 0,
      totalEarlyLeave: 0,
      totalMissingStamp: 0,
      totalAbsencePenalty: 0,
      totalPenalties: 0,
    };

    if (dayType === "عمل") summary.workDays += 1;
    if (dayType === "جمعة") summary.fridays += 1;
    if (isFriday && attendedFriday) summary.fridayAttendance += 1;
    if (dayType === "إجازة رسمية") summary.officialLeaves += 1;
    if (dayType === "إجازة") summary.hrLeaves += 1;
    if (!isFriday && record.status === "Absent") summary.absenceDays += 1;

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
    "إجمالي التأخيرات",
    "إجمالي الانصراف المبكر",
    "إجمالي سهو البصمة",
    "إجمالي الغياب",
    "إجمالي الجزاءات",
  ];

  const summaryRows: any[][] = [summaryHeaders];
  Array.from(summaryByEmployee.values()).forEach((summary) => {
    const summaryAbsenceTotal = summary.absenceDays * 2;
    const summaryPenaltiesTotal = summary.totalLate + summary.totalEarlyLeave + summary.totalMissingStamp + summaryAbsenceTotal;
    summaryRows.push([
      summary.code,
      summary.name,
      summary.workDays,
      summary.fridays,
      summary.fridayAttendance,
      summary.officialLeaves,
      summary.hrLeaves,
      summary.absenceDays,
      summary.totalLate,
      summary.totalEarlyLeave,
      summary.totalMissingStamp,
      summaryAbsenceTotal,
      summaryPenaltiesTotal,
    ]);
  });

  return { detailHeaders, detailRows, summaryHeaders, summaryRows };
};
