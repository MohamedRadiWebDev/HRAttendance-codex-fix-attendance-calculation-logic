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
import { resolveShiftForDate, secondsToHms, timeStringToSeconds } from "@/engine/attendanceEngine";
import type { InsertAdjustment, InsertLeave } from "@shared/schema";

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
  const config = useAttendanceStore((s) => s.config);
  const { toast } = useToast();

  const employeeMap = useMemo(() => new Map((employees || []).map((e) => [e.code, e])), [employees]);

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

  const handleFile = async (file: File) => {
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
      const employeeCode = String(raw[0] ?? "").trim();
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

      if (typeText === "مأمورية") {
        if (!fromTime || !toTime) return { ...base, state: "Invalid", reason: "المأمورية يجب أن تحتوي على من / إلى" };
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
  };

  const validRows = useMemo(() => validationRows.filter((r) => r.state !== "Invalid"), [validationRows]);
  const invalidRows = useMemo(() => validationRows.filter((r) => r.state === "Invalid"), [validationRows]);

  const applyEffects = () => {
    if (!validRows.length) {
      toast({ title: "تنبيه", description: "لا توجد صفوف صالحة للتطبيق.", variant: "destructive" });
      return;
    }

    const adjustmentMap = new Map<string, any>();
    adjustments.forEach((adj) => adjustmentMap.set(`${adj.employeeCode}__${adj.date}__${adj.type}__${adj.fromTime}__${adj.toTime}`, adj));

    const leaveMap = new Map<string, any>();
    leaves.forEach((leave) => leaveMap.set(`${leave.type}__${leave.scope}__${leave.scopeValue || ""}__${leave.startDate}__${leave.endDate}`, leave));

    let nextAdjustmentId = Math.max(0, ...adjustments.map((a) => a.id || 0)) + 1;
    let nextLeaveId = Math.max(0, ...leaves.map((l) => l.id || 0)) + 1;

    validRows.forEach((row) => {
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
        if (!leaveMap.has(key)) {
          leaveMap.set(key, { id: nextLeaveId++, ...leaveRow });
        }
        return;
      }

      const normalizedType =
        row.normalizedType === "إذن صباحي" ? "اذن صباحي" :
        row.normalizedType === "إذن مسائي" ? "اذن مسائي" :
        row.normalizedType;

      const adjustment: InsertAdjustment = {
        employeeCode: row.employeeCode,
        date: row.date,
        fromTime: row.fromTime || "00:00:00",
        toTime: row.toTime || "00:00:00",
        type: normalizedType as any,
        source: "effects_import",
        sourceFileName: fileName || "effects.xlsx",
        importedAt: new Date(),
        note: [row.note, row.status ? `الحالة: ${row.status}` : ""].filter(Boolean).join(" | "),
      };
      const key = `${adjustment.employeeCode}__${adjustment.date}__${adjustment.type}__${adjustment.fromTime}__${adjustment.toTime}`;
      if (!adjustmentMap.has(key)) {
        adjustmentMap.set(key, { id: nextAdjustmentId++, ...adjustment });
      }
    });

    setAdjustments(Array.from(adjustmentMap.values()));
    setLeaves(Array.from(leaveMap.values()));
    toast({ title: "تم التطبيق", description: `تم تطبيق ${validRows.length} مؤثر بنجاح.` });
  };

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

  const statusBadge = (status: AdjustmentStatus) => {
    const styles: Record<AdjustmentStatus, string> = {
      Valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
      "Auto-filled": "bg-blue-50 text-blue-700 border-blue-200",
      "Auto-inferred": "bg-purple-50 text-purple-700 border-purple-200",
      "Needs Review": "bg-amber-50 text-amber-700 border-amber-200",
      Invalid: "bg-rose-50 text-rose-700 border-rose-200",
    };
    return <Badge className={`border ${styles[status]}`}>{status}</Badge>;
  };

  const updateReviewSide = (rowIndex: number, side: "صباح" | "مساء", applyToAll: boolean) => {
    setValidationRows((prev) => {
      return prev.map((row) => {
        if (!row.needsReview) return row;
        const shouldUpdate = applyToAll ? row.needsReview : row.rowIndex === rowIndex;
        if (!shouldUpdate || !row.shiftStart || !row.shiftEnd) return row;
        const range = buildRangeFromShift({
          shiftStart: row.shiftStart,
          shiftEnd: row.shiftEnd,
          durationMinutes: config.defaultHalfDayMinutes || 240,
          side,
        });
        return {
          ...row,
          fromTime: range.fromTime,
          toTime: range.toTime,
          status: "Auto-filled",
          inferredSide: side,
          reason: undefined,
          needsReview: false,
        };
      });
    });
  };

  const summaryCounts = useMemo(() => {
    return validationRows.reduce<Record<AdjustmentStatus, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {
      Valid: 0,
      "Auto-filled": 0,
      "Auto-inferred": 0,
      "Needs Review": 0,
      Invalid: 0,
    });
  }, [validationRows]);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Sidebar />
      <main className="mr-64 p-6 space-y-6">
        <Header title="استيراد المؤثرات" subtitle="ملف Excel موحد للتعديلات والإجازات والغياب" />

        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input type="file" accept=".xlsx,.xls" className="max-w-sm" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button variant="outline" onClick={exportTemplate}>تصدير قالب المؤثرات</Button>
            <Button onClick={applyEffects}>تطبيق المؤثرات</Button>
            {fileName && <Badge variant="secondary">{fileName}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            الأعمدة المطلوبة: {EFFECT_HEADERS.join(" | ")}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-4">
            <h3 className="font-semibold mb-3">معاينة الصفوف ({validationRows.length})</h3>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs text-right">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="py-2">الصف</th>
                    <th>الكود</th>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>من</th>
                    <th>إلى</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {validationRows.map((row) => (
                    <tr key={`${row.rowIndex}-${row.employeeCode}-${row.date}`} className="border-t border-border/30">
                      <td className="py-1">{row.rowIndex}</td>
                      <td>{row.employeeCode}</td>
                      <td>{row.date || "-"}</td>
                      <td>{row.type}</td>
                      <td>{row.fromTime || "-"}</td>
                      <td>{row.toTime || "-"}</td>
                      <td>
                        <Badge variant={row.state === "Invalid" ? "destructive" : "secondary"}>{row.state}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-4">
            <h3 className="font-semibold mb-3">نتيجة التحقق</h3>
            <div className="space-y-2 mb-3">
              <p className="text-sm">صالحة: <Badge variant="secondary">{validRows.length}</Badge></p>
              <p className="text-sm">غير صالحة: <Badge variant="destructive">{invalidRows.length}</Badge></p>
            </div>
            <div className="max-h-[360px] overflow-auto">
              {invalidRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد أخطاء.</p>
              ) : (
                <table className="w-full text-xs text-right">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="py-2">الصف</th>
                      <th>الكود</th>
                      <th>السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalidRows.map((row) => (
                      <tr key={`inv-${row.rowIndex}`} className="border-t border-border/30">
                        <td className="py-1">{row.rowIndex}</td>
                        <td>{row.employeeCode || "-"}</td>
                        <td className="text-red-600">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
