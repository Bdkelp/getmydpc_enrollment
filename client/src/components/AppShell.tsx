import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getDefaultAvatar, getUserInitials } from "@/lib/avatarUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart2,
  Bell,
  ChevronRight,
  DollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Target,
  User,
  Users,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
}

interface AppShellProps {
  children: ReactNode;
  title: string;
  breadcrumb?: string[];
  actions?: ReactNode;
}

function getNavItems(role: string | undefined): NavItem[] {
  const isAdmin = hasAtLeastRole(role, "admin");

  if (isAdmin) {
    return [
      { label: "Overview", icon: LayoutDashboard, href: "/admin" },
      { label: "Enrollments", icon: Users, href: "/admin/enrollments" },
      { label: "Leads", icon: FileText, href: "/admin/leads" },
      { label: "Commissions", icon: DollarSign, href: "/admin/commissions" },
      { label: "Analytics", icon: BarChart2, href: "/admin/analytics" },
      { label: "Performance", icon: Target, href: "/admin/performance-goals" },
      { label: "Users", icon: Shield, href: "/admin/users" },
      { label: "Settings", icon: Settings, href: "/profile" },
    ];
  }

  return [
    { label: "Overview", icon: LayoutDashboard, href: "/agent" },
    { label: "Leads", icon: FileText, href: "/agent/leads" },
    { label: "Commissions", icon: DollarSign, href: "/agent/commissions" },
    { label: "Groups", icon: Users, href: "/agent/groups" },
    { label: "Failed Payments", icon: BarChart2, href: "/agent/failed-payments" },
    { label: "Settings", icon: Settings, href: "/profile" },
  ];
}

export default function AppShell({ children, title, breadcrumb, actions }: AppShellProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = getNavItems(user?.role);
  const userFullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const sidebarAvatarSrc =
    user?.profileImageUrl ||
    getDefaultAvatar(user?.id || user?.email || "user", userFullName || user?.email);
  const sidebarAvatarInitials = getUserInitials(userFullName || user?.email || "User");

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-aqua-50 via-white to-french-blue-50">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-french-blue-100 bg-white flex flex-col transition-transform duration-300 md:hidden ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-french-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-deep-twilight-700 text-sky-aqua-50">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">MPP</p>
              <p className="font-semibold text-slate-900 leading-tight">GetMyDPC</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileNavOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location === item.href ||
              (item.href !== "/admin" && item.href !== "/agent" && location.startsWith(item.href));
            return (
              <Link key={`mobile-${item.href}`} href={item.href}>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-french-blue-50 text-french-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-french-blue-700" : ""}`} />
                  <span>{item.label}</span>
                </button>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100 transition-colors">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={sidebarAvatarSrc} />
              <AvatarFallback className="bg-deep-twilight-700 text-sky-aqua-50 text-xs">
                {sidebarAvatarInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.firstName || user?.name || "User"}
              </p>
              <p className="text-xs text-slate-500 capitalize">{user?.role || "agent"}</p>
            </div>
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/profile">Profile</Link>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => logout()}>
              Log out
            </Button>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "grid min-h-screen transition-all duration-300 grid-cols-1",
          sidebarOpen ? "md:grid-cols-[260px_1fr]" : "md:grid-cols-[64px_1fr]",
        )}
      >
        {/* Sidebar */}
        <aside className="hidden border-r border-french-blue-100 bg-white md:flex md:flex-col">
          {/* Brand */}
          <div className="p-4 border-b border-french-blue-100 flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-deep-twilight-700 text-sky-aqua-50">
              <Shield className="h-5 w-5" />
            </div>
            {sidebarOpen && (
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">MPP</p>
                <p className="font-semibold text-slate-900 leading-tight">GetMyDPC</p>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location === item.href ||
                (item.href !== "/admin" && item.href !== "/agent" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-french-blue-50 text-french-blue-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-french-blue-700" : ""}`} />
                    {sidebarOpen && <span>{item.label}</span>}
                  </button>
                </Link>
              );
            })}
          </nav>

          {/* User + Logout */}
          <div className="p-3 border-t border-french-blue-100">
            {sidebarOpen ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100 transition-colors">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={sidebarAvatarSrc} />
                      <AvatarFallback className="bg-deep-twilight-700 text-sky-aqua-50 text-xs">
                        {sidebarAvatarInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {user?.firstName || user?.name || "User"}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{user?.role || "agent"}</p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="h-4 w-4 mr-2" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()} className="text-red-600">
                    <LogOut className="h-4 w-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                onClick={() => logout()}
                className="flex w-full items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </aside>

        {/* Main area */}
        <div className="flex flex-col min-h-screen overflow-hidden">
          {/* Top bar */}
          <header className="border-b border-french-blue-100 bg-white/95 px-5 py-3 flex items-center justify-between gap-4 flex-shrink-0 backdrop-blur-sm">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 text-slate-500 md:hidden"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 flex-shrink-0 text-slate-500 md:inline-flex"
                onClick={() => setSidebarOpen((v) => !v)}
              >
                {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
              <div className="min-w-0">
                {breadcrumb && breadcrumb.length > 0 && (
                  <div className="mb-0.5 flex items-center gap-1 text-xs text-french-blue-500">
                    {breadcrumb.map((crumb, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="h-3 w-3" />}
                        <span>{crumb}</span>
                      </span>
                    ))}
                  </div>
                )}
                <h1 className="truncate text-lg font-semibold text-deep-twilight-900">{title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {actions}
              <Button variant="ghost" size="icon" className="relative h-8 w-8 text-french-blue-600 hover:text-french-blue-700">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
