import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  ChevronRight,
  LayoutDashboard,
  Search,
  Shield,
  Users,
  Wallet,
} from "lucide-react";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Operations", icon: Users, active: false },
  { label: "Revenue", icon: Wallet, active: false },
  { label: "Compliance", icon: Shield, active: false },
];

const previewRows = [
  {
    member: "#1142 / Laura Jones",
    plan: "Plus Family",
    lifecycle: "Active",
    pending: "None",
    risk: "OK",
    nextBilling: "May 12, 2026",
  },
  {
    member: "#1141 / Evan Park",
    plan: "Base Individual",
    lifecycle: "Active",
    pending: "member_cancelled",
    risk: "OK",
    nextBilling: "May 3, 2026",
  },
  {
    member: "#1138 / Carla Perez",
    plan: "Elite Family",
    lifecycle: "Suspended",
    pending: "payment_delinquent",
    risk: "Failed",
    nextBilling: "Apr 18, 2026",
  },
];

export default function UiPreviewOrganized() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-200 bg-white p-4 lg:p-5">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-500 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Preview</p>
              <p className="font-semibold text-slate-900">Organized Shell</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    item.active
                      ? "bg-navy-500 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>Admin</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>Operations</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-slate-700">Enrollments</span>
                </div>
                <h1 className="text-xl font-semibold text-slate-900">Membership Operations</h1>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Bell className="mr-1 h-4 w-4" />
                  Alerts
                </Button>
                <Button size="sm">New Enrollment</Button>
              </div>
            </div>
          </header>

          <section className="space-y-5 p-4 lg:p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-600">Open Lifecycle Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-slate-900">18</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-600">Payment Risk Members</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-rose-700">6</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-600">Scheduled Cancellations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-amber-700">9</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Unified Filter Toolbar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <Input placeholder="Search member" />
                  <Select defaultValue="all">
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="all">
                    <SelectTrigger>
                      <SelectValue placeholder="Pending Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All pending actions</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="member_cancelled">Member Cancelled</SelectItem>
                      <SelectItem value="payment_delinquent">Payment Delinquent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="all">
                    <SelectTrigger>
                      <SelectValue placeholder="Payment Risk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All risk</SelectItem>
                      <SelectItem value="ok">OK</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="date" />
                  <Button variant="outline">
                    <Search className="mr-1 h-4 w-4" />
                    Apply
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enrollment Grid With Standardized Lifecycle Language</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="pb-2">Member</th>
                        <th className="pb-2">Plan</th>
                        <th className="pb-2">Subscription</th>
                        <th className="pb-2">Pending</th>
                        <th className="pb-2">Risk</th>
                        <th className="pb-2">Next Billing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => (
                        <tr key={row.member} className="border-b last:border-0">
                          <td className="py-3 font-medium text-slate-900">{row.member}</td>
                          <td className="py-3 text-slate-700">{row.plan}</td>
                          <td className="py-3">
                            <Badge className="bg-emerald-100 text-emerald-800">{row.lifecycle}</Badge>
                          </td>
                          <td className="py-3">
                            <Badge
                              className={
                                row.pending === "None"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-200 text-slate-800"
                              }
                            >
                              {row.pending}
                            </Badge>
                          </td>
                          <td className="py-3">
                            <Badge
                              className={
                                row.risk === "Failed"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }
                            >
                              {row.risk}
                            </Badge>
                          </td>
                          <td className="py-3 text-slate-700">{row.nextBilling}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
