import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getCurrentUserId } from './supa';
import { generateRunSeed } from '../game/rng';

/**
 * Lobby management with code-based joining and 3-player cap
 */

export interface LobbyMember {
  lobby_id: string;
  user_id: string;
  name: string;
  is_host: boolean;
  ready: boolean;
  joined_at: string;
}

export interface Lobby {
  id: string;
  code: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
}

export interface LobbyState {
  lobby: Lobby;
  members: LobbyMember[];
}

export interface LobbyHandlers {
  onMembersChange?: (members: LobbyMember[]) => void;
  onLobbyUpdate?: (lobby: Lobby) => void;
  onGameStart?: (startedAt: string) => void;
}

const MAX_LOBBY_SIZE = 3;
const CODE_LENGTH = 5;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars

/**
 * Generate a random 5-character lobby code
 */
function generateLobbyCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Create a new lobby with the current user as host
 * @param name - Display name for the host
 * @returns Lobby ID and join code
 */
export async function createLobby(name: string): Promise<{ id: string; code: string }> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated. Call signInAnonymously first.');
  }

  // Generate unique code (retry if collision)
  let code = generateLobbyCode();
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    // Insert lobby
    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .insert({
        code,
        created_by: userId,
      })
      .select()
      .single();

    if (lobbyError) {
      // If code collision, retry with new code
      if (lobbyError.code === '23505') {
        code = generateLobbyCode();
        retries++;
        continue;
      }
      throw new Error(`Failed to create lobby: ${lobbyError.message}`);
    }

    if (!lobby) {
      throw new Error('Failed to create lobby: no data returned');
    }

    // Insert host as first member
    const { error: memberError } = await supabase.from('lobby_members').insert({
      lobby_id: lobby.id,
      user_id: userId,
      name,
      is_host: true,
      ready: false,
    });

    if (memberError) {
      // Cleanup lobby on failure
      await supabase.from('lobbies').delete().eq('id', lobby.id);
      throw new Error(`Failed to add host to lobby: ${memberError.message}`);
    }

    console.log(`Created lobby: ${lobby.id} with code: ${code}`);
    return { id: lobby.id, code: lobby.code };
  }

  throw new Error('Failed to generate unique lobby code after retries');
}

/**
 * Join an existing lobby by code
 * @param code - 5-character lobby code
 * @param name - Display name for the joining player
 * @returns Lobby ID
 */
export async function joinLobbyByCode(code: string, name: string): Promise<string> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated. Call signInAnonymously first.');
  }

  // Find lobby by code
  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, started_at')
    .eq('code', code.toUpperCase())
    .single();

  if (lobbyError || !lobby) {
    throw new Error(`Lobby not found with code: ${code}`);
  }

  if (lobby.started_at) {
    throw new Error('Lobby has already started');
  }

  // Check current member count (client-side guard for UX)
  const { data: members, error: countError } = await supabase
    .from('lobby_members')
    .select('user_id')
    .eq('lobby_id', lobby.id);

  if (countError) {
    throw new Error(`Failed to check lobby capacity: ${countError.message}`);
  }

  if (members && members.length >= MAX_LOBBY_SIZE) {
    throw new Error(`Lobby is full (max ${MAX_LOBBY_SIZE} players)`);
  }

  // Check if already a member
  const isAlreadyMember = members?.some((m) => m.user_id === userId);
  if (isAlreadyMember) {
    console.log(`Already a member of lobby: ${lobby.id}`);
    return lobby.id;
  }

  // Insert membership (RLS enforces capacity at DB level)
  const { error: memberError } = await supabase.from('lobby_members').insert({
    lobby_id: lobby.id,
    user_id: userId,
    name,
    is_host: false,
    ready: false,
  });

  if (memberError) {
    // Check if capacity error
    if (memberError.message.includes('capacity')) {
      throw new Error(`Lobby is full (max ${MAX_LOBBY_SIZE} players)`);
    }
    throw new Error(`Failed to join lobby: ${memberError.message}`);
  }

  console.log(`Joined lobby: ${lobby.id} (code: ${code})`);
  return lobby.id;
}

/**
 * Subscribe to lobby updates via Realtime
 * @param lobbyId - Lobby to subscribe to
 * @param handlers - Callbacks for different events
 * @returns Unsubscribe function
 */
export function subscribeLobby(
  lobbyId: string,
  handlers: LobbyHandlers
): () => void {
  const supabase = getSupabase();
  const channels: RealtimeChannel[] = [];

  // Subscribe to lobby_members changes
  const membersChannel = supabase
    .channel(`lobby_members:${lobbyId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lobby_members',
        filter: `lobby_id=eq.${lobbyId}`,
      },
      async () => {
        // Fetch updated members list
        const { data: members } = await supabase
          .from('lobby_members')
          .select('*')
          .eq('lobby_id', lobbyId)
          .order('joined_at', { ascending: true });

        if (members && handlers.onMembersChange) {
          handlers.onMembersChange(members);
        }
      }
    )
    .subscribe();

  channels.push(membersChannel);

  // Subscribe to lobby changes
  const lobbyChannel = supabase
    .channel(`lobbies:${lobbyId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'lobbies',
        filter: `id=eq.${lobbyId}`,
      },
      (payload) => {
        const lobby = payload.new as Lobby;
        if (handlers.onLobbyUpdate) {
          handlers.onLobbyUpdate(lobby);
        }
        if (lobby.started_at && handlers.onGameStart) {
          handlers.onGameStart(lobby.started_at);
        }
      }
    )
    .subscribe();

  channels.push(lobbyChannel);

  console.log(`Subscribed to lobby: ${lobbyId}`);

  // Return unsubscribe function
  return () => {
    channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    console.log(`Unsubscribed from lobby: ${lobbyId}`);
  };
}

/**
 * Set ready state for current user in lobby
 * @param lobbyId - Lobby ID
 * @param ready - Ready state
 */
export async function setReady(lobbyId: string, ready: boolean): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const { error } = await supabase
    .from('lobby_members')
    .update({ ready })
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to set ready state: ${error.message}`);
  }

  console.log(`Set ready: ${ready} in lobby: ${lobbyId}`);
}

/**
 * Leave a lobby
 * @param lobbyId - Lobby ID
 */
export async function leaveLobby(lobbyId: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const { error } = await supabase
    .from('lobby_members')
    .delete()
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to leave lobby: ${error.message}`);
  }

  console.log(`Left lobby: ${lobbyId}`);
}

/**
 * Start the game (host only)
 * @param lobbyId - Lobby ID
 * @returns Seed for the run
 */
export async function startGame(lobbyId: string): Promise<number> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  // Verify host status
  const { data: member } = await supabase
    .from('lobby_members')
    .select('is_host')
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId)
    .single();

  if (!member?.is_host) {
    throw new Error('Only the host can start the game');
  }

  const seed = generateRunSeed();

  const { error } = await supabase
    .from('lobbies')
    .update({ started_at: new Date().toISOString() })
    .eq('id', lobbyId);

  if (error) {
    throw new Error(`Failed to start game: ${error.message}`);
  }

  console.log(`Started game in lobby: ${lobbyId} with seed: ${seed}`);
  return seed;
}

/**
 * Get current lobby state (one-time fetch)
 * @param lobbyId - Lobby ID
 * @returns Current lobby state
 */
export async function getLobbyState(lobbyId: string): Promise<LobbyState> {
  const supabase = getSupabase();

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('*')
    .eq('id', lobbyId)
    .single();

  if (lobbyError || !lobby) {
    throw new Error(`Failed to fetch lobby: ${lobbyError?.message}`);
  }

  const { data: members, error: membersError } = await supabase
    .from('lobby_members')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true });

  if (membersError) {
    throw new Error(`Failed to fetch members: ${membersError.message}`);
  }

  return {
    lobby,
    members: members || [],
  };
}

