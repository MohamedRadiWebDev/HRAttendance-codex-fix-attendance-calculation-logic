import { useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEmployees } from "@/hooks/use-employees";
import { useAdjustments, useImportAdjustments } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import * as XLSX from "xlsx";

const EXPECTED_HEADERS = ["الكود", "الاسم", "التاريخ", "من", "الي", "النوع"];
const ALLOWED_TYPES = ["اذن صباحي", "اذن مسائي", "إجازة نص يوم", "مأمورية"];

type ImportRow = {
  rowIndex: number;
  employeeCode: string;
  employeeName: string;
  date: string;
  fromTime: string;
  toTime: string;
  type: string;
};

type InvalidRow = {
  rowIndex: number;
  reason: string;
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
  const importAdjustments = useImportAdjustments();
  const { toast } = useToast();

  const [fileName, setFileName] = useState("");
  const [validRows, setValidRows] = useState<ImportRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([]);

  const [filters, setFilters] = useState({ startDate: "", endDate: "", employeeCode: "", type: "all" });
  const adjustmentsFilters = {
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    employeeCode: filters.employeeCode || undefined,
    type: filters.type !== "all" ? filters.type : undefined,
  };
  const { data: adjustments } = useAdjustments(adjustmentsFilters);

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
      setValidRows([]);
      setInvalidRows([{ rowIndex: 1, reason: "عناوين الأعمدة غير مطابقة" }]);
      return;
    }

    const nextValid: ImportRow[] = [];
    const nextInvalid: InvalidRow[] = [];

    rows.slice(1).forEach((row, index) => {
      const rowIndex = index + 2;
      const [code, name, dateRaw, fromRaw, toRaw, typeRaw] = row;
      const employeeCode = String(code ?? "").trim();
      const employeeName = String(name ?? "").trim();
      const date = normalizeDate(dateRaw);
      const fromTime = normalizeTime(fromRaw);
      const toTime = normalizeTime(toRaw);
      const type = String(typeRaw ?? "").trim();

      if (!employeeCode) {
        nextInvalid.push({ rowIndex, reason: "كود الموظف مفقود" });
        return;
      }
      if (!employeeCodes.has(employeeCode)) {
        nextInvalid.push({ rowIndex, reason: "كود الموظف غير موجود" });
        return;
      }
      if (!date) {
        nextInvalid.push({ rowIndex, reason: "التاريخ غير صالح" });
        return;
      }
      if (!fromTime || !toTime) {
        nextInvalid.push({ rowIndex, reason: "وقت البداية أو النهاية غير صالح" });
        return;
      }
      if (!ALLOWED_TYPES.includes(type)) {
        nextInvalid.push({ rowIndex, reason: "نوع غير مسموح" });
        return;
      }
      if (fromTime >= toTime) {
        nextInvalid.push({ rowIndex, reason: "وقت البداية يجب أن يكون قبل النهاية" });
        return;
      }

      nextValid.push({
        rowIndex,
        employeeCode,
        employeeName,
        date,
        fromTime,
        toTime,
        type,
      });
    });

    setValidRows(nextValid);
    setInvalidRows(nextInvalid);
  };

  const handleImport = () => {
    if (validRows.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد بيانات صالحة للاستيراد.", variant: "destructive" });
      return;
    }
    importAdjustments.mutate({
      sourceFileName: fileName,
      rows: validRows.map((row) => ({
        rowIndex: row.rowIndex,
        employeeCode: row.employeeCode,
        date: row.date,
        type: row.type,
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
          setInvalidRows(data.invalid);
        }
      },
      onError: (error: any) => {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      },
    });
  };

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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-slate-50 border border-border/50 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">الصفوف الصالحة</h3>
                  <div className="max-h-60 overflow-auto text-sm">
                    {validRows.length === 0 ? (
                      <p className="text-muted-foreground">لا توجد بيانات صالحة بعد.</p>
                    ) : (
                      <table className="w-full text-right text-xs">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="py-1">الصف</th>
                            <th className="py-1">الكود</th>
                            <th className="py-1">التاريخ</th>
                            <th className="py-1">من</th>
                            <th className="py-1">إلى</th>
                            <th className="py-1">النوع</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validRows.map((row) => (
                            <tr key={`${row.employeeCode}-${row.rowIndex}`} className="border-t border-border/30">
                              <td className="py-1">{row.rowIndex}</td>
                              <td className="py-1">{row.employeeCode}</td>
                              <td className="py-1">{row.date}</td>
                              <td className="py-1">{row.fromTime}</td>
                              <td className="py-1">{row.toTime}</td>
                              <td className="py-1">{row.type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                <div className="bg-slate-50 border border-border/50 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">تحقق الاستيراد</h3>
                  <div className="max-h-60 overflow-auto text-sm">
                    {invalidRows.length === 0 ? (
                      <p className="text-muted-foreground">لا توجد أخطاء حالياً.</p>
                    ) : (
                      <ul className="space-y-2">
                        {invalidRows.map((row, index) => (
                          <li key={`${row.rowIndex}-${index}`} className="flex items-center justify-between border border-border/40 rounded-lg p-2">
                            <span>الصف {row.rowIndex}</span>
                            <span className="text-red-600">{row.reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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
                      {ALLOWED_TYPES.map((type) => (
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
