export const LOCAL_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function isLocalDateOnlyString(value: string): boolean {
  return LOCAL_DATE_ONLY_REGEX.test(String(value || '').trim());
}

export function parseLocalDate(value: Date | string): Date {
  if (value instanceof Date) {
    const next = new Date(value);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  const raw = String(value || '').trim();
  if (isLocalDateOnlyString(raw)) {
    const [year, month, day] = raw.split('-').map((part) => Number(part));
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  const next = new Date(raw);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function formatLocalDate(value: Date | string): string {
  const date = parseLocalDate(value);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

export function addDaysLocal(value: Date | string, days: number): Date {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return date;
}
