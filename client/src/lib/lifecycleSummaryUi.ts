export type LifecycleSummary = {
  subscriptionStatus?: string | null;
  pendingAction?: string | null;
  paymentRiskStatus?: string | null;
};

const SUBSCRIPTION_BADGE_CLASSES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  pending_payment: 'bg-amber-100 text-amber-800 border border-amber-200',
  pending_activation: 'bg-amber-100 text-amber-800 border border-amber-200',
  suspended: 'bg-orange-100 text-orange-800 border border-orange-200',
  cancelled: 'bg-slate-200 text-slate-800 border border-slate-300',
  canceled: 'bg-slate-200 text-slate-800 border border-slate-300',
  inactive: 'bg-slate-200 text-slate-800 border border-slate-300',
};

const PENDING_BADGE_CLASSES: Record<string, string> = {
  none: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  member_cancelled: 'bg-slate-200 text-slate-800 border border-slate-300',
  payment_delinquent: 'bg-rose-100 text-rose-800 border border-rose-200',
  plan_change: 'bg-blue-100 text-blue-800 border border-blue-200',
};

const PAYMENT_RISK_BADGE_CLASSES: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  failed: 'bg-rose-100 text-rose-800 border border-rose-200',
  unknown: 'bg-gray-100 text-gray-700 border border-gray-200',
};

function normalize(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function humanize(value?: string | null, emptyLabel = 'Unknown'): string {
  const normalized = normalize(value);
  if (!normalized) {
    return emptyLabel;
  }
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getLifecycleSubscriptionBadgeClasses(status?: string | null): string {
  return SUBSCRIPTION_BADGE_CLASSES[normalize(status)] || 'bg-gray-100 text-gray-700 border border-gray-200';
}

export function getLifecyclePendingBadgeClasses(pendingAction?: string | null): string {
  const normalized = normalize(pendingAction) || 'none';
  return PENDING_BADGE_CLASSES[normalized] || 'bg-gray-100 text-gray-700 border border-gray-200';
}

export function getLifecyclePaymentRiskBadgeClasses(risk?: string | null): string {
  return PAYMENT_RISK_BADGE_CLASSES[normalize(risk) || 'unknown'] || 'bg-gray-100 text-gray-700 border border-gray-200';
}

export function getLifecycleSubscriptionLabel(status?: string | null): string {
  return humanize(status);
}

export function getLifecyclePendingLabel(pendingAction?: string | null): string {
  const normalized = normalize(pendingAction);
  if (!normalized) {
    return 'None';
  }
  return humanize(normalized, 'None');
}

export function getLifecyclePaymentRiskLabel(risk?: string | null): string {
  return humanize(risk, 'Unknown');
}
