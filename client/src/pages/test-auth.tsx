import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, getCurrentUser } from "@/lib/supabase";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

export default function TestAuth() {
  const { user, session, isAuthenticated } = useAuth();
  const [testResults, setTestResults] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    runTests();
  }, []);

  const runTests = async () => {
    setLoading(true);
    const results: any = {};
    
    // Test 1: Check Supabase session
    try {
      const session = await getSession();
      results.supabaseSession = {
        success: !!session,
        hasToken: !!session?.access_token,
        tokenPreview: session?.access_token?.substring(0, 30) + '...',
        userEmail: session?.user?.email
      };
    } catch (error: any) {
      results.supabaseSession = { error: error.message };
    }
    
    // Test 2: Check Supabase current user
    try {
      const user = await getCurrentUser();
      results.supabaseUser = {
        success: !!user,
        userId: user?.id,
        email: user?.email
      };
    } catch (error: any) {
      results.supabaseUser = { error: error.message };
    }
    
    // Test 3: Check useAuth hook
    results.useAuthHook = {
      isAuthenticated,
      hasUser: !!user,
      userEmail: user?.email,
      userRole: user?.role,
      hasSession: !!session
    };
    
    // Test 4: Test API call to /api/auth/user
    try {
      const response = await apiRequest('/api/auth/user', {
        method: 'GET'
      });
      results.apiAuthUser = {
        success: true,
        data: response
      };
    } catch (error: any) {
      results.apiAuthUser = {
        success: false,
        error: error.message,
        status: error.status
      };
    }
    
    // Test 5: Test API call to /api/admin/leads
    try {
      const response = await apiRequest('/api/admin/leads', {
        method: 'GET'
      });
      results.apiAdminLeads = {
        success: true,
        leadCount: response.length
      };
    } catch (error: any) {
      results.apiAdminLeads = {
        success: false,
        error: error.message,
        status: error.status
      };
    }
    
    // Test 6: Direct fetch with manual token
    try {
      const session = await getSession();
      if (session?.access_token) {
        const response = await fetch('/api/admin/leads', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const data = await response.json();
        results.directFetch = {
          success: response.ok,
          status: response.status,
          data: response.ok ? data : data.message
        };
      } else {
        results.directFetch = { error: 'No session token available' };
      }
    } catch (error: any) {
      results.directFetch = { error: error.message };
    }
    
    setTestResults(results);
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Authentication Test Page</CardTitle>
          <CardDescription>Testing authentication and API connectivity</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runTests} disabled={loading} className="mb-4">
            {loading ? 'Running Tests...' : 'Run Tests Again'}
          </Button>
          
          <div className="space-y-4">
            {Object.entries(testResults).map(([key, value]) => (
              <div key={key} className="border p-3 rounded">
                <h3 className="font-semibold mb-2">{key}</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}