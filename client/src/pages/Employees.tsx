import { useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, MoreHorizontal, FileDown } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import type { Employee } from "@shared/schema";

export default function Employees() {
  const { data: employees, isLoading } = useEmployees();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const filteredEmployees = useMemo(
    () =>
      employees?.filter((emp) => emp.nameAr.includes(searchTerm) || emp.code.includes(searchTerm)) ?? [],
    [employees, searchTerm]
  );

  const handleExport = () => {
    if (!employees || employees.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(employees);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
    XLSX.writeFile(workbook, "Employees_Master_Data.xlsx");
    toast({ title: "تم التصدير", description: "تم تحميل ملف بيانات الموظفين بنجاح" });
  };

  return (
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="الموظفين" />
        
        <main className="flex-1 overflow-y-auto p-8">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="بحث بالاسم أو الكود..." 
                    className="pr-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button variant="outline" className="gap-2" onClick={handleExport}>
                  <FileDown className="w-4 h-4" />
                  تصدير
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 text-muted-foreground font-medium">
                  <tr>
                    <th className="px-6 py-4">كود</th>
                    <th className="px-6 py-4">الاسم</th>
                    <th className="px-6 py-4">القطاع</th>
                    <th className="px-6 py-4">الادارة</th>
                    <th className="px-6 py-4">الوظيفة</th>
                    <th className="px-6 py-4">تاريخ التعيين</th>
                    <th className="px-6 py-4">التليفون</th>
                    <th className="px-6 py-4">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">لا يوجد موظفين</td></tr>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <tr
                        key={employee.id}
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedEmployee(employee)}
                      >
                        <td className="px-6 py-4 font-mono text-primary">{employee.code}</td>
                        <td className="px-6 py-4 font-medium">{employee.nameAr}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-md bg-slate-100 text-xs font-medium text-slate-600">
                            {employee.sector || "-"}
                          </span>
                        </td>
                        <td className="px-6 py-4">{employee.department || "-"}</td>
                        <td className="px-6 py-4">{employee.jobTitle || "-"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{employee.hireDate || "-"}</td>
                        <td className="px-6 py-4" dir="ltr">{employee.personalPhone || "-"}</td>
                        <td className="px-6 py-4">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedEmployee(employee)}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Dialog open={Boolean(selectedEmployee)} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
            <DialogContent className="sm:max-w-[600px]" dir="rtl">
              <DialogHeader>
                <DialogTitle>تفاصيل الموظف</DialogTitle>
              </DialogHeader>
              {selectedEmployee && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div><span className="font-semibold">الكود:</span> {selectedEmployee.code}</div>
                  <div><span className="font-semibold">الاسم:</span> {selectedEmployee.nameAr}</div>
                  <div><span className="font-semibold">القطاع:</span> {selectedEmployee.sector || "-"}</div>
                  <div><span className="font-semibold">الإدارة:</span> {selectedEmployee.department || "-"}</div>
                  <div><span className="font-semibold">القسم:</span> {selectedEmployee.section || "-"}</div>
                  <div><span className="font-semibold">الوظيفة:</span> {selectedEmployee.jobTitle || "-"}</div>
                  <div><span className="font-semibold">الفرع:</span> {selectedEmployee.branch || "-"}</div>
                  <div><span className="font-semibold">المحافظة:</span> {selectedEmployee.governorate || "-"}</div>
                  <div><span className="font-semibold">تاريخ التعيين:</span> {selectedEmployee.hireDate || "-"}</div>
                  <div><span className="font-semibold">تاريخ ترك العمل:</span> {selectedEmployee.terminationDate || "-"}</div>
                  <div><span className="font-semibold">سبب ترك العمل:</span> {selectedEmployee.terminationReason || "-"}</div>
                  <div><span className="font-semibold">مدة الخدمة:</span> {selectedEmployee.serviceDuration || "-"}</div>
                  <div><span className="font-semibold">المدير المباشر:</span> {selectedEmployee.directManager || "-"}</div>
                  <div><span className="font-semibold">مدير الإدارة:</span> {selectedEmployee.deptManager || "-"}</div>
                  <div><span className="font-semibold">الرقم القومي:</span> {selectedEmployee.nationalId || "-"}</div>
                  <div><span className="font-semibold">تاريخ الميلاد:</span> {selectedEmployee.birthDate || "-"}</div>
                  <div><span className="font-semibold">العنوان:</span> {selectedEmployee.address || "-"}</div>
                  <div><span className="font-semibold">محل الميلاد:</span> {selectedEmployee.birthPlace || "-"}</div>
                  <div><span className="font-semibold">التليفون الشخصي:</span> {selectedEmployee.personalPhone || "-"}</div>
                  <div><span className="font-semibold">تليفون الطوارئ:</span> {selectedEmployee.emergencyPhone || "-"}</div>
                  <div><span className="font-semibold">بداية الوردية:</span> {selectedEmployee.shiftStart || "-"}</div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}
