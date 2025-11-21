import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiClient } from '@/lib/apiClient';
import { Download, RefreshCw, FileText, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

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
  const [loadingOctober, setLoadingOctober] = useState(false);
  const [loadingCleanup, setLoadingCleanup] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [certStatus, setCertStatus] = useState<{
    enabled: boolean;
    totalLogs: number;
    environment: string;
    logFiles: string[];
  } | null>(null);

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

  // Fetch certification status on mount
  useEffect(() => {
    if (isAuthenticated && (user?.role === 'admin' || user?.role === 'super_admin')) {
      fetchCertificationStatus();
    }
  }, [isAuthenticated, user]);

  const fetchCertificationStatus = async () => {
    try {
      const response = await apiClient.get('/api/admin/epx-certification-status');
      if (response.success) {
        setCertStatus({
          enabled: response.certificationLoggingEnabled,
          totalLogs: response.totalLogs,
          environment: response.environment,
          logFiles: response.logFiles || []
        });
      }
    } catch (error) {
      console.error('[EPX Logs] Failed to fetch certification status:', error);
    }
  };

  const { data, isLoading, error, refetch } = useQuery<EPXLogsResponse>({
    queryKey: ['/api/admin/epx-logs'],
    enabled: isAuthenticated && (user?.role === 'admin' || user?.role === 'super_admin'),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const fetchCertificationLogs = async (useDateRange = false) => {
    setLoadingCertLogs(true);
    try {
      // Get auth token
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Build URL with optional date range
      const { API_BASE_URL } = await import('@/lib/apiClient');
      let url = `${API_BASE_URL}/api/admin/epx-certification-logs`;
      
      if (useDateRange && (startDate || endDate)) {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        url = `${API_BASE_URL}/api/admin/epx-certification-logs/by-date?${params.toString()}`;
      }
      
      console.log('[EPX Logs] Downloading from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('[EPX Logs] Response status:', response.status, response.statusText);
      console.log('[EPX Logs] Content-Type:', response.headers.get('content-type'));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[EPX Logs] Error response:', errorText);
        throw new Error(`Server returned ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      // Download the file
      const blob = await response.blob();
      console.log('[EPX Logs] Downloaded blob size:', blob.size, 'bytes');
      
      const url2 = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url2;
      const filename = useDateRange 
        ? `epx-certification-logs-${startDate || 'all'}-to-${endDate || new Date().toISOString().split('T')[0]}.txt`
        : `epx-certification-logs-${new Date().toISOString().split('T')[0]}.txt`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url2);
      
      alert('✅ Certification logs downloaded successfully!\n\nThis file contains raw HTTP request/response data for EPX certification.\nSensitive data has been masked.\n\nSubmit this .txt file to EPX for certification review.');
    } catch (err: any) {
      console.error('[EPX Logs] Download error:', err);
      alert(`❌ Error downloading certification logs:\n\n${err.message || 'Unknown error'}\n\nCheck the console for details.`);
    } finally {
      setLoadingCertLogs(false);
    }
  };

  const generateOctoberLogs = async () => {
    if (!confirm('Generate temporary certification logs from October successful transactions?\n\n⚠️ This creates TEMPORARY files for certification only.\nYou should delete these after EPX approval.')) {
      return;
    }

    setLoadingOctober(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('Not authenticated');
      }

      const { API_BASE_URL } = await import('@/lib/apiClient');
      const response = await fetch(`${API_BASE_URL}/api/admin/epx-certification-logs/generate-october`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Server returned ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `epx-certification-october-successful-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert('✅ October successful transactions exported!\n\nThis is a TEMPORARY export for EPX certification.\nAfter certification approval, use the "Cleanup Temp Files" button to delete these files.');
      
      // Refresh status to show temp files
      fetchCertificationStatus();
    } catch (err: any) {
      console.error('[EPX Logs] October generation error:', err);
      alert(`❌ Error generating October logs:\n\n${err.message || 'Unknown error'}\n\n${err.message?.includes('No successful') ? 'No successful transactions found in October 2025.' : 'Check the console for details.'}`);
    } finally {
      setLoadingOctober(false);
    }
  };

  const cleanupTempFiles = async () => {
    if (!confirm('Delete all temporary certification files?\n\n⚠️ This will permanently delete files in logs/certification/temp-export/\nOnly do this AFTER EPX certification is approved.')) {
      return;
    }

    setLoadingCleanup(true);
    try {
      const response = await apiClient.delete('/api/admin/epx-certification-logs/cleanup-temp');
      
      if (response.success) {
        alert(`✅ ${response.message}\n\n${response.filesDeleted} file(s) deleted.`);
        fetchCertificationStatus(); // Refresh status
      } else {
        throw new Error(response.error || 'Cleanup failed');
      }
    } catch (err: any) {
      console.error('[EPX Logs] Cleanup error:', err);
      alert(`❌ Error cleaning up temp files:\n\n${err.message || 'Unknown error'}`);
    } finally {
      setLoadingCleanup(false);
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

  // Filter transactions by date range
  const filteredTransactions = data.transactions.filter(transaction => {
    const txDate = new Date(transaction.createdAt);
    
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      start.setHours(0, 0, 0, 0);
      if (txDate < start) return false;
    }
    
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      if (txDate > end) return false;
    }
    
    return true;
  });

  // Calculate filtered stats
  const filteredStats = {
    totalTransactions: filteredTransactions.length,
    successful: filteredTransactions.filter(t => t.status === 'completed').length,
    failed: filteredTransactions.filter(t => t.status === 'failed').length,
    pending: filteredTransactions.filter(t => t.status === 'pending').length,
    totalAmount: filteredTransactions
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0),
    dateRange: filteredTransactions.length > 0 ? {
      earliest: filteredTransactions[filteredTransactions.length - 1].createdAt,
      latest: filteredTransactions[0].createdAt
    } : {
      earliest: null,
      latest: null
    }
  };

  const clearFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
  };

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
          <Link href="/admin">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Admin Dashboard
            </Button>
          </Link>
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

      {/* Date Range Filter */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-purple-900 flex items-center justify-between">
            <span>Filter Transaction History</span>
            {(filterStartDate || filterEndDate) && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Clear Filters
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-purple-900 block mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-purple-900 block mb-2">
                End Date
              </label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="text-sm text-purple-700">
              {filterStartDate || filterEndDate ? (
                <div>
                  Showing: <strong>{filteredStats.totalTransactions}</strong> of <strong>{data.stats.totalTransactions}</strong> transactions
                </div>
              ) : (
                <div>
                  Showing all <strong>{data.stats.totalTransactions}</strong> transactions
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EPX Certification Section */}
      <Alert className="border-blue-200 bg-blue-50">
        <FileText className="h-5 w-5 text-blue-600" />
        <AlertTitle className="text-blue-900 font-semibold flex items-center justify-between">
          <span>EPX Certification Logs</span>
          {certStatus && (
            <Badge variant={certStatus.enabled ? "success" : "destructive"} className="ml-2">
              {certStatus.enabled ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Logging Active
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Logging Disabled
                </>
              )}
            </Badge>
          )}
        </AlertTitle>
        <AlertDescription>
          <div className="flex items-center justify-between mb-3">
            <p className="text-blue-800">
              EPX requires specific raw request/response data for certification. Follow the instructions below to capture the exact data they need.
            </p>
            {certStatus && (
              <div className="text-sm text-blue-700 ml-4 text-right">
                <p><strong>{certStatus.totalLogs}</strong> server-side log{certStatus.totalLogs !== 1 ? 's' : ''}</p>
                <p className="text-xs text-blue-600">{certStatus.environment} environment</p>
              </div>
            )}
          </div>
          
          {/* Hosted Checkout Browser Capture Instructions */}
          <div className="mt-4 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
            <p className="text-sm font-bold text-green-900 mb-2 flex items-center">
              🌐 HOSTED CHECKOUT: Capture from Browser (REQUIRED)
            </p>
            <div className="text-xs text-green-800 space-y-2">
              <p className="font-semibold">EPX needs to see the raw browser request/response to validate:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li><strong>reCaptcha token</strong> in the request (Google reCaptcha v3 required in production)</li>
                <li>Requests are sent <strong>from the browser</strong> (not server-side)</li>
                <li>Hosted Checkout payload structure and response format</li>
              </ul>
              
              <div className="mt-3 p-2 bg-white rounded border border-green-200">
                <p className="font-bold text-green-900 mb-1">How to Capture (F12 Method):</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Go to enrollment page and open browser DevTools (press <kbd className="bg-gray-200 px-1 rounded">F12</kbd>)</li>
                  <li>Click <strong>"Network"</strong> tab in DevTools</li>
                  <li>Complete a test enrollment/payment</li>
                  <li>In Network tab, find the EPX Hosted Checkout request (look for <code className="bg-gray-100 px-1">hosted.epx</code>)</li>
                  <li>Right-click the request → <strong>"Copy"</strong> → <strong>"Copy as cURL"</strong> or <strong>"Copy all as HAR"</strong></li>
                  <li>Paste into a .txt file and send to EPX</li>
                </ol>
              </div>
              
              <p className="mt-2 text-green-700 italic">
                ⚠️ Make sure to capture a request that shows the <strong>reCaptcha token</strong> in the payload!
              </p>
            </div>
          </div>

          {/* Server-Side Logs */}
          <div className="mt-4 space-y-2 text-sm text-blue-700">
            <p className="font-bold">📋 Server-Side Logs (Backend API):</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>EPX Environment Variables (EPX_CUST_NBR, EPX_MERCH_NBR, EPX_DBA_NBR, EPX_TERMINAL_NBR)</li>
              <li>Raw HTTP request headers and body for each transaction</li>
              <li>Raw HTTP response headers and body for each transaction</li>
              <li>ACI_EXT field for Merchant Initiated Transactions (recurring billing)</li>
              <li>Sensitive data automatically masked (card numbers, auth tokens)</li>
            </ul>
          </div>

          {/* Quick Action: October Successful Transactions */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
            <p className="text-sm font-semibold text-green-900 mb-2">
              🎯 Quick Export: October Successful Transactions
            </p>
            <p className="text-xs text-green-700 mb-3">
              Generate certification logs from <strong>all successful transactions in October 2025</strong>. 
              Creates temporary files that can be deleted after EPX approval.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={generateOctoberLogs}
                disabled={loadingOctober}
                size="sm"
                className="bg-green-600 hover:bg-green-700"
              >
                {loadingOctober ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3 mr-2" />
                    Export October Successful Only
                  </>
                )}
              </Button>
              <Button
                onClick={cleanupTempFiles}
                disabled={loadingCleanup}
                size="sm"
                variant="destructive"
              >
                {loadingCleanup ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    🧹 Cleanup Temp Files
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-green-600 mt-2">
              ⚠️ Delete temp files after EPX certification is approved to save space
            </p>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              onClick={fetchCertificationLogs}
              disabled={loadingCertLogs || (certStatus && certStatus.totalLogs === 0)}
              className="bg-blue-600 hover:bg-blue-700"
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
                  {certStatus && certStatus.totalLogs > 0 && ` (${certStatus.totalLogs})`}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={fetchCertificationStatus}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Check Status
            </Button>
          </div>
          {certStatus && !certStatus.enabled && (
            <p className="mt-3 text-sm text-orange-700 bg-orange-50 p-2 rounded border border-orange-200">
              ⚠️ Certification logging is currently disabled. Enable it in Railway environment variables: <code className="bg-orange-100 px-1 rounded">ENABLE_CERTIFICATION_LOGGING=true</code>
            </p>
          )}
          {certStatus && certStatus.logFiles && certStatus.logFiles.length > 0 && (
            <div className="mt-4 p-3 bg-white rounded border border-blue-200">
              <p className="text-sm font-semibold text-blue-900 mb-2">Available Log Files ({certStatus.logFiles.length}):</p>
              <div className="max-h-32 overflow-y-auto">
                <ul className="text-xs text-blue-700 space-y-1">
                  {certStatus.logFiles.map((file, idx) => (
                    <li key={idx} className="font-mono">{file}</li>
                  ))}
                </ul>
              </div>
              
              {/* Date Range Filter */}
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-sm font-semibold text-blue-900 mb-2">Filter by Date Range:</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-blue-700 block mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-blue-300 rounded"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-blue-700 block mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-blue-300 rounded"
                    />
                  </div>
                  <Button
                    onClick={() => fetchCertificationLogs(true)}
                    disabled={loadingCertLogs || (!startDate && !endDate)}
                    variant="outline"
                    size="sm"
                    className="gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Export Range
                  </Button>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Leave dates empty to export all logs. Dates filter by file modification time.
                </p>
              </div>
            </div>
          )}
        </AlertDescription>
      </Alert>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Transactions</CardDescription>
            <CardTitle className="text-3xl">{filteredStats.totalTransactions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Successful</CardDescription>
            <CardTitle className="text-3xl text-green-600">{filteredStats.successful}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-3xl text-red-600">{filteredStats.failed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{filteredStats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Amount</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(filteredStats.totalAmount)}</CardTitle>
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
            {filteredStats.totalTransactions > 0 ? (
              <>
                {filteredStats.totalTransactions} transaction{filteredStats.totalTransactions !== 1 ? 's' : ''} 
                {filteredStats.dateRange.earliest && filteredStats.dateRange.latest && (
                  <> from {new Date(filteredStats.dateRange.earliest).toLocaleDateString()} to {new Date(filteredStats.dateRange.latest).toLocaleDateString()}</>
                )}
              </>
            ) : (
              'No transactions found' + ((filterStartDate || filterEndDate) ? ' for selected date range' : '')
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg font-medium">No transactions to display</p>
              {(filterStartDate || filterEndDate) && (
                <p className="text-sm mt-2">Try adjusting your date filter or <button onClick={clearFilters} className="text-blue-600 hover:underline">clear filters</button></p>
              )}
            </div>
          ) : (
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
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.transactionId} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm">
                      {new Date(transaction.createdAt).toLocaleDateString()}
                      <br />
                      <span className="text-xs text-gray-500">
                        {new Date(transaction.createdAt).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit',
                          timeZoneName: 'short'
                        })}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
