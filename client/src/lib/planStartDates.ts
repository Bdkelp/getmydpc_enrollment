import { formatPlanStartDateISO, getAvailablePlanStartDates } from "@shared/planStartDates";

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

export const getPlanStartDateSelectOptions = (): PlanStartDateOption[] => {
  const today = new Date();
  return getAvailablePlanStartDates(today, 2).map((date) => ({
    value: formatPlanStartDateISO(date),
    label: formatPlanStartLabel(date, false),
  }));
};
