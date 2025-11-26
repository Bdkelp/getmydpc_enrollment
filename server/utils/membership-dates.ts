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

/**
 * Calculate next recurring billing date (same day next month)
 * @param billingDate - The original billing date
 * @returns The next billing date (same day next month)
 */
export function calculateNextBillingDate(billingDate: Date): Date {
  const nextMonth = new Date(billingDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  // Handle edge case: if billing date is 31st but next month has fewer days
  // (e.g., Jan 31 → Feb 28/29), use last day of month
  const dayOfMonth = billingDate.getDate();
  const lastDayOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  
  if (dayOfMonth > lastDayOfNextMonth) {
    nextMonth.setDate(lastDayOfNextMonth);
  }
  
  return nextMonth;
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
