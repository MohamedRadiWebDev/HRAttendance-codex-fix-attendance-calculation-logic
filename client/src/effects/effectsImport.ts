import * as XLSX from "xlsx";
import { normalizeEmployeeCode } from "@shared/employee-code";
import { normalizeEffectDateKey, normalizeEffectTimeKey, normalizeEffectType } from "@shared/effect-normalization";
import { resolveShiftForDate, timeStringToSeconds } from "@/engine/attendanceEngine";
import type { Employee, BiometricPunch, SpecialRule } from "@shared/schema";
import type { Effect } from "@/store/effectsStore";

export const EFFECT_IMPORT_HEADERS_REQUIRED = ["الكود", "الاسم", "التاريخ", "من", "إلى", "النوع"] as const;
export const EFFECT_IMPORT_HEADERS_OPTIONAL = ["الحالة", "ملاحظة"] as const;

export type ParsedEffectValidation = {
  rowIndex: number;
  valid: boolean;
  reason?: string;
};

export type ParseEffectsResult = {
  validRows: Omit<Effect, "id" | "createdAt" | "updatedAt">[];
  invalidRows: ParsedEffectValidation[];
};

const excelDateToText = (value: unknown) => {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return value;
};

const excelTimeToText = (value: unknown) => {
  if (typeof value === "number") {
    const sec = Math.round(value * 24 * 3600);
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}`;
  }
  return value;
};

const inferHalfDaySide = ({
  employeeCode,
  date,
  punches,
  shiftStart,
  shiftEnd,
}: {
  employeeCode: string;
  date: string;
  punches: BiometricPunch[];
  shiftStart: string;
  shiftEnd: string;
}) => {
  const dayPunches = punches
    .filter((p) => normalizeEmployeeCode(p.employeeCode) === employeeCode)
    .filter((p) => {
      const d = new Date(p.punchDatetime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return key === date;
    })
    .sort((a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime());

  if (dayPunches.length === 0) return "morning" as const;

  const checkIn = dayPunches[0];
  const checkOut = dayPunches[dayPunches.length - 1];
  const checkInSec = checkIn.punchDatetime.getHours() * 3600 + checkIn.punchDatetime.getMinutes() * 60;
  const checkOutSec = checkOut.punchDatetime.getHours() * 3600 + checkOut.punchDatetime.getMinutes() * 60;
  const shiftStartSec = timeStringToSeconds(shiftStart);
  const shiftEndSec = timeStringToSeconds(shiftEnd);

  if (checkOutSec <= shiftEndSec - 2 * 3600) return "evening" as const;
  if (checkInSec >= shiftStartSec + 2 * 3600) return "morning" as const;
  return "morning" as const;
};

export const parseEffectsSheet = ({
  file,
  employees,
  punches,
  rules,
}: {
  file: File;
  employees: Employee[];
  punches: BiometricPunch[];
  rules: SpecialRule[];
}): Promise<ParseEffectsResult> => new Promise(async (resolve, reject) => {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    const headers = (rows[0] || []).map((h) => String(h || "").trim());

    const requiredMatched = EFFECT_IMPORT_HEADERS_REQUIRED.every((header, idx) => headers[idx] === header);
    if (!requiredMatched) {
      return reject(new Error("رأس الملف غير مطابق. الأعمدة المطلوبة: الكود | الاسم | التاريخ | من | إلى | النوع"));
    }

    const employeeMap = new Map((employees || []).map((e) => [normalizeEmployeeCode(e.code), e]));
    const validRows: Omit<Effect, "id" | "createdAt" | "updatedAt">[] = [];
    const invalidRows: ParsedEffectValidation[] = [];

    rows.slice(1).forEach((row, index) => {
      const rowIndex = index + 2;
      const employeeCode = normalizeEmployeeCode(row[0]);
      const employeeName = String(row[1] || "").trim();
      const date = normalizeEffectDateKey(excelDateToText(row[2]));
      let fromTime = normalizeEffectTimeKey(excelTimeToText(row[3]));
      let toTime = normalizeEffectTimeKey(excelTimeToText(row[4]));
      const type = normalizeEffectType(row[5]);
      const status = String(row[6] || "").trim();
      const note = String(row[7] || "").trim();

      if (!employeeCode) return invalidRows.push({ rowIndex, valid: false, reason: "الكود مطلوب" });
      const emp = employeeMap.get(employeeCode);
      if (!emp) return invalidRows.push({ rowIndex, valid: false, reason: "كود الموظف غير موجود" });
      if (!date) return invalidRows.push({ rowIndex, valid: false, reason: "تاريخ غير صالح" });
      if (!type) return invalidRows.push({ rowIndex, valid: false, reason: "النوع مطلوب" });

      const shift = resolveShiftForDate({ employee: emp, dateStr: date, rules });
      const shiftStartSec = timeStringToSeconds(shift.shiftStart);
      const shiftEndSec = timeStringToSeconds(shift.shiftEnd);

      if (type === "مأمورية" && (!fromTime || !toTime)) {
        return invalidRows.push({ rowIndex, valid: false, reason: "المأمورية تتطلب من وإلى" });
      }

      if ((type === "اذن صباحي" || type === "اذن مسائي") && (!fromTime || !toTime)) {
        // keep empty: engine defaults by shift + config
        fromTime = "";
        toTime = "";
      }

      if ((type === "اجازة نصف يوم" || type === "اجازة نص يوم") && (!fromTime || !toTime)) {
        const side = inferHalfDaySide({ employeeCode, date, punches, shiftStart: shift.shiftStart, shiftEnd: shift.shiftEnd });
        if (side === "morning") {
          fromTime = `${String(Math.floor(shiftStartSec / 3600)).padStart(2, "0")}:${String(Math.floor((shiftStartSec % 3600) / 60)).padStart(2, "0")}`;
          toTime = `${String(Math.floor((shiftStartSec + 4 * 3600) / 3600)).padStart(2, "0")}:${String(Math.floor(((shiftStartSec + 4 * 3600) % 3600) / 60)).padStart(2, "0")}`;
        } else {
          fromTime = `${String(Math.floor((shiftEndSec - 4 * 3600) / 3600)).padStart(2, "0")}:${String(Math.floor(((shiftEndSec - 4 * 3600) % 3600) / 60)).padStart(2, "0")}`;
          toTime = `${String(Math.floor(shiftEndSec / 3600)).padStart(2, "0")}:${String(Math.floor((shiftEndSec % 3600) / 60)).padStart(2, "0")}`;
        }
      }

      validRows.push({
        employeeCode,
        employeeName,
        date,
        fromTime,
        toTime,
        type,
        status,
        note,
        source: "excel",
      });
    });

    resolve({ validRows, invalidRows });
  } catch (error) {
    reject(error);
  }
});

export const buildEffectsTemplateWorkbook = () => {
  const data = [
    [...EFFECT_IMPORT_HEADERS_REQUIRED, ...EFFECT_IMPORT_HEADERS_OPTIONAL],
    ["648", "أحمد علي", "2025-01-05", "", "", "إذن صباحي", "موافق", "سماح أول ساعتين"],
    ["648", "أحمد علي", "2025-01-06", "", "", "إذن مسائي", "موافق", "سماح آخر ساعتين"],
    ["701", "منى سالم", "2025-01-07", "", "", "إجازة نصف يوم", "موافق", "نصف يوم"],
    ["701", "منى سالم", "2025-01-08", "10:00", "14:00", "مأمورية", "موافق", "مأمورية ميدانية"],
    ["702", "عمرو محمد", "2025-01-09", "", "", "غياب بعذر", "معتمد", "مستند طبي"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المؤثرات");
  return wb;
};
