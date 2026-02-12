import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/use-employees";
import { useAttendanceStore } from "@/store/attendanceStore";
import { useEffectsStore, type Effect } from "@/store/effectsStore";
import { applyEffectsToState } from "@/effects/applyEffects";
import { normalizeEmployeeCode } from "@shared/employee-code";

const HEADERS = ["الكود", "الاسم", "التاريخ", "من", "الي", "النوع", "الحالة", "ملاحظة"];

const weekDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const excelDate = (value: unknown) => {
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  if (typeof value === "number") {
    const p = XLSX.SSF.parse_date_code(value);
    if (p) return format(new Date(Date.UTC(p.y, p.m - 1, p.d)), "yyyy-MM-dd");
  }
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd");
};

const excelTime = (value: unknown) => {
  if (typeof value === "number") {
    const sec = Math.round(value * 24 * 3600);
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  const text = String(value || "").trim();
  if (!text) return "";
  const [h = "0", m = "0", s = "0"] = text.split(":");
  return `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}:${String(Number(s)).padStart(2, "0")}`;
};

export default function Effects() {
  const { toast } = useToast();
  const { data: employees } = useEmployees();
  const effects = useEffectsStore((s) => s.effects);
  const upsertEffects = useEffectsStore((s) => s.upsertEffects);
  const removeEffect = useEffectsStore((s) => s.removeEffect);
  const updateEffect = useEffectsStore((s) => s.updateEffect);

  const adjustments = useAttendanceStore((s) => s.adjustments);
  const leaves = useAttendanceStore((s) => s.leaves);
  const setAdjustments = useAttendanceStore((s) => s.setAdjustments);
  const setLeaves = useAttendanceStore((s) => s.setLeaves);
  const processAttendance = useAttendanceStore((s) => s.processAttendance);

  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [editRow, setEditRow] = useState<Effect | null>(null);

  const employeeMap = useMemo(() => new Map((employees || []).map((e) => [normalizeEmployeeCode(e.code), e])), [employees]);

  const sectors = useMemo(() => Array.from(new Set((employees || []).map((e) => e.sector).filter(Boolean))) as string[], [employees]);
  const departments = useMemo(() => Array.from(new Set((employees || []).map((e) => e.department).filter(Boolean))) as string[], [employees]);
  const branches = useMemo(() => Array.from(new Set((employees || []).map((e) => e.branch).filter(Boolean))) as string[], [employees]);
  const types = useMemo(() => Array.from(new Set(effects.map((e) => e.type))).sort(), [effects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return effects.filter((effect) => {
      const employee = employeeMap.get(normalizeEmployeeCode(effect.employeeCode));
      if (startDate && effect.date < startDate) return false;
      if (endDate && effect.date > endDate) return false;
      if (typeFilter !== "all" && effect.type !== typeFilter) return false;
      if (sourceFilter !== "all" && effect.source !== sourceFilter) return false;
      if (sectorFilter !== "all" && employee?.sector !== sectorFilter) return false;
      if (departmentFilter !== "all" && employee?.department !== departmentFilter) return false;
      if (branchFilter !== "all" && employee?.branch !== branchFilter) return false;
      if (!q) return true;
      return [effect.employeeCode, effect.employeeName || employee?.nameAr || "", effect.type]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [effects, search, startDate, endDate, typeFilter, sourceFilter, sectorFilter, departmentFilter, branchFilter, employeeMap]);

  const reapply = (rows: Effect[]) => {
    const applied = applyEffectsToState({ effects: rows, adjustments, leaves });
    setAdjustments(applied.adjustments);
    setLeaves(applied.leaves);
    if (applied.affectedDates.length > 0) {
      processAttendance({
        startDate: applied.affectedDates[0],
        endDate: applied.affectedDates[applied.affectedDates.length - 1],
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        employeeCodes: applied.employeeCodes,
      });
    }
  };

  const handleImport = async (file: File) => {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    const headers = (rows[0] || []).map((h) => String(h).trim());
    const matched = HEADERS.every((h, i) => headers[i] === h);
    if (!matched) {
      toast({ title: "خطأ", description: "رأس ملف المؤثرات غير مطابق", variant: "destructive" });
      return;
    }

    const valid: Omit<Effect, "id" | "createdAt" | "updatedAt">[] = [];
    const invalid: string[] = [];

    rows.slice(1).forEach((row, idx) => {
      const employeeCode = normalizeEmployeeCode(row[0]);
      const employeeName = String(row[1] || "").trim();
      const date = excelDate(row[2]);
      const fromTime = excelTime(row[3]);
      const toTime = excelTime(row[4]);
      const type = String(row[5] || "").trim();
      const status = String(row[6] || "").trim();
      const note = String(row[7] || "").trim();

      if (!employeeCode) return invalid.push(`صف ${idx + 2}: الكود مطلوب`);
      if (!date) return invalid.push(`صف ${idx + 2}: تاريخ غير صالح`);
      if (!type) return invalid.push(`صف ${idx + 2}: النوع مطلوب`);

      valid.push({ employeeCode, employeeName, date, fromTime, toTime, type, status, note, source: "excel" });
    });

    const stats = upsertEffects(valid);
    reapply(useEffectsStore.getState().effects);

    toast({ title: "تم الحفظ", description: `تم حفظ ${stats.inserted + stats.updated} مؤثر${invalid.length ? ` مع ${invalid.length} صف غير صالح` : ""}` });
  };

  const exportFiltered = () => {
    const data = filtered.map((row) => ({
      الكود: row.employeeCode,
      الاسم: row.employeeName || employeeMap.get(normalizeEmployeeCode(row.employeeCode))?.nameAr || "",
      التاريخ: row.date,
      من: row.fromTime || "",
      الي: row.toTime || "",
      النوع: row.type,
      الحالة: row.status || "",
      ملاحظة: row.note || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Effects");
    XLSX.writeFile(wb, "effects-export.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Sidebar />
      <div className="mr-72 min-h-screen flex flex-col">
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <Header title="إدارة المؤثرات" />

            <div className="rounded-2xl border bg-white p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Input placeholder="بحث بالكود/الاسم/النوع" value={search} onChange={(e) => setSearch(e.target.value)} />
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    {types.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger><SelectValue placeholder="المصدر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المصادر</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => {
                  setSearch(""); setStartDate(""); setEndDate(""); setTypeFilter("all"); setSourceFilter("all");
                  setSectorFilter("all"); setDepartmentFilter("all"); setBranchFilter("all");
                }}>مسح الفلاتر</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select value={sectorFilter} onValueChange={setSectorFilter}><SelectTrigger><SelectValue placeholder="القطاع" /></SelectTrigger><SelectContent><SelectItem value="all">كل القطاعات</SelectItem>{sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}><SelectTrigger><SelectValue placeholder="الإدارة" /></SelectTrigger><SelectContent><SelectItem value="all">كل الإدارات</SelectItem>{departments.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                <Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger><SelectValue placeholder="الفرع" /></SelectTrigger><SelectContent><SelectItem value="all">كل الفروع</SelectItem>{branches.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <Input type="file" accept=".xlsx,.xls" className="max-w-sm" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
                <Button variant="outline" onClick={exportFiltered}>تصدير النتائج</Button>
                <Badge className="mr-auto">عدد المؤثرات: {filtered.length}</Badge>
              </div>
            </div>

            <div className="rounded-2xl border bg-white overflow-hidden">
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-xs min-w-[1200px]">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="px-3 py-2">التاريخ</th><th className="px-3 py-2">اليوم</th><th className="px-3 py-2">الكود</th><th className="px-3 py-2">الاسم</th><th className="px-3 py-2">النوع</th><th className="px-3 py-2">من</th><th className="px-3 py-2">إلى</th><th className="px-3 py-2">الحالة</th><th className="px-3 py-2">ملاحظة</th><th className="px-3 py-2">المصدر</th><th className="px-3 py-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const employee = employeeMap.get(normalizeEmployeeCode(row.employeeCode));
                      const day = weekDays[new Date(row.date).getDay()] || "-";
                      return (
                        <tr key={row.id} className="border-t border-border/30">
                          <td className="px-3 py-2">{row.date}</td>
                          <td className="px-3 py-2">{day}</td>
                          <td className="px-3 py-2">{row.employeeCode}</td>
                          <td className="px-3 py-2">{row.employeeName || employee?.nameAr || "-"}</td>
                          <td className="px-3 py-2">{row.type}</td>
                          <td className="px-3 py-2">{row.fromTime || "-"}</td>
                          <td className="px-3 py-2">{row.toTime || "-"}</td>
                          <td className="px-3 py-2">{row.status || "-"}</td>
                          <td className="px-3 py-2">{row.note || "-"}</td>
                          <td className="px-3 py-2">{row.source}</td>
                          <td className="px-3 py-2 space-x-2 space-x-reverse">
                            <Button size="sm" variant="outline" onClick={() => setEditRow(row)}>تعديل</Button>
                            <Button size="sm" variant="destructive" onClick={() => {
                              if (!confirm("حذف هذا المؤثر؟")) return;
                              removeEffect(row.id);
                              reapply(useEffectsStore.getState().effects.filter((e) => e.id !== row.id));
                            }}>حذف</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={Boolean(editRow)} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المؤثر</DialogTitle>
            <DialogDescription>يمكن تعديل الحالة والملاحظة والتوقيتات.</DialogDescription>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <Input value={editRow.status || ""} onChange={(e) => setEditRow({ ...editRow, status: e.target.value })} placeholder="الحالة" />
              <Input value={editRow.note || ""} onChange={(e) => setEditRow({ ...editRow, note: e.target.value })} placeholder="ملاحظة" />
              <Input value={editRow.fromTime || ""} onChange={(e) => setEditRow({ ...editRow, fromTime: e.target.value })} placeholder="من" />
              <Input value={editRow.toTime || ""} onChange={(e) => setEditRow({ ...editRow, toTime: e.target.value })} placeholder="إلى" />
              <Button onClick={() => {
                updateEffect(editRow.id, editRow);
                reapply(useEffectsStore.getState().effects);
                setEditRow(null);
                toast({ title: "تم التحديث", description: "تم تحديث المؤثر" });
              }}>حفظ</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
