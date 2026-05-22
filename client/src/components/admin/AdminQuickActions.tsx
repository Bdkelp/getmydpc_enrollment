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
    <div className="border-b border-french-blue-100 bg-gradient-to-r from-white via-sky-aqua-50/40 to-french-blue-50/40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage users, plans, and system settings</p>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-french-blue-200 bg-french-blue-50/60 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-french-blue-700">Enrollment Operations</h2>
                <p className="text-xs text-french-blue-700/80">Core enrollment and queue management workflows.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Link href="/registration">
                  <Button className="h-20 w-full flex-col items-center justify-center border-0 bg-gradient-to-r from-deep-twilight-600 via-french-blue-500 to-bright-teal-blue-500 text-sky-aqua-50 shadow-colored transition-all duration-300 hover:scale-[1.01] hover:from-deep-twilight-500 hover:to-turquoise-surf-500">
                    <UserPlus className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">New Person Enrollment</span>
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="h-20 w-full flex-col items-center justify-center border-french-blue-400 text-french-blue-700 hover:bg-french-blue-50"
                  onClick={() => onNavigate(enrollmentRecordsRoute)}
                >
                  <Users className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Membership Operations</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 w-full flex-col items-center justify-center border-turquoise-surf-500 text-turquoise-surf-700 hover:bg-turquoise-surf-50"
                  onClick={() => onNavigate("/admin/leads")}
                >
                  <Users className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Leads</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 w-full flex-col items-center justify-center border-deep-twilight-500 text-deep-twilight-700 hover:bg-deep-twilight-50"
                  onClick={() => onNavigate("/admin/notifications")}
                >
                  <Bell className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Notifications</span>
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-sky-aqua-200 bg-sky-aqua-50/60 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-aqua-700">Revenue and Performance</h2>
                <p className="text-xs text-sky-aqua-700/80">Payments, commissions, analytics, and goals.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Link href="/admin/commissions">
                  <Button variant="outline" className="h-20 w-full flex-col items-center justify-center border-sky-aqua-500 text-sky-aqua-700 hover:bg-sky-aqua-50">
                    <DollarSign className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Commissions</span>
                  </Button>
                </Link>
                <Link href="/admin/payments/recent">
                  <Button variant="outline" className="h-20 w-full flex-col items-center justify-center border-french-blue-500 text-french-blue-700 hover:bg-french-blue-50">
                    <DollarSign className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Recent Payments</span>
                  </Button>
                </Link>
                <Link href="/admin/payments/failed">
                  <Button variant="outline" className="h-20 w-full flex-col items-center justify-center border-red-400 text-red-700 hover:bg-red-50">
                    <AlertTriangle className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Failed Payments</span>
                  </Button>
                </Link>
                <Link href="/admin/analytics">
                  <Button variant="outline" className="h-20 w-full flex-col items-center justify-center border-bright-teal-blue-500 text-bright-teal-blue-700 hover:bg-bright-teal-blue-50">
                    <BarChart className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Analytics</span>
                  </Button>
                </Link>
                <Link href="/admin/performance-goals">
                  <Button variant="outline" className="h-20 w-full flex-col items-center justify-center border-deep-twilight-500 text-deep-twilight-700 hover:bg-deep-twilight-50">
                    <Target className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Performance Goals</span>
                  </Button>
                </Link>
              </div>

              <div className="mt-4 rounded-xl border border-deep-twilight-200 bg-white p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-deep-twilight-700">Recurring Billing Controls</h3>
                    <p className="text-xs text-gray-600">Run a safe preview or confirmed live recurring billing + commission workflow.</p>
                  </div>
                  <div className="mt-1 flex w-full flex-col gap-3 sm:mt-0 sm:w-auto sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onPreviewRecurringBilling}
                      disabled={recurringPending}
                      className="w-full border-french-blue-300 text-french-blue-700 hover:bg-french-blue-50 sm:w-auto"
                    >
                      {recurringPending ? "Running preview..." : "Preview Recurring Billing"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={onOpenLiveRecurringConfirmation}
                      disabled={recurringPending || superAdminRestricted}
                      className="w-full border-0 bg-gradient-to-r from-deep-twilight-600 via-french-blue-600 to-bright-teal-blue-600 text-sky-aqua-50 hover:from-deep-twilight-500 hover:to-turquoise-surf-500 sm:w-auto"
                    >
                      {recurringPending ? "Running live workflow..." : "Run Recurring Billing + Commission Update"}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-deep-twilight-800">
                  Safety note: the system auto-selects currently due records; manual member/account selection is disabled in this workflow.
                </p>
                {lastRecurringMode && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-700">
                    Last run mode: <span className="font-semibold uppercase">{lastRecurringMode}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-french-blue-100 bg-french-blue-50/30 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-deep-twilight-700">Platform Admin</h2>
                <p className="text-xs text-french-blue-800">User management, hierarchy, and platform configuration.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="h-20 w-full flex-col items-center justify-center border-french-blue-500 text-french-blue-700 hover:bg-french-blue-50"
                  onClick={onCreateUser}
                >
                  <UserPlus className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Create User</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 w-full flex-col items-center justify-center border-deep-twilight-500 text-deep-twilight-700 hover:bg-deep-twilight-50"
                  onClick={() => onNavigate("/admin/users")}
                >
                  <Shield className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Users</span>
                </Button>
                <Link href="/admin/discount-codes">
                  <Button variant="outline" className="h-20 w-full flex-col items-center justify-center border-bright-teal-blue-500 text-bright-teal-blue-700 hover:bg-bright-teal-blue-50">
                    <FileText className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Discount Codes</span>
                  </Button>
                </Link>
                <Link href="/admin/agent-hierarchy">
                  <Button variant="outline" className="h-20 w-full flex-col items-center justify-center border-deep-twilight-400 text-deep-twilight-700 hover:bg-deep-twilight-50">
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
