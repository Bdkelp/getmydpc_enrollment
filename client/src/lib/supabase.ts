import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/['"]/g, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.replace(/['"]/g, '');

// Check if properly initialized
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration missing. Please check environment variables.', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    url: supabaseUrl,
    keyPreview: supabaseAnonKey?.substring(0, 20) + '...'
  });
  throw new Error('Supabase configuration missing');
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

export const signIn = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({
    email,
    password
  });
};

export const signInWithOAuth = async (provider: 'google' | 'facebook' | 'twitter' | 'linkedin' | 'microsoft' | 'apple') => {
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

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Listen for auth state changes
export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};