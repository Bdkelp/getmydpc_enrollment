import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestDataFetch() {
  const { user, session } = useAuth();
  const [enrollmentsData, setEnrollmentsData] = useState<any>(null);
  const [leadsData, setLeadsData] = useState<any>(null);
  const [enrollmentsError, setEnrollmentsError] = useState<string>('');
  const [leadsError, setLeadsError] = useState<string>('');
  
  const testEnrollments = async () => {
    if (!session?.access_token) {
      setEnrollmentsError('No access token available');
      return;
    }
    
    try {
      const response = await fetch('/api/admin/enrollments', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.text();
      
      if (!response.ok) {
        setEnrollmentsError(`HTTP ${response.status}: ${data}`);
        setEnrollmentsData(null);
      } else {
        setEnrollmentsData(JSON.parse(data));
        setEnrollmentsError('');
      }
    } catch (error) {
      setEnrollmentsError(`Error: ${error}`);
      setEnrollmentsData(null);
    }
  };
  
  const testLeads = async () => {
    if (!session?.access_token) {
      setLeadsError('No access token available');
      return;
    }
    
    try {
      const response = await fetch('/api/admin/leads', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.text();
      
      if (!response.ok) {
        setLeadsError(`HTTP ${response.status}: ${data}`);
        setLeadsData(null);
      } else {
        setLeadsData(JSON.parse(data));
        setLeadsError('');
      }
    } catch (error) {
      setLeadsError(`Error: ${error}`);
      setLeadsData(null);
    }
  };
  
  useEffect(() => {
    if (session?.access_token) {
      testEnrollments();
      testLeads();
    }
  }, [session]);
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">API Test Page</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Authentication Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>Logged In:</strong> {user ? 'Yes' : 'No'}</p>
              <p><strong>User Email:</strong> {user?.email || 'N/A'}</p>
              <p><strong>User Role:</strong> {user?.role || 'N/A'}</p>
              <p><strong>Has Token:</strong> {session?.access_token ? 'Yes' : 'No'}</p>
              <p><strong>Token Preview:</strong> {session?.access_token?.substring(0, 30)}...</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Enrollments API Test</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={testEnrollments} className="mb-4">Test Enrollments API</Button>
            {enrollmentsError && (
              <div className="p-4 bg-red-100 text-red-700 rounded mb-4">
                <strong>Error:</strong> {enrollmentsError}
              </div>
            )}
            {enrollmentsData && (
              <div className="p-4 bg-green-100 text-green-700 rounded">
                <strong>Success!</strong> Found {Array.isArray(enrollmentsData) ? enrollmentsData.length : 0} enrollments
                <pre className="mt-2 text-xs overflow-auto max-h-48">
                  {JSON.stringify(enrollmentsData, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Leads API Test</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={testLeads} className="mb-4">Test Leads API</Button>
            {leadsError && (
              <div className="p-4 bg-red-100 text-red-700 rounded mb-4">
                <strong>Error:</strong> {leadsError}
              </div>
            )}
            {leadsData && (
              <div className="p-4 bg-green-100 text-green-700 rounded">
                <strong>Success!</strong> Found {Array.isArray(leadsData) ? leadsData.length : 0} leads
                <pre className="mt-2 text-xs overflow-auto max-h-48">
                  {JSON.stringify(leadsData, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}