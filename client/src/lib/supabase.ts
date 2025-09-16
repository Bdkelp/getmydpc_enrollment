import { createClient } from '@supabase/supabase-js';

// Clean up URL - remove any quotes that might be in the environment variable
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/['"]/g, '') || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: window.localStorage,
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
    // Use default storage key - removing custom key to avoid issues
  }
});

// Check if profile images bucket exists (only when explicitly called)
export async function checkProfileImagesBucket() {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.warn('Storage access limited:', listError.message);
      return { exists: false, error: listError };
    }

    const bucketExists = buckets?.some(bucket => bucket.name === 'profile-images');
    
    if (bucketExists) {
      console.log('Profile-images bucket exists and accessible');
      return { exists: true, error: null };
    } else {
      console.warn('Profile-images bucket not found - profile uploads may not work');
      return { exists: false, error: null };
    }
  } catch (error) {
    console.warn('Storage check failed:', error);
    return { exists: false, error };
  }
}

// Auth helper functions
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  return { data, error };
};

export const signUp = async (email: string, password: string, metadata?: any) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  });

  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  });

  return { data, error };
};

export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  return session;
};

export const getUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return user;
};

export const signInWithOAuth = async (provider: 'google' | 'facebook' | 'twitter' | 'linkedin' | 'microsoft' | 'apple') => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth-callback`
      }
    });

    if (error) {
      // Handle specific OAuth errors
      if (error.message?.includes('provider is not enabled')) {
        return { 
          data: null, 
          error: {
            ...error,
            message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} login is not configured. Please use email/password login instead.`
          }
        };
      }
      return { data, error };
    }

    return { data, error };
  } catch (err: any) {
    return {
      data: null,
      error: {
        message: `Social login with ${provider} is currently unavailable. Please use email/password login.`,
        __isAuthError: true,
        name: 'AuthApiError',
        status: 400
      }
    };
  }
};

export const onAuthStateChange = (callback: (event: any, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};

// Monitor and handle token refresh
export const setupTokenRefreshHandling = () => {
  return supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase] Auth event:', event);
    
    switch (event) {
      case 'TOKEN_REFRESHED':
        console.log('[Supabase] Token refreshed successfully');
        // Store the new token if needed
        if (session?.access_token) {
          localStorage.setItem('supabase_token', session.access_token);
        }
        break;
        
      case 'SIGNED_OUT':
        console.log('[Supabase] User signed out');
        // Clear stored tokens
        localStorage.removeItem('supabase_token');
        localStorage.removeItem('auth_token');
        break;
        
      case 'SIGNED_IN':
        console.log('[Supabase] User signed in');
        if (session?.access_token) {
          localStorage.setItem('supabase_token', session.access_token);
        }
        break;
    }
  });
};

// Force token refresh if needed
export const refreshSession = async () => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.error('[Supabase] Failed to refresh session:', error);
      return { data: null, error };
    }
    console.log('[Supabase] Session refreshed successfully');
    return { data, error: null };
  } catch (err) {
    console.error('[Supabase] Error refreshing session:', err);
    return { data: null, error: err };
  }
};

// Safe storage upload with error handling
export const uploadProfileImage = async (file: File, userId: string) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Math.random()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { data, error } = await supabase.storage
      .from('profile-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Storage upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profile-images')
      .getPublicUrl(filePath);

    return { data: { path: filePath, publicUrl }, error: null };
  } catch (error) {
    console.error('Profile image upload failed:', error);
    return { data: null, error };
  }
};

// Safe storage delete
export const deleteProfileImage = async (filePath: string) => {
  try {
    const { error } = await supabase.storage
      .from('profile-images')
      .remove([filePath]);

    if (error) {
      console.error('Storage delete error:', error);
      throw error;
    }

    return { error: null };
  } catch (error) {
    console.error('Profile image delete failed:', error);
    return { error };
  }
};