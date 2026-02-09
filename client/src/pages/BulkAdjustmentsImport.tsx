import { useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useEmployees } from "@/hooks/use-employees";
import { useAdjustments, useImportAdjustments } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { useAttendanceStore } from "@/store/attendanceStore";
import { resolveShiftForDate, secondsToHms, timeStringToSeconds } from "@/engine/attendanceEngine";

const EXPECTED_HEADERS = ["الكود", "الاسم", "التاريخ", "من", "الي", "النوع"];
const ALLOWED_TYPES = ["اذن صباحي", "اذن مسائي", "إجازة نص يوم", "إجازة نص يوم صباح", "إجازة نص يوم مساء", "مأمورية"];
const FILTER_TYPES = ["اذن صباحي", "اذن مسائي", "إجازة نص يوم", "مأمورية"];
const NORMALIZED_HALF_DAY_TYPE = "إجازة نص يوم";

const DEFAULT_TIMEZONE_OFFSET_MINUTES = -120;

type ImportRow = {
  rowIndex: number;
  employeeCode: string;
  employeeName: string;
  date: string;
  fromTime: string;
  toTime: string;
  type: string;
};

type AdjustmentStatus = "Valid" | "Auto-filled" | "Auto-inferred" | "Needs Review" | "Invalid";

type ValidationRow = ImportRow & {
  normalizedType: "اذن صباحي" | "اذن مسائي" | "إجازة نص يوم" | "مأمورية";
  inferredSide?: "صباح" | "مساء";
  status: AdjustmentStatus;
  reason?: string;
  shiftStart?: string;
  shiftEnd?: string;
  needsReview?: boolean;
};

const normalizeTime = (value: unknown) => {
  if (typeof value === "number") {
    const totalSeconds = Math.round(value * 24 * 60 * 60);
    return toHms(totalSeconds);
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const [h = "0", m = "0", s = "0"] = text.split(":");
  return `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}:${String(Number(s)).padStart(2, "0")}`;
};

const toHms = (seconds: number) => {
  const total = Math.max(0, seconds);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, "yyyy-MM-dd");
  }
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
  if (!Number.isNaN(parsed.getTime())) {
    return format(parsed, "yyyy-MM-dd");
  }
  return "";
};

export default function BulkAdjustmentsImport() {
  const { data: employees } = useEmployees();
  const employeeCodes = useMemo(() => new Set(employees?.map((emp) => emp.code) || []), [employees]);
  const employeesByCode = useMemo(() => new Map(employees?.map((emp) => [emp.code, emp]) || []), [employees]);
  const punches = useAttendanceStore((state) => state.punches);
  const rules = useAttendanceStore((state) => state.rules);
  const config = useAttendanceStore((state) => state.config);
  const importAdjustments = useImportAdjustments();
  const { toast } = useToast();

  const [fileName, setFileName] = useState("");
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
  const [applyToAllSimilar, setApplyToAllSimilar] = useState(false);

  const [filters, setFilters] = useState({ startDate: "", endDate: "", employeeCode: "", type: "all" });
  const adjustmentsFilters = {
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    employeeCode: filters.employeeCode || undefined,
    type: filters.type !== "all" ? filters.type : undefined,
  };
  const { data: adjustments } = useAdjustments(adjustmentsFilters);

  const normalizeHalfDaySide = (type: string) => {
    if (type.includes("صباح")) return "صباح";
    if (type.includes("مساء")) return "مساء";
    return null;
  };

  const buildRangeFromShift = ({
    shiftStart,
    shiftEnd,
    durationMinutes,
    side,
  }: {
    shiftStart: string;
    shiftEnd: string;
    durationMinutes: number;
    side: "صباح" | "مساء";
  }) => {
    if (side === "صباح") {
      const startSeconds = timeStringToSeconds(shiftStart);
      return {
        fromTime: secondsToHms(startSeconds),
        toTime: secondsToHms(startSeconds + durationMinutes * 60),
      };
    }
    const endSeconds = timeStringToSeconds(shiftEnd);
    return {
      fromTime: secondsToHms(endSeconds - durationMinutes * 60),
      toTime: secondsToHms(endSeconds),
    };
  };

  const buildLocalDateKey = (date: Date, offsetMinutes: number) => {
    const localDate = new Date(date.getTime() - offsetMinutes * 60 * 1000);
    const year = localDate.getUTCFullYear();
    const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(localDate.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getPunchesForEmployeeDate = (employeeCode: string, dateStr: string) => {
    const punchesForEmployee = punches.filter((punch) => punch.employeeCode === employeeCode);
    const punchesForDate = punchesForEmployee.filter(
      (punch) => buildLocalDateKey(punch.punchDatetime, DEFAULT_TIMEZONE_OFFSET_MINUTES) === dateStr
    ).sort((a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime());
    const checkIn = punchesForDate[0]?.punchDatetime ?? null;
    const checkOut = punchesForDate.length > 1 ? punchesForDate[punchesForDate.length - 1].punchDatetime : null;
    const checkInLocal = checkIn ? new Date(checkIn.getTime() - DEFAULT_TIMEZONE_OFFSET_MINUTES * 60 * 1000) : null;
    const checkOutLocal = checkOut ? new Date(checkOut.getTime() - DEFAULT_TIMEZONE_OFFSET_MINUTES * 60 * 1000) : null;
    const checkInSeconds = checkInLocal
      ? checkInLocal.getUTCHours() * 3600 + checkInLocal.getUTCMinutes() * 60 + checkInLocal.getUTCSeconds()
      : null;
    const checkOutSeconds = checkOutLocal
      ? checkOutLocal.getUTCHours() * 3600 + checkOutLocal.getUTCMinutes() * 60 + checkOutLocal.getUTCSeconds()
      : null;
    return { checkInSeconds, checkOutSeconds };
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const headerRow = rows[0] || [];
    const headers = headerRow.map((cell) => String(cell).trim());
    const headerMatch = EXPECTED_HEADERS.every((header, index) => headers[index] === header);
    if (!headerMatch) {
      toast({ title: "خطأ", description: "تأكد من عناوين الأعمدة العربية المطلوبة بالترتيب الصحيح.", variant: "destructive" });
      setValidationRows([{
        rowIndex: 1,
        employeeCode: "-",
        employeeName: "-",
        date: "",
        fromTime: "",
        toTime: "",
        type: "",
        normalizedType: "اذن صباحي",
        status: "Invalid",
        reason: "عناوين الأعمدة غير مطابقة",
      }]);
      return;
    }

    const nextValidation: ValidationRow[] = [];
    const permissionMinutes = config.defaultPermissionMinutes || 120;
    const halfDayMinutes = config.defaultHalfDayMinutes || 240;
    const defaultHalfDaySide = config.defaultHalfDaySide || "صباح";

    rows.slice(1).forEach((row, index) => {
      const rowIndex = index + 2;
      const [code, name, dateRaw, fromRaw, toRaw, typeRaw] = row;
      const employeeCode = String(code ?? "").trim();
      const employeeName = String(name ?? "").trim();
      const date = normalizeDate(dateRaw);
      const fromTime = normalizeTime(fromRaw);
      const toTime = normalizeTime(toRaw);
      const type = String(typeRaw ?? "").trim();
      const normalizedType = type.startsWith("إجازة نص يوم") ? NORMALIZED_HALF_DAY_TYPE : type;
      const halfDaySideFromType = normalizeHalfDaySide(type);
      const employee = employeesByCode.get(employeeCode);

      if (!employeeCode) {
        nextValidation.push({
          rowIndex,
          employeeCode,
          employeeName,
          date,
          fromTime,
          toTime,
          type,
          normalizedType: "اذن صباحي",
          status: "Invalid",
          reason: "كود الموظف مفقود",
        });
        return;
      }
      if (!employeeCodes.has(employeeCode)) {
        nextValidation.push({
          rowIndex,
          employeeCode,
          employeeName,
          date,
          fromTime,
          toTime,
          type,
          normalizedType: "اذن صباحي",
          status: "Invalid",
          reason: "كود الموظف غير موجود",
        });
        return;
      }
      if (!date) {
        nextValidation.push({
          rowIndex,
          employeeCode,
          employeeName,
          date,
          fromTime,
          toTime,
          type,
          normalizedType: "اذن صباحي",
          status: "Invalid",
          reason: "التاريخ غير صالح",
        });
        return;
      }
      if (!ALLOWED_TYPES.includes(type)) {
        nextValidation.push({
          rowIndex,
          employeeCode,
          employeeName,
          date,
          fromTime,
          toTime,
          type,
          normalizedType: "اذن صباحي",
          status: "Invalid",
          reason: "نوع غير مسموح",
        });
        return;
      }
      if (!employee) {
        nextValidation.push({
          rowIndex,
          employeeCode,
          employeeName,
          date,
          fromTime,
          toTime,
          type,
          normalizedType: normalizedType as ValidationRow["normalizedType"],
          status: "Invalid",
          reason: "بيانات الموظف غير مكتملة",
        });
        return;
      }

      const { shiftStart, shiftEnd } = resolveShiftForDate({ employee, dateStr: date, rules });
      const hasFrom = Boolean(fromTime);
      const hasTo = Boolean(toTime);
      let nextFrom = fromTime;
      let nextTo = toTime;
      let status: AdjustmentStatus = "Valid";
      let reason: string | undefined;
      let inferredSide: "صباح" | "مساء" | undefined;
      let needsReview = false;

      if (normalizedType === "مأمورية") {
        if (!hasFrom || !hasTo) {
          status = "Invalid";
          reason = "المأمورية يجب أن تحتوي على من / إلى";
        }
      }

      if (status !== "Invalid" && (!hasFrom || !hasTo)) {
        if (normalizedType === "اذن صباحي") {
          const range = buildRangeFromShift({
            shiftStart,
            shiftEnd,
            durationMinutes: permissionMinutes,
            side: "صباح",
          });
          nextFrom = range.fromTime;
          nextTo = range.toTime;
          status = "Auto-filled";
          inferredSide = "صباح";
        } else if (normalizedType === "اذن مسائي") {
          const range = buildRangeFromShift({
            shiftStart,
            shiftEnd,
            durationMinutes: permissionMinutes,
            side: "مساء",
          });
          nextFrom = range.fromTime;
          nextTo = range.toTime;
          status = "Auto-filled";
          inferredSide = "مساء";
        } else if (normalizedType === NORMALIZED_HALF_DAY_TYPE) {
          if (halfDaySideFromType) {
            const range = buildRangeFromShift({
              shiftStart,
              shiftEnd,
              durationMinutes: halfDayMinutes,
              side: halfDaySideFromType,
            });
            nextFrom = range.fromTime;
            nextTo = range.toTime;
            status = "Auto-filled";
            inferredSide = halfDaySideFromType;
          } else {
            const { checkInSeconds, checkOutSeconds } = getPunchesForEmployeeDate(employeeCode, date);
            const shiftStartSeconds = timeStringToSeconds(shiftStart);
            const shiftEndSeconds = timeStringToSeconds(shiftEnd);
            const shiftDuration = Math.max(0, shiftEndSeconds - shiftStartSeconds);
            const midShiftSeconds = shiftStartSeconds + shiftDuration / 2;

            if (checkInSeconds !== null && checkInSeconds >= midShiftSeconds) {
              const range = buildRangeFromShift({
                shiftStart,
                shiftEnd,
                durationMinutes: halfDayMinutes,
                side: "صباح",
              });
              nextFrom = range.fromTime;
              nextTo = range.toTime;
              status = "Auto-inferred";
              inferredSide = "صباح";
            } else if (checkOutSeconds !== null && checkOutSeconds <= midShiftSeconds) {
              const range = buildRangeFromShift({
                shiftStart,
                shiftEnd,
                durationMinutes: halfDayMinutes,
                side: "مساء",
              });
              nextFrom = range.fromTime;
              nextTo = range.toTime;
              status = "Auto-inferred";
              inferredSide = "مساء";
            } else {
              status = "Needs Review";
              inferredSide = defaultHalfDaySide;
              reason = "يتطلب تحديد نصف اليوم بناءً على البصمات";
              needsReview = true;
            }
          }
        } else {
          status = "Invalid";
          reason = "وقت البداية أو النهاية غير صالح";
        }
      }

      if (status !== "Invalid" && (!nextFrom || !nextTo)) {
        status = "Invalid";
        reason = "وقت البداية أو النهاية غير صالح";
      }

      if (status !== "Invalid" && nextFrom && nextTo && nextFrom >= nextTo) {
        status = "Invalid";
        reason = "وقت البداية يجب أن يكون قبل النهاية";
      }

      nextValidation.push({
        rowIndex,
        employeeCode,
        employeeName,
        date,
        fromTime: nextFrom,
        toTime: nextTo,
        type,
        normalizedType: normalizedType as ValidationRow["normalizedType"],
        status,
        reason,
        inferredSide,
        shiftStart,
        shiftEnd,
        needsReview,
      });
    });

    setValidationRows(nextValidation);
  };

  const handleImport = () => {
    const needsReview = validationRows.some((row) => row.status === "Needs Review");
    if (needsReview) {
      toast({ title: "تنبيه", description: "يرجى مراجعة الصفوف التي تحتاج تحديد النصف قبل الاستيراد.", variant: "destructive" });
      return;
    }
    const readyRows = validationRows.filter((row) => row.status !== "Invalid");
    if (readyRows.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد بيانات صالحة للاستيراد.", variant: "destructive" });
      return;
    }
    importAdjustments.mutate({
      sourceFileName: fileName,
      rows: readyRows.map((row) => ({
        rowIndex: row.rowIndex,
        employeeCode: row.employeeCode,
        date: row.date,
        type: row.normalizedType,
        fromTime: row.fromTime,
        toTime: row.toTime,
        source: "excel",
        sourceFileName: fileName,
        note: null,
      })),
    }, {
      onSuccess: (data) => {
        toast({ title: "تم الاستيراد", description: `تم حفظ ${data.inserted} سجل بنجاح.` });
        if (data.invalid.length > 0) {
          toast({ title: "تنبيه", description: `تم تجاهل ${data.invalid.length} سجل غير صالح.`, variant: "destructive" });
        }
      },
      onError: (error: any) => {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      },
    });
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
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="رفع التعديلات" />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <h2 className="text-lg font-semibold">استيراد ملف التعديلات</h2>
                  <p className="text-sm text-muted-foreground">الرجاء استخدام الأعمدة العربية المطلوبة.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                  <Button onClick={handleImport} disabled={importAdjustments.isPending}>
                    {importAdjustments.isPending ? "جاري الاستيراد..." : "حفظ التعديلات"}
                  </Button>
                </div>
              </div>

              <div className="bg-slate-50 border border-border/50 rounded-xl p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold mb-1">جدول التحقق من الاستيراد</h3>
                    <p className="text-sm text-muted-foreground">راجع الحالات، وأكمل الصفوف التي تحتاج تحديد النصف.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">Valid: {summaryCounts.Valid}</Badge>
                    <Badge variant="outline">Auto-filled: {summaryCounts["Auto-filled"]}</Badge>
                    <Badge variant="outline">Auto-inferred: {summaryCounts["Auto-inferred"]}</Badge>
                    <Badge variant="outline">Needs Review: {summaryCounts["Needs Review"]}</Badge>
                    <Badge variant="outline">Invalid: {summaryCounts.Invalid}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={applyToAllSimilar}
                    onCheckedChange={(value) => setApplyToAllSimilar(Boolean(value))}
                  />
                  <span>تطبيق الاختيار على كل الصفوف المشابهة</span>
                </div>
                <div className="max-h-[320px] overflow-auto text-sm">
                  {validationRows.length === 0 ? (
                    <p className="text-muted-foreground">لا توجد بيانات بعد.</p>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="py-2 px-2">الصف</th>
                          <th className="py-2 px-2">الكود</th>
                          <th className="py-2 px-2">التاريخ</th>
                          <th className="py-2 px-2">النوع</th>
                          <th className="py-2 px-2">النصف</th>
                          <th className="py-2 px-2">من</th>
                          <th className="py-2 px-2">إلى</th>
                          <th className="py-2 px-2">الحالة</th>
                          <th className="py-2 px-2">السبب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationRows.map((row) => (
                          <tr key={`${row.employeeCode}-${row.rowIndex}`} className="border-t border-border/30">
                            <td className="py-2 px-2">{row.rowIndex}</td>
                            <td className="py-2 px-2">{row.employeeCode}</td>
                            <td className="py-2 px-2">{row.date || "-"}</td>
                            <td className="py-2 px-2">{row.type || "-"}</td>
                            <td className="py-2 px-2">
                              {row.status === "Needs Review" ? (
                                <Select
                                  value={row.inferredSide}
                                  onValueChange={(value) => updateReviewSide(row.rowIndex, value as "صباح" | "مساء", applyToAllSimilar)}
                                >
                                  <SelectTrigger className="h-7 text-xs w-24">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="صباح">صباح</SelectItem>
                                    <SelectItem value="مساء">مساء</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                row.inferredSide || "-"
                              )}
                            </td>
                            <td className="py-2 px-2">{row.fromTime || "-"}</td>
                            <td className="py-2 px-2">{row.toTime || "-"}</td>
                            <td className="py-2 px-2">{statusBadge(row.status)}</td>
                            <td className="py-2 px-2 text-muted-foreground">{row.reason || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <h2 className="text-lg font-semibold">سجلات التعديلات المستوردة</h2>
                <div className="flex flex-wrap gap-3">
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                  />
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                  />
                  <Input
                    placeholder="كود الموظف"
                    value={filters.employeeCode}
                    onChange={(event) => setFilters((prev) => ({ ...prev, employeeCode: event.target.value }))}
                  />
                  <Select
                    value={filters.type}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الأنواع</SelectItem>
                      {FILTER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2">الكود</th>
                      <th className="px-4 py-2">الاسم</th>
                      <th className="px-4 py-2">التاريخ</th>
                      <th className="px-4 py-2">من</th>
                      <th className="px-4 py-2">إلى</th>
                      <th className="px-4 py-2">النوع</th>
                      <th className="px-4 py-2">المصدر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments?.length ? adjustments.map((adj) => (
                      <tr key={adj.id} className="border-t border-border/40">
                        <td className="px-4 py-2">{adj.employeeCode}</td>
                        <td className="px-4 py-2">
                          {employees?.find((emp) => emp.code === adj.employeeCode)?.nameAr || "-"}
                        </td>
                        <td className="px-4 py-2">{adj.date}</td>
                        <td className="px-4 py-2">{adj.fromTime}</td>
                        <td className="px-4 py-2">{adj.toTime}</td>
                        <td className="px-4 py-2">{adj.type}</td>
                        <td className="px-4 py-2">{adj.source}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                          لا توجد بيانات حتى الآن.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
