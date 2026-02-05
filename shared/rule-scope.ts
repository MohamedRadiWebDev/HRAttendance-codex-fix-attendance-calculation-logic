export type RuleScope =
  | { type: "all"; values: [] }
  | { type: "emp" | "dept" | "sector"; values: string[] };

const splitScopeValues = (raw: string) =>
  raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export const parseRuleScope = (scope: string): RuleScope => {
  if (!scope || scope === "all") return { type: "all", values: [] };
  if (scope.startsWith("emp:")) {
    return { type: "emp", values: splitScopeValues(scope.slice("emp:".length)) };
  }
  if (scope.startsWith("dept:")) {
    return { type: "dept", values: splitScopeValues(scope.slice("dept:".length)) };
  }
  if (scope.startsWith("sector:")) {
    return { type: "sector", values: splitScopeValues(scope.slice("sector:".length)) };
  }
  return { type: "all", values: [] };
};

export const buildEmpScope = (values: string[]) => {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  return `emp:${normalized.join(",")}`;
};
