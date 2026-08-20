/**
 * Federal Reserve Bank holiday calendar + business-day helpers.
 *
 * Shared, single source of truth for "is this a Federal Reserve Bank
 * business day" used by commission/override payout scheduling
 * (server/services/commission-payout-schedule-service.ts).
 *
 * Timezone handling: all functions operate on calendar dates using the
 * local (server) Date components (year/month/day), never on UTC-shifted
 * timestamps, matching the existing convention in shared/localDate.ts. A
 * "date" here always means a specific calendar day, not a moment in time —
 * comparisons never depend on the machine's timezone offset because we only
 * ever read/write year/month/day fields, never epoch millis or ISO-UTC
 * strings, for the holiday/business-day math itself.
 *
 * Corrected vs. the pre-existing calendar in server/utils/membership-dates.ts:
 * a fixed-date holiday that falls on a SATURDAY is observed on its actual
 * date only — Federal Reserve Banks do NOT close the preceding Friday for a
 * Saturday holiday (only the Board of Governors, an administrative body,
 * closes early; Reserve Bank funds-transfer operations remain open). Only a
 * SUNDAY holiday shifts forward to the following Monday. This is why
 * 07/03/2026 (the Friday before Independence Day, which falls on Saturday
 * 07/04/2026) must be treated as a normal Federal Reserve Bank business day.
 * membership-dates.ts's existing (Saturday-shifts-to-Friday) calendar is
 * left untouched here to avoid changing existing billing-anchor behavior
 * that already depends on it — see docs/COMMISSION_PAYOUT_SCHEDULING_PHASE2A_REPORT.md.
 */

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isSameLocalDate(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): Date {
  const first = new Date(year, month, 1);
  const firstWeekdayOffset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + firstWeekdayOffset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

/**
 * Federal Reserve Bank observance rule: a holiday falling on Sunday is
 * observed the following Monday. A holiday falling on Saturday is NOT
 * observed on an adjacent weekday — Reserve Banks remain open that Friday.
 */
function observedFederalReserveHoliday(actualDate: Date): Date {
  const day = actualDate.getDay();
  if (day === 0) {
    return addDays(actualDate, 1);
  }
  return actualDate;
}

function getFederalReserveBankHolidays(year: number): Date[] {
  const january = 0;
  const february = 1;
  const may = 4;
  const june = 5;
  const july = 6;
  const september = 8;
  const october = 9;
  const november = 10;
  const december = 11;

  const holidays: Date[] = [
    observedFederalReserveHoliday(new Date(year, january, 1)), // New Year's Day
    nthWeekdayOfMonth(year, january, 1, 3), // Martin Luther King Jr. Day
    nthWeekdayOfMonth(year, february, 1, 3), // Washington's Birthday
    lastWeekdayOfMonth(year, may, 1), // Memorial Day
    observedFederalReserveHoliday(new Date(year, june, 19)), // Juneteenth
    observedFederalReserveHoliday(new Date(year, july, 4)), // Independence Day
    nthWeekdayOfMonth(year, september, 1, 1), // Labor Day
    nthWeekdayOfMonth(year, october, 1, 2), // Columbus Day
    observedFederalReserveHoliday(new Date(year, november, 11)), // Veterans Day
    nthWeekdayOfMonth(year, november, 4, 4), // Thanksgiving Day
    observedFederalReserveHoliday(new Date(year, december, 25)), // Christmas Day
  ];

  return holidays.map(startOfLocalDay);
}

/** Recognized Federal Reserve Bank holiday for the given calendar date. */
export function isFederalReserveBankHoliday(date: Date): boolean {
  const normalized = startOfLocalDay(date);
  const holidays = getFederalReserveBankHolidays(normalized.getFullYear());
  // A Sunday holiday's Monday observance can fall in the next month but
  // never a different year in this holiday set; still check the adjacent
  // year defensively for New Year's Day observed-Monday edge cases.
  const adjacentYearHolidays =
    normalized.getMonth() === 0
      ? getFederalReserveBankHolidays(normalized.getFullYear() - 1)
      : [];
  return [...holidays, ...adjacentYearHolidays].some((holiday) =>
    isSameLocalDate(holiday, normalized),
  );
}

/** Monday–Friday and not a recognized Federal Reserve Bank holiday. */
export function isFederalReserveBankBusinessDay(date: Date): boolean {
  const normalized = startOfLocalDay(date);
  return !isWeekend(normalized) && !isFederalReserveBankHoliday(normalized);
}

/** The nearest business day on or before `date` (moves backward only if needed). */
export function previousBusinessDay(date: Date): Date {
  let current = startOfLocalDay(date);
  while (!isFederalReserveBankBusinessDay(current)) {
    current = addDays(current, -1);
  }
  return current;
}

/** The nearest business day on or after `date` (moves forward only if needed). */
export function nextBusinessDay(date: Date): Date {
  let current = startOfLocalDay(date);
  while (!isFederalReserveBankBusinessDay(current)) {
    current = addDays(current, 1);
  }
  return current;
}

/** The first Friday on or after `date` (does not itself apply holiday adjustment). */
export function firstFridayOnOrAfter(date: Date): Date {
  const result = startOfLocalDay(date);
  const friday = 5;
  const delta = (friday - result.getDay() + 7) % 7;
  return addDays(result, delta);
}

/** The first Friday strictly after `date` — if `date` is itself a Friday, returns the following Friday. */
export function firstFridayStrictlyAfter(date: Date): Date {
  return firstFridayOnOrAfter(addDays(startOfLocalDay(date), 1));
}
