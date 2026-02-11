import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/use-employees";
import { useAttendanceStore } from "@/store/attendanceStore";
import { useEffectsStore, type Effect } from "@/store/effectsStore";
import { resolveShiftForDate, secondsToHms, timeStringToSeconds } from "@/engine/attendanceEngine";
import type { InsertAdjustment, InsertLeave } from "@shared/schema";
import { normalizeEmployeeCode } from "@shared/employee-code";

const EFFECT_HEADERS = ["الكود", "الاسم", "التاريخ", "من", "إلى", "النوع", "الحالة", "ملاحظة"];
const SUPPORTED_TYPES = [
  "مأمورية",
  "إذن صباحي",
  "إذن مسائي",
  "إذن (عام)",
  "إجازة نصف يوم",
  "إجازة من الرصيد",
  "إجازة بالخصم",
  "إجازة رسمية",
  "إجازة تحصيل",
  "غياب بعذر",
] as const;

type SupportedType = (typeof SUPPORTED_TYPES)[number];
type RowStatus = "Valid" | "Auto-filled" | "Auto-inferred" | "Invalid";

type ParsedEffectRow = {
  rowIndex: number;
  employeeCode: string;
  employeeName: string;
  date: string;
  fromTime: string;
  toTime: string;
  type: SupportedType;
  status: string;
  note: string;
  normalizedType: string;
  state: RowStatus;
  reason?: string;
};

const toHms = (seconds: number) => {
  const clamped = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(clamped / 3600)).padStart(2, "0");
  const m = String(Math.floor((clamped % 3600) / 60)).padStart(2, "0");
  const s = String(clamped % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return format(value, "yyyy-MM-dd");
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return format(date, "yyyy-MM-dd");
    }
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd");
};

const normalizeTime = (value: unknown) => {
  if (typeof value === "number") {
    return toHms(Math.round(value * 24 * 60 * 60));
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const [h = "0", m = "0", s = "0"] = text.split(":");
  return `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}:${String(Number(s)).padStart(2, "0")}`;
};

const LOCAL_OFFSET_MINUTES = -120;
const toLocalDateKey = (date: Date) => {
  const shifted = new Date(date.getTime() - LOCAL_OFFSET_MINUTES * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function BulkAdjustmentsImport() {
  const { data: employees } = useEmployees();
  const rules = useAttendanceStore((s) => s.rules);
  const punches = useAttendanceStore((s) => s.punches);
  const adjustments = useAttendanceStore((s) => s.adjustments);
  const leaves = useAttendanceStore((s) => s.leaves);
  const setAdjustments = useAttendanceStore((s) => s.setAdjustments);
  const setLeaves = useAttendanceStore((s) => s.setLeaves);
  const processAttendance = useAttendanceStore((s) => s.processAttendance);
  const config = useAttendanceStore((s) => s.config);

  const effects = useEffectsStore((s) => s.effects);
  const setEffects = useEffectsStore((s) => s.setEffects);
  const clearEffects = useEffectsStore((s) => s.clearEffects);

  const { toast } = useToast();

  const employeeMap = useMemo(() => new Map((employees || []).map((e) => [normalizeEmployeeCode(e.code), e])), [employees]);

  const [fileName, setFileName] = useState("");
  const [validationRows, setValidationRows] = useState<ParsedEffectRow[]>([]);

  const inferGenericSide = (employeeCode: string, date: string, shiftStartSec: number) => {
    const dayPunches = punches
      .filter((p) => p.employeeCode === employeeCode && toLocalDateKey(p.punchDatetime) === date)
      .sort((a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime());
    const checkIn = dayPunches[0];
    if (!checkIn) return "مسائي" as const;
    const local = new Date(checkIn.punchDatetime.getTime() - LOCAL_OFFSET_MINUTES * 60 * 1000);
    const checkInSec = local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds();
    return checkInSec >= shiftStartSec + 2 * 3600 ? "صباحي" : "مسائي";
  };

  const validRows = useMemo(() => validationRows.filter((r) => r.state !== "Invalid"), [validationRows]);
  const invalidRows = useMemo(() => validationRows.filter((r) => r.state === "Invalid"), [validationRows]);

  const mapRowsToEffects = (rows: ParsedEffectRow[]) => rows.map<Effect>((row) => ({
    id: `${Date.now()}_${row.rowIndex}_${Math.random().toString(36).slice(2, 8)}`,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    date: row.date,
    from: row.fromTime || "00:00:00",
    to: row.toTime || "00:00:00",
    type: row.normalizedType,
    status: row.status,
    note: row.note,
    createdAt: new Date().toISOString(),
  }));

  const applyEffectsToAttendance = (rows: Effect[], sourceFileName?: string) => {
    if (!rows.length) {
      toast({ title: "تنبيه", description: "لا توجد مؤثرات محفوظة للتطبيق.", variant: "destructive" });
      return;
    }

    const adjustmentMap = new Map<string, any>();
    adjustments.forEach((adj) => adjustmentMap.set(`${adj.employeeCode}__${adj.date}__${adj.type}__${adj.fromTime}__${adj.toTime}`, adj));
    const leaveMap = new Map<string, any>();
    leaves.forEach((leave) => leaveMap.set(`${leave.type}__${leave.scope}__${leave.scopeValue || ""}__${leave.startDate}__${leave.endDate}`, leave));

    let nextAdjustmentId = Math.max(0, ...adjustments.map((a) => a.id || 0)) + 1;
    let nextLeaveId = Math.max(0, ...leaves.map((l) => l.id || 0)) + 1;

    rows.forEach((row) => {
      if (row.type === "إجازة رسمية" || row.type === "إجازة تحصيل") {
        const leaveRow: InsertLeave = {
          type: row.type === "إجازة رسمية" ? "official" : "collections",
          scope: "emp",
          scopeValue: row.employeeCode,
          startDate: row.date,
          endDate: row.date,
          note: row.note || "",
          createdAt: new Date(),
        };
        const key = `${leaveRow.type}__${leaveRow.scope}__${leaveRow.scopeValue}__${leaveRow.startDate}__${leaveRow.endDate}`;
        if (!leaveMap.has(key)) leaveMap.set(key, { id: nextLeaveId++, ...leaveRow });
        return;
      }

      const normalizedType = row.type === "إذن صباحي" ? "اذن صباحي" : row.type === "إذن مسائي" ? "اذن مسائي" : row.type;
      const adjustment: InsertAdjustment = {
        employeeCode: row.employeeCode,
        date: row.date,
        fromTime: row.from || "00:00:00",
        toTime: row.to || "00:00:00",
        type: normalizedType as any,
        source: "effects_import",
        sourceFileName: sourceFileName || fileName || "effects.xlsx",
        importedAt: new Date(),
        note: [row.note, row.status ? `الحالة: ${row.status}` : ""].filter(Boolean).join(" | "),
      };
      const key = `${adjustment.employeeCode}__${adjustment.date}__${adjustment.type}__${adjustment.fromTime}__${adjustment.toTime}`;
      if (!adjustmentMap.has(key)) adjustmentMap.set(key, { id: nextAdjustmentId++, ...adjustment });
    });

    setAdjustments(Array.from(adjustmentMap.values()));
    setLeaves(Array.from(leaveMap.values()));

    const affectedDates = Array.from(new Set(rows.map((row) => row.date))).sort();
    if (affectedDates.length > 0) {
      processAttendance({
        startDate: affectedDates[0],
        endDate: affectedDates[affectedDates.length - 1],
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        employeeCodes: Array.from(new Set(rows.map((row) => normalizeEmployeeCode(row.employeeCode)).filter(Boolean))),
      });
    }

    toast({
      title: "تم الاستيراد والتطبيق",
      description: `تم تطبيق ${rows.length} مؤثر صالح تلقائياً${invalidRows.length ? ` مع ${invalidRows.length} صف غير صالح.` : ""}`,
    });
  };

  const parseFile = async (file: File) => {
    setFileName(file.name);
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    const headers = (rawRows[0] || []).map((h) => String(h).trim());
    const match = EFFECT_HEADERS.every((header, i) => headers[i] === header);
    if (!match) {
      toast({ title: "خطأ", description: "رأس الملف غير مطابق لقالب المؤثرات الموحد.", variant: "destructive" });
      setValidationRows([]);
      return;
    }

    const permissionMinutes = config.defaultPermissionMinutes || 120;
    const halfDayMinutes = config.defaultHalfDayMinutes || 240;

    const parsed: ParsedEffectRow[] = rawRows.slice(1).map((raw, idx) => {
      const rowIndex = idx + 2;
      const employeeCode = normalizeEmployeeCode(raw[0]);
      const employeeName = String(raw[1] ?? "").trim();
      const date = normalizeDate(raw[2]);
      let fromTime = normalizeTime(raw[3]);
      let toTime = normalizeTime(raw[4]);
      const typeText = String(raw[5] ?? "").trim() as SupportedType;
      const status = String(raw[6] ?? "").trim();
      const note = String(raw[7] ?? "").trim();

      const base: ParsedEffectRow = {
        rowIndex,
        employeeCode,
        employeeName,
        date,
        fromTime,
        toTime,
        type: typeText,
        status,
        note,
        normalizedType: typeText,
        state: "Valid",
      };

      if (!employeeCode) return { ...base, state: "Invalid", reason: "الكود مطلوب" };
      if (!employeeMap.has(employeeCode)) return { ...base, state: "Invalid", reason: "كود موظف غير معروف" };
      if (!date) return { ...base, state: "Invalid", reason: "تاريخ غير صالح" };
      if (!SUPPORTED_TYPES.includes(typeText)) return { ...base, state: "Invalid", reason: "نوع مؤثر غير مدعوم" };

      const emp = employeeMap.get(employeeCode)!;
      const shift = resolveShiftForDate({ employee: emp, dateStr: date, rules });
      const shiftStartSec = timeStringToSeconds(shift.shiftStart);
      const shiftEndSec = timeStringToSeconds(shift.shiftEnd);

      if (typeText === "مأمورية" && (!fromTime || !toTime)) {
        return { ...base, state: "Invalid", reason: "المأمورية يجب أن تحتوي على من / إلى" };
      }

      if (typeText === "إذن صباحي" && (!fromTime || !toTime)) {
        fromTime = secondsToHms(shiftStartSec);
        toTime = secondsToHms(shiftStartSec + permissionMinutes * 60);
        return { ...base, fromTime, toTime, normalizedType: "اذن صباحي", state: "Auto-filled" };
      }
      if (typeText === "إذن مسائي" && (!fromTime || !toTime)) {
        fromTime = secondsToHms(shiftEndSec - permissionMinutes * 60);
        toTime = secondsToHms(shiftEndSec);
        return { ...base, fromTime, toTime, normalizedType: "اذن مسائي", state: "Auto-filled" };
      }
      if (typeText === "إذن (عام)") {
        if (!fromTime || !toTime) {
          const inferred = inferGenericSide(employeeCode, date, shiftStartSec);
          if (inferred === "صباحي") {
            fromTime = secondsToHms(shiftStartSec);
            toTime = secondsToHms(shiftStartSec + permissionMinutes * 60);
            return { ...base, fromTime, toTime, normalizedType: "اذن صباحي", state: "Auto-inferred" };
          }
          fromTime = secondsToHms(shiftEndSec - permissionMinutes * 60);
          toTime = secondsToHms(shiftEndSec);
          return { ...base, fromTime, toTime, normalizedType: "اذن مسائي", state: "Auto-inferred" };
        }
        const fromSec = timeStringToSeconds(fromTime);
        const toSec = timeStringToSeconds(toTime);
        const distanceStart = Math.abs(fromSec - shiftStartSec) + Math.abs(toSec - (shiftStartSec + permissionMinutes * 60));
        const distanceEnd = Math.abs(fromSec - (shiftEndSec - permissionMinutes * 60)) + Math.abs(toSec - shiftEndSec);
        return { ...base, normalizedType: distanceStart <= distanceEnd ? "اذن صباحي" : "اذن مسائي" };
      }

      if (typeText === "إجازة نصف يوم") {
        if (!fromTime || !toTime) {
          const inferred = inferGenericSide(employeeCode, date, shiftStartSec);
          if (inferred === "صباحي") {
            fromTime = secondsToHms(shiftStartSec);
            toTime = secondsToHms(shiftStartSec + halfDayMinutes * 60);
          } else {
            fromTime = secondsToHms(shiftEndSec - halfDayMinutes * 60);
            toTime = secondsToHms(shiftEndSec);
          }
          return { ...base, normalizedType: "إجازة نص يوم", fromTime, toTime, state: "Auto-inferred" };
        }
        return { ...base, normalizedType: "إجازة نص يوم" };
      }

      if (["إجازة من الرصيد", "إجازة بالخصم", "غياب بعذر", "إجازة رسمية", "إجازة تحصيل"].includes(typeText)) {
        return { ...base, fromTime: "00:00:00", toTime: "00:00:00" };
      }

      return base;
    });

    setValidationRows(parsed);

    const validParsed = parsed.filter((row) => row.state !== "Invalid");
    if (!validParsed.length) {
      toast({ title: "تنبيه", description: "لا توجد صفوف صالحة للاستيراد.", variant: "destructive" });
      return;
    }

    const importedEffects = mapRowsToEffects(validParsed);
    setEffects(importedEffects);
    applyEffectsToAttendance(importedEffects, file.name);
  };

  const applySavedEffects = () => applyEffectsToAttendance(effects, fileName);

  const exportTemplate = () => {
    const wb = XLSX.utils.book_new();
    const data = [
      EFFECT_HEADERS,
      ["648", "أحمد علي", "2025-01-05", "09:00:00", "11:00:00", "إذن صباحي", "موافق", "نموذج إذن"],
      ["648", "أحمد علي", "2025-01-06", "", "", "إجازة نصف يوم", "موافق", "يتم الاستدلال تلقائياً"],
      ["701", "منى سالم", "2025-01-10", "10:00:00", "14:00:00", "مأمورية", "موافق", "مأمورية خارجية"],
      ["701", "منى سالم", "2025-01-12", "", "", "إجازة بالخصم", "موافق", ""],
      ["702", "عمرو محمد", "2025-01-15", "", "", "إجازة رسمية", "نشط", "تعويض يوم عمل"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Effects");
    XLSX.writeFile(wb, "effects-template.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Sidebar />
      <div className="mr-72 min-h-screen flex flex-col">
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <Header title="استيراد المؤثرات" />

            <div className="rounded-2xl border bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input type="file" accept=".xlsx,.xls" className="max-w-sm" onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
                <Button variant="outline" onClick={exportTemplate}>تصدير قالب المؤثرات</Button>
                {fileName && <Badge variant="secondary">{fileName}</Badge>}
                <Badge className="mr-auto">إجمالي المؤثرات المحفوظة: {effects.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">الأعمدة المطلوبة: {EFFECT_HEADERS.join(" | ")}</p>
            </div>

            <div className="rounded-2xl border bg-white overflow-hidden">
              <div className="p-4 border-b bg-slate-50/50">
                <h3 className="font-semibold">نتائج التحقق من الاستيراد</h3>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-xs text-right min-w-[860px]">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="py-2 px-3">الصف</th>
                      <th className="py-2 px-3">الكود</th>
                      <th className="py-2 px-3">التاريخ</th>
                      <th className="py-2 px-3">النوع</th>
                      <th className="py-2 px-3">من</th>
                      <th className="py-2 px-3">إلى</th>
                      <th className="py-2 px-3">الحالة</th>
                      <th className="py-2 px-3">سبب الرفض</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-muted-foreground">قم برفع ملف المؤثرات للمعاينة.</td>
                      </tr>
                    ) : (
                      validationRows.map((row) => (
                        <tr key={`${row.rowIndex}-${row.employeeCode}-${row.date}`} className="border-t border-border/30">
                          <td className="py-1 px-3">{row.rowIndex}</td>
                          <td className="py-1 px-3">{row.employeeCode}</td>
                          <td className="py-1 px-3">{row.date || "-"}</td>
                          <td className="py-1 px-3">{row.type}</td>
                          <td className="py-1 px-3">{row.fromTime || "-"}</td>
                          <td className="py-1 px-3">{row.toTime || "-"}</td>
                          <td className="py-1 px-3"><Badge variant={row.state === "Invalid" ? "destructive" : "secondary"}>{row.state}</Badge></td>
                          <td className="py-1 px-3 text-red-600">{row.reason || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div>صالحة: <Badge variant="secondary">{validRows.length}</Badge></div>
                <div>غير صالحة: <Badge variant="destructive">{invalidRows.length}</Badge></div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={applySavedEffects}>إعادة تطبيق المؤثرات المحفوظة</Button>
                <Button variant="ghost" onClick={clearEffects}>مسح المؤثرات المحفوظة</Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
