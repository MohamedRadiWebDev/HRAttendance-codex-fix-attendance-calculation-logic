import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Download, Search, Clock } from "lucide-react";
import { useAttendanceRecords, useProcessAttendance, useUpdateAttendanceRecord } from "@/hooks/use-attendance";
import { useEmployees } from "@/hooks/use-employees";
import { useAdjustments } from "@/hooks/use-data";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import * as XLSX from 'xlsx';
import { buildAttendanceExportRows } from "@/exporters/attendanceExport";
import { useAttendanceStore } from "@/store/attendanceStore";
import { useEffectsStore } from "@/store/effectsStore";
import { resolveShiftForDate, timeStringToSeconds } from "@/engine/attendanceEngine";

export default function Attendance() {
  const [location, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [dateInput, setDateInput] = useState({ start: "", end: "" });
  const [employeeFilter, setEmployeeFilter] = useState("");
  const hasInitialized = useRef(false);
  
  const [page, setPage] = useState(1);
  const limit = 0;
  
  const { data: recordsData, isLoading } = useAttendanceRecords(dateRange.start, dateRange.end, employeeFilter, page, limit, false);
  const records = recordsData?.data;
  const total = recordsData?.total || 0;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
  const { data: employees } = useEmployees();
  const punches = useAttendanceStore((state) => state.punches);
  const rules = useAttendanceStore((state) => state.rules);
  const effects = useEffectsStore((state) => state.effects);
  const processAttendance = useProcessAttendance();
  const updateAttendanceRecord = useUpdateAttendanceRecord();
  const { toast } = useToast();
  const [timelineRecord, setTimelineRecord] = useState<any | null>(null);
  const [effectsRecord, setEffectsRecord] = useState<any | null>(null);
  const [showEffectsDebug, setShowEffectsDebug] = useState(false);

  const parseDateInput = (value: string) => {
    if (!value) return null;
    const parsed = parse(value, "dd/MM/yyyy", new Date());
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(value);
    if (!Number.isNaN(fallback.getTime())) return fallback;
    return null;
  };

  const formatDisplayDate = (value?: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return format(parsed, "dd/MM/yyyy");
  };

  useEffect(() => {
    const queryString = location.split("?")[1] || "";
    const params = new URLSearchParams(queryString);
    const startDate = params.get("startDate");
    const endDate = params.get("endDate");
    const storedStart = localStorage.getItem("attendanceStartDate");
    const storedEnd = localStorage.getItem("attendanceEndDate");
    const nextStart = startDate || storedStart || "";
    const nextEnd = endDate || storedEnd || "";

    setDateRange((prev) => {
      if (prev.start === nextStart && prev.end === nextEnd) return prev;
      return { start: nextStart, end: nextEnd };
    });

    setDateInput({
      start: formatDisplayDate(nextStart),
      end: formatDisplayDate(nextEnd),
    });
    hasInitialized.current = true;
  }, [location]);

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) return;
    const params = new URLSearchParams();
    params.set("startDate", dateRange.start);
    params.set("endDate", dateRange.end);
    localStorage.setItem("attendanceStartDate", dateRange.start);
    localStorage.setItem("attendanceEndDate", dateRange.end);
    setLocation(`/attendance?${params.toString()}`, { replace: true });
  }, [dateRange, setLocation]);

  useEffect(() => {
    if (!hasInitialized.current) return;
    if (!dateRange.start && !dateRange.end) {
      localStorage.removeItem("attendanceStartDate");
      localStorage.removeItem("attendanceEndDate");
      setLocation("/attendance", { replace: true });
    }
  }, [dateRange, setLocation]);

  const sectors = Array.from(new Set(employees?.map(e => e.sector).filter(Boolean) || []));
  const [sectorFilter, setSectorFilter] = useState("all");

  const filteredRecords = records?.filter((record: any) => {
    if (sectorFilter !== "all") {
      const emp = employees?.find(e => e.code === record.employeeCode);
      return emp?.sector === sectorFilter;
    }
    return true;
  });

  const adjustmentFilters = {
    startDate: dateRange.start && dateRange.end ? dateRange.start : undefined,
    endDate: dateRange.start && dateRange.end ? dateRange.end : undefined,
    employeeCode: employeeFilter.includes(",") ? undefined : employeeFilter || undefined,
  };
  const { data: adjustments } = useAdjustments(adjustmentFilters);
  const adjustmentsByKey = useMemo(() => {
    const map = new Map<string, any[]>();
    (adjustments || []).forEach((adj) => {
      const key = `${adj.employeeCode}__${adj.date}`;
      const existing = map.get(key) || [];
      existing.push(adj);
      map.set(key, existing);
    });
    return map;
  }, [adjustments]);


  const effectsByKey = useMemo(() => {
    const map = new Map<string, any[]>();
    (effects || []).forEach((effect: any) => {
      const key = `${effect.employeeCode}__${effect.date}`;
      const list = map.get(key) || [];
      list.push(effect);
      map.set(key, list);
    });
    return map;
  }, [effects]);

  const effectsInPeriod = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return 0;
    return (effects || []).filter((e: any) => e.date >= dateRange.start && e.date <= dateRange.end).length;
  }, [effects, dateRange.start, dateRange.end]);

  const employeesByCode = useMemo(() => {
    return new Map((employees || []).map((employee) => [employee.code, employee]));
  }, [employees]);

  const getLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getPunchesForWindow = (employeeCode: string, dateStr: string, isOvernight: boolean) => {
    const base = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(base.getTime())) return [];
    const start = new Date(base);
    if (isOvernight) start.setHours(6, 0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 24);
    return punches.filter((punch) => {
      if (punch.employeeCode !== employeeCode) return false;
      const punchDate = new Date(punch.punchDatetime);
      if (isOvernight) return punchDate >= start && punchDate <= end;
      return getLocalDateKey(punchDate) === dateStr;
    }).sort((a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime());
  };

  const getWorkedOnHoliday = (record: any) => {
    if (!record.isOfficialHoliday) return false;
    if (record.workedOnOfficialHoliday !== null && record.workedOnOfficialHoliday !== undefined) {
      return Boolean(record.workedOnOfficialHoliday);
    }
    const autoWorked = Boolean(record.checkIn || record.checkOut)
      || (typeof record.totalHours === "number" && record.totalHours > 0)
      || Boolean(record.missionStart && record.missionEnd);
    return autoWorked;
  };

  useEffect(() => {
    setPage(1);
  }, [dateRange.start, dateRange.end, employeeFilter, sectorFilter]);

  const handleProcess = () => {
    if (!dateRange.start || !dateRange.end) {
      toast({ title: "خطأ", description: "يرجى تحديد الفترة أولاً", variant: "destructive" });
      return;
    }
    processAttendance.mutate({ startDate: dateRange.start, endDate: dateRange.end, timezoneOffsetMinutes: new Date().getTimezoneOffset() }, {
      onSuccess: (data: any) => {
        toast({ title: "اكتملت المعالجة", description: data.message });
      }
    });
  };

  const handleExport = () => {
    if (!records || records.length === 0) return;
    const { detailHeaders, detailRows, summaryRows } = buildAttendanceExportRows({
      records,
      employees: employees || [],
    });

    const workbook = XLSX.utils.book_new();
    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    const applyHeaderStyle = (sheet: XLSX.WorkSheet, headerCount: number) => {
      for (let colIndex = 0; colIndex < headerCount; colIndex += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
        const cell = sheet[cellAddress];
        if (!cell) continue;
        cell.s = {
          font: { bold: true },
          fill: { patternType: "solid", fgColor: { rgb: "E2E8F0" } },
        };
      }
    };
    applyHeaderStyle(detailSheet, detailHeaders.length);
    applyHeaderStyle(summarySheet, summaryHeaders.length);

    const buildAutoWidths = (rows: any[][]) => {
      if (rows.length === 0) return [];
      const widths = rows[0].map((_, colIndex) => {
        const max = rows.reduce((acc, row) => {
          const value = row[colIndex];
          if (value === null || value === undefined) return acc;
          const length = String(value).length;
          return Math.max(acc, length);
        }, 6);
        return { wch: Math.min(Math.max(max + 2, 8), 40) };
      });
      return widths;
    };

    detailSheet["!cols"] = buildAutoWidths(detailRows);
    summarySheet["!cols"] = buildAutoWidths(summaryRows);

    detailSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    summarySheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    detailSheet["!rtl"] = true;
    summarySheet["!rtl"] = true;

    for (let rowIndex = 1; rowIndex < detailRows.length; rowIndex += 1) {
      const isFridayRow = detailRows[rowIndex][8] === "جمعة";
      const hasViolation = detailRows[rowIndex][19] !== "";
      const fill = isFridayRow
        ? "D9E8FF"
        : hasViolation
          ? "FFE5E5"
          : rowIndex % 2 === 0
            ? "F8FAFC"
            : "FFFFFF";
      for (let colIndex = 0; colIndex < detailHeaders.length; colIndex += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        const cell = detailSheet[cellAddress];
        if (!cell) continue;
        if (fill) {
          cell.s = {
            fill: { patternType: "solid", fgColor: { rgb: fill } },
          };
        }
      }
    }

    for (let rowIndex = 1; rowIndex < detailRows.length; rowIndex += 1) {
      const dateCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })];
      if (dateCell) {
        dateCell.t = "n";
        dateCell.z = "yyyy-mm-dd";
      }
      const checkInCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 4 })];
      if (checkInCell && checkInCell.v !== "-") {
        checkInCell.t = "n";
        checkInCell.z = "hh:mm";
      }
      const checkOutCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 5 })];
      if (checkOutCell && checkOutCell.v !== "-") {
        checkOutCell.t = "n";
        checkOutCell.z = "hh:mm";
      }
      const hoursCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 6 })];
      if (hoursCell && hoursCell.v !== "-") {
        hoursCell.t = "n";
        hoursCell.z = "0.00";
      }
      const overtimeCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 7 })];
      if (overtimeCell && overtimeCell.v !== "-") {
        overtimeCell.t = "n";
        overtimeCell.z = "0.00";
      }
      const penaltyColumns = [12, 13, 14, 15, 16, 17, 18];
      penaltyColumns.forEach((colIndex) => {
        const penaltyCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
        if (penaltyCell && penaltyCell.v !== "") {
          penaltyCell.t = "n";
          penaltyCell.z = "0.00";
        }
      });
      const totalPenaltyCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 19 })];
      if (totalPenaltyCell) {
        const rowNumber = rowIndex + 1;
        totalPenaltyCell.f = `M${rowNumber}+N${rowNumber}+O${rowNumber}+P${rowNumber}*2`;
        totalPenaltyCell.t = "n";
        totalPenaltyCell.z = "0.00";
      }
    }

    for (let rowIndex = 1; rowIndex < summaryRows.length; rowIndex += 1) {
      const fill = rowIndex % 2 === 0 ? "F8FAFC" : "FFFFFF";
      for (let colIndex = 0; colIndex < summaryHeaders.length; colIndex += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        const cell = summarySheet[cellAddress];
        if (!cell) continue;
        cell.s = {
          ...(cell.s || {}),
          fill: { patternType: "solid", fgColor: { rgb: fill } },
        };
      }
      const dateCell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 21 })];
      if (dateCell && dateCell.v !== "") {
        dateCell.t = "n";
        dateCell.z = "yyyy-mm-dd";
      }
      for (let colIndex = 2; colIndex <= 20; colIndex += 1) {
        const cell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
        if (cell && cell.v !== "") {
          cell.t = "n";
          cell.z = "0.00";
        }
      }
      const totalAbsenceCell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 11 })];
      const totalCompCell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 16 })];
      const totalPenaltyCell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 20 })];
      const rowNumber = rowIndex + 1;
      if (totalAbsenceCell) {
        totalAbsenceCell.f = `H${rowNumber}*2+I${rowNumber}`;
        totalAbsenceCell.t = "n";
        totalAbsenceCell.z = "0.00";
      }
      if (totalCompCell) {
        totalCompCell.f = `O${rowNumber}+P${rowNumber}`;
        totalCompCell.t = "n";
        totalCompCell.z = "0.00";
      }
      if (totalPenaltyCell) {
        totalPenaltyCell.f = `R${rowNumber}+S${rowNumber}+T${rowNumber}+L${rowNumber}+J${rowNumber}`;
        totalPenaltyCell.t = "n";
        totalPenaltyCell.z = "0.00";
      }
    }

    XLSX.utils.book_append_sheet(workbook, detailSheet, "تفصيلي");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص");
    XLSX.writeFile(workbook, `Attendance_${dateRange.start}_${dateRange.end}.xlsx`);
    toast({ title: "تم التصدير", description: "تم تحميل ملف الإكسل بنجاح" });
  };

  return (
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="الحضور والانصراف" />
        
        <main className="flex-1 overflow-y-auto p-8">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-slate-50 border border-border rounded-lg p-1">
                  <Input 
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={dateInput.start}
                    onChange={e => {
                      const value = e.target.value;
                      setDateInput(prev => ({ ...prev, start: value }));
                      if (!value) {
                        setDateRange(prev => ({ ...prev, start: undefined }));
                        return;
                      }
                      const parsed = parseDateInput(value);
                      if (parsed) {
                        setDateRange(prev => ({ ...prev, start: format(parsed, "yyyy-MM-dd") }));
                      }
                    }}
                    className="border-none bg-transparent h-8 w-36"
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input 
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={dateInput.end}
                    onChange={e => {
                      const value = e.target.value;
                      setDateInput(prev => ({ ...prev, end: value }));
                      if (!value) {
                        setDateRange(prev => ({ ...prev, end: undefined }));
                        return;
                      }
                      const parsed = parseDateInput(value);
                      if (parsed) {
                        setDateRange(prev => ({ ...prev, end: format(parsed, "yyyy-MM-dd") }));
                      }
                    }}
                    className="border-none bg-transparent h-8 w-36"
                  />
                </div>
              <div className="space-y-2 flex-1 min-w-[200px]">
                <label className="text-sm font-medium">بحث بالأكواد (101, 102)...</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="مثال: 101, 102, 105" 
                    className="pr-10 h-10"
                    value={employeeFilter} 
                    onChange={(e) => setEmployeeFilter(e.target.value)} 
                  />
                </div>
              </div>
                <Select value={sectorFilter} onValueChange={setSectorFilter}>
                  <SelectTrigger className="w-[180px] h-10">
                    <SelectValue placeholder="القطاع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل القطاعات</SelectItem>
                    {sectors.map(s => (
                      <SelectItem key={s} value={s as string}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={handleProcess} disabled={processAttendance.isPending} className="gap-2">
                    <RefreshCw className={cn("w-4 h-4", processAttendance.isPending && "animate-spin")} />
                    معالجة الحضور
                  </Button>
                  <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={handleExport}>
                    <Download className="w-4 h-4" />
                    تصدير التقرير
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  يعيد حساب الحضور من البصمة للفترة المختارة
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-3 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-semibold">تشخيص المؤثرات</span>
                <Button variant="ghost" size="sm" onClick={() => setShowEffectsDebug((v) => !v)}>{showEffectsDebug ? "إخفاء" : "إظهار"}</Button>
              </div>
              {showEffectsDebug && (
                <div className="space-y-1 mt-2">
                  <div>Effects loaded: <strong>{effects.length}</strong></div>
                  <div>Effects matched to this period: <strong>{effectsInPeriod}</strong></div>
                  <div>Sample match: <strong>{records?.[0] ? `${records[0].employeeCode}/${records[0].date} -> ${(effectsByKey.get(`${records[0].employeeCode}__${records[0].date}`) || []).length}` : "-"}</strong></div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-right min-w-[1100px] hidden md:table">
                <thead className="bg-slate-50 text-muted-foreground font-medium sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-4">التاريخ</th>
                    <th className="px-6 py-4">الموظف</th>
                    <th className="px-6 py-4">الدخول</th>
                    <th className="px-6 py-4">الخروج</th>
                    <th className="px-6 py-4">ساعات العمل</th>
                    <th className="px-6 py-4">الإضافي</th>
                    <th className="px-6 py-4">الحالة</th>
                    <th className="px-6 py-4">الإجازة الرسمية</th>
                    <th className="px-6 py-4">المؤثرات</th>
                    <th className="px-6 py-4">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={10} className="px-6 py-8 text-center">جاري تحميل البيانات...</td></tr>
                  ) : !dateRange.start || !dateRange.end ? (
                    <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">يرجى تحديد الفترة أولاً.</td></tr>
                  ) : filteredRecords?.length === 0 ? (
                    <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">لا توجد سجلات في هذه الفترة. جرّب معالجة الحضور بعد استيراد البصمة.</td></tr>
                  ) : (
                    filteredRecords?.map((record: any) => (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setEffectsRecord(record)}>
                        <td className="px-6 py-4 font-mono text-muted-foreground">{record.date}</td>
                        <td className="px-6 py-4 font-medium">{record.employeeCode}</td>
                        <td className="px-6 py-4 font-mono" dir="ltr">
                          {record.checkIn ? format(new Date(record.checkIn), "HH:mm") : "-"}
                        </td>
                        <td className="px-6 py-4 font-mono" dir="ltr">
                          {record.checkOut ? format(new Date(record.checkOut), "HH:mm") : "-"}
                        </td>
                        <td className="px-6 py-4 font-bold">{record.totalHours?.toFixed(2)}</td>
                        <td className="px-6 py-4 text-emerald-600 font-bold">
                          {record.overtimeHours && record.overtimeHours > 0 ? `+${record.overtimeHours.toFixed(2)}` : "-"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge status={record.status} />
                            {record.isOfficialHoliday && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-blue-100 text-blue-700 border-blue-200">
                                إجازة رسمية
                              </span>
                            )}
                            {record.isOfficialHoliday && record.compDayCredit > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-100 text-emerald-700 border-emerald-200">
                                يوم بالبدل
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {record.isOfficialHoliday ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={getWorkedOnHoliday(record)}
                                onCheckedChange={(value) => {
                                  updateAttendanceRecord.mutate({
                                    id: record.id,
                                    updates: {
                                      workedOnOfficialHoliday: value,
                                      compDayCredit: value ? 1 : 0,
                                    },
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">حضر؟</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {(effectsByKey.get(`${record.employeeCode}__${record.date}`) || []).map((effect: any, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                                {effect.type}
                              </span>
                            ))}
                            {!(effectsByKey.get(`${record.employeeCode}__${record.date}`) || []).length && (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setTimelineRecord(record)}
                                  >
                                    <Clock className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>عرض الخط الزمني</TooltipContent>
                              </Tooltip>
                              <span className="text-[10px] text-muted-foreground">الخط الزمني</span>
                            </div>
                            {record.penalties && Array.isArray(record.penalties) && record.penalties.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {(record.penalties as any[]).map((p: any, i: number) => (
                                  <span key={i} className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                                    {p.type}: {p.value}
                                  </span>
                                ))}
                              </div>
                            )}
                            {adjustmentsByKey.get(`${record.employeeCode}__${record.date}`)?.length ? (
                              <div className="flex gap-1 flex-wrap">
                                {adjustmentsByKey.get(`${record.employeeCode}__${record.date}`)?.map((adj, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">
                                    {adj.type} ({adj.fromTime}-{adj.toTime})
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {record.notes ? (
                              <div className="text-[10px] text-slate-600 font-medium">{record.notes}</div>
                            ) : null}
                            {record.status === "Excused" && (
                              <span className="text-[10px] text-emerald-600 font-medium italic">إذن مسجل</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="md:hidden space-y-4 p-4">
                {isLoading ? (
                  <div className="text-center text-muted-foreground">جاري تحميل البيانات...</div>
                ) : !dateRange.start || !dateRange.end ? (
                  <div className="text-center text-muted-foreground">يرجى تحديد الفترة أولاً.</div>
                ) : filteredRecords?.length === 0 ? (
                  <div className="text-center text-muted-foreground">لا توجد سجلات في هذه الفترة.</div>
                ) : (
                  filteredRecords?.map((record: any) => (
                    <div key={record.id} className="bg-white border border-border/50 rounded-xl p-4 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{record.date}</span>
                        <StatusBadge status={record.status} />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 w-full"
                        onClick={() => setTimelineRecord(record)}
                      >
                        <Clock className="w-4 h-4" />
                        عرض الخط الزمني
                      </Button>
                      <div className="font-semibold">{record.employeeCode}</div>
                      <div className="flex flex-wrap gap-1">
                        {(effectsByKey.get(`${record.employeeCode}__${record.date}`) || []).map((effect: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">{effect.type}</span>
                        ))}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>الدخول</span>
                        <span dir="ltr">{record.checkIn ? format(new Date(record.checkIn), "HH:mm") : "-"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>الخروج</span>
                        <span dir="ltr">{record.checkOut ? format(new Date(record.checkOut), "HH:mm") : "-"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>ساعات العمل</span>
                        <span>{record.totalHours?.toFixed(2)}</span>
                      </div>
                      {record.isOfficialHoliday && (
                        <div className="flex items-center justify-between text-sm">
                          <span>حضر في الإجازة الرسمية؟</span>
                          <Switch
                            checked={getWorkedOnHoliday(record)}
                            onCheckedChange={(value) => {
                              updateAttendanceRecord.mutate({
                                id: record.id,
                                updates: {
                                  workedOnOfficialHoliday: value,
                                  compDayCredit: value ? 1 : 0,
                                },
                              });
                            }}
                          />
                        </div>
                      )}
                      {record.compDayCredit > 0 && (
                        <span className="text-xs font-semibold text-emerald-600">يوم بالبدل</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {limit > 0 && totalPages > 1 && (
              <div className="p-4 border-t border-border/50 flex items-center justify-center gap-2 bg-white">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1} 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  السابق
                </Button>
                <div className="text-sm font-medium">
                  صفحة {page} من {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === totalPages} 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  التالي
                </Button>
              </div>
            )}
          </div>

          <Sheet open={Boolean(effectsRecord)} onOpenChange={(open) => !open && setEffectsRecord(null)}>
            <SheetContent side="left" className="w-full sm:max-w-lg" dir="rtl">
              <SheetHeader>
                <SheetTitle>تفاصيل المؤثرات</SheetTitle>
              </SheetHeader>
              {effectsRecord && (
                <div className="mt-4 space-y-3 text-sm">
                  <div className="font-semibold">{effectsRecord.employeeCode} - {effectsRecord.date}</div>
                  {(effectsByKey.get(`${effectsRecord.employeeCode}__${effectsRecord.date}`) || []).length === 0 ? (
                    <p className="text-muted-foreground">لا توجد مؤثرات محفوظة لهذا اليوم.</p>
                  ) : (
                    <div className="space-y-2">
                      {(effectsByKey.get(`${effectsRecord.employeeCode}__${effectsRecord.date}`) || []).map((effect: any) => {
                        const missingHours = (["اذن صباحي", "اذن مسائي", "إذن صباحي", "إذن مسائي", "إجازة نصف يوم", "إجازة نص يوم"].includes(effect.type)) && (!effect.from || !effect.to);
                        return (
                          <div key={effect.id} className="rounded-lg border p-2">
                            <div className="font-medium">{effect.type}</div>
                            <div className="text-xs text-muted-foreground">{effect.from || "-"} → {effect.to || "-"}</div>
                            {missingHours && <div className="text-xs text-amber-600">ناقص ساعات</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>

          <TimelineSheet
            record={timelineRecord}
            employee={timelineRecord ? employeesByCode.get(timelineRecord.employeeCode) : null}
            punches={timelineRecord ? getPunchesForWindow(timelineRecord.employeeCode, timelineRecord.date, Boolean(timelineRecord.isOvernight)) : []}
            adjustments={timelineRecord ? adjustmentsByKey.get(`${timelineRecord.employeeCode}__${timelineRecord.date}`) || [] : []}
            rules={rules}
            onOpenChange={(open) => {
              if (!open) setTimelineRecord(null);
            }}
          />
        </main>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    "Present": "status-present",
    "Absent": "status-absent",
    "Late": "status-late",
    "Excused": "status-excused",
    "Leave Deduction": "bg-rose-100 text-rose-700 border-rose-200",
    "Excused Absence": "bg-amber-100 text-amber-700 border-amber-200",
    "Termination Period": "bg-slate-200 text-slate-700 border-slate-300",
    "Friday": "bg-amber-100 text-amber-700 border-amber-200",
    "Friday Attended": "bg-amber-100 text-amber-700 border-amber-200",
    "Comp Day": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Official Holiday": "bg-blue-100 text-blue-700 border-blue-200",
  };
  
  const labels: Record<string, string> = {
    "Present": "حضور",
    "Absent": "غياب",
    "Late": "تأخير",
    "Excused": "مأذون",
    "Leave Deduction": "إجازة بالخصم",
    "Excused Absence": "غياب بعذر",
    "Termination Period": "فترة ترك",
    "Friday": "جمعة",
    "Friday Attended": "جمعة (حضور)",
    "Comp Day": "يوم بالبدل",
    "Official Holiday": "إجازة رسمية",
  };

  const baseStyle = styles[status || ""] || "bg-slate-100 text-slate-600";
  const label = labels[status || ""] || status || "-";

  return (
    <div className="flex items-center gap-2">
      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold border", baseStyle)}>
        {label}
      </span>
    </div>
  );
}

type TimelineSheetProps = {
  record: any | null;
  employee: any | null;
  punches: { punchDatetime: Date }[];
  adjustments: any[];
  rules: any[];
  onOpenChange: (open: boolean) => void;
};

function TimelineSheet({ record, employee, punches, adjustments, rules, onOpenChange }: TimelineSheetProps) {
  const isOpen = Boolean(record);
  if (!record) {
    return (
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent side="right" />
      </Sheet>
    );
  }

  const shiftInfo = employee
    ? resolveShiftForDate({ employee, dateStr: record.date, rules })
    : { shiftStart: "09:00", shiftEnd: "17:00" };
  const windowStartHour = record.isOvernight ? 6 : 0;
  const windowStartSeconds = windowStartHour * 3600;

  const normalizeSeconds = (seconds: number) => {
    let offset = seconds - windowStartSeconds;
    if (offset < 0) offset += 24 * 3600;
    return Math.min(Math.max(offset, 0), 24 * 3600);
  };

  const punchMarkers = punches.map((punch) => {
    const date = new Date(punch.punchDatetime);
    const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    return {
      id: date.getTime(),
      label: format(date, "HH:mm"),
      offset: normalizeSeconds(seconds),
    };
  });

  const checkIn = record.checkIn ? new Date(record.checkIn) : null;
  const checkOut = record.checkOut ? new Date(record.checkOut) : null;
  const checkInOffset = checkIn
    ? normalizeSeconds(checkIn.getHours() * 3600 + checkIn.getMinutes() * 60 + checkIn.getSeconds())
    : null;
  const checkOutOffset = checkOut
    ? normalizeSeconds(checkOut.getHours() * 3600 + checkOut.getMinutes() * 60 + checkOut.getSeconds())
    : null;

  const shiftStartOffset = normalizeSeconds(timeStringToSeconds(shiftInfo.shiftStart));
  const shiftEndOffset = normalizeSeconds(timeStringToSeconds(shiftInfo.shiftEnd));
  const overtimeStartOffset = normalizeSeconds(timeStringToSeconds(shiftInfo.shiftEnd) + 3600);

  const adjustmentRanges = adjustments.map((adj) => ({
    ...adj,
    start: normalizeSeconds(timeStringToSeconds(adj.fromTime)),
    end: normalizeSeconds(timeStringToSeconds(adj.toTime)),
  }));

  const penalties = Array.isArray(record.penalties) ? record.penalties : [];
  const penaltyTotal = penalties.reduce((sum: number, penalty: any) => sum + (Number(penalty?.value) || 0), 0);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>الخط الزمني للحضور</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ملخص اليوم</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{record.employeeCode}</Badge>
                <Badge variant="outline">{record.date}</Badge>
                <Badge variant="outline">{employee?.nameAr || "-"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>بداية الوردية: <span className="text-foreground">{shiftInfo.shiftStart}</span></div>
                <div>نهاية الوردية: <span className="text-foreground">{shiftInfo.shiftEnd}</span></div>
                <div>الدخول: <span className="text-foreground">{checkIn ? format(checkIn, "HH:mm") : "-"}</span></div>
                <div>الخروج: <span className="text-foreground">{checkOut ? format(checkOut, "HH:mm") : "-"}</span></div>
                <div>ساعات العمل: <span className="text-foreground">{record.totalHours?.toFixed(2) ?? "-"}</span></div>
                <div>الإضافي: <span className="text-foreground">{record.overtimeHours?.toFixed(2) ?? "-"}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">خط الزمن</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-20 rounded-lg border border-border/50 bg-slate-50">
                <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" />
                {[0, 6, 12, 18, 24].map((hour) => {
                  const offset = ((hour * 3600) / (24 * 3600)) * 100;
                  return (
                    <div key={hour} className="absolute top-0 h-full" style={{ left: `${offset}%` }}>
                      <div className="h-full w-px bg-slate-200" />
                      <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-muted-foreground">
                        {(hour + windowStartHour) % 24}:00
                      </span>
                    </div>
                  );
                })}
                <div
                  className="absolute top-[18px] h-10 rounded-md bg-blue-100 border border-blue-200"
                  style={{
                    left: `${(shiftStartOffset / (24 * 3600)) * 100}%`,
                    width: `${Math.max(shiftEndOffset - shiftStartOffset, 0) / (24 * 3600) * 100}%`,
                  }}
                />
                <div className="absolute top-[12px] h-12 border-l-2 border-blue-600" style={{ left: `${(shiftStartOffset / (24 * 3600)) * 100}%` }} />
                <div className="absolute top-[12px] h-12 border-l-2 border-blue-600" style={{ left: `${(shiftEndOffset / (24 * 3600)) * 100}%` }} />
                <div className="absolute top-[12px] h-12 border-l-2 border-emerald-600" style={{ left: `${(overtimeStartOffset / (24 * 3600)) * 100}%` }} />

                {adjustmentRanges.map((range, index) => (
                  <div
                    key={`${range.type}-${index}`}
                    className="absolute top-[6px] h-6 rounded-md bg-amber-100 border border-amber-200"
                    style={{
                      left: `${(range.start / (24 * 3600)) * 100}%`,
                      width: `${Math.max(range.end - range.start, 0) / (24 * 3600) * 100}%`,
                    }}
                    title={`${range.type} ${range.fromTime}-${range.toTime}`}
                  />
                ))}

                {punchMarkers.map((marker) => (
                  <div
                    key={marker.id}
                    className="absolute top-[50px] h-3 w-3 rounded-full bg-slate-700"
                    style={{ left: `${(marker.offset / (24 * 3600)) * 100}%` }}
                    title={marker.label}
                  />
                ))}

                {checkInOffset !== null && (
                  <div
                    className="absolute top-[44px] h-5 w-2 rounded-full bg-emerald-600"
                    style={{ left: `${(checkInOffset / (24 * 3600)) * 100}%` }}
                    title="دخول"
                  />
                )}
                {checkOutOffset !== null && (
                  <div
                    className="absolute top-[44px] h-5 w-2 rounded-full bg-rose-600"
                    style={{ left: `${(checkOutOffset / (24 * 3600)) * 100}%` }}
                    title="خروج"
                  />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">الوردية</Badge>
                <Badge variant="outline">الإضافي</Badge>
                <Badge variant="outline">التسويات</Badge>
                <Badge variant="outline">البصمات</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">التفاصيل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="font-semibold">البصمات:</span>{" "}
                {punchMarkers.length > 0 ? punchMarkers.map((marker) => marker.label).join("، ") : "-"}
              </div>
              <div>
                <span className="font-semibold">التسويات:</span>{" "}
                {adjustments.length > 0
                  ? adjustments.map((adj) => `${adj.type} (${adj.fromTime}-${adj.toTime})`).join(" | ")
                  : "-"}
              </div>
              <div>
                <span className="font-semibold">المخالفات:</span>{" "}
                {penalties.length > 0
                  ? penalties.map((penalty: any) => `${penalty.type}: ${penalty.value}`).join(" | ")
                  : "-"}
              </div>
              <div>
                <span className="font-semibold">إجمالي الخصم:</span> {penaltyTotal || 0}
              </div>
              <div>
                <span className="font-semibold">الملاحظات:</span> {record.notes || "-"}
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
