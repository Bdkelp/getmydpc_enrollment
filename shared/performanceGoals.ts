export type GoalMetricSet = {
  enrollments: number;
  revenue: number;
  commissions: number;
  leads: number;
};

export type ProductGoal = {
  planId: number;
  planName?: string | null;
  weeklyEnrollments?: number;
  monthlyEnrollments?: number;
  quarterlyEnrollments?: number;
};

export type PerformanceGoals = {
  weekly: GoalMetricSet;
  monthly: GoalMetricSet;
  quarterly: GoalMetricSet;
  productGoals: ProductGoal[];
};

const createDefaultMetricSet = (): GoalMetricSet => ({
  enrollments: 0,
  revenue: 0,
  commissions: 0,
  leads: 0,
});

export const defaultPerformanceGoals: PerformanceGoals = {
  weekly: createDefaultMetricSet(),
  monthly: createDefaultMetricSet(),
  quarterly: createDefaultMetricSet(),
  productGoals: [],
};

export const PERFORMANCE_GOALS_SETTING_KEY = "performance_goals";

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mergeMetricSet = (base: GoalMetricSet, override?: Partial<GoalMetricSet>): GoalMetricSet => ({
  enrollments: toNumber(override?.enrollments ?? base.enrollments),
  revenue: toNumber(override?.revenue ?? base.revenue),
  commissions: toNumber(override?.commissions ?? base.commissions),
  leads: toNumber(override?.leads ?? base.leads),
});

export const normalizeGoalMetricSet = (input?: Partial<GoalMetricSet>): GoalMetricSet =>
  mergeMetricSet(createDefaultMetricSet(), input);

export const normalizePerformanceGoals = (input?: Partial<PerformanceGoals>): PerformanceGoals => ({
  weekly: normalizeGoalMetricSet(input?.weekly),
  monthly: normalizeGoalMetricSet(input?.monthly),
  quarterly: normalizeGoalMetricSet(input?.quarterly),
  productGoals: Array.isArray(input?.productGoals)
    ? input.productGoals
        .filter((goal): goal is ProductGoal => !!goal && typeof goal.planId === "number")
        .map((goal) => ({
          planId: goal.planId,
          planName: goal.planName || null,
          weeklyEnrollments: goal.weeklyEnrollments ? toNumber(goal.weeklyEnrollments) : undefined,
          monthlyEnrollments: goal.monthlyEnrollments ? toNumber(goal.monthlyEnrollments) : undefined,
          quarterlyEnrollments: goal.quarterlyEnrollments ? toNumber(goal.quarterlyEnrollments) : undefined,
        }))
    : [],
});

export const mergePerformanceGoals = (
  base: PerformanceGoals,
  override?: Partial<PerformanceGoals> | null,
): PerformanceGoals => ({
  weekly: mergeMetricSet(base.weekly, override?.weekly),
  monthly: mergeMetricSet(base.monthly, override?.monthly),
  quarterly: mergeMetricSet(base.quarterly, override?.quarterly),
  productGoals: override?.productGoals?.length ? override.productGoals : base.productGoals,
});
