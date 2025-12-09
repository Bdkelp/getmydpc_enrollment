import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign, Calendar, CheckCircle, ChevronLeft, Clock } from "lucide-react";
import { hasAtLeastRole } from "@/lib/roles";
import { format, startOfWeek, endOfWeek, isFuture, isPast, isToday } from "date-fns";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Commission {
  id: string;
  agentId: string;
  memberId: string;
  commissionAmount: number;
  coverageType: string;
  status: string;
  paymentStatus: string;
  paymentDate?: string;
  createdAt: string;
  userName: string;
  planType: string;
  paymentCaptured?: boolean;
  paymentIntentId?: string;
  paymentCapturedAt?: string;
  eligibleForPayoutAt?: string;
  commissionType?: 'direct' | 'override';
  isClawedBack?: boolean;
  clawbackReason?: string;
}

export default function AdminCommissions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, 'admin');
  const queryClient = useQueryClient();

  // Current week by default
  const [dateFilter, setDateFilter] = useState({
    startDate: format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd"),
    endDate: format(endOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd"),
  });

  const [selectedCommissions, setSelectedCommissions] = useState<Set<string>>(new Set());
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Fetch all commissions (admin view)
  const { data: commissions, isLoading } = useQuery<Commission[]>({
    queryKey: ["/api/admin/commissions", dateFilter.startDate, dateFilter.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
      });
      return await apiRequest(`/api/admin/commissions?${params}`, { method: "GET" });
    },
    enabled: !!user && isAdminUser,
  });

  // Mark commissions as paid mutation
  const markAsPaidMutation = useMutation({
    mutationFn: async (data: { commissionIds: string[], paymentDate: string }) => {
      return await apiRequest("/api/admin/mark-commissions-paid", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${selectedCommissions.size} commission(s) marked as paid`,
      });
      setSelectedCommissions(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark commissions as paid",
        variant: "destructive",
      });
    },
  });

  const safeCommissions = useMemo(() => {
    return Array.isArray(commissions) ? commissions : [];
  }, [commissions]);

  const unpaidCommissions = useMemo(() => {
    const now = new Date();
    return safeCommissions.filter(c => {
      // Only show unpaid commissions where:
      // 1. Payment status is unpaid
      // 2. Payment was captured (payment_captured = true)
      // 3. Past the 14-day grace period (eligible_for_payout_at < now)
      if (c.paymentStatus !== 'unpaid') return false;
      if (!c.paymentCaptured) return false;
      if (c.eligibleForPayoutAt && new Date(c.eligibleForPayoutAt) > now) return false;
      return true;
    });
  }, [safeCommissions]);

  const paidCommissions = useMemo(() => {
    return safeCommissions.filter(c => c.paymentStatus === 'paid');
  }, [safeCommissions]);

  const scheduledCommissions = useMemo(() => {
    return safeCommissions.filter(c => {
      if (c.paymentStatus !== 'paid' || !c.paymentDate) return false;
      const paymentDate = new Date(c.paymentDate);
      return isFuture(paymentDate) || isToday(paymentDate);
    });
  }, [safeCommissions]);

  const totalUnpaid = useMemo(() => {
    return unpaidCommissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [unpaidCommissions]);

  const totalPaid = useMemo(() => {
    return paidCommissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [paidCommissions]);

  const totalScheduled = useMemo(() => {
    return scheduledCommissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [scheduledCommissions]);

  const selectedTotal = useMemo(() => {
    return safeCommissions
      .filter(c => selectedCommissions.has(c.id))
      .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);
  }, [safeCommissions, selectedCommissions]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const unpaidIds = unpaidCommissions.map(c => c.id);
      setSelectedCommissions(new Set(unpaidIds));
    } else {
      setSelectedCommissions(new Set());
    }
  };

  const handleSelectCommission = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedCommissions);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedCommissions(newSelected);
  };

  const handleMarkAsPaid = () => {
    if (selectedCommissions.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select commissions to mark as paid",
        variant: "destructive",
      });
      return;
    }

    markAsPaidMutation.mutate({
      commissionIds: Array.from(selectedCommissions),
      paymentDate: paymentDate,
    });
  };

  const handleQuickSelectWeek = () => {
    const sunday = startOfWeek(new Date(), { weekStartsOn: 0 });
    const saturday = endOfWeek(new Date(), { weekStartsOn: 0 });
    setDateFilter({
      startDate: format(sunday, "yyyy-MM-dd"),
      endDate: format(saturday, "yyyy-MM-dd"),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => setLocation('/admin')}
                className="mr-4"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Admin
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">Commission Management</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Unpaid</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalUnpaid.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{unpaidCommissions.length} commissions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${totalPaid.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{paidCommissions.length} commissions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled Payments</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">${totalScheduled.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{scheduledCommissions.length} upcoming</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Selected for Payment</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${selectedTotal.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{selectedCommissions.size} selected</p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Action Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Process Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="paymentDate">Payment Date</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <Button
                onClick={handleMarkAsPaid}
                disabled={selectedCommissions.size === 0 || markAsPaidMutation.isPending}
                className="mb-0"
              >
                {markAsPaidMutation.isPending ? "Processing..." : `Mark ${selectedCommissions.size} as Paid`}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Date Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filter by Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="startDate">Start Date (Sunday)</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="endDate">End Date (Saturday)</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <Button onClick={handleQuickSelectWeek} variant="outline">
                Current Week
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Commission Table with Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({safeCommissions.length})</TabsTrigger>
                <TabsTrigger value="unpaid">Unpaid ({unpaidCommissions.length})</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled ({scheduledCommissions.length})</TabsTrigger>
                <TabsTrigger value="paid">Paid ({paidCommissions.length})</TabsTrigger>
              </TabsList>

              {/* All Commissions Tab */}
              <TabsContent value="all">
                {safeCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={unpaidCommissions.length > 0 && selectedCommissions.size === unpaidCommissions.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safeCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCommissions.has(commission.id)}
                              onCheckedChange={(checked) => handleSelectCommission(commission.id, checked as boolean)}
                              disabled={commission.paymentStatus === 'paid'}
                            />
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.createdAt), "MM/dd/yyyy")}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {commission.paymentStatus === 'paid' ? (
                              <Badge className="bg-green-100 text-green-800">Paid</Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800">Unpaid</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {commission.paymentDate
                              ? format(new Date(commission.paymentDate), "MM/dd/yyyy")
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No commissions found for the selected date range.</p>
                  </div>
                )}
              </TabsContent>

              {/* Unpaid Commissions Tab */}
              <TabsContent value="unpaid">
                {unpaidCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={unpaidCommissions.length > 0 && selectedCommissions.size === unpaidCommissions.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCommissions.has(commission.id)}
                              onCheckedChange={(checked) => handleSelectCommission(commission.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.createdAt), "MM/dd/yyyy")}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No unpaid commissions found.</p>
                  </div>
                )}
              </TabsContent>

              {/* Scheduled Payments Tab */}
              <TabsContent value="scheduled">
                {scheduledCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scheduled Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduledCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            {commission.paymentDate && (
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-blue-600" />
                                {format(new Date(commission.paymentDate), "MM/dd/yyyy")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No scheduled payments found.</p>
                  </div>
                )}
              </TabsContent>

              {/* Paid Commissions Tab */}
              <TabsContent value="paid">
                {paidCommissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>
                            {commission.paymentDate ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                {format(new Date(commission.paymentDate), "MM/dd/yyyy")}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{commission.agentNumber || commission.agentId.slice(0, 8)}</TableCell>
                          <TableCell>{commission.userName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{commission.planName || commission.coverageType}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            ${commission.commissionAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No paid commissions found.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
