/**
 * Commission Payout Schedule Service — Phase 2A automated tests.
 *
 * Pure-function tests (no database required), following this repository's
 * existing test convention (node:assert + tsx — see
 * scripts/test-recurring-scheduler-policy.ts / scripts/test-plan-start-dates.ts).
 */

import assert from "node:assert/strict";
import {
  getWritingCommissionPayDate,
  getOverridePayDate,
  isFederalReserveBankHoliday,
  previousBusinessDay,
  nextBusinessDay,
  isWritingBalancePayable,
  isOverrideBalancePayable,
} from "../server/services/commission-payout-schedule-service";

const date = (mmddyyyy: string): Date => {
  const [m, d, y] = mmddyyyy.split("/").map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (d: Date): string =>
  `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

// ---------------------------------------------------------------------------
// §9 — Required writing commission tests (all 7 must pass; forensic audit
// found the old implementation failed 4 of these 7).
// ---------------------------------------------------------------------------
const writingCases: Array<[string, string]> = [
  ["03/01/2026", "03/06/2026"],
  ["04/01/2026", "04/03/2026"],
  ["05/01/2026", "05/08/2026"],
  ["06/15/2026", "06/18/2026"],
  ["07/01/2026", "07/03/2026"],
  ["08/15/2026", "08/21/2026"],
  ["01/01/2027", "01/08/2027"],
];

for (const [effective, expected] of writingCases) {
  const actual = fmt(getWritingCommissionPayDate(date(effective)));
  assert.equal(
    actual,
    expected,
    `writing commission effective ${effective}: expected ${expected}, got ${actual}`,
  );
}
console.log(`✅ Writing commission tests passed (${writingCases.length}/${writingCases.length})`);

// ---------------------------------------------------------------------------
// §10 — Required override tests
// ---------------------------------------------------------------------------
const overrideCases: Array<[string, string]> = [
  ["08/01/2026", "09/04/2026"], // August 2026 earnings
  ["09/01/2026", "10/02/2026"], // September 2026 earnings
  ["12/01/2026", "01/04/2027"], // December 2026 earnings (New Year's Day holiday, forward)
];

for (const [earnedMonthAnchor, expected] of overrideCases) {
  const actual = fmt(getOverridePayDate(date(earnedMonthAnchor)));
  assert.equal(
    actual,
    expected,
    `override earned month ${earnedMonthAnchor}: expected ${expected}, got ${actual}`,
  );
}
console.log(`✅ Override tests passed (${overrideCases.length}/${overrideCases.length})`);

// Override anchor date should not matter beyond year/month (any day within
// the earning month produces the same result).
assert.equal(
  fmt(getOverridePayDate(date("08/17/2026"))),
  fmt(getOverridePayDate(date("08/01/2026"))),
  "override pay date must depend only on year/month of the earned month, not the day",
);

// ---------------------------------------------------------------------------
// §11 — Additional edge tests
// ---------------------------------------------------------------------------

// Effective date itself is a Friday — must NOT pay that same Friday.
assert.equal(date("05/01/2026").getDay(), 5, "test fixture assumption: 05/01/2026 is a Friday");
const fridayEffectiveResult = getWritingCommissionPayDate(date("05/01/2026"));
assert.notEqual(fmt(fridayEffectiveResult), "05/01/2026");
assert.equal(fmt(fridayEffectiveResult), "05/08/2026");

// Effective date is a Saturday — first Friday strictly afterward.
const saturdayEffective = date("08/15/2026");
assert.equal(saturdayEffective.getDay(), 6, "test fixture assumption: 08/15/2026 is a Saturday");
assert.equal(fmt(getWritingCommissionPayDate(saturdayEffective)), "08/21/2026");

// Effective date is a Sunday — first Friday strictly afterward.
// 11/01/2026 is a Sunday.
const sundayEffective = date("11/01/2026");
assert.equal(sundayEffective.getDay(), 0, "test fixture assumption: 11/01/2026 is a Sunday");
const sundayResult = getWritingCommissionPayDate(sundayEffective);
assert.equal(sundayResult.getDay(), 5, "result must be a Friday");
assert.ok(sundayResult.getTime() > sundayEffective.getTime(), "result must be strictly after the effective date");
assert.equal(fmt(sundayResult), "11/06/2026");

// Friday payout lands on a holiday: writing moves BACKWARD.
// 06/15/2026 (Monday) -> naive Friday 06/19/2026 = Juneteenth -> 06/18/2026.
assert.equal(isFederalReserveBankHoliday(date("06/19/2026")), true);
assert.equal(fmt(getWritingCommissionPayDate(date("06/15/2026"))), "06/18/2026");

// Friday payout lands on a holiday: override moves FORWARD.
// December 2026 -> naive first Friday 01/01/2027 = New Year's Day -> 01/04/2027.
assert.equal(isFederalReserveBankHoliday(date("01/01/2027")), true);
assert.equal(fmt(getOverridePayDate(date("12/01/2026"))), "01/04/2027");

// Holiday adjustment crossing a month boundary: writing must never cross
// backward past the effective date's own eligible window in a way that
// produces an earlier-than-effective result, and override must never move
// back into the earning month.
const decemberOverrideResult = getOverridePayDate(date("12/15/2026"));
assert.ok(
  decemberOverrideResult.getFullYear() === 2027 && decemberOverrideResult.getMonth() === 0,
  "override forward-holiday adjustment must stay in the following month (January 2027), never back into December 2026",
);

// Weekend business-day navigation: previousBusinessDay/nextBusinessDay must
// skip Saturday and Sunday correctly.
assert.equal(fmt(previousBusinessDay(date("11/01/2026"))), "10/30/2026"); // Sunday -> preceding Friday
assert.equal(fmt(nextBusinessDay(date("11/01/2026"))), "11/02/2026"); // Sunday -> following Monday

console.log("✅ Edge-case tests passed");

// ---------------------------------------------------------------------------
// §8 — July 3, 2026 must be treated as a normal Federal Reserve Bank
// business day (Board of Governors closure is not a Reserve Bank holiday).
// ---------------------------------------------------------------------------
assert.equal(date("07/04/2026").getDay(), 6, "test fixture assumption: 07/04/2026 is a Saturday");
assert.equal(
  isFederalReserveBankHoliday(date("07/03/2026")),
  false,
  "07/03/2026 must NOT be treated as a Federal Reserve Bank holiday",
);
assert.equal(fmt(getWritingCommissionPayDate(date("07/01/2026"))), "07/03/2026");
console.log("✅ July 3, 2026 rule test passed");

// ---------------------------------------------------------------------------
// §15 — Writing and override thresholds stay independent; $20 writing +
// $10 override must NOT become a payable combined $30.
// ---------------------------------------------------------------------------
assert.equal(isWritingBalancePayable(20), false);
assert.equal(isOverrideBalancePayable(10), false);
assert.equal(isWritingBalancePayable(20 + 10), true, "sanity check: $30 alone would be payable");
// The two balances must be evaluated independently, never summed:
const writingBalance = 20;
const overrideBalance = 10;
assert.equal(
  isWritingBalancePayable(writingBalance) || isOverrideBalancePayable(overrideBalance),
  false,
  "$20 writing + $10 override must not become a payable combined $30 — each balance is evaluated independently",
);
assert.equal(isWritingBalancePayable(25), true);
assert.equal(isOverrideBalancePayable(25), true);
console.log("✅ Threshold separation tests passed");

console.log("\nAll Phase 2A commission-payout-schedule-service tests passed.");
