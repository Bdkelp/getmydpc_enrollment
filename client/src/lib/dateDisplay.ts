export function formatCalendarDate(value: string | Date | null | undefined): string {
  if (!value) return 'Not scheduled';

  if (typeof value === 'string') {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(value);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return `${Number(month)}/${Number(day)}/${year}`;
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not scheduled' : parsed.toLocaleDateString();
}
