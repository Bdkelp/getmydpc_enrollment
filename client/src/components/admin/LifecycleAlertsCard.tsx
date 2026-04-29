import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import {
  LIFECYCLE_ALERT_LEGEND,
  getLifecycleAlertBadgeClasses,
  getLifecycleAlertLabel,
} from "@/lib/lifecycleAlertUi";

interface BillingItem {
  kind: string;
  memberId: string;
  memberLabel: string;
  referenceDate?: string;
}

interface CommissionItem {
  kind: string;
  memberId: string;
  memberLabel: string;
  commissionId: string;
  amount: number;
  referenceDate?: string;
}

interface LifecycleAlertsData {
  horizonDays: number;
  billing: {
    dueSoon: number;
    overdue: number;
    failed: number;
  };
  commissions: {
    dueSoon: number;
    overdue: number;
    unscheduled: number;
  };
  totals: {
    totalAttention: number;
  };
  billingItems: BillingItem[];
  commissionItems: CommissionItem[];
}

interface LifecycleAlertsCardProps {
  lifecycleAlerts: LifecycleAlertsData | null;
}

export const LifecycleAlertsCard: React.FC<LifecycleAlertsCardProps> = ({ lifecycleAlerts }) => {
  const [, setLocation] = useLocation();

  if (!lifecycleAlerts) return null;

  return (
    <Card className="mb-8 border-orange-200 bg-orange-50/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recurring Lifecycle Alerts (Next {lifecycleAlerts.horizonDays} Days)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIFECYCLE_ALERT_LEGEND.map((kind) => (
                <span
                  key={kind}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getLifecycleAlertBadgeClasses(kind)}`}
                >
                  {getLifecycleAlertLabel(kind)}
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Billing Due Soon</p>
                <p className="text-lg font-semibold text-gray-900">{lifecycleAlerts.billing.dueSoon}</p>
              </div>
              <div>
                <p className="text-gray-600">Billing Overdue + Failed</p>
                <p className="text-lg font-semibold text-red-700">
                  {lifecycleAlerts.billing.overdue + lifecycleAlerts.billing.failed}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Commissions Due Soon</p>
                <p className="text-lg font-semibold text-gray-900">{lifecycleAlerts.commissions.dueSoon}</p>
              </div>
              <div>
                <p className="text-gray-600">Commissions Overdue + Unscheduled</p>
                <p className="text-lg font-semibold text-red-700">
                  {lifecycleAlerts.commissions.overdue + lifecycleAlerts.commissions.unscheduled}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={lifecycleAlerts.totals.totalAttention > 0 ? "destructive" : "secondary"}>
              {lifecycleAlerts.totals.totalAttention} Active Alerts
            </Badge>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin/enrollments")}>
                Review Billing
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin/commissions")}>
                Review Commissions
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-orange-100 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Billing Alerts</p>
            {(lifecycleAlerts.billingItems || []).slice(0, 4).length > 0 ? (
              <div className="space-y-2">
                {(lifecycleAlerts.billingItems || []).slice(0, 4).map((item, idx) => (
                  <button
                    key={`${item.kind}-${item.memberId}-${idx}`}
                    type="button"
                    onClick={() =>
                      setLocation(`/admin/enrollments?memberId=${item.memberId}&alertType=${item.kind}`)
                    }
                    className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-orange-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.memberLabel}</p>
                      <p className="text-xs">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getLifecycleAlertBadgeClasses(item.kind)}`}>
                          {getLifecycleAlertLabel(item.kind)}
                        </span>
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {item.referenceDate ? format(new Date(item.referenceDate), "MMM d") : "N/A"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No billing alerts in the selected horizon.</p>
            )}
          </div>
          <div className="rounded-lg border border-orange-100 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Top Commission Alerts</p>
            {(lifecycleAlerts.commissionItems || []).slice(0, 4).length > 0 ? (
              <div className="space-y-2">
                {(lifecycleAlerts.commissionItems || []).slice(0, 4).map((item, idx) => (
                  <button
                    key={`${item.kind}-${item.commissionId}-${idx}`}
                    type="button"
                    onClick={() =>
                      setLocation(
                        `/admin/commissions?memberId=${item.memberId}&commissionId=${item.commissionId}&alertType=${item.kind}`
                      )
                    }
                    className="w-full text-sm flex items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-orange-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.memberLabel}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getLifecycleAlertBadgeClasses(item.kind)}`}>
                          {getLifecycleAlertLabel(item.kind)}
                        </span>
                        <span>${item.amount.toFixed(2)}</span>
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {item.referenceDate ? format(new Date(item.referenceDate), "MMM d") : "N/A"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No commission alerts in the selected horizon.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
