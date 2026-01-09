export const PLAN_START_ANCHOR_DAYS = [1, 15] as const;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const isSameCalendarDay = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

export type PlanStartDateConfig = {
  today?: Date;
  anchorCount?: number;
  includeSameDay?: boolean;
};

export const getUpcomingPlanStartDates = (config: PlanStartDateConfig = {}): Date[] => {
  const { today = new Date(), anchorCount = 2, includeSameDay = false } = config;
  const normalizedToday = startOfDay(today);
  const dates: Date[] = [];

  if (includeSameDay) {
    dates.push(normalizedToday);
  }

  let anchorsAdded = 0;
  let monthOffset = 0;

  while (anchorsAdded < anchorCount) {
    const candidateMonth = new Date(
      normalizedToday.getFullYear(),
      normalizedToday.getMonth() + monthOffset,
      1
    );

    for (const day of PLAN_START_ANCHOR_DAYS) {
      const candidate = new Date(candidateMonth.getFullYear(), candidateMonth.getMonth(), day);
      if (candidate < normalizedToday) {
        continue;
      }

      if (includeSameDay && isSameCalendarDay(candidate, normalizedToday)) {
        continue;
      }

      dates.push(candidate);
      anchorsAdded += 1;

      if (anchorsAdded >= anchorCount) {
        break;
      }
    }

    monthOffset += 1;

    if (monthOffset > 24) {
      break;
    }
  }

  return dates;
};

export const formatPlanStartDateISO = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseISODateString = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  const parsed = new Date(year, month, day);

  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
};

export type PlanStartValidationOptions = {
  includeSameDay?: boolean;
  today?: Date;
};

export const isPlanStartDateAllowed = (
  isoDate: string,
  options: PlanStartValidationOptions = {}
): boolean => {
  const parsed = parseISODateString(isoDate);
  if (!parsed) {
    return false;
  }

  const upcoming = getUpcomingPlanStartDates({
    today: options.today,
    includeSameDay: options.includeSameDay,
  });

  return upcoming.some((date) => isSameCalendarDay(date, parsed));
};
