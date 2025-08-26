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
    storageKey: 'supabase.auth.token'
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
          console.warn('Error creating profile-images bucket:', createError);
        } else {
          console.log('Profile images bucket created successfully');
        }
      }
    }
  } catch (error) {
    console.warn('Storage bucket setup failed:', error);
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
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth-callback`
    }
  });

  return { data, error };
};

export const onAuthStateChange = (callback: (event: any, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};