import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import apiClient from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft } from "lucide-react";

interface CertificationLogEntry {
  transactionId?: string;
  customerId?: string;
  purpose?: string;
  amount?: number;
  environment?: string;
  timestamp?: string;
  fileName?: string;
  metadata?: Record<string, any>;
  request?: Record<string, any>;
  response?: Record<string, any>;
}

interface CertificationLogResponse {
  success: boolean;
  entries: CertificationLogEntry[];
  totalEntries: number;
  limit: number;
}

interface CertificationExportResponse {
  success: boolean;
  fileName: string;
  filePath: string;
  totalEntries: number;
  entries: CertificationLogEntry[];
}

const AdminEPXCertification = () => {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [formState, setFormState] = useState({
    memberId: "",
    transactionId: "",
    amount: "10.00",
    description: "Certification Server Post test via admin panel",
  });
  const [logsLimit, setLogsLimit] = useState(10);
  const [latestResult, setLatestResult] = useState<any>(null);
  const [exportFileName, setExportFileName] = useState("epx-certification-samples.json");
  const [exportPreview, setExportPreview] = useState<CertificationExportResponse | null>(null);

  const logsQuery = useQuery<CertificationLogResponse>(
    {
      queryKey: ["epx-cert-logs", logsLimit],
      enabled: isAuthenticated && isAdmin,
      queryFn: async () => {
        const response = await apiClient.get(`/api/epx/certification/logs?limit=${logsLimit}`);
        return response as CertificationLogResponse;
      },
    }
  );

  const runTestMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      return apiClient.post("/api/epx/test-recurring", payload);
    },
    onSuccess: (data) => {
      setLatestResult(data);
      toast({
        title: "Server Post submitted",
        description: "Check the log viewer below for captured samples.",
      });
      queryClient.invalidateQueries({ queryKey: ["epx-cert-logs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit Server Post",
        description: error?.message || "See console for details",
        variant: "destructive",
      });
    },
  });

  const exportLogsMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post("/api/epx/certification/export", {
        filename: exportFileName,
      });
    },
    onSuccess: (data: CertificationExportResponse) => {
      setExportPreview(data);
      toast({
        title: "Export ready",
        description: `${data.totalEntries} entries bundled into ${data.fileName}`,
      });

      if (Array.isArray(data.entries)) {
        const blob = new Blob([JSON.stringify(data.entries, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = data.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error?.message || "Unable to export certification logs",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof typeof formState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleRunTest = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.memberId.trim() && !formState.transactionId.trim()) {
      toast({
        title: "Member or transaction required",
        description: "Provide a member ID or a transaction ID so the system can find an AUTH_GUID.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, any> = {
      amount: parseFloat(formState.amount) || 0,
      description: formState.description.trim() || undefined,
    };

    if (formState.memberId.trim()) {
      payload.memberId = Number(formState.memberId.trim());
    }
    if (formState.transactionId.trim()) {
      payload.transactionId = formState.transactionId.trim();
    }

    runTestMutation.mutate(payload);
  };

  const handleLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = parseInt(event.target.value || "10", 10);
    setLogsLimit(Number.isFinite(nextValue) ? Math.min(Math.max(nextValue, 1), 200) : 10);
  };

  const formattedLogs = useMemo(() => logsQuery.data?.entries || [], [logsQuery.data]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Admin or super admin permissions are required to run EPX certification tools.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-6xl mx-auto px-4 space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">EPX Certification Toolkit</h1>
            <p className="text-muted-foreground mt-2">
              Generate Server Post samples, download certification logs, and keep EPX auditors happy.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full md:w-auto"
            onClick={() => setLocation("/admin")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admin View
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Run Server Post MIT Sample</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleRunTest}>
                <div>
                  <Label htmlFor="memberId">Member ID</Label>
                  <Input
                    id="memberId"
                    placeholder="1234"
                    value={formState.memberId}
                    onChange={handleInputChange("memberId")}
                  />
                </div>
                <div>
                  <Label htmlFor="transactionId">Transaction ID</Label>
                  <Input
                    id="transactionId"
                    placeholder="Override when you have a known transaction"
                    value={formState.transactionId}
                    onChange={handleInputChange("transactionId")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0.50"
                      value={formState.amount}
                      onChange={handleInputChange("amount")}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={formState.description}
                      onChange={handleInputChange("description")}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Provide at least a member ID or a transaction ID. The backend will reuse the stored AUTH_GUID to submit an MIT request via `/api/epx/test-recurring`.
                </p>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={runTestMutation.isPending}
                >
                  {runTestMutation.isPending ? "Submitting Sample..." : "Submit Certification Sample"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Certification Logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="exportFileName">Export Filename</Label>
                <Input
                  id="exportFileName"
                  value={exportFileName}
                  onChange={(event) => setExportFileName(event.target.value)}
                  placeholder="epx-certification-samples.json"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Downloads every certification log entry (hosted checkout + Server Post) to a single JSON file so you can forward it to EPX.
              </p>
              <Button
                className="w-full"
                onClick={() => exportLogsMutation.mutate()}
                disabled={exportLogsMutation.isPending}
              >
                {exportLogsMutation.isPending ? "Preparing Export..." : "Download All Logs"}
              </Button>
              {exportPreview && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Last export:</p>
                  <p>{exportPreview.fileName} &middot; {exportPreview.totalEntries} entries</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {latestResult && (
          <Card>
            <CardHeader>
              <CardTitle>Most Recent Server Post Response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium mb-2">Request Fields</p>
                  <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                    {JSON.stringify(latestResult.request?.fields || latestResult.request, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Response Fields</p>
                  <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                    {JSON.stringify(latestResult.response?.fields || latestResult.response, null, 2)}
                  </pre>
                </div>
              </div>
              {latestResult.message && (
                <p className="text-sm">Server message: {latestResult.message}</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Certification Log Viewer</CardTitle>
              <p className="text-sm text-muted-foreground">Showing the most recent {logsQuery.data?.totalEntries || 0} entries.</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <Label htmlFor="limit" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Entries to fetch
                </Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={200}
                  value={logsLimit}
                  onChange={handleLimitChange}
                  className="w-24"
                />
              </div>
              <Button variant="outline" onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}>
                {logsQuery.isFetching ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {logsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : formattedLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No certification logs found yet.</p>
            ) : (
              formattedLogs.map((entry) => (
                <div key={entry.fileName || entry.timestamp} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline">{entry.purpose || 'unknown-purpose'}</Badge>
                    <span className="text-sm font-medium">TX: {entry.transactionId || 'n/a'}</span>
                    {entry.amount && (
                      <span className="text-sm text-muted-foreground">${entry.amount.toFixed(2)}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {entry.timestamp ? formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true }) : 'timestamp unknown'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">Request Snapshot</p>
                      <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                        {JSON.stringify(entry.request, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">Response Snapshot</p>
                      <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
                        {JSON.stringify(entry.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                  {entry.metadata && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Metadata: {JSON.stringify(entry.metadata)}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminEPXCertification;
