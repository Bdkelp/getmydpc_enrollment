import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { DollarSign, TrendingUp, Calendar, Download, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Commission {
  id: number;
  subscriptionId: number;
  userId: string;
  userName: string;
  planName: string;
  planType: string;
  planTier: string;
  commissionAmount: number;
  totalPlanCost: number;
  status: string;
  paymentStatus: string;
  paidDate?: string;
  createdAt: string;
}

interface CommissionStats {
  totalEarned: number;
  totalPending: number;
  totalPaid: number;
}

export default function AgentCommissions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  // Set up real-time subscription for commissions (NEW agent_commissions table)
  useEffect(() => {
    console.log('[AgentCommissions] Setting up real-time commission subscription...');
    
    const channel = supabase
      .channel('agent-commissions-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'agent_commissions' }, // Changed from 'commissions' to 'agent_commissions'
        (payload) => {
          console.log('[AgentCommissions] Commission change detected:', payload);
          // Only refresh if this commission belongs to the current agent
          if (payload.new?.agent_id === user?.id || payload.old?.agent_id === user?.id) {
            queryClient.invalidateQueries({ queryKey: ["/api/agent/commission-stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/agent/commissions"] });
            toast({
              title: "Commission Updated",
              description: "Your commission data has been updated",
            });
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[AgentCommissions] Cleaning up commission subscription...');
      supabase.removeChannel(channel); // Use removeChannel instead of unsubscribe
    };
  }, [queryClient, toast, user?.id]);

  // Fetch commission stats
  const { data: stats, isLoading: statsLoading } = useQuery<CommissionStats>({
    queryKey: ["/api/agent/commission-stats"],
  });

  // Fetch commissions with filters
  const { data: commissions, isLoading: commissionsLoading } = useQuery<Commission[]>({
    queryKey: ["/api/agent/commissions", dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
      });
      return await apiRequest(`/api/agent/commissions?${params}`, { method: "GET" });
    },
  });

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
      });

      const response = await fetch(`/api/agent/export-commissions?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `commissions-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "Your commission report has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to download commission report.",
        variant: "destructive",
      });
    }
  };

  if (statsLoading || commissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-blue-100 text-blue-800">Paid</Badge>;
      case 'unpaid':
        return <Badge className="bg-gray-100 text-gray-800">Unpaid</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Safe array handling for commissions data with comprehensive checks
  const safeCommissions = React.useMemo(() => {
    return Array.isArray(commissions) ? commissions : [];
  }, [commissions]);

  // Safe stats object with defaults and null checks
  const safeStats = React.useMemo(() => {
    return {
      totalEarned: (stats && typeof stats.totalEarned === 'number') ? stats.totalEarned : 0,
      totalPending: (stats && typeof stats.totalPending === 'number') ? stats.totalPending : 0,
      totalPaid: (stats && typeof stats.totalPaid === 'number') ? stats.totalPaid : 0
    };
  }, [stats]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => setLocation('/agent')}
                className="mr-4"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Dashboard
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">Commission Tracking</h1>
            </div>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${safeStats.totalEarned.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">All time earnings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${safeStats.totalPending.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Awaiting payment</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid Commissions</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${safeStats.totalPaid.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Already received</p>
            </CardContent>
          </Card>
        </div>

        {/* Date Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filter by Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  autoComplete="off"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  autoComplete="off"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commission Table */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(safeCommissions) && safeCommissions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Plan Cost</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safeCommissions.map((commission) => {
                    if (!commission) return null;
                    return (
                      <TableRow key={commission.id}>
                        <TableCell>
                          {commission.createdAt ? format(new Date(commission.createdAt), "MM/dd/yyyy") : 'N/A'}
                        </TableCell>
                        <TableCell>{commission.userName || 'N/A'}</TableCell>
                        <TableCell>{commission.planTier || 'N/A'}</TableCell>
                        <TableCell>{commission.planType || 'N/A'}</TableCell>
                        <TableCell>
                          ${(commission.totalPlanCost && typeof commission.totalPlanCost === 'number') ? commission.totalPlanCost.toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${(commission.commissionAmount && typeof commission.commissionAmount === 'number') ? commission.commissionAmount.toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell>{getStatusBadge(commission.status || 'unknown')}</TableCell>
                        <TableCell>
                          {getPaymentBadge(commission.paymentStatus || 'unknown')}
                          {commission.paidDate && (
                            <div className="text-xs text-gray-500 mt-1">
                              {format(new Date(commission.paidDate), "MM/dd/yyyy")}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }).filter(Boolean)}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No commissions found for the selected date range.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}