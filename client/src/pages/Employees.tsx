import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, MoreHorizontal, FileDown } from "lucide-react";
import { useEmployees, useCreateEmployee } from "@/hooks/use-employees";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';

export default function Employees() {
  const { data: employees, isLoading } = useEmployees();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  
  const filteredEmployees = employees?.filter(emp => 
    emp.nameAr.includes(searchTerm) || emp.code.includes(searchTerm)
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
                <AddEmployeeDialog />
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
                  ) : filteredEmployees?.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">لا يوجد موظفين</td></tr>
                  ) : (
                    filteredEmployees?.map((employee) => (
                      <tr key={employee.id} className="hover:bg-slate-50/50 transition-colors">
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast({ title: "معلومات", description: `عرض تفاصيل الموظف: ${employee.nameAr}` })}>
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
        </main>
      </div>
    </div>
  );
}

function AddEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createEmployee = useCreateEmployee();
  
  const form = useForm({
    resolver: zodResolver(insertEmployeeSchema),
    defaultValues: {
      code: "",
      nameAr: "",
      department: "",
      shiftStart: "09:00",
    }
  });

  const onSubmit = (data: any) => {
    createEmployee.mutate(data, {
      onSuccess: () => {
        toast({ title: "تمت العملية بنجاح", description: "تم إضافة الموظف الجديد" });
        setOpen(false);
        form.reset();
      },
      onError: (err) => {
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25">
          <Plus className="w-4 h-4" />
          إضافة موظف
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>إضافة موظف جديد</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>كود الموظف</FormLabel>
                  <FormControl>
                    <Input placeholder="مثال: 1001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nameAr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم (عربي)</FormLabel>
                  <FormControl>
                    <Input placeholder="الاسم الكامل" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>القسم</FormLabel>
                  <FormControl>
                    <Input placeholder="مثال: المبيعات" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shiftStart"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>بداية الوردية</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full mt-4" disabled={createEmployee.isPending}>
              {createEmployee.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
