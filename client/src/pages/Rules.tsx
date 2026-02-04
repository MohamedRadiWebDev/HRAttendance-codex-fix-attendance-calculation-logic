import { useMemo, useState, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Settings2, ShieldCheck, Download, Upload, Pencil } from "lucide-react";
import { useRules, useDeleteRule, useCreateRule, useUpdateRule } from "@/hooks/use-data";
import { useEmployees } from "@/hooks/use-employees";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { format, parse } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRuleSchema, RULE_TYPES, type SpecialRule } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Rules() {
  const { data: rules, isLoading } = useRules();
  const deleteRule = useDeleteRule();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingRule, setEditingRule] = useState<SpecialRule | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه القاعدة؟")) return;
    try {
      await deleteRule.mutateAsync(id);
      toast({ title: "نجاح", description: "تم حذف القاعدة بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  const handleExport = () => {
    if (!rules) return;
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_rules_${format(new Date(), "yyyyMMdd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = JSON.parse(event.target?.result as string);
        // Clean IDs before importing
        const rulesToImport = content.map(({ id, ...rest }: any) => rest);
        await apiRequest("POST", "/api/rules/import", rulesToImport);
        queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
        toast({ title: "نجاح", description: "تم استيراد القواعد بنجاح" });
      } catch (err: any) {
        toast({ title: "خطأ", description: "فشل استيراد القواعد. تأكد من صحة الملف.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="القواعد والورديات" />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold font-display">إدارة القواعد الخاصة</h2>
              <div className="flex gap-2">
                <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="w-4 h-4" />
                  استيراد
                </Button>
                <Button variant="outline" onClick={handleExport} className="gap-2">
                  <Download className="w-4 h-4" />
                  تصدير
                </Button>
                <AddRuleDialog />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <Card key={i} className="animate-pulse h-48" />
                ))
              ) : rules?.map((rule) => (
                <Card key={rule.id} className="hover-elevate transition-all duration-200">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-bold">{rule.name}</CardTitle>
                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="bg-primary/5">{rule.ruleType}</Badge>
                        <Badge variant="secondary">أولوية: {rule.priority}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>النطاق: {rule.scope}</p>
                        <p>الفترة: {rule.startDate} إلى {rule.endDate}</p>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <AddRuleDialog rule={rule} />
                        <Button variant="ghost" size="icon" onClick={() => toast({ title: "معلومات", description: "فحص حالة القاعدة وتطبيقها" })}>
                          <ShieldCheck className="w-4 h-4 text-primary" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function AddRuleDialog({ rule }: { rule?: SpecialRule }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const { data: employees } = useEmployees();
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  
  const sectors = Array.from(new Set(employees?.map(e => e.sector).filter(Boolean) || []));
  const departments = useMemo(() => {
    return Array.from(
      new Set(
        employees
          ?.filter(emp => (selectedSector ? emp.sector === selectedSector : true))
          .map(emp => emp.department)
          .filter(Boolean) || []
      )
    );
  }, [employees, selectedSector]);
  const filteredEmployees = useMemo(() => {
    return employees?.filter(emp => {
      if (selectedSector && emp.sector !== selectedSector) return false;
      if (selectedDepartment && emp.department !== selectedDepartment) return false;
      return true;
    }) || [];
  }, [employees, selectedSector, selectedDepartment]);
  
  const form = useForm({
    resolver: zodResolver(insertRuleSchema),
    defaultValues: rule ? {
      name: rule.name,
      priority: rule.priority || 0,
      scope: rule.scope,
      startDate: format(new Date(rule.startDate), "dd/MM/yyyy"),
      endDate: format(new Date(rule.endDate), "dd/MM/yyyy"),
      ruleType: rule.ruleType,
      params: rule.params
    } : {
      name: "",
      priority: 0,
      scope: "all",
      startDate: "",
      endDate: "",
      ruleType: "custom_shift",
      params: { shiftStart: "09:00", shiftEnd: "17:00" }
    }
  });

  const onSubmit = (data: any) => {
    const parseDateInput = (value: string) => {
      if (!value) return null;
      const parts = value.split("/");
      if (parts.length === 3) {
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1;
        const y = parseInt(parts[2]);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date;
      }
      const fallback = new Date(value);
      if (!Number.isNaN(fallback.getTime())) return fallback;
      return null;
    };
    const startDate = parseDateInput(data.startDate);
    const endDate = parseDateInput(data.endDate);
    if (!startDate || !endDate) {
      toast({ title: "خطأ", description: "يرجى إدخال تاريخ صحيح بصيغة dd/mm/yyyy", variant: "destructive" });
      return;
    }

    const payload = {
      ...data,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    };

    if (rule) {
      updateRule.mutate({ id: rule.id, rule: payload }, {
        onSuccess: () => {
          toast({ title: "نجاح", description: "تم تحديث القاعدة بنجاح" });
          setOpen(false);
        }
      });
    } else {
      createRule.mutate(payload, {
        onSuccess: () => {
          toast({ title: "نجاح", description: "تمت إضافة القاعدة بنجاح" });
          setOpen(false);
          form.reset();
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {rule ? (
          <Button variant="ghost" size="icon" className="text-primary hover:text-primary hover:bg-primary/10">
            <Pencil className="w-4 h-4" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            إضافة قاعدة جديدة
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{rule ? "تعديل القاعدة" : "إضافة قاعدة جديدة"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم القاعدة</FormLabel>
                    <FormControl><Input placeholder="مثال: وردية رمضان" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ruleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع القاعدة</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="custom_shift">وردية مخصصة</SelectItem>
                        <SelectItem value="attendance_exempt">إعفاء من البصمة</SelectItem>
                        <SelectItem value="overtime_overnight">وردية ليلية</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
              render={({ field }) => (
                  <FormItem>
                    <FormLabel>من تاريخ</FormLabel>
                    <FormControl><Input type="text" placeholder="dd/mm/yyyy" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>إلى تاريخ</FormLabel>
                    <FormControl><Input type="text" placeholder="dd/mm/yyyy" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => {
                const isSect = typeof field.value === 'string' && field.value.startsWith('sector:');
                const isDept = typeof field.value === 'string' && field.value.startsWith('dept:');
                const isEmp = typeof field.value === 'string' && field.value.startsWith('emp:');
                const scopeType = isSect ? 'sector' : (isDept ? 'dept' : (isEmp ? 'emp' : 'all'));
                
                return (
                  <FormItem>
                    <FormLabel>النطاق</FormLabel>
                    <Select 
                      onValueChange={(val) => {
                        if (val === 'all') field.onChange('all');
                        else if (val === 'sector') field.onChange('sector:');
                        else if (val === 'dept') field.onChange('dept:');
                        else field.onChange('emp:');
                      }} 
                      value={scopeType}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        <SelectItem value="sector">قطاع محدد</SelectItem>
                        <SelectItem value="dept">إدارة محددة</SelectItem>
                        <SelectItem value="emp">أكواد موظفين</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {scopeType === 'sector' && (
                      <div className="mt-2">
                        <Select onValueChange={(val) => field.onChange(`sector:${val}`)} value={field.value.split(':')[1] || ""}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="اختر القطاع" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sectors.map(s => (
                              <SelectItem key={s} value={s as string}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {scopeType === 'dept' && (
                      <div className="mt-2">
                        <Select onValueChange={(val) => field.onChange(`dept:${val}`)} value={field.value.split(':')[1] || ""}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="اختر الإدارة" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {departments.map(d => (
                              <SelectItem key={d} value={d as string}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {scopeType === 'emp' && (
                      <div className="mt-2">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <Select
                            onValueChange={(val) => {
                              setSelectedSector(val);
                              setSelectedDepartment("");
                            }}
                            value={selectedSector}
                          >
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="اختر القطاع" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {sectors.map(s => (
                                <SelectItem key={s} value={s as string}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            onValueChange={(val) => setSelectedDepartment(val)}
                            value={selectedDepartment}
                          >
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="اختر الإدارة" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {departments.map(d => (
                                <SelectItem key={d} value={d as string}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Select
                          onValueChange={(val) => {
                            const existing = field.value.replace('emp:', '').split(',').map(v => v.trim()).filter(Boolean);
                            if (!existing.includes(val)) {
                              field.onChange(`emp:${[...existing, val].join(',')}`);
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="اختر الموظف لإضافته" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredEmployees.map(emp => (
                              <SelectItem key={emp.code} value={emp.code}>
                                {emp.code} - {emp.nameAr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input 
                          placeholder="اكتب الأكواد: 101,102" 
                          value={field.value.replace('emp:', '')}
                          onChange={(e) => field.onChange(`emp:${e.target.value}`)}
                        />
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {form.watch("ruleType") === "custom_shift" && (
              <div className="grid grid-cols-2 gap-4 border p-3 rounded-lg bg-slate-50">
                <div className="space-y-2">
                  <label className="text-xs font-bold">بداية الوردية</label>
                  <Input type="time" onChange={(e) => {
                    const current = form.getValues("params") as any;
                    form.setValue("params", { ...current, shiftStart: e.target.value });
                  }} defaultValue="09:00" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold">نهاية الوردية</label>
                  <Input type="time" onChange={(e) => {
                    const current = form.getValues("params") as any;
                    form.setValue("params", { ...current, shiftEnd: e.target.value });
                  }} defaultValue="17:00" />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={createRule.isPending || updateRule.isPending}>
              {createRule.isPending || updateRule.isPending ? "جاري الحفظ..." : "حفظ القاعدة"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
