import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  FileText,
  Settings,
  LogOut,
  Search,
  Bell,
  Menu,
  X,
  DollarSign,
  Calendar,
  Shield,
  ChevronDown,
} from "lucide-react";

/**
 * DASHBOARD MOCKUP - Preview of NexaVerse Design
 * Based on: https://coolors.co/0a2463-fb3640-605f5e-247ba0-e2e2e2-c6ccb2
 * 
 * This is a preview/mockup page. Navigate to /dashboard-mockup to view.
 */

interface MenuItem {
  icon: any;
  label: string;
  href: string;
  active?: boolean;
}

export default function DashboardMockup() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const menuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: "Overview", href: "#", active: true },
    { icon: TrendingUp, label: "Transactions", href: "#" },
    { icon: Users, label: "Customers", href: "#" },
    { icon: FileText, label: "Reports", href: "#" },
    { icon: Settings, label: "Settings", href: "#" },
  ];

  // Mock data
  const stats = {
    currentMRR: 12400,
    totalCustomers: 16601,
    activeCustomers: 33,
    churnRate: 2,
    trendData: [
      { month: "Jan", mtd: 70, monthly: 90, churn: 30 },
      { month: "Feb", mtd: 85, monthly: 110, churn: 25 },
      { month: "Mar", mtd: 95, monthly: 100, churn: 35 },
      { month: "Apr", mtd: 105, monthly: 85, churn: 28 },
      { month: "May", mtd: 110, monthly: 120, churn: 32 },
      { month: "Jun", mtd: 115, monthly: 95, churn: 26 },
      { month: "Jul", mtd: 105, monthly: 110, churn: 30 },
    ],
    salesBreakdown: [
      { label: "MOST PLAN", value: 63, color: "#0a2463" },
      { label: "MOST/MET", value: 35, color: "#fb3640" },
      { label: "UNLIMITED PLAN", value: 2, color: "#247ba0" },
      { label: "UNLIMITED/MET", value: 0, color: "#e2e2e2" },
    ],
    transactions: [
      { id: 1, email: "eddickson1234@example.com", issue: "Login Issue", priority: "HIGH", status: "NEW" },
      { id: 2, email: "emerjones456@anotherexample.com", issue: "Billing Inquiry", priority: "MEDIUM", status: "OPEN" },
      { id: 3, email: "emily.jones123@thirdexample.net", issue: "Product Malfunction", priority: "LOW", status: "URGENT" },
      { id: 4, email: "anthony.franco23@example.org", issue: "Feature Request", priority: "MEDIUM", status: "LOW" },
    ],
  };

  const maxTrendValue = Math.max(
    ...stats.trendData.flatMap((d) => [d.mtd, d.monthly, d.churn])
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } bg-navy-500 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Logo/Brand */}
        <div className="p-6 border-b border-navy-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0">
              <Shield className="h-6 w-6 text-navy-500" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-lg">NexaVerse</h1>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 space-y-1 px-3 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  item.active
                    ? "bg-blue-500 text-white"
                    : "text-navy-100 hover:bg-navy-600 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span className="flex-1 text-left">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-navy-400">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-navy-100 hover:bg-navy-600 hover:text-white transition-colors">
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarOpen && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Page Title and Toggle */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-gray-600 hover:text-gray-900"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
              <h2 className="text-2xl font-semibold text-navy-500">Dashboard</h2>
            </div>

            {/* Right: Search, Notifications, Profile */}
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search transactions, customers, subscribers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-96 bg-gray-50 border-gray-200 focus:bg-white"
                />
              </div>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-coral-500 rounded-full text-xs text-white flex items-center justify-center font-semibold">
                  3
                </span>
              </Button>

              {/* User Menu */}
              <Button variant="ghost" className="flex items-center gap-2 hover:bg-gray-100">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-navy-500 text-white text-sm font-semibold">
                    JD
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900">John Doe</p>
                  <p className="text-xs text-gray-500">Administrator</p>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Mockup Notice */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-900">Dashboard Mockup Preview</h3>
                <p className="text-sm text-blue-700">
                  This is a preview of the NexaVerse design. Return to{" "}
                  <Link href="/agent" className="underline font-medium">
                    Agent Dashboard
                  </Link>{" "}
                  or{" "}
                  <Link href="/admin" className="underline font-medium">
                    Admin Dashboard
                  </Link>{" "}
                  for the working version.
                </p>
              </div>
            </div>
          </div>

          {/* Color-Coded Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Current MRR - Coral/Red Background */}
            <Card className="bg-coral-500 border-coral-500 text-white shadow-coral overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-white/90">Current MRR</p>
                    <h3 className="text-3xl font-bold mt-2">
                      ${(stats.currentMRR / 1000).toFixed(1)}k
                    </h3>
                  </div>
                  <DollarSign className="h-8 w-8 text-white/80" />
                </div>
                <p className="text-xs text-white/70 mt-2">+5.2% vs last period</p>
              </CardContent>
            </Card>

            {/* Current Customers - Gray Background */}
            <Card className="bg-gray-600 border-gray-600 text-white shadow-medium overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-white/90">Current Customers</p>
                    <h3 className="text-3xl font-bold mt-2">
                      {stats.totalCustomers.toLocaleString()}
                    </h3>
                  </div>
                  <Users className="h-8 w-8 text-white/80" />
                </div>
                <p className="text-xs text-white/70 mt-2">Total active members</p>
              </CardContent>
            </Card>

            {/* Active Customers - Blue Background */}
            <Card className="bg-blue-500 border-blue-500 text-white shadow-glow overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-white/90">Active Customers</p>
                    <h3 className="text-3xl font-bold mt-2">{stats.activeCustomers}%</h3>
                  </div>
                  <TrendingUp className="h-8 w-8 text-white/80" />
                </div>
                <p className="text-xs text-white/70 mt-2">+2.3% new this month</p>
              </CardContent>
            </Card>

            {/* Churn Rate - Light Gray Background */}
            <Card className="bg-gray-200 border-gray-300 text-gray-900 shadow-medium overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Churn Rate</p>
                    <h3 className="text-3xl font-bold mt-2">{stats.churnRate}%</h3>
                  </div>
                  <Calendar className="h-8 w-8 text-gray-600" />
                </div>
                <p className="text-xs text-gray-600 mt-2">Within target range</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Trend Chart */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-navy-500">Trend</CardTitle>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-navy-500 rounded"></div>
                      <span className="text-gray-600">MTD</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span className="text-gray-600">MONTHLY</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-coral-500 rounded"></div>
                      <span className="text-gray-600">CHURN</span>
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Vertical axis labels */}
                <div className="flex mb-2">
                  <div className="w-12 text-xs text-gray-500 space-y-4">
                    <div>$12k</div>
                    <div>$10k</div>
                    <div>$8k</div>
                    <div>$6k</div>
                    <div>$4k</div>
                    <div>$2k</div>
                    <div>$0</div>
                  </div>
                  {/* Bar chart */}
                  <div className="flex-1 h-56 flex items-end justify-between gap-2">
                    {stats.trendData.map((data, i) => {
                      const mtdHeight = (data.mtd / maxTrendValue) * 100;
                      const monthlyHeight = (data.monthly / maxTrendValue) * 100;
                      const churnHeight = (data.churn / maxTrendValue) * 100;

                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2">
                          <div className="w-full flex justify-center items-end gap-0.5 h-48">
                            <div
                              className="w-2 bg-navy-500 rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                              style={{ height: `${mtdHeight}%` }}
                              title={`MTD: ${data.mtd}`}
                            ></div>
                            <div
                              className="w-2 bg-blue-500 rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                              style={{ height: `${monthlyHeight}%` }}
                              title={`Monthly: ${data.monthly}`}
                            ></div>
                            <div
                              className="w-2 bg-coral-500 rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                              style={{ height: `${churnHeight}%` }}
                              title={`Churn: ${data.churn}`}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500">{data.month}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sales Donut Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-navy-500">Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  {/* Donut Chart */}
                  <div className="relative w-44 h-44">
                    <svg viewBox="0 0 100 100" className="transform -rotate-90">
                      {/* Background circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#e2e2e2"
                        strokeWidth="18"
                      />
                      {/* Navy segment - 63% */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#0a2463"
                        strokeWidth="18"
                        strokeDasharray="158 251"
                        strokeDashoffset="0"
                      />
                      {/* Coral segment - 35% */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#fb3640"
                        strokeWidth="18"
                        strokeDasharray="88 251"
                        strokeDashoffset="-158"
                      />
                      {/* Blue segment - 2% */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#247ba0"
                        strokeWidth="18"
                        strokeDasharray="5 251"
                        strokeDashoffset="-246"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold text-navy-500">342</span>
                      <span className="text-xs text-gray-500 font-semibold">TOTAL</span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="space-y-3">
                    {stats.salesBreakdown.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 min-w-[180px]">
                        <div
                          className="w-3 h-3 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        ></div>
                        <span className="text-sm text-gray-700 flex-1">{item.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Section - Transactions and Demographics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Support Tickets / Transactions */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-navy-500">
                    Support Tickets
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                      ALL
                    </Badge>
                    <Badge variant="outline" className="text-xs">OPEN</Badge>
                    <Badge variant="outline" className="text-xs">PENDING</Badge>
                    <Badge variant="outline" className="text-xs">CLOSED</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.transactions.map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{txn.email}</p>
                          <p className="text-xs text-gray-500">{txn.issue}</p>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-xs ml-2 ${
                          txn.status === "HIGH"
                            ? "bg-coral-100 text-coral-700"
                            : txn.status === "URGENT"
                            ? "bg-red-100 text-red-700"
                            : txn.status === "OPEN"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {txn.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                <Button variant="link" className="w-full mt-4 text-blue-500">
                  View all transactions →
                </Button>
              </CardContent>
            </Card>

            {/* Customer Demographics Map */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-navy-500">
                    Customer Demographic
                  </CardTitle>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="secondary" className="bg-navy-100 text-navy-700">
                      ACTIVE
                    </Badge>
                    <Badge variant="outline">INACTIVE</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Simplified world map representation */}
                <div className="h-48 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg flex items-center justify-center relative overflow-hidden">
                  {/* Map dots representing customer locations */}
                  <div className="absolute inset-0">
                    {[...Array(20)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                        style={{
                          top: `${Math.random() * 90 + 5}%`,
                          left: `${Math.random() * 90 + 5}%`,
                          animationDelay: `${Math.random() * 2}s`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-center z-10">
                    <p className="text-3xl font-bold text-navy-500">16,601</p>
                    <p className="text-sm text-gray-600">Global Customers</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-navy-500">78%</p>
                    <p className="text-xs text-gray-600">North America</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-500">22%</p>
                    <p className="text-xs text-gray-600">Other Regions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
