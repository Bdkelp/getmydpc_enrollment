export type LifecycleAlertKind =
  | 'due_soon'
  | 'overdue'
  | 'failed'
  | 'stale_pending'
  | 'unscheduled';

export const LIFECYCLE_ALERT_LEGEND: LifecycleAlertKind[] = [
  'due_soon',
  'overdue',
  'failed',
  'stale_pending',
  'unscheduled',
];

const KIND_LABELS: Record<LifecycleAlertKind, string> = {
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  failed: 'Failed',
  stale_pending: 'Stale Pending',
  unscheduled: 'Unscheduled',
};

const KIND_BADGE_CLASSES: Record<LifecycleAlertKind, string> = {
  due_soon: 'bg-amber-100 text-amber-800 border border-amber-200',
  overdue: 'bg-red-100 text-red-800 border border-red-200',
  failed: 'bg-rose-100 text-rose-800 border border-rose-200',
  stale_pending: 'bg-slate-200 text-slate-800 border border-slate-300',
  unscheduled: 'bg-violet-100 text-violet-800 border border-violet-200',
};

export function getLifecycleAlertLabel(kind?: string | null): string {
  if (!kind) return 'Unknown';
  if (kind in KIND_LABELS) {
    return KIND_LABELS[kind as LifecycleAlertKind];
  }
  return kind
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function getLifecycleAlertBadgeClasses(kind?: string | null): string {
  if (!kind) return 'bg-gray-100 text-gray-700 border border-gray-200';
  if (kind in KIND_BADGE_CLASSES) {
    return KIND_BADGE_CLASSES[kind as LifecycleAlertKind];
  }
  return 'bg-gray-100 text-gray-700 border border-gray-200';
}
