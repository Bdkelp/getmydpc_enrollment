import assert from "node:assert/strict";
import {
  formatPlanStartDateISO,
  getPlanStartDateDecision,
  isPlanStartDateAllowed,
} from "../shared/planStartDates";

const date = (value: string) => new Date(`${value}T12:00:00`);
const earliest = (today: string) => {
  const decision = getPlanStartDateDecision({ today: date(today) });
  assert.ok(decision);
  return formatPlanStartDateISO(decision.selectedEffectiveDate);
};

const cases: Array<[string, string]> = [
  ["2026-08-26", "2026-09-01"],
  ["2026-08-27", "2026-09-15"],
  ["2026-08-28", "2026-09-15"],
  ["2026-08-31", "2026-09-15"],
  ["2026-09-01", "2026-09-15"],
  ["2026-09-09", "2026-09-15"],
  ["2026-09-10", "2026-10-01"],
  ["2026-09-11", "2026-10-01"],
  ["2026-09-14", "2026-10-01"],
  ["2026-09-15", "2026-10-01"],
  ["2026-08-11", "2026-08-15"],
  ["2026-08-12", "2026-09-01"],
  ["2026-10-27", "2026-11-01"],
  ["2026-10-28", "2026-11-15"],
  ["2026-12-10", "2027-01-01"],
  ["2026-12-16", "2027-01-01"],
  ["2028-01-26", "2028-02-01"],
  ["2028-01-27", "2028-02-15"],
];

for (const [today, expected] of cases) {
  assert.equal(earliest(today), expected, `${today} should select ${expected}`);
}

assert.equal(isPlanStartDateAllowed("2026-09-01", { today: date("2026-08-26") }), true);
assert.equal(isPlanStartDateAllowed("2026-09-01", { today: date("2026-08-27") }), false);
assert.equal(isPlanStartDateAllowed("2026-09-15", { today: date("2026-08-27") }), true);
assert.equal(isPlanStartDateAllowed("2026-09-02", { today: date("2026-08-26") }), false);

console.log(`Plan start date tests passed (${cases.length + 4} assertions)`);
