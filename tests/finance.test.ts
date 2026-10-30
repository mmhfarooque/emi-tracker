import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, validDate } from "../server/finance.js";

test("reducing-balance EMI matches a known example and fully repays principal", () => {
  const rows = schedule({
    principal: 100000,
    annualRate: 12,
    months: 12,
    firstDue: "2026-01-15",
  });
  assert.equal(rows[0].amount, 888488);
  assert.equal(
    rows.reduce((s, r) => s + r.principal, 0),
    10000000,
  );
  assert.equal(rows.at(-1)!.balance, 0);
  assert.ok(
    rows.every(
      (r) =>
        Number.isSafeInteger(r.amount) &&
        Number.isSafeInteger(r.interest) &&
        r.balance >= 0,
    ),
  );
});
test("zero-interest loans distribute cents with a final rounding adjustment", () => {
  const rows = schedule({
    principal: 100,
    annualRate: 0,
    months: 3,
    firstDue: "2026-01-31",
  });
  assert.deepEqual(
    rows.map((s) => s.amount),
    [3333, 3333, 3334],
  );
  assert.deepEqual(
    rows.map((s) => s.dueDate),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.equal(
    rows.reduce((s, r) => s + r.interest, 0),
    0,
  );
});
test("month-end dates preserve the intended day after leap February and across years", () => {
  const rows = schedule({
    principal: 10000,
    annualRate: 5,
    months: 5,
    firstDue: "2023-12-31",
  });
  assert.deepEqual(
    rows.map((s) => s.dueDate),
    ["2023-12-31", "2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"],
  );
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("not-a-date"), false);
});
test("supported boundary loans stay finite and principal is conserved", () => {
  for (const principal of [1, 100.01, 500000, 1000000000])
    for (const annualRate of [0, 0.01, 10, 60])
      for (const months of [1, 12, 600]) {
        const rows = schedule({
          principal,
          annualRate,
          months,
          firstDue: "2026-10-30",
        });
        assert.equal(
          rows.reduce((n, r) => n + r.principal, 0),
          Math.round(principal * 100),
        );
        assert.ok(
          rows.every(
            (r) =>
              Number.isSafeInteger(r.amount) &&
              r.principal >= 0 &&
              r.interest >= 0,
          ),
        );
        assert.equal(rows.at(-1)!.balance, 0);
      }
});
