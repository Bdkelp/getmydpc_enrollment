import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase'; // Assuming supabase is exported from here
// Safe API request function
const safeApiRequest = async (url: string, options: any = {}) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    return response.ok;
  } catch (error) {
    console.warn('[SessionManager] API request failed:', error);
    return false;
  }
};

const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const WARNING_TIME = 30 * 1000; // 30 seconds before timeout

export function SessionManager({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update last activity timestamp in backend every 5 minutes
  const updateActivityInBackend = useCallback(async () => {
    if (isAuthenticated) {
      await safeApiRequest('/api/user/activity');
    }
  }, [isAuthenticated]);

  // Handle user logout due to inactivity
  const handleInactiveLogout = useCallback(async () => {
    setShowWarning(false);
    toast({
      title: "Session Expired",
      description: "You have been logged out due to inactivity.",
      variant: "destructive",
    });
    await signOut();
    setLocation('/login');
  }, [setLocation, toast]);

  // Reset the idle timer
  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    // Clear existing timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // Reset warning state
    setShowWarning(false);
    setCountdown(30);

    if (isAuthenticated) {
      // Set warning timeout (30 seconds before logout)
      warningTimeoutRef.current = setTimeout(() => {
        setShowWarning(true);
        setCountdown(30);

        // Start countdown
        countdownIntervalRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, IDLE_TIMEOUT - WARNING_TIME);

      // Set logout timeout
      timeoutRef.current = setTimeout(handleInactiveLogout, IDLE_TIMEOUT);
    }
  }, [isAuthenticated, handleInactiveLogout]);

  // Continue session - user clicked to stay logged in
  const continueSession = useCallback(() => {
    setShowWarning(false);
    resetIdleTimer();
    updateActivityInBackend();
    toast({
      title: "Session Extended",
      description: "Your session has been extended for another 30 minutes.",
    });
  }, [resetIdleTimer, updateActivityInBackend, toast]);

  // Track user activity and monitor token refresh
  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    const updateLastActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const checkIdleTime = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;

      if (timeSinceLastActivity >= IDLE_TIMEOUT) {
        setShowWarning(true);
      }
    };

    // Add event listeners for user activity
    events.forEach(event => {
      document.addEventListener(event, updateLastActivity, { passive: true });
    });

    // Check idle time every minute
    const idleCheckInterval = setInterval(checkIdleTime, 60000);

    // Monitor token refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('[SessionManager] Token refreshed successfully');
        // Reset activity timer on successful token refresh
        lastActivityRef.current = Date.now();
      } else if (event === 'SIGNED_OUT') {
        console.log('[SessionManager] User signed out');
        setShowWarning(false);
        // Optionally, redirect to login if not already handled by app logic
        // setLocation('/login');
      }
    });

    // Initial timer setup
    resetIdleTimer();

    // Update activity in backend every 5 minutes
    const activityInterval = setInterval(updateActivityInBackend, 5 * 60 * 1000);

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateLastActivity);
      });
      clearInterval(idleCheckInterval);
      clearInterval(activityInterval);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      subscription.unsubscribe();
    };
  }, [isAuthenticated, resetIdleTimer, updateActivityInBackend]);

  return (
    <>
      {children}

      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session Timeout Warning</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Your session will expire in <span className="font-bold text-red-600">{countdown} seconds</span> due to inactivity.</p>
              <p>Click "Continue Session" to remain logged in, or you will be automatically logged out.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleInactiveLogout}>
              Logout Now
            </AlertDialogCancel>
            <AlertDialogAction onClick={continueSession}>
              Continue Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}