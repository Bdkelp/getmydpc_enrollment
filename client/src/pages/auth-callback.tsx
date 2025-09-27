import { useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const provider = urlParams.get('provider');

        if (!token) {
          throw new Error('No authentication token found');
        }

        // Set the session in Supabase
        const { data, error } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: '', // Will be handled by the backend
        });

        if (error) {
          throw error;
        }

        toast({
          title: "Login Successful",
          description: `Successfully logged in with ${provider}`,
        });

        // Redirect to dashboard after successful authentication
        setTimeout(() => {
          setLocation('/');
        }, 1000);

      } catch (error: any) {
        console.error('Auth callback error:', error);
        toast({
          title: "Authentication Error",
          description: error.message || 'Failed to complete authentication',
          variant: "destructive",
        });

        // Redirect back to login after error
        setTimeout(() => {
          setLocation('/login');
        }, 2000);
      }
    };

    handleAuthCallback();
  }, [setLocation, toast]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner className="mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Completing Authentication</h2>
        <p className="text-gray-600">Please wait while we log you in...</p>
      </div>
    </div>
  );
}