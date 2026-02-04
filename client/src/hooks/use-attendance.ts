import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { AttendanceRecord, InsertBiometricPunch } from "@shared/schema";

export function useAttendanceRecords(
  startDate?: string,
  endDate?: string,
  employeeCode?: string,
  page: number = 1,
  limit: number = 0,
  useDefaultRange: boolean = true
) {
  const now = new Date();
  const defaultStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const defaultEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");
  const effectiveStart = useDefaultRange ? (startDate || defaultStart) : startDate;
  const effectiveEnd = useDefaultRange ? (endDate || defaultEnd) : endDate;

  const queryParams = new URLSearchParams();
  if (effectiveStart) queryParams.append("startDate", effectiveStart);
  if (effectiveEnd) queryParams.append("endDate", effectiveEnd);
  if (employeeCode) queryParams.append("employeeCode", employeeCode);
  queryParams.append("page", page.toString());
  queryParams.append("limit", limit.toString());

  const url = `${api.attendance.list.path}?${queryParams.toString()}`;

  return useQuery({
    queryKey: [api.attendance.list.path, effectiveStart, effectiveEnd, employeeCode, page, limit, useDefaultRange],
    enabled: !!effectiveStart && !!effectiveEnd,
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch attendance");
      return await res.json();
    },
  });
}

export function useProcessAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      const res = await fetch(api.attendance.process.path, {
        method: api.attendance.process.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!res.ok) throw new Error("Failed to process attendance");
      return api.attendance.process.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.attendance.list.path] }),
  });
}

export function useImportPunches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertBiometricPunch[]) => {
      const res = await fetch(api.import.punches.path, {
        method: api.import.punches.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to import punches");
      return api.import.punches.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.attendance.list.path] }),
  });
}
