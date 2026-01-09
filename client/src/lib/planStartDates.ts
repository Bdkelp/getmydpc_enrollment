import { formatPlanStartDateISO, getUpcomingPlanStartDates, isSameCalendarDay } from "@shared/planStartDates";

export type PlanStartDateOption = {
  value: string;
  label: string;
};

const PLAN_START_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
};

const formatPlanStartLabel = (date: Date, isImmediateStart: boolean) => {
  const formattedDate = date.toLocaleDateString("en-US", PLAN_START_LABEL_FORMAT);
  return isImmediateStart ? `Start Today (${formattedDate})` : formattedDate;
};

export const PLAN_START_SAME_DAY_ENABLED =
  import.meta.env?.VITE_ENABLE_SAME_DAY_PLAN_START === "true";

export const getPlanStartDateSelectOptions = (): PlanStartDateOption[] => {
  const today = new Date();
  return getUpcomingPlanStartDates({ includeSameDay: PLAN_START_SAME_DAY_ENABLED }).map((date) => ({
    value: formatPlanStartDateISO(date),
    label: formatPlanStartLabel(date, PLAN_START_SAME_DAY_ENABLED && isSameCalendarDay(date, today)),
  }));
};
