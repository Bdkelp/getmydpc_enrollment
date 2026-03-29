/**
 * Membership Date Calculation Utilities
 * 
 * Business Rules:
 * - Enrollment/Billing Date: Variable (any day of month when customer enrolls)
 * - Membership Start Date: Fixed (1st or 15th only)
 * 
 * Logic:
 * - Enrolled on 1st-14th → Membership starts on 15th of SAME month
 * - Enrolled on 15th-end of month → Membership starts on 1st of NEXT month
 * 
 * Examples:
 * - Enroll Nov 5 → Billing: Nov 5 (recurring), Membership: Nov 15
 * - Enroll Nov 18 → Billing: Nov 18 (recurring), Membership: Dec 1
 * - Enroll Nov 14 → Billing: Nov 14 (recurring), Membership: Nov 15 (1 day wait)
 * - Enroll Nov 15 → Billing: Nov 15 (recurring), Membership: Dec 1 (16 day wait)
 */

/**
 * Calculate membership start date based on enrollment date
 * @param enrollmentDate - The date when customer enrolled/paid
 * @returns The membership start date (either 1st or 15th)
 */
export function calculateMembershipStartDate(enrollmentDate: Date): Date {
  const enrollDay = enrollmentDate.getDate();
  const enrollMonth = enrollmentDate.getMonth();
  const enrollYear = enrollmentDate.getFullYear();

  if (enrollDay >= 1 && enrollDay <= 14) {
    // Enrolled 1st-14th → Start on 15th of same month
    return new Date(enrollYear, enrollMonth, 15);
  } else {
    // Enrolled 15th-end of month → Start on 1st of next month
    return new Date(enrollYear, enrollMonth + 1, 1);
  }
}

const BILLING_ANCHOR_DAYS = [1, 15] as const;

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
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month, 1);
  const firstWeekdayOffset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + firstWeekdayOffset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function observedHoliday(actualDate: Date): Date {
  const day = actualDate.getDay();
  if (day === 6) {
    return addDays(actualDate, -1);
  }
  if (day === 0) {
    return addDays(actualDate, 1);
  }
  return actualDate;
}

function getObservedUsBankHolidays(year: number): Date[] {
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
    observedHoliday(new Date(year, january, 1)),
    nthWeekdayOfMonth(year, january, 1, 3),
    nthWeekdayOfMonth(year, february, 1, 3),
    lastWeekdayOfMonth(year, may, 1),
    observedHoliday(new Date(year, june, 19)),
    observedHoliday(new Date(year, july, 4)),
    nthWeekdayOfMonth(year, september, 1, 1),
    nthWeekdayOfMonth(year, october, 1, 2),
    observedHoliday(new Date(year, november, 11)),
    nthWeekdayOfMonth(year, november, 4, 4),
    observedHoliday(new Date(year, december, 25)),
  ];

  return holidays.map(startOfLocalDay);
}

function isUsBankHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const holidays = getObservedUsBankHolidays(year);
  return holidays.some((holiday) => isSameLocalDate(holiday, date));
}

function shiftToPreviousBusinessDay(date: Date): Date {
  let current = startOfLocalDay(date);
  while (isUsBankHoliday(current) || isWeekend(current)) {
    current = addDays(current, -1);
  }
  return current;
}

function adjustAnchorForBusinessCalendar(anchor: Date): Date {
  const day = anchor.getDay();

  if (day === 6) {
    return shiftToPreviousBusinessDay(addDays(anchor, -1));
  }

  if (day === 0) {
    return shiftToPreviousBusinessDay(addDays(anchor, -1));
  }

  if (isUsBankHoliday(anchor)) {
    return shiftToPreviousBusinessDay(addDays(anchor, -1));
  }

  return startOfLocalDay(anchor);
}

function getNextBillingAnchorDate(afterDate: Date): Date {
  const baseline = startOfLocalDay(afterDate);

  for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
    const monthStart = new Date(baseline.getFullYear(), baseline.getMonth() + monthOffset, 1);
    for (const anchorDay of BILLING_ANCHOR_DAYS) {
      const anchor = new Date(monthStart.getFullYear(), monthStart.getMonth(), anchorDay);
      if (anchor <= baseline) {
        continue;
      }
      return anchor;
    }
  }

  return new Date(baseline.getFullYear(), baseline.getMonth() + 1, BILLING_ANCHOR_DAYS[0]);
}

/**
 * Calculate next recurring billing date (same day next month)
 * @param billingDate - The original billing date
 * @returns The next billing date (same day next month)
 */
export function calculateNextBillingDate(billingDate: Date): Date {
  const nextAnchor = getNextBillingAnchorDate(billingDate);
  return adjustAnchorForBusinessCalendar(nextAnchor);
}

/**
 * Format date for EPX API (YYYY-MM-DD)
 * @param date - Date to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateForEPX(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date for database storage (MMDDYYYY)
 * @param date - Date to format
 * @returns Date string in MMDDYYYY format
 */
export function formatDateForDB(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}${day}${year}`;
}

/**
 * Parse database date format (MMDDYYYY) to Date object
 * @param dateStr - Date string in MMDDYYYY format
 * @returns Date object
 */
export function parseDateFromDB(dateStr: string): Date {
  if (!dateStr || dateStr.length !== 8) {
    throw new Error('Invalid date format. Expected MMDDYYYY');
  }
  
  const month = parseInt(dateStr.substring(0, 2), 10) - 1; // Month is 0-indexed
  const day = parseInt(dateStr.substring(2, 4), 10);
  const year = parseInt(dateStr.substring(4, 8), 10);
  
  return new Date(year, month, day);
}

/**
 * Check if membership should be active based on current date and membership start date
 * @param membershipStartDate - The date membership begins
 * @param currentDate - The current date (defaults to now)
 * @returns True if membership should be active
 */
export function isMembershipActive(membershipStartDate: Date, currentDate: Date = new Date()): boolean {
  // Remove time component for date-only comparison
  const startDateOnly = new Date(membershipStartDate.getFullYear(), membershipStartDate.getMonth(), membershipStartDate.getDate());
  const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  
  return currentDateOnly >= startDateOnly;
}

/**
 * Calculate days until membership starts
 * @param enrollmentDate - The date when customer enrolled
 * @param membershipStartDate - The date membership begins
 * @returns Number of days until membership starts
 */
export function daysUntilMembershipStarts(enrollmentDate: Date, membershipStartDate: Date): number {
  const enrollDateOnly = new Date(enrollmentDate.getFullYear(), enrollmentDate.getMonth(), enrollmentDate.getDate());
  const startDateOnly = new Date(membershipStartDate.getFullYear(), membershipStartDate.getMonth(), membershipStartDate.getDate());
  
  const diffTime = startDateOnly.getTime() - enrollDateOnly.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}
