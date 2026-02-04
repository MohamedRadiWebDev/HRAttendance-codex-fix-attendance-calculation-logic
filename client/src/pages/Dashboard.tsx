import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Users, Clock, AlertTriangle, CheckCircle, Trash2 } from "lucide-react";
import { useAttendanceRecords } from "@/hooks/use-attendance";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useEmployees } from "@/hooks/use-employees";
import { format, parse } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const { data: employees } = useEmployees();
  const [dateInput, setDateInput] = useState({ start: "", end: "" });
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const hasInitialized = useRef(false);

  const parseDateInput = (value: string) => {
    if (!value) return null;
    const parsed = parse(value, "dd/MM/yyyy", new Date());
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(value);
    if (!Number.isNaN(fallback.getTime())) return fallback;
    return null;
  };

  useEffect(() => {
    const storedStart = localStorage.getItem("attendanceStartDate");
    const storedEnd = localStorage.getItem("attendanceEndDate");
    if (storedStart && storedEnd) {
      setDateRange({ start: storedStart, end: storedEnd });
      setDateInput({
        start: format(new Date(storedStart), "dd/MM/yyyy"),
        end: format(new Date(storedEnd), "dd/MM/yyyy"),
      });
    }
    hasInitialized.current = true;
  }, []);

  const { data: attendanceData } = useAttendanceRecords(
    dateRange.start,
    dateRange.end,
    "",
    1,
    0,
    false
  );

  const { data: allEmployees } = useEmployees();

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) return;
    localStorage.setItem("attendanceStartDate", dateRange.start);
    localStorage.setItem("attendanceEndDate", dateRange.end);
  }, [dateRange]);

  useEffect(() => {
    if (!hasInitialized.current) return;
    if (!dateRange.start && !dateRange.end) {
      localStorage.removeItem("attendanceStartDate");
      localStorage.removeItem("attendanceEndDate");
    }
  }, [dateRange]);

  const todayRecords = (attendanceData as any)?.data || [];
  const presentCount = todayRecords.filter((r: any) => r.status === "Present" || r.status === "Late").length;
  const lateCount = todayRecords.filter((r: any) => r.status === "Late").length;
  const absentCount = todayRecords.filter((r: any) => r.status === "Absent").length;
  const excusedCount = todayRecords.filter((r: any) => r.status === "Excused").length;

  const stats = [
    { title: "إجمالي الموظفين", value: allEmployees?.length || 0, icon: Users, color: "blue" as const, trend: "", trendUp: true },
    { title: "حضور الفترة", value: presentCount, icon: CheckCircle, color: "green" as const, trend: "", trendUp: true },
    { title: "تأخيرات الفترة", value: lateCount, icon: Clock, color: "orange" as const, trend: "", trendUp: true },
    { title: "غياب الفترة", value: absentCount, icon: AlertTriangle, color: "red" as const, trend: "", trendUp: false },
  ];

  const chartData = [
    { name: "حضور", value: presentCount },
    { name: "غياب", value: absentCount },
    { name: "تأخير", value: lateCount },
    { name: "إجازات", value: excusedCount },
  ];

  const pieData = [
    { name: 'حضور', value: presentCount },
    { name: 'غياب', value: absentCount },
    { name: 'تأخير', value: lateCount },
    { name: 'إجازات', value: excusedCount },
  ];

  return (
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="لوحة التحكم" />
        
        <main className="flex-1 overflow-y-auto p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-2xl font-bold font-display">لوحة التحكم</h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 bg-slate-50 border border-border rounded-lg p-1">
                  <Input
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={dateInput.start}
                    onChange={(e) => {
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
                    onChange={(e) => {
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
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => {
                    if (window.confirm("هل أنت متأكد من مسح كافة بيانات الموقع؟ لا يمكن التراجع عن هذا الإجراء.")) {
                      fetch("/api/admin/wipe-data", { method: "POST" })
                        .then(res => res.json())
                        .then(data => {
                          window.alert(data.message);
                          window.location.reload();
                        });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  مسح كافة البيانات
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, i) => (
              <StatCard key={i} {...stat} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-border/50 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold font-display">توزيع الحالات حسب الفترة المختارة</h3>
              </div>
              <div className="h-[300px] w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                      cursor={{fill: '#f1f5f9'}}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-border/50 shadow-sm">
              <h3 className="text-lg font-bold font-display mb-6">توزيع الحالات اليومية</h3>
              <div className="h-[300px] w-full flex items-center justify-center" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                {pieData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-sm text-muted-foreground">{item.name}</span>
                    <span className="text-sm font-bold mr-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
