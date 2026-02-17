import { useState, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDefaultAvatar, getUserInitials } from "@/lib/avatarUtils";
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
  BarChart,
  DollarSign,
  UserPlus,
  Target,
  Database,
  Shield,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasAtLeastRole } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  role?: "agent" | "admin" | "super_admin";
}

interface MenuItem {
  icon: any;
  label: string;
  href: string;
  badge?: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

export default function DashboardLayout({ children, title = "Dashboard", role }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const isAdmin = hasAtLeastRole(user?.role, "admin");
  const isSuperAdmin = hasAtLeastRole(user?.role, "super_admin");

  const menuItems: MenuItem[] = [
    {
      icon: LayoutDashboard,
      label: "Overview",
      href: role === "agent" ? "/agent" : "/admin",
    },
    {
      icon: Users,
      label: "Customers",
      href: role === "agent" ? "/agent/enrollments" : "/admin/enrollments",
    },
    {
      icon: TrendingUp,
      label: "Transactions",
      href: role === "agent" ? "/agent/commissions" : "/admin/transactions",
    },
    {
      icon: FileText,
      label: "Reports",
      href: role === "agent" ? "/agent/reports" : "/admin/reports",
    },
    {
      icon: Target,
      label: "Performance",
      href: role === "agent" ? "/agent/performance" : "/admin/performance-goals",
      adminOnly: role === "admin",
    },
    {
      icon: Settings,
      label: "Settings",
      href: "/settings",
    },
    {
      icon: Database,
      label: "Developer",
      href: "/admin/data-viewer",
      superAdminOnly: true,
    },
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  const handleLogout = async () => {
    await logout();
  };

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
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
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
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(item.href + "/");

            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-500 text-white"
                      : "text-navy-100 hover:bg-navy-600 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="bg-coral-500 text-white">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </button>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-navy-400">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-navy-100 hover:bg-navy-600 hover:text-white transition-colors"
          >
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
              <h2 className="text-2xl font-semibold text-navy-500">{title}</h2>
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
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-coral-500 rounded-full text-xs text-white flex items-center justify-center">
                  3
                </span>
              </Button>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-gray-100">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={getDefaultAvatar(user?.email || "")} />
                      <AvatarFallback className="bg-navy-500 text-white">
                        {getUserInitials(user?.firstName, user?.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block text-left">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.firstName || user?.name || "User"}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{user?.role || "agent"}</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="h-4 w-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
