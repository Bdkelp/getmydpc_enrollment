/**
 * Commission Payment Date Calculator
 * 
 * Calculates the payment eligible date for commissions based on business rules:
 * - Weeks run Monday 00:00 → Sunday 23:59
 * - Commissions are paid on the Friday after the week ends
 * - For example, if enrollment is Tuesday, the week ends Sunday, and payment is eligible the following Friday
 */

/**
 * Calculate the payment eligible date for a commission
 * @param enrollmentDate - The date the member enrolled (plan activation date)
 * @returns The Friday after the Monday-Sunday week ends
 */
export function calculatePaymentEligibleDate(enrollmentDate: Date): Date {
  // Find the Monday that starts the week containing the enrollment date
  const dayOfWeek = enrollmentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Calculate days since last Monday
  // If dayOfWeek is 0 (Sunday), we need to go back 6 days
  // If dayOfWeek is 1 (Monday), we need to go back 0 days
  // If dayOfWeek is 2 (Tuesday), we need to go back 1 day, etc.
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  // Get the Monday of this week
  const weekMonday = new Date(enrollmentDate);
  weekMonday.setDate(enrollmentDate.getDate() - daysSinceMonday);
  weekMonday.setHours(0, 0, 0, 0);
  
  // Get the Sunday that ends this week (6 days after Monday)
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);
  weekSunday.setHours(23, 59, 59, 999);
  
  // Payment is eligible on the Friday after the week ends (5 days after Sunday ends)
  const paymentEligibleDate = new Date(weekSunday);
  paymentEligibleDate.setDate(weekSunday.getDate() + 5); // 5 days after Sunday = Friday
  paymentEligibleDate.setHours(0, 0, 0, 0); // Set to beginning of Friday
  
  return paymentEligibleDate;
}

/**
 * Format the payment schedule explanation for display
 * @param enrollmentDate - The date the member enrolled
 * @returns Human-readable explanation of the payment schedule
 */
export function formatPaymentSchedule(enrollmentDate: Date): string {
  const paymentDate = calculatePaymentEligibleDate(enrollmentDate);
  const formatter = new Intl.DateTimeFormat('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return `Enrolled ${formatter.format(enrollmentDate)}, eligible for payment ${formatter.format(paymentDate)}`;
}

/**
 * Check if a commission is currently eligible for payment
 * @param paymentEligibleDate - The calculated payment eligible date
 * @returns true if the current date is on or after the payment eligible date
 */
export function isEligibleForPayment(paymentEligibleDate: Date): boolean {
  const now = new Date();
  return now >= paymentEligibleDate;
}

// Example usage and test cases (for development reference)
if (require.main === module) {
  console.log('Commission Payment Date Calculator - Test Cases\n');
  console.log('Business Rule: Weeks run Monday-Sunday, payment eligible Friday after week ends\n');
  
  const testCases = [
    new Date('2026-02-20'), // Thursday
    new Date('2026-02-17'), // Monday
    new Date('2026-02-22'), // Saturday
    new Date('2026-02-23'), // Sunday
    new Date('2026-02-24'), // Monday (next week)
  ];
  
  testCases.forEach(enrollDate => {
    const paymentDate = calculatePaymentEligibleDate(enrollDate);
    console.log(`Enrollment: ${enrollDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
    console.log(`Payment Eligible: ${paymentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
    console.log(`  → ${formatPaymentSchedule(enrollDate)}\n`);
  });
}
