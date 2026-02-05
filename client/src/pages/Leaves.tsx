import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLeaves, useCreateLeave, useDeleteLeave, useImportLeaves } from "@/hooks/use-data";

const TYPE_LABELS: Record<string, string> = {
  official: "اجازة رسمية",
  collections: "اجازات التحصيل",
};

const SCOPE_LABELS: Record<string, string> = {
  all: "الكل",
  sector: "قطاع",
  department: "إدارة",
  section: "قسم",
  branch: "فرع",
  emp: "موظف",
};

export default function Leaves() {
  const { data: leaves } = useLeaves();
  const createLeave = useCreateLeave();
  const deleteLeave = useDeleteLeave();
  const importLeaves = useImportLeaves();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    type: "official",
    scope: "all",
    scopeValue: "",
    startDate: "",
    endDate: "",
    note: "",
  });

  const rows = useMemo(() => leaves || [], [leaves]);

  const handleCreate = async () => {
    if (!form.startDate || !form.endDate) {
      toast({ title: "خطأ", description: "يرجى تحديد الفترة", variant: "destructive" });
      return;
    }
    if (form.scope !== "all" && !form.scopeValue) {
      toast({ title: "خطأ", description: "يرجى تحديد قيمة النطاق", variant: "destructive" });
      return;
    }
    await createLeave.mutateAsync({
      type: form.type,
      scope: form.scope,
      scopeValue: form.scope === "all" ? null : form.scopeValue,
      startDate: form.startDate,
      endDate: form.endDate,
      note: form.note || null,
    });
    toast({ title: "تم الحفظ", description: "تم إضافة الإجازة" });
    setForm((prev) => ({ ...prev, scopeValue: "", note: "" }));
  };

  const handleExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      rows.map((leave: any) => ({
        النوع: leave.type,
        النطاق: leave.scope,
        القيمة: leave.scopeValue || "",
        من: leave.startDate,
        إلى: leave.endDate,
        ملاحظة: leave.note || "",
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leaves");
    XLSX.writeFile(workbook, "leaves.xlsx");
  };

  const handleImport = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];
    const rowsToImport = data.map((row, index) => ({
      rowIndex: index + 2,
      type: String(row["النوع"] || "").trim(),
      scope: String(row["النطاق"] || "").trim(),
      scopeValue: String(row["القيمة"] || "").trim(),
      startDate: String(row["من"] || "").trim(),
      endDate: String(row["إلى"] || "").trim(),
      note: String(row["ملاحظة"] || "").trim(),
    }));
    const result = await importLeaves.mutateAsync({ rows: rowsToImport });
    if (result.invalid.length > 0) {
      toast({
        title: "تحذير",
        description: `تم استيراد ${result.inserted} صفوف، مع ${result.invalid.length} صفوف غير صالحة.`,
        variant: "destructive",
      });
    } else {
      toast({ title: "نجاح", description: "تم استيراد الإجازات" });
    }
  };

  return (
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="إدارة الإجازات" />
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select value={form.type} onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="official">اجازة رسمية</SelectItem>
                  <SelectItem value="collections">اجازات التحصيل</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.scope} onValueChange={(value) => setForm((prev) => ({ ...prev, scope: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="النطاق" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="sector">قطاع</SelectItem>
                  <SelectItem value="department">إدارة</SelectItem>
                  <SelectItem value="section">قسم</SelectItem>
                  <SelectItem value="branch">فرع</SelectItem>
                  <SelectItem value="emp">موظف</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="قيمة النطاق"
                value={form.scopeValue}
                onChange={(e) => setForm((prev) => ({ ...prev, scopeValue: e.target.value }))}
                disabled={form.scope === "all"}
              />
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
              <Input
                placeholder="ملاحظة"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCreate}>إضافة إجازة</Button>
              <Button variant="outline" onClick={handleExport}>تصدير</Button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImport(file);
                  }
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                استيراد
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-muted-foreground font-medium">
                <tr>
                  <th className="px-4 py-3">النوع</th>
                  <th className="px-4 py-3">النطاق</th>
                  <th className="px-4 py-3">القيمة</th>
                  <th className="px-4 py-3">من</th>
                  <th className="px-4 py-3">إلى</th>
                  <th className="px-4 py-3">ملاحظة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((leave: any) => (
                  <tr key={leave.id}>
                    <td className="px-4 py-3">{TYPE_LABELS[leave.type] || leave.type}</td>
                    <td className="px-4 py-3">{SCOPE_LABELS[leave.scope] || leave.scope}</td>
                    <td className="px-4 py-3">{leave.scopeValue || "-"}</td>
                    <td className="px-4 py-3">{leave.startDate}</td>
                    <td className="px-4 py-3">{leave.endDate}</td>
                    <td className="px-4 py-3">{leave.note || "-"}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        onClick={() => deleteLeave.mutateAsync(leave.id)}
                      >
                        حذف
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      لا توجد إجازات مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
