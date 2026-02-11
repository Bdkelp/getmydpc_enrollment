/**
 * Admin Notifications Dashboard
 * 
 * Displays system notifications that require admin attention:
 * - Failed EPX recurring subscription creation
 * - Payment processing errors
 * - Other system alerts
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle, RefreshCw, Eye, Clock, AlertTriangle, CreditCard, Mail, User } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatDistanceToNow } from "date-fns";

interface AdminNotification {
  id: number;
  type: string;
  memberId?: number;
  member_id?: number;
  subscriptionId?: number;
  errorMessage?: string;
  error_message?: string;
  metadata?: any;
  resolved: boolean;
  resolvedAt?: string;
  resolved_at?: string;
  resolvedBy?: string;
  resolved_by?: string;
  createdAt: string;
  created_at?: string;
  // From JOIN
  member_first_name?: string;
  member_last_name?: string;
  member_email?: string;
  member_customer_number?: string;
}

export default function AdminNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

  const { data: response, isLoading } = useQuery<{ success: boolean; notifications: AdminNotification[]; total: number }>({
    queryKey: ['/api/admin/notifications', filter],
    queryFn: async () => {
      const result = await apiRequest(`/api/admin/notifications?filter=${filter}`, {
        method: 'GET'
      });
      // Handle both old and new response formats
      if (result?.notifications) {
        return result;
      }
      return { success: true, notifications: Array.isArray(result) ? result : [], total: Array.isArray(result) ? result.length : 0 };
    }
  });

  const notifications = response?.notifications || [];

  const resolveNotificationMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      return await apiRequest(`/api/admin/notifications/${notificationId}/resolve`, {
        method: 'POST'
      });
    },
    onSuccess: () => {
      toast({
        title: "Notification Resolved",
        description: "The notification has been marked as resolved."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resolve notification",
        variant: "destructive"
      });
    }
  });

  const retryEPXSubscriptionMutation = useMutation({
    mutationFn: async ({ notificationId, subscriptionId }: { notificationId: number; subscriptionId: number }) => {
      return await apiRequest(`/api/admin/notifications/${notificationId}/retry-epx`, {
        method: 'POST',
        body: JSON.stringify({ subscriptionId })
      });
    },
    onSuccess: () => {
      toast({
        title: "Retry Successful",
        description: "EPX subscription creation was successful."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications'] });
    },
    onError: (error: any) => {
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to create EPX subscription",
        variant: "destructive"
      });
    }
  });

  const getNotification TypeLabel = (type: string) => {
    switch (type) {
      case 'epx_subscription_failed':
        return 'EPX Subscription Failed';
      case 'payment_failed':
        return 'Payment Failed';
      default:
        return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  const getNotificationTypeBadge = (type: string) => {
    switch (type) {
      case 'epx_subscription_failed':
        return <Badge variant="destructive">EPX Error</Badge>;
      case 'payment_failed':
        return <Badge variant="destructive" className="bg-red-100 text-red-800"><CreditCard className="h-3 w-3 mr-1" />Payment Failed</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getMemberDisplayName = (notification: AdminNotification) => {
    // Try metadata first
    if (notification.metadata?.memberName) {
      return notification.metadata.memberName;
    }
    // Try joined data
    if (notification.member_first_name || notification.member_last_name) {
      return `${notification.member_first_name || ''} ${notification.member_last_name || ''}`.trim();
    }
    // Try email
    if (notification.metadata?.memberEmail || notification.member_email) {
      return notification.metadata?.memberEmail || notification.member_email;
    }
    return `Member #${notification.memberId || notification.member_id || 'Unknown'}`;
  };

  const handleRetryPayment = (notification: AdminNotification) => {
    const memberId = notification.memberId || notification.member_id;
    const amount = notification.metadata?.amount;
    const paymentId = notification.metadata?.paymentId;
    
    if (!memberId || !amount) {
      toast({
        title: "Missing Information",
        description: "Cannot retry payment - missing member ID or amount",
        variant: "destructive"
      });
      return;
    }

    const params = new URLSearchParams({
      memberId: memberId.toString(),
      amount: amount.toString(),
      description: `Retry failed payment for ${getMemberDisplayName(notification)}`,
      retryPaymentId: paymentId?.toString() || '',
      retryMemberId: memberId.toString(),
      retryReason: "Admin-initiated retry from notification",
      autoLaunch: "true"
    });

    setLocation(`/admin/payment-checkout?${params.toString()}`);
  };

  const unresolvedCount = notifications.filter(n => !n.resolved).length;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Notifications</h1>
          <p className="text-muted-foreground mt-2">
            Monitor and resolve system alerts
          </p>
        </div>
        {unresolvedCount > 0 && (
          <Alert className="w-auto">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {unresolvedCount} unresolved {unresolvedCount === 1 ? 'notification' : 'notifications'}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Notifications</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={filter === 'unresolved' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('unresolved')}
              >
                Unresolved ({notifications.filter(n => !n.resolved).length})
              </Button>
              <Button
                variant={filter === 'resolved' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('resolved')}
              >
                Resolved
              </Button>
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No {filter === 'unresolved' ? 'unresolved' : filter === 'resolved' ? 'resolved' : ''} notifications</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((notification) => {
                  const memberId = notification.memberId || notification.member_id;
                  const memberEmail = notification.metadata?.memberEmail || notification.member_email;
                  const errorMessage = notification.errorMessage || notification.error_message;
                  const createdAt = notification.createdAt || notification.created_at;
                  
                  return (
                  <TableRow key={notification.id}>
                    <TableCell>
                      {getNotificationTypeBadge(notification.type)}
                    </TableCell>
                    <TableCell>
                      {memberId ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-gray-500" />
                            <span className="font-medium">{getMemberDisplayName(notification)}</span>
                          </div>
                          {memberEmail && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {memberEmail}
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Member #{memberId}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm line-clamp-2">{errorMessage || 'No error message'}</p>
                          {notification.metadata?.amount && (
                            <p className="text-xs text-muted-foreground">
                              Amount: ${parseFloat(notification.metadata.amount).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(createdAt!), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {notification.resolved ? (
                        <Badge variant="outline" className="bg-green-50">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Resolved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-50">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {!notification.resolved && notification.type === 'payment_failed' && memberId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetryPayment(notification)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry Payment
                          </Button>
                        )}
                        {!notification.resolved && notification.type === 'epx_subscription_failed' && notification.subscriptionId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryEPXSubscriptionMutation.mutate({
                              notificationId: notification.id,
                              subscriptionId: notification.subscriptionId!
                            })}
                            disabled={retryEPXSubscriptionMutation.isPending}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry EPX
                          </Button>
                        )}
                        {!notification.resolved && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => resolveNotificationMutation.mutate(notification.id)}
                            disabled={resolveNotificationMutation.isPending}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
