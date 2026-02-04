import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, Plus, Trash2, Download } from "lucide-react";
import { useTemplates, useDeleteTemplate, useCreateTemplate } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTemplateSchema } from "@shared/schema";

export default function Templates() {
  const { data: templates, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: "نجاح", description: "تم حذف النموذج بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="نماذج الإكسل" />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold font-display">إدارة القوالب والنماذج</h2>
              <AddTemplateDialog />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <Card key={i} className="animate-pulse h-48" />
                ))
              ) : templates?.map((template) => (
                <Card key={template.id} className="hover-elevate transition-all duration-200">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-bold">{template.name}</CardTitle>
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        <p>النوع: {template.type === 'attendance' ? 'حضور وانصراف' : 'ملخص شهري'}</p>
                        <p>الأعمدة المعرفة: {Object.keys(template.mapping as any).length}</p>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(template.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toast({ title: "معلومات", description: "تحميل القالب الفارغ للاستخدام" })}>
                          <Download className="w-4 h-4 text-primary" />
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

function AddTemplateDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createTemplate = useCreateTemplate();
  
  const form = useForm({
    resolver: zodResolver(insertTemplateSchema),
    defaultValues: {
      name: "",
      type: "attendance",
      mapping: {},
    }
  });

  const onSubmit = (data: any) => {
    // Basic mapping for now, in real app would use a column builder
    const defaultMapping = {
      "Code": "employeeCode",
      "Name": "nameAr",
      "Date": "date",
      "Time": "punchDatetime"
    };
    createTemplate.mutate({ ...data, mapping: defaultMapping }, {
      onSuccess: () => {
        toast({ title: "تم الحفظ", description: "تم إنشاء النموذج بنجاح" });
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
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          إنشاء نموذج جديد
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>إنشاء نموذج إكسل جديد</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم النموذج</FormLabel>
                  <FormControl>
                    <Input placeholder="مثال: نموذج حضور البصمة" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نوع النموذج</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="attendance">حضور وانصراف</SelectItem>
                      <SelectItem value="summary">ملخص شهري</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="bg-slate-50 p-4 rounded-lg border text-sm text-muted-foreground">
              سيتم إنشاء تعيين تلقائي للأعمدة الأساسية (Code, Name, Date, Time). يمكنك تعديلها لاحقاً.
            </div>
            <Button type="submit" className="w-full" disabled={createTemplate.isPending}>
              {createTemplate.isPending ? "جاري الحفظ..." : "حفظ النموذج"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
