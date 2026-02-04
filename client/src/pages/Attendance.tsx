import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Download, Search } from "lucide-react";
import { useAttendanceRecords, useProcessAttendance } from "@/hooks/use-attendance";
import { useEmployees } from "@/hooks/use-employees";
import { useAdjustments } from "@/hooks/use-data";
import { format, startOfMonth, endOfMonth, parse } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from 'xlsx';

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
  const processAttendance = useProcessAttendance();
  const { toast } = useToast();

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

  useEffect(() => {
    setPage(1);
  }, [dateRange.start, dateRange.end, employeeFilter, sectorFilter]);

  const handleProcess = () => {
    if (!dateRange.start || !dateRange.end) {
      toast({ title: "خطأ", description: "يرجى تحديد الفترة أولاً", variant: "destructive" });
      return;
    }
    processAttendance.mutate({ startDate: dateRange.start, endDate: dateRange.end }, {
      onSuccess: (data: any) => {
        toast({ title: "اكتملت المعالجة", description: data.message });
      }
    });
  };

  const handleExport = () => {
    if (!records || records.length === 0) return;
    const employeeMap = new Map((employees || []).map(emp => [emp.code, emp.name]));

    const recordKeyMap = new Map<string, any>();
    records.forEach((record: any) => {
      recordKeyMap.set(`${record.employeeCode}__${record.date}`, record);
    });

    const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    const toExcelTime = (value: Date) => {
      const seconds = value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
      return seconds / 86400;
    };

    const detailHeaders = [
      "الكود",
      "الاسم",
      "التاريخ",
      "اليوم",
      "بصمة دخول",
      "بصمة خروج",
      "نوع اليوم",
      "حضور الجمعة",
      "الحالة",
      "التأخير",
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

    records.forEach((record: any) => {
      const dateObj = new Date(`${record.date}T00:00:00`);
      const dayIndex = dateObj.getUTCDay();
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
        : record.status === "Absent"
          ? "غياب"
          : isCompDay
            ? "إجازة"
            : "حضور";

      let lateValue = "";
      let earlyLeaveValue = "";
      let missingStampValue = "";
      let absenceValue = "";
      let totalPenalties = "";
      const hasPenalties = Array.isArray(record.penalties) && record.penalties.length > 0;

      if (!isFriday) {
        let penaltySum = 0;
        if (hasPenalties) {
          record.penalties.forEach((penalty: any) => {
            const value = Number(penalty.value);
            if (!Number.isFinite(value)) return;
            penaltySum += value;
            if (penalty.type === "تأخير") {
              lateValue = value;
            } else if (penalty.type === "انصراف مبكر") {
              earlyLeaveValue = value;
            } else if (penalty.type === "سهو بصمة") {
              missingStampValue = value;
            } else if (penalty.type === "غياب") {
              absenceValue = value;
            }
          });
        }
        if (penaltySum > 0) {
          totalPenalties = penaltySum;
        }
      }

      const detailRow = [
        record.employeeCode,
        employeeMap.get(record.employeeCode) || "",
        dateObj,
        dayNames[dayIndex],
        record.checkIn ? toExcelTime(new Date(record.checkIn)) : "",
        record.checkOut ? toExcelTime(new Date(record.checkOut)) : "",
        dayType,
        isFriday && attendedFriday ? 1 : "",
        status,
        lateValue,
        earlyLeaveValue,
        missingStampValue,
        absenceValue,
        totalPenalties,
        record.notes || "",
      ];

      detailRows.push(detailRow);

      const summary = summaryByEmployee.get(record.employeeCode) || {
        code: record.employeeCode,
        name: employeeMap.get(record.employeeCode) || "",
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
        record.penalties.forEach((penalty: any) => {
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
        summary.totalAbsencePenalty,
        summary.totalPenalties,
      ]);
    });

    const workbook = XLSX.utils.book_new();
    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

    detailSheet["!cols"] = [
      { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 24 },
    ];

    summarySheet["!cols"] = [
      { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
      { wch: 16 }, { wch: 14 }, { wch: 14 },
    ];

    for (let rowIndex = 1; rowIndex < detailRows.length; rowIndex += 1) {
      const isFridayRow = detailRows[rowIndex][6] === "جمعة";
      const hasViolation = detailRows[rowIndex][9] !== "" ||
        detailRows[rowIndex][10] !== "" ||
        detailRows[rowIndex][11] !== "" ||
        detailRows[rowIndex][12] !== "";
      const fill = isFridayRow
        ? "D9E8FF"
        : hasViolation
          ? "FFE5E5"
          : "E7F7E7";
      for (let colIndex = 0; colIndex < detailHeaders.length; colIndex += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        const cell = detailSheet[cellAddress];
        if (!cell) continue;
        cell.s = {
          fill: { patternType: "solid", fgColor: { rgb: fill } },
        };
      }
    }

    for (let rowIndex = 1; rowIndex < detailRows.length; rowIndex += 1) {
      const dateCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 2 })];
      if (dateCell) {
        dateCell.t = "d";
        dateCell.z = "yyyy-mm-dd";
      }
      const checkInCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 4 })];
      if (checkInCell) {
        checkInCell.t = "n";
        checkInCell.z = "hh:mm";
      }
      const checkOutCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 5 })];
      if (checkOutCell) {
        checkOutCell.t = "n";
        checkOutCell.z = "hh:mm";
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

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-right min-w-[1000px]">
                <thead className="bg-slate-50 text-muted-foreground font-medium sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-4">التاريخ</th>
                    <th className="px-6 py-4">الموظف</th>
                    <th className="px-6 py-4">الدخول</th>
                    <th className="px-6 py-4">الخروج</th>
                    <th className="px-6 py-4">ساعات العمل</th>
                    <th className="px-6 py-4">الإضافي</th>
                    <th className="px-6 py-4">الحالة</th>
                    <th className="px-6 py-4">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center">جاري تحميل البيانات...</td></tr>
                  ) : !dateRange.start || !dateRange.end ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">يرجى تحديد الفترة أولاً.</td></tr>
                  ) : filteredRecords?.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">لا توجد سجلات في هذه الفترة. جرّب معالجة الحضور بعد استيراد البصمة.</td></tr>
                  ) : (
                    filteredRecords?.map((record: any) => (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
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
                          <StatusBadge status={record.status} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
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
    "Friday": "bg-amber-100 text-amber-700 border-amber-200",
    "Friday Attended": "bg-amber-100 text-amber-700 border-amber-200",
    "Comp Day": "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  
  const labels: Record<string, string> = {
    "Present": "حضور",
    "Absent": "غياب",
    "Late": "تأخير",
    "Excused": "مأذون",
    "Friday": "جمعة",
    "Friday Attended": "جمعة (حضور)",
    "Comp Day": "يوم بالبدل",
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
