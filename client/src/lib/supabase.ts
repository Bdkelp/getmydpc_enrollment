import { createClient } from '@supabase/supabase-js';

// Get environment variables and ensure they're strings without quotes
const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Remove any surrounding quotes that might have been added
const supabaseUrl = typeof rawUrl === 'string' ? rawUrl.replace(/^['"]|['"]$/g, '').trim() : '';
const supabaseAnonKey = typeof rawKey === 'string' ? rawKey.replace(/^['"]|['"]$/g, '').trim() : '';

// Configuration loaded successfully

// Check if properly initialized
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration missing. Please check environment variables.');
  throw new Error('Supabase configuration missing');
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch (e) {
  console.error('Invalid Supabase URL format');
  throw new Error(`Invalid Supabase URL: ${supabaseUrl}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helper functions
export const signUp = async (email: string, password: string, userData?: any) => {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData
    }
  });
};

// Sign in with email and password
export async function signIn(email: string, password: string) {
  try {
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (result.data.session) {
      console.log("Session established successfully");
      // Ensure session is persisted
      await supabase.auth.setSession(result.data.session);
    }

    return result;
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  }
}

export const signInWithOAuth = async (provider: 'google' | 'facebook' | 'twitter' | 'linkedin' | 'apple') => {
  const redirectTo = `${window.location.origin}/auth/callback`;

  return await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo
    }
  });
};

export const signOut = async () => {
  return await supabase.auth.signOut();
};

export const resetPassword = async (email: string) => {
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  });
};

export const updatePassword = async (password: string) => {
  return await supabase.auth.updateUser({ password });
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Get current session
export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error("Error getting session:", error);
      return null;
    }
    return session;
  } catch (error) {
    console.error("Failed to get session:", error);
    return null;
  }
}

// Listen for auth state changes
export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};