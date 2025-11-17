import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, RefreshCw, Database, Search } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminDataViewer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState("users");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });

  // Set up real-time subscriptions for data viewer
  useEffect(() => {
    console.log('[AdminDataViewer] Setting up real-time subscriptions...');
    
    const dataViewerSubscription = supabase
      .channel('admin-data-viewer-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          console.log('[AdminDataViewer] Users table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/database', 'users'] });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'members' },
        (payload) => {
          console.log('[AdminDataViewer] Members table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/database', 'members'] });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'commissions' },
        (payload) => {
          console.log('[AdminDataViewer] Commissions table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/database', 'commissions'] });
          toast({
            title: "Data Updated",
            description: "Commission data has been updated in real-time",
          });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'subscriptions' },
        (payload) => {
          console.log('[AdminDataViewer] Subscriptions table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/database', 'subscriptions'] });
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          console.log('[AdminDataViewer] Payments table change:', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/database', 'payments'] });
        }
      )
      .subscribe();

    return () => {
      console.log('[AdminDataViewer] Cleaning up real-time subscriptions...');
      dataViewerSubscription.unsubscribe();
    };
  }, [queryClient, toast]);
  
  // Placeholder for safeAgents - replace with actual data fetching if needed
  const safeAgents = [
    { id: "agent1", firstName: "John", lastName: "Doe", agentNumber: "A001" },
    { id: "agent2", firstName: "Jane", lastName: "Smith", agentNumber: "A002" },
  ];

  // Fetch data for selected table
  const { data: tableData, isLoading, refetch } = useQuery({
    queryKey: ['/api/admin/database', selectedTable],
    queryFn: async () => {
      const response = await apiRequest(`/api/admin/database/${selectedTable}`, {
        method: "GET"
      });
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      return response.json();
    }
  });

  // Fetch database stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/database/stats'],
    queryFn: async () => {
      const response = await apiRequest('/api/admin/database/stats', {
        method: "GET"
      });
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      return response.json();
    }
  });

  const exportToCSV = () => {
    if (!tableData || !tableData.data || tableData.data.length === 0) {
      toast({
        title: "No Data",
        description: "No data available to export",
        variant: "destructive"
      });
      return;
    }

    const headers = Object.keys(tableData.data[0]);
    const csvContent = [
      headers.join(','),
      ...tableData.data.map((row: any) => 
        headers.map(header => {
          const value = row[header];
          // Handle null, dates, and strings with commas
          if (value === null) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTable}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `${selectedTable} data exported to CSV`,
    });
  };

  const tables = [
    { id: 'users', name: 'Users', description: 'All user accounts' },
    { id: 'leads', name: 'Leads', description: 'Sales leads' },
    { id: 'subscriptions', name: 'Subscriptions', description: 'Active subscriptions' },
    { id: 'plans', name: 'Plans', description: 'Membership plans' },
    { id: 'family_members', name: 'Family Members', description: 'Family plan members' },
    { id: 'payments', name: 'Payments', description: 'Payment records' },
    { id: 'lead_activities', name: 'Lead Activities', description: 'Lead interaction history' },
    { id: 'commissions', name: 'Commissions', description: 'Agent commission records' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/admin">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <Database className="h-6 w-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">Database Viewer</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={exportToCSV}
                disabled={!tableData || tableData.data?.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
          {/* Filters Row */}
          <div className="flex flex-wrap items-center justify-between mt-6 space-y-4 md:space-y-0 md:space-x-6">
            
              <div className="flex items-center space-x-2">
                <label htmlFor="admin-db-search" className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="admin-db-search"
                    name="search"
                    type="text"
                    placeholder="Name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-db-agent-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <Select
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                  name="agentFilter"
                >
                  <SelectTrigger id="admin-db-agent-filter">
                    <SelectValue placeholder="All Agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {safeAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.firstName} {agent.lastName}
                        {agent.agentNumber && ` (${agent.agentNumber})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="admin-db-status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter} name="statusFilter">
                  <SelectTrigger id="admin-db-status-filter">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="admin-db-start-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <Input
                  id="admin-db-start-date"
                  name="startDate"
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) =>
                    setDateFilter({ ...dateFilter, startDate: e.target.value })
                  }
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="admin-db-end-date" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <Input
                  id="admin-db-end-date"
                  name="endDate"
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) =>
                    setDateFilter({ ...dateFilter, endDate: e.target.value })
                  }
                  autoComplete="off"
                />
              </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {stats.map((stat: any) => (
              <Card key={stat.table}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {stat.table}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.count}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Table Viewer */}
        <Card>
          <CardHeader>
            <CardTitle>Database Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTable} onValueChange={setSelectedTable}>
              <TabsList className="grid grid-cols-7 w-full">
                {tables.map(table => (
                  <TabsTrigger key={table.id} value={table.id}>
                    {table.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {tables.map(table => (
                <TabsContent key={table.id} value={table.id}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600">{table.description}</p>
                      <p className="text-sm text-gray-600">
                        {tableData?.data?.length || 0} records
                      </p>
                    </div>

                    {isLoading ? (
                      <div className="text-center py-8">Loading...</div>
                    ) : tableData?.data && tableData.data.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {Object.keys(tableData.data[0]).map((header) => (
                                <TableHead key={header} className="font-medium">
                                  {header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableData.data.map((row: any, index: number) => (
                              <TableRow key={index}>
                                {Object.values(row).map((value: any, i: number) => (
                                  <TableCell key={i} className="text-sm">
                                    {value === null ? (
                                      <span className="text-gray-400">null</span>
                                    ) : typeof value === 'boolean' ? (
                                      <span className={value ? 'text-green-600' : 'text-red-600'}>
                                        {value.toString()}
                                      </span>
                                    ) : typeof value === 'object' ? (
                                      <span className="text-gray-600">
                                        {JSON.stringify(value)}
                                      </span>
                                    ) : (
                                      value.toString()
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No data found in {table.name}
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}