import { Button } from "@/components/ui/button";
import { AlertTriangle, BarChart, Bell, DollarSign, FileText, Shield, Target, UserPlus, Users } from "lucide-react";
import { Link } from "wouter";

interface AdminQuickActionsProps {
  enrollmentRecordsRoute: string;
  onNavigate: (path: string) => void;
  onCreateUser: () => void;
  onPreviewRecurringBilling: () => void;
  onOpenLiveRecurringConfirmation: () => void;
  recurringPending: boolean;
  superAdminRestricted: boolean;
  lastRecurringMode?: string;
}

export const AdminQuickActions: React.FC<AdminQuickActionsProps> = ({
  enrollmentRecordsRoute,
  onNavigate,
  onCreateUser,
  onPreviewRecurringBilling,
  onOpenLiveRecurringConfirmation,
  recurringPending,
  superAdminRestricted,
  lastRecurringMode,
}) => {
  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage users, plans, and system settings</p>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-700">Enrollment Operations</h2>
                <p className="text-xs text-blue-700/80">Core enrollment and queue management workflows.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Link href="/registration">
                  <Button className="w-full bg-white hover:bg-gray-100 text-black border border-gray-300 h-20 flex flex-col items-center justify-center">
                    <UserPlus className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">New Person Enrollment</span>
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 h-20 flex flex-col items-center justify-center"
                  onClick={() => onNavigate(enrollmentRecordsRoute)}
                >
                  <Users className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Membership Operations</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-orange-500 text-orange-600 hover:bg-orange-50 h-20 flex flex-col items-center justify-center"
                  onClick={() => onNavigate("/admin/leads")}
                >
                  <Users className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Leads</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-red-500 text-red-600 hover:bg-red-50 h-20 flex flex-col items-center justify-center"
                  onClick={() => onNavigate("/admin/notifications")}
                >
                  <Bell className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Notifications</span>
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Revenue and Performance</h2>
                <p className="text-xs text-emerald-700/80">Payments, commissions, analytics, and goals.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Link href="/admin/commissions">
                  <Button variant="outline" className="w-full border-emerald-500 text-emerald-600 hover:bg-emerald-50 h-20 flex flex-col items-center justify-center">
                    <DollarSign className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Commissions</span>
                  </Button>
                </Link>
                <Link href="/admin/payments/recent">
                  <Button variant="outline" className="w-full border-green-500 text-green-600 hover:bg-green-50 h-20 flex flex-col items-center justify-center">
                    <DollarSign className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Recent Payments</span>
                  </Button>
                </Link>
                <Link href="/admin/payments/failed">
                  <Button variant="outline" className="w-full border-red-500 text-red-600 hover:bg-red-50 h-20 flex flex-col items-center justify-center">
                    <AlertTriangle className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Failed Payments</span>
                  </Button>
                </Link>
                <Link href="/admin/analytics">
                  <Button variant="outline" className="w-full border-green-500 text-green-600 hover:bg-green-50 h-20 flex flex-col items-center justify-center">
                    <BarChart className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Analytics</span>
                  </Button>
                </Link>
                <Link href="/admin/performance-goals">
                  <Button variant="outline" className="w-full border-fuchsia-500 text-fuchsia-600 hover:bg-fuchsia-50 h-20 flex flex-col items-center justify-center">
                    <Target className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Performance Goals</span>
                  </Button>
                </Link>
              </div>

              <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Recurring Billing Controls</h3>
                    <p className="text-xs text-gray-600">Run a safe preview or confirmed live recurring billing + commission workflow.</p>
                  </div>
                  <div className="mt-1 flex w-full flex-col gap-3 sm:mt-0 sm:w-auto sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onPreviewRecurringBilling}
                      disabled={recurringPending}
                      className="w-full sm:w-auto"
                    >
                      {recurringPending ? "Running preview..." : "Preview Recurring Billing"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={onOpenLiveRecurringConfirmation}
                      disabled={recurringPending || superAdminRestricted}
                      className="w-full bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"
                    >
                      {recurringPending ? "Running live workflow..." : "Run Recurring Billing + Commission Update"}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-indigo-900">
                  Safety note: the system auto-selects currently due records; manual member/account selection is disabled in this workflow.
                </p>
                {lastRecurringMode && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-700">
                    Last run mode: <span className="font-semibold uppercase">{lastRecurringMode}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Platform Admin</h2>
                <p className="text-xs text-slate-600">User management, hierarchy, and platform configuration.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 h-20 flex flex-col items-center justify-center"
                  onClick={onCreateUser}
                >
                  <UserPlus className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Create User</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-red-500 text-red-600 hover:bg-red-50 h-20 flex flex-col items-center justify-center"
                  onClick={() => onNavigate("/admin/users")}
                >
                  <Shield className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Users</span>
                </Button>
                <Link href="/admin/discount-codes">
                  <Button variant="outline" className="w-full border-purple-500 text-purple-600 hover:bg-purple-50 h-20 flex flex-col items-center justify-center">
                    <FileText className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Discount Codes</span>
                  </Button>
                </Link>
                <Link href="/admin/agent-hierarchy">
                  <Button variant="outline" className="w-full border-indigo-500 text-indigo-600 hover:bg-indigo-50 h-20 flex flex-col items-center justify-center">
                    <Users className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Agent Hierarchy</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
