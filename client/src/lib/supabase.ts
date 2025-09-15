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

// Create profile images bucket if it doesn't exist
export async function ensureProfileImagesBucket() {
  try {
    // Check if user is authenticated before attempting bucket operations
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('No active session, skipping bucket setup');
      return;
    }

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.warn('Could not list buckets:', listError);
      return;
    }

    const bucketExists = buckets?.some(bucket => bucket.name === 'profile-images');

    if (!bucketExists) {
      // Only attempt to create bucket if user has admin privileges
      const { data: user } = await supabase.auth.getUser();
      if (user?.user?.user_metadata?.role === 'admin') {
        const { error: createError } = await supabase.storage.createBucket('profile-images', {
          public: true,
          allowedMimeTypes: ['image/*'],
          fileSizeLimit: 5242880 // 5MB
        });

        if (createError) {
        console.warn('Could not create profile-images bucket:', createError.message);
        // Don't throw error - the bucket might already exist or we might not have permissions
        // Profile uploads will handle individual upload errors gracefully
      } else {
        console.log('Profile-images bucket created successfully');
      }
    } else {
      console.log('Profile-images bucket already exists');
    }
  } } catch (error) {
    console.warn('Error in ensureProfileImagesBucket:', error);
    // Don't throw - this is not critical for app functionality
  }
}

// Initialize storage on app start
ensureProfileImagesBucket();

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