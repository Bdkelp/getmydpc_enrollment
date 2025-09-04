
import { storage } from '../storage';
import { sendWeeklyRecap } from '../utils/notifications';

interface WeeklyRecapData {
  weekOf: string;
  totalEnrollments: number;
  totalRevenue: number;
  newMembers: Array<{
    name: string;
    plan: string;
    amount: number;
    enrollmentDate: string;
    agentName?: string;
  }>;
  agentPerformance: Array<{
    agentName: string;
    enrollments: number;
    totalCommissions: number;
  }>;
  planBreakdown: Array<{
    planName: string;
    enrollments: number;
    revenue: number;
  }>;
}

export class WeeklyRecapService {
  /**
   * Generate and send weekly recap for the previous week
   */
  static async generateAndSendWeeklyRecap(): Promise<void> {
    try {
      console.log('[Weekly Recap] Generating weekly recap...');
      
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(lastWeek);
      weekStart.setDate(lastWeek.getDate() - lastWeek.getDay()); // Start of week (Sunday)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)

      const weekOf = weekStart.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });

      // Get enrollments for the week
      const enrollments = await storage.getAllEnrollments(
        weekStart.toISOString().split('T')[0],
        weekEnd.toISOString().split('T')[0]
      );

      if (!Array.isArray(enrollments)) {
        console.log('[Weekly Recap] No enrollments data available');
        return;
      }

      // Calculate totals
      const totalEnrollments = enrollments.length;
      const totalRevenue = enrollments.reduce((sum, enrollment) => {
        return sum + (parseFloat(enrollment.subscriptionAmount) || 0);
      }, 0);

      // Format new members data
      const newMembers = enrollments.map(enrollment => ({
        name: `${enrollment.firstName} ${enrollment.lastName}`,
        plan: enrollment.planName || 'Unknown Plan',
        amount: parseFloat(enrollment.subscriptionAmount) || 0,
        enrollmentDate: new Date(enrollment.createdAt).toLocaleDateString(),
        agentName: enrollment.agentName || undefined
      }));

      // Calculate agent performance
      const agentMap = new Map();
      enrollments.forEach(enrollment => {
        const agentName = enrollment.agentName || 'Direct';
        if (!agentMap.has(agentName)) {
          agentMap.set(agentName, {
            agentName,
            enrollments: 0,
            totalCommissions: 0
          });
        }
        const agent = agentMap.get(agentName);
        agent.enrollments++;
        agent.totalCommissions += parseFloat(enrollment.commissionAmount) || 0;
      });

      const agentPerformance = Array.from(agentMap.values())
        .filter(agent => agent.agentName !== 'Direct')
        .sort((a, b) => b.enrollments - a.enrollments);

      // Calculate plan breakdown
      const planMap = new Map();
      enrollments.forEach(enrollment => {
        const planName = enrollment.planName || 'Unknown Plan';
        if (!planMap.has(planName)) {
          planMap.set(planName, {
            planName,
            enrollments: 0,
            revenue: 0
          });
        }
        const plan = planMap.get(planName);
        plan.enrollments++;
        plan.revenue += parseFloat(enrollment.subscriptionAmount) || 0;
      });

      const planBreakdown = Array.from(planMap.values())
        .sort((a, b) => b.enrollments - a.enrollments);

      const recapData: WeeklyRecapData = {
        weekOf,
        totalEnrollments,
        totalRevenue,
        newMembers,
        agentPerformance,
        planBreakdown
      };

      // Send the recap
      await sendWeeklyRecap(recapData);
      console.log('[Weekly Recap] Weekly recap sent successfully');

    } catch (error) {
      console.error('[Weekly Recap] Error generating weekly recap:', error);
    }
  }

  /**
   * Schedule weekly recap to run every Monday
   */
  static scheduleWeeklyRecap(): void {
    // Calculate milliseconds until next Monday at 9 AM
    const now = new Date();
    const nextMonday = new Date();
    nextMonday.setDate(now.getDate() + (1 + 7 - now.getDay()) % 7);
    nextMonday.setHours(9, 0, 0, 0);

    const msUntilNextMonday = nextMonday.getTime() - now.getTime();

    // Schedule first recap
    setTimeout(() => {
      this.generateAndSendWeeklyRecap();
      
      // Then schedule to repeat every week
      setInterval(() => {
        this.generateAndSendWeeklyRecap();
      }, 7 * 24 * 60 * 60 * 1000); // Every week
      
    }, msUntilNextMonday);

    console.log('[Weekly Recap] Scheduled weekly recap for every Monday at 9 AM');
    console.log('[Weekly Recap] Next recap will be sent on:', nextMonday.toLocaleString());
  }
}
