import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/apiClient";
import { hasAtLeastRole } from "@/lib/roles";

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  // Get user email from localStorage (set during login)
  const userEmail = localStorage.getItem('password_change_email') || '';

  const handlePasswordChange = async (e: any) => {
    e.preventDefault();
    
    if (!userEmail) {
      toast({
        title: "Error",
        description: "No user email found. Please log in again.",
        variant: "destructive"
      });
      setLocation('/login');
      return;
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive"
      });
      return;
    }

    if (passwords.newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long",
        variant: "destructive"
      });
      return;
    }

    if (passwords.currentPassword === passwords.newPassword) {
      toast({
        title: "Error",
        description: "New password must be different from current password",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Sign in with current password to get a session
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: passwords.currentPassword
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      if (!authData.session) {
        throw new Error('Failed to establish session');
      }

      // Step 2: Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwords.newPassword
      });

      if (updateError) {
        throw updateError;
      }

      // Step 3: Update password_change_required flag in backend
      const response = await apiClient.post('/api/auth/password-change-completed');

      if (!response) {
        console.warn('No response from password-change-completed endpoint, but password was updated');
      }

      // Clear the stored email
      localStorage.removeItem('password_change_email');

      toast({
        title: "Success!",
        description: "Your password has been changed successfully. Redirecting...",
      });

      // Determine redirect based on user role
      const userRole = authData.user?.user_metadata?.role || 'agent';
      const isAdminUser = hasAtLeastRole(userRole, 'admin');
      const isAgentOrAbove = hasAtLeastRole(userRole, 'agent');
      
      setTimeout(() => {
        if (isAdminUser) {
          setLocation('/admin');
        } else if (isAgentOrAbove) {
          setLocation('/agent');
        } else {
          setLocation('/');
        }
      }, 1500);

    } catch (error: any) {
      console.error('Password change error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to change password. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Change Your Password</CardTitle>
          <CardDescription>
            For security reasons, you must change your password before continuing.
            {userEmail && <div className="mt-2 text-sm font-medium">Account: {userEmail}</div>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="Enter current password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                required
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Enter new password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                required
                minLength={8}
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500">At least 8 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                required
                minLength={8}
                disabled={isLoading}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? "Changing Password..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
