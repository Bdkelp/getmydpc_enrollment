import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiClient } from '@/lib/apiClient';
import { Download, RefreshCw, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface EPXTransaction {
  transactionId: string;
  paymentId: string;
  subscriptionId: string | null;
  createdAt: string;
  processedAt: string | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  authorizationCode: string | null;
  bricToken: string | null;
  terminalProfileId: string;
  environment: string;
  memberEmail: string | null;
  planName: string | null;
}

interface EPXLogsResponse {
  success: boolean;
  stats: {
    totalTransactions: number;
    successful: number;
    failed: number;
    pending: number;
    totalAmount: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
  };
  transactions: EPXTransaction[];
  exportedAt: string;
  exportedBy: string;
  environment: string;
  terminalProfileId: string;
}

export default function AdminEPXLogs() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loadingCertLogs, setLoadingCertLogs] = useState(false);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        setLocation('/login');
      } else if (user.role !== 'admin' && user.role !== 'super_admin') {
        setLocation('/no-access');
      }
    }
  }, [user, authLoading, setLocation]);

  const { data, isLoading, error, refetch } = useQuery<EPXLogsResponse>({
    queryKey: ['/api/admin/epx-logs'],
    enabled: isAuthenticated && (user?.role === 'admin' || user?.role === 'super_admin'),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const fetchCertificationLogs = async () => {
    setLoadingCertLogs(true);
    try {
      const response = await apiClient.get('/api/admin/epx-certification-logs');
      
      // Create a formatted text file for download
      const content = `EPX CERTIFICATION LOGS EXPORT
========================================
Generated: ${new Date().toISOString()}
Environment: ${response.environment}
Terminal Profile ID: ${response.terminalProfileId}
Total Log Files: ${response.summary.totalLogs}

INSTRUCTIONS:
${response.summary.instructions.map((i: string) => `• ${i}`).join('\n')}

LOG FILES:
${response.logFiles.map((f: string) => `  - ${f}`).join('\n')}

========================================
For detailed raw request/response data, please check:
${response.summary.logsDirectory}

Exported file location:
${response.summary.exportedFile}
`;

      // Download the summary
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `epx-certification-logs-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      
      // Show success message
      alert(`✅ Certification logs exported!\n\nTotal files: ${response.summary.totalLogs}\nLocation: ${response.summary.exportedFile}\n\nA summary has been downloaded. The full logs are available on the server.`);
    } catch (err: any) {
      alert(`❌ Error fetching certification logs: ${err.message || 'Unknown error'}`);
    } finally {
      setLoadingCertLogs(false);
    }
  };

  const downloadLogs = () => {
    if (!data) return;
    
    const csv = [
      'Transaction ID,Payment ID,Date,Amount,Status,Payment Method,Auth Code,Plan,Member Email',
      ...data.transactions.map(t => 
        `"${t.transactionId}","${t.paymentId}","${t.createdAt}","${t.amount}","${t.status}","${t.paymentMethod}","${t.authorizationCode || 'N/A'}","${t.planName || 'N/A'}","${t.memberEmail || 'N/A'}"`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epx-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'success' | 'destructive' | 'warning'> = {
      completed: 'success',
      failed: 'destructive',
      pending: 'warning',
    };
    return variants[status] || 'default';
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect handled by useEffect, but show nothing while redirecting
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading EPX payment logs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-700">Error Loading Logs</CardTitle>
          <CardDescription className="text-red-600">
            {error instanceof Error ? error.message : 'Failed to load EPX payment logs'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">EPX Payment Logs</h1>
          <p className="text-gray-600 mt-1">
            Transaction history and payment details for EPX support
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={downloadLogs}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </div>

      {/* EPX Certification Section */}
      <Alert className="border-blue-200 bg-blue-50">
        <FileText className="h-5 w-5 text-blue-600" />
        <AlertTitle className="text-blue-900 font-semibold">
          EPX Certification Logs
        </AlertTitle>
        <AlertDescription>
          <p className="text-blue-800 mb-3">
            For EPX certification, you need raw request/response logs. Click below to export the certification logs in the format EPX requires.
          </p>
          <div className="space-y-2 text-sm text-blue-700">
            <p><strong>What you'll get:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Raw HTTP request headers and body for each transaction</li>
              <li>Raw HTTP response headers and body for each transaction</li>
              <li>Sensitive data automatically masked (card numbers, auth tokens)</li>
              <li>.txt format files ready to submit to EPX</li>
            </ul>
          </div>
          <Button
            onClick={fetchCertificationLogs}
            disabled={loadingCertLogs}
            className="mt-4 bg-blue-600 hover:bg-blue-700"
          >
            {loadingCertLogs ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Certification Logs
              </>
            )}
          </Button>
        </AlertDescription>
      </Alert>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Transactions</CardDescription>
            <CardTitle className="text-3xl">{data.stats.totalTransactions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Successful</CardDescription>
            <CardTitle className="text-3xl text-green-600">{data.stats.successful}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-3xl text-red-600">{data.stats.failed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{data.stats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Amount</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(data.stats.totalAmount)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Environment Info */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Environment</p>
              <Badge variant={data.environment === 'production' ? 'destructive' : 'default'}>
                {data.environment.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-600">Terminal Profile ID</p>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">{data.terminalProfileId}</code>
            </div>
            <div>
              <p className="text-sm text-gray-600">Exported At</p>
              <p className="text-sm">{new Date(data.exportedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Exported By</p>
              <p className="text-sm">{data.exportedBy}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>
            {data.transactions.length} transactions from {new Date(data.stats.dateRange.earliest).toLocaleDateString()} to {new Date(data.stats.dateRange.latest).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Date</th>
                  <th className="text-left p-3 font-semibold">Transaction ID</th>
                  <th className="text-left p-3 font-semibold">Amount</th>
                  <th className="text-left p-3 font-semibold">Status</th>
                  <th className="text-left p-3 font-semibold">Method</th>
                  <th className="text-left p-3 font-semibold">Auth Code</th>
                  <th className="text-left p-3 font-semibold">Plan</th>
                  <th className="text-left p-3 font-semibold">Member</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((transaction) => (
                  <tr key={transaction.transactionId} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm">
                      {new Date(transaction.createdAt).toLocaleDateString()}
                      <br />
                      <span className="text-xs text-gray-500">
                        {new Date(transaction.createdAt).toLocaleTimeString()}
                      </span>
                    </td>
                    <td className="p-3">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {transaction.transactionId}
                      </code>
                    </td>
                    <td className="p-3 font-semibold">
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="p-3">
                      <Badge variant={getStatusBadge(transaction.status)}>
                        {transaction.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm">{transaction.paymentMethod}</td>
                    <td className="p-3">
                      {transaction.authorizationCode ? (
                        <code className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          {transaction.authorizationCode}
                        </code>
                      ) : (
                        <span className="text-gray-400 text-xs">N/A</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">{transaction.planName || '-'}</td>
                    <td className="p-3 text-sm">{transaction.memberEmail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
