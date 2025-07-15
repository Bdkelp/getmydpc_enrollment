import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          toast({
            title: "Authentication failed",
            description: error.message,
            variant: "destructive",
          });
          setLocation("/login");
          return;
        }

        if (data.session) {
          toast({
            title: "Welcome!",
            description: "You have been successfully logged in.",
          });
          setLocation("/");
        } else {
          setLocation("/login");
        }
      } catch (error: any) {
        toast({
          title: "Authentication error",
          description: error.message || "Something went wrong",
          variant: "destructive",
        });
        setLocation("/login");
      }
    };

    handleAuthCallback();
  }, [setLocation, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-medical-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}