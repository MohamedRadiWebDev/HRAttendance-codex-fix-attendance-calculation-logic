export const normalizeEmpCode = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (/^\d+$/.test(trimmed)) {
    const normalized = trimmed.replace(/^0+/, "");
    return normalized === "" ? "0" : normalized;
  }
  return trimmed;
};

export const parseEmpScope = (scope: string) => {
  if (!scope.startsWith("emp:")) return new Set<string>();
  const raw = scope.slice("emp:".length).split(",");
  const set = new Set<string>();
  raw.forEach((token) => {
    const normalized = normalizeEmpCode(token);
    if (normalized) set.add(normalized);
  });
  return set;
};
