import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuditLogs } from "@/hooks/use-audit-logs";

export default function AuditLogs() {
  const [filters, setFilters] = useState({ startDate: "", endDate: "", employeeCode: "" });
  const { data: logs } = useAuditLogs({
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    employeeCode: filters.employeeCode || undefined,
  });

  return (
    <div className="flex h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="سجل المراجعة" />
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
              <Input
                placeholder="كود الموظف"
                value={filters.employeeCode}
                onChange={(e) => setFilters((prev) => ({ ...prev, employeeCode: e.target.value }))}
              />
              <Button onClick={() => setFilters({ ...filters })}>تحديث</Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-muted-foreground font-medium">
                <tr>
                  <th className="px-4 py-3">الموظف</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3">الإجراء</th>
                  <th className="px-4 py-3">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(logs || []).map((log: any) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3">{log.employeeCode}</td>
                    <td className="px-4 py-3">{log.date}</td>
                    <td className="px-4 py-3">{log.action}</td>
                    <td className="px-4 py-3 whitespace-pre-wrap">
                      {JSON.stringify(log.details, null, 2)}
                    </td>
                  </tr>
                ))}
                {(logs || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      لا توجد سجلات
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
