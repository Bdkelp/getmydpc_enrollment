import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, RefreshCw, Database } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminDataViewer() {
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState("users");

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