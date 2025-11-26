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
import { AlertCircle, CheckCircle, RefreshCw, Eye, Clock, AlertTriangle } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatDistanceToNow } from "date-fns";

interface AdminNotification {
  id: number;
  type: string;
  memberId?: number;
  subscriptionId?: number;
  errorMessage?: string;
  metadata?: any;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export default function AdminNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

  const { data: notifications = [], isLoading } = useQuery<AdminNotification[]>({
    queryKey: ['/api/admin/notifications', filter],
    queryFn: async () => {
      const response = await apiRequest(`/api/admin/notifications?filter=${filter}`, {
        method: 'GET'
      });
      return response;
    }
  });

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

  const getNotificationTypeLabel = (type: string) => {
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
        return <Badge variant="destructive">Payment</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
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
                {notifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>
                      {getNotificationTypeBadge(notification.type)}
                    </TableCell>
                    <TableCell>
                      {notification.memberId ? (
                        <Button
                          variant="link"
                          className="p-0 h-auto"
                          onClick={() => window.open(`/admin/members/${notification.memberId}`, '_blank')}
                        >
                          Member #{notification.memberId}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm line-clamp-2">{notification.errorMessage || 'No error message'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
