import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft, Target, Users } from "lucide-react";
import type { PerformanceGoals, GoalMetricSet, ProductGoal } from "@shared/performanceGoals";
import { defaultPerformanceGoals } from "@shared/performanceGoals";

const metricFields: Array<{ key: keyof GoalMetricSet; label: string; prefix?: string }> = [
  { key: "enrollments", label: "Enrollments" },
  { key: "revenue", label: "Revenue", prefix: "$" },
  { key: "commissions", label: "Commissions", prefix: "$" },
  { key: "leads", label: "Leads" },
];

const periodLabels: Record<GoalPeriod, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const planFields = [
  { key: "weeklyEnrollments", label: "Weekly" },
  { key: "monthlyEnrollments", label: "Monthly" },
  { key: "quarterlyEnrollments", label: "Quarterly" },
] as const;

type GoalPeriod = "weekly" | "monthly" | "quarterly";
type PlanFrequencyField = typeof planFields[number]["key"];

interface PlanSummary {
  id: number;
  name: string;
}

interface AgentSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  agentNumber?: string;
}

interface PerformanceGoalOverrideRecord {
  agentId: string;
  goals: PerformanceGoals;
  updatedAt?: string;
  updatedBy?: string | null;
  agent?: AgentSummary | null;
}

interface PerformanceGoalsResponse {
  defaults: PerformanceGoals;
  overrides: PerformanceGoalOverrideRecord[];
  plans: PlanSummary[];
}

const formatAgentLabel = (agent: AgentSummary) => {
  const parts = [agent.agentNumber, agent.firstName, agent.lastName].filter(Boolean).join(" ");
  return parts || agent.email || "Unnamed Agent";
};

const getPlanGoalValue = (
  goals: PerformanceGoals,
  planId: number,
  field: PlanFrequencyField,
) => {
  const planGoal = goals.productGoals.find((goal) => goal.planId === planId);
  const value = planGoal?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const applyPlanGoalUpdate = (
  current: PerformanceGoals,
  plan: PlanSummary,
  field: PlanFrequencyField,
  value: number,
): PerformanceGoals => {
  const next: PerformanceGoals = {
    ...current,
    productGoals: [...current.productGoals],
  };
  const existingIndex = next.productGoals.findIndex((goal) => goal.planId === plan.id);
  if (existingIndex === -1) {
    next.productGoals.push({
      planId: plan.id,
      planName: plan.name,
      [field]: value,
    } as ProductGoal);
    return next;
  }

  next.productGoals[existingIndex] = {
    ...next.productGoals[existingIndex],
    planName: plan.name,
    [field]: value,
  } as ProductGoal;
  return next;
};

function AdminPerformanceGoals() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, "admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [defaultGoals, setDefaultGoals] = useState<PerformanceGoals>(defaultPerformanceGoals);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [overrideGoals, setOverrideGoals] = useState<PerformanceGoals | null>(null);

  const { data: goalsResponse, isLoading: goalsLoading } = useQuery<PerformanceGoalsResponse>({
    queryKey: ["/api/admin/performance-goals"],
    enabled: isAdminUser,
  });

  const { data: agents = [] } = useQuery<AgentSummary[]>({
    queryKey: ["/api/agents"],
    enabled: isAdminUser,
  });

  useEffect(() => {
    if (goalsResponse?.defaults) {
      setDefaultGoals(goalsResponse.defaults);
    }
  }, [goalsResponse?.defaults]);

  useEffect(() => {
    if (!selectedAgentId) {
      setOverrideGoals(null);
      return;
    }
    const match = goalsResponse?.overrides?.find((record) => record.agentId === selectedAgentId);
    if (match) {
      setOverrideGoals(match.goals);
    } else if (goalsResponse?.defaults) {
      setOverrideGoals(goalsResponse.defaults);
    } else {
      setOverrideGoals(defaultPerformanceGoals);
    }
  }, [selectedAgentId, goalsResponse?.overrides, goalsResponse?.defaults]);

  const updateDefaultsMutation = useMutation({
    mutationFn: async (payload: PerformanceGoals) =>
      apiRequest("/api/admin/performance-goals/defaults", {
        method: "PUT",
        body: JSON.stringify({ goals: payload }),
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Default goals updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/performance-goals"] });
    },
    onError: (error: any) => {
      toast({ title: "Unable to save", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const saveOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgentId || !overrideGoals) {
        throw new Error("Select an agent before saving goals.");
      }
      return apiRequest(`/api/admin/performance-goals/agent/${selectedAgentId}`, {
        method: "PUT",
        body: JSON.stringify({ goals: overrideGoals }),
      });
    },
    onSuccess: () => {
      toast({ title: "Override saved", description: "Goals updated for the selected agent." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/performance-goals"] });
    },
    onError: (error: any) => {
      toast({ title: "Unable to save override", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgentId) {
        throw new Error("Select an agent to remove the override.");
      }
      return apiRequest(`/api/admin/performance-goals/agent/${selectedAgentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({ title: "Override removed", description: "Agent now inherits the default goals." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/performance-goals"] });
      setOverrideGoals(goalsResponse?.defaults ?? defaultPerformanceGoals);
    },
    onError: (error: any) => {
      toast({ title: "Unable to remove override", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const handleMetricChange = (
    setter: (updater: (current: PerformanceGoals) => PerformanceGoals) => void,
  ) =>
    (period: GoalPeriod, field: keyof GoalMetricSet, value: string) => {
      const numericValue = Number(value);
      setter((current) => ({
        ...current,
        [period]: {
          ...current[period],
          [field]: Number.isFinite(numericValue) ? numericValue : 0,
        },
      }));
    };

  const handleDefaultMetricChange = handleMetricChange((updater) => setDefaultGoals(updater));
  const handleOverrideMetricChange = handleMetricChange((updater) => {
    setOverrideGoals((current) => {
      if (!current) return current;
      return updater(current);
    });
  });

  const handlePlanGoalChange = (
    setter: (updater: (current: PerformanceGoals) => PerformanceGoals) => void,
  ) =>
    (plan: PlanSummary, field: PlanFrequencyField, value: string) => {
      const numericValue = Number(value);
      setter((current) => applyPlanGoalUpdate(current, plan, field, Number.isFinite(numericValue) ? numericValue : 0));
    };

  const handleDefaultPlanGoalChange = handlePlanGoalChange((updater) => setDefaultGoals(updater));
  const handleOverridePlanGoalChange = handlePlanGoalChange((updater) => {
    setOverrideGoals((current) => {
      if (!current) return current;
      return updater(current);
    });
  });

  const overridesForTable = useMemo(() => goalsResponse?.overrides || [], [goalsResponse?.overrides]);

  if (authLoading || goalsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !user || !isAdminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
              <p className="text-gray-600">Admin access is required to manage performance goals.</p>
              <Link href="/login">
                <Button>Return to Login</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  const hasExistingOverride = overridesForTable.some((record) => record.agentId === selectedAgentId);

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Admin
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Performance Goals</h1>
              <p className="text-gray-600">Define enrollment, revenue, and commission targets.</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-white">Admin Tools</Badge>
        </div>

        <Alert>
          <AlertDescription>
            Defaults apply to every agent unless a custom override is saved. Goals feed directly into the agent dashboard to power progress bars and callouts.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-600" />
              Default Goals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              {(Object.keys(periodLabels) as GoalPeriod[]).map((period) => (
                <div key={period} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">{periodLabels[period]}</h3>
                    <Badge variant="outline" className="bg-gray-50">Platform</Badge>
                  </div>
                  {metricFields.map(({ key, label, prefix }) => (
                    <div key={`${period}-${key}`} className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">{label}</label>
                      <div className="flex items-center gap-2">
                        {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
                        <Input
                          type="number"
                          value={defaultGoals[period][key] ?? 0}
                          onChange={(event) => handleDefaultMetricChange(period, key, event.target.value)}
                          min={0}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Plan-specific enrollment goals</h3>
              {goalsResponse?.plans?.length ? (
                <div className="space-y-4">
                  {goalsResponse.plans.map((plan) => (
                    <div key={plan.id} className="rounded-lg border bg-white p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">{plan.name}</p>
                          <p className="text-xs text-gray-500">Plan #{plan.id}</p>
                        </div>
                        <Badge variant="outline">Default</Badge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        {planFields.map(({ key, label }) => (
                          <div key={`${plan.id}-${key}`} className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">{label} Enrollments</label>
                            <Input
                              type="number"
                              min={0}
                              value={getPlanGoalValue(defaultGoals, plan.id, key)}
                              onChange={(event) => handleDefaultPlanGoalChange(plan, key, event.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No active plans found.</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => updateDefaultsMutation.mutate(defaultGoals)}
                disabled={updateDefaultsMutation.isLoading}
              >
                {updateDefaultsMutation.isLoading ? "Saving..." : "Save Defaults"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Agent Overrides
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Select Agent</label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">-- None --</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {formatAgentLabel(agent)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedAgent && (
                <Alert>
                  <AlertDescription>
                    Editing goals for <span className="font-semibold">{formatAgentLabel(selectedAgent)}</span>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {selectedAgentId ? (
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-3">
                  {(Object.keys(periodLabels) as GoalPeriod[]).map((period) => (
                    <div key={`override-${period}`} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">{periodLabels[period]}</h3>
                        {hasExistingOverride ? (
                          <Badge variant="outline" className="bg-blue-50">Override</Badge>
                        ) : (
                          <Badge variant="outline">Inherits</Badge>
                        )}
                      </div>
                      {metricFields.map(({ key, label, prefix }) => (
                        <div key={`override-${period}-${key}`} className="space-y-1">
                          <label className="text-xs text-gray-600">{label}</label>
                          <div className="flex items-center gap-2">
                            {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
                            <Input
                              type="number"
                              min={0}
                              value={overrideGoals?.[period][key] ?? 0}
                              onChange={(event) => handleOverrideMetricChange(period, key, event.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">Plan enrollment goals</h3>
                  {goalsResponse?.plans?.length ? (
                    <div className="space-y-4">
                      {goalsResponse.plans.map((plan) => (
                        <div key={`override-plan-${plan.id}`} className="rounded-lg border bg-white p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-semibold text-gray-900">{plan.name}</p>
                              <p className="text-xs text-gray-500">Plan #{plan.id}</p>
                            </div>
                            <Badge variant="outline" className="bg-blue-50">Agent</Badge>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            {planFields.map(({ key, label }) => (
                              <div key={`override-${plan.id}-${key}`} className="space-y-1">
                                <label className="text-xs text-gray-600">{label} Enrollments</label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={overrideGoals ? getPlanGoalValue(overrideGoals, plan.id, key) : 0}
                                  onChange={(event) => handleOverridePlanGoalChange(plan, key, event.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No plans available for overrides.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 justify-end">
                  <Button
                    variant="outline"
                    disabled={!hasExistingOverride || deleteOverrideMutation.isLoading}
                    onClick={() => deleteOverrideMutation.mutate()}
                  >
                    {deleteOverrideMutation.isLoading ? "Removing..." : "Remove Override"}
                  </Button>
                  <Button
                    disabled={!overrideGoals || saveOverrideMutation.isLoading}
                    onClick={() => saveOverrideMutation.mutate()}
                  >
                    {saveOverrideMutation.isLoading ? "Saving..." : "Save Override"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Select an agent to configure custom goals.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            {overridesForTable.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Weekly Enrollments</TableHead>
                      <TableHead>Monthly Enrollments</TableHead>
                      <TableHead>Monthly Revenue</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overridesForTable.map((record) => (
                      <TableRow key={record.agentId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{record.agent ? formatAgentLabel(record.agent) : record.agentId}</span>
                            <span className="text-xs text-gray-500">Override</span>
                          </div>
                        </TableCell>
                        <TableCell>{record.goals.weekly.enrollments ?? 0}</TableCell>
                        <TableCell>{record.goals.monthly.enrollments ?? 0}</TableCell>
                        <TableCell>${record.goals.monthly.revenue ?? 0}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "--"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No overrides have been created yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AdminPerformanceGoals;
