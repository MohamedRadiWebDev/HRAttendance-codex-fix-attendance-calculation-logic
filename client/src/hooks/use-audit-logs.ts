import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useAuditLogs(filters?: { startDate?: string; endDate?: string; employeeCode?: string }) {
  return useQuery({
    queryKey: [api.auditLogs.list.path, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.startDate) params.set("startDate", filters.startDate);
      if (filters?.endDate) params.set("endDate", filters.endDate);
      if (filters?.employeeCode) params.set("employeeCode", filters.employeeCode);
      const url = params.toString()
        ? `${api.auditLogs.list.path}?${params.toString()}`
        : api.auditLogs.list.path;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return api.auditLogs.list.responses[200].parse(await res.json());
    },
  });
}
