import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function AuthDebug() {
  const { user, session, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("michael@mypremierplans.com");
  const [password, setPassword] = useState("TempAdmin2025!");
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const testLogin = async () => {
    setLoading(true);
    setDebugInfo({});
    
    try {
      // Step 1: Try Supabase login
      console.log("Step 1: Attempting Supabase login...");
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (authError) {
        setDebugInfo(prev => ({
          ...prev,
          supabaseError: authError.message,
          step1: "❌ Supabase login failed"
        }));
        setLoading(false);
        return;
      }
      
      setDebugInfo(prev => ({
        ...prev,
        step1: "✅ Supabase login successful",
        supabaseUser: authData.user?.email,
        hasToken: !!authData.session?.access_token
      }));
      
      // Step 2: Check session storage
      console.log("Step 2: Checking session storage...");
      const { data: { session: storedSession } } = await supabase.auth.getSession();
      
      setDebugInfo(prev => ({
        ...prev,
        step2: storedSession ? "✅ Session stored" : "❌ No session stored",
        sessionUser: storedSession?.user?.email
      }));
      
      // Step 3: Test backend API
      console.log("Step 3: Testing backend API...");
      if (authData.session?.access_token) {
        const response = await fetch('/api/auth/user', {
          headers: {
            'Authorization': `Bearer ${authData.session.access_token}`
          }
        });
        
        const responseData = response.ok ? await response.json() : null;
        
        setDebugInfo(prev => ({
          ...prev,
          step3: response.ok ? "✅ Backend API working" : `❌ Backend API failed (${response.status})`,
          backendResponse: responseData,
          userRole: responseData?.role
        }));
      }
      
    } catch (error: any) {
      setDebugInfo(prev => ({
        ...prev,
        generalError: error.message
      }));
    } finally {
      setLoading(false);
    }
  };
  
  const testLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };
  
  const refreshPage = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Debug Panel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">Current Auth State</h3>
                <div className="text-sm space-y-1">
                  <div>Authenticated: {isAuthenticated ? "✅ Yes" : "❌ No"}</div>
                  <div>User Email: {user?.email || "None"}</div>
                  <div>User Role: {user?.role || "None"}</div>
                  <div>Has Session: {session ? "✅ Yes" : "❌ No"}</div>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Test Login</h3>
                <div className="space-y-2">
                  <Input 
                    placeholder="Email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input 
                    type="password"
                    placeholder="Password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button onClick={testLogin} disabled={loading}>
                      {loading ? "Testing..." : "Test Login"}
                    </Button>
                    <Button onClick={testLogout} variant="outline">
                      Logout
                    </Button>
                    <Button onClick={refreshPage} variant="outline">
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            
            {Object.keys(debugInfo).length > 0 && (
              <div className="mt-4 p-4 bg-gray-100 rounded">
                <h3 className="font-semibold mb-2">Debug Information</h3>
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}