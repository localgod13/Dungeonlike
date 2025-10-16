import { createClient, SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';

/**
 * Supabase singleton client with anonymous auth
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase singleton client
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Missing Supabase credentials. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env'
      );
    }

    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return supabaseClient;
}

/**
 * Sign in anonymously with a display name
 * @param displayName - User's chosen display name
 * @returns Session if successful
 */
export async function signInAnonymously(displayName: string): Promise<Session | null> {
  const client = getSupabase();

  // Check if already signed in
  const { data: { session: existingSession } } = await client.auth.getSession();
  if (existingSession) {
    console.log('Already authenticated:', existingSession.user.id);
    // Update display name in metadata if changed
    await client.auth.updateUser({
      data: { display_name: displayName },
    });
    return existingSession;
  }

  // Sign in anonymously
  const { data, error } = await client.auth.signInAnonymously({
    options: {
      data: {
        display_name: displayName,
      },
    },
  });

  if (error) {
    console.error('Anonymous sign-in failed:', error);
    throw error;
  }

  console.log('Signed in anonymously:', data.session?.user.id);
  return data.session;
}

/**
 * Get current session
 */
export async function getSession(): Promise<Session | null> {
  const client = getSupabase();
  const { data: { session } } = await client.auth.getSession();
  return session;
}

/**
 * Listen to auth state changes
 * @param callback - Called when auth state changes
 * @returns Unsubscribe function
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const client = getSupabase();
  const { data: { subscription } } = client.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  const client = getSupabase();
  await client.auth.signOut();
  console.log('Signed out');
}

/**
 * Get current user ID
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id || null;
}

// Database table schemas (for reference)
export interface Database {
  public: {
    Tables: {
      lobbies: {
        Row: {
          id: string;
          code: string;
          created_by: string;
          created_at: string;
          started_at: string | null;
        };
      };
      lobby_members: {
        Row: {
          lobby_id: string;
          user_id: string;
          name: string;
          is_host: boolean;
          ready: boolean;
          joined_at: string;
        };
      };
    };
  };
}

