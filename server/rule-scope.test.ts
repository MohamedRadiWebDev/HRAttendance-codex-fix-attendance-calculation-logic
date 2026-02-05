import assert from "node:assert/strict";
import { normalizeEmpCode, parseEmpScope } from "./rule-scope";

(() => {
  const scope = parseEmpScope("emp:289,31,515,723,780,806");
  assert.ok(scope.has("31"));
  assert.ok(scope.has("806"));
  assert.equal(scope.has("659"), false);
})();

(() => {
  const scope = parseEmpScope("emp:289, 31 , 515");
  assert.ok(scope.has("31"));
  assert.ok(scope.has("515"));
})();

(() => {
  const scope = parseEmpScope("emp:19");
  assert.ok(scope.has("19"));
  assert.equal(scope.size, 1);
})();

(() => {
  assert.equal(normalizeEmpCode("031"), "31");
  assert.equal(normalizeEmpCode("  31  "), "31");
})();

console.log("rule-scope tests passed");
