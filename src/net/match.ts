import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getCurrentUserId } from './supa';
import { 
  ActionPlan, 
  ResolvePayload, 
  CombatMessage,
  CursorPosition,
  SelectionMessage,
  Loadout,
  parseCombatMessage,
  parseSelectionMessage
} from './proto';

/**
 * Battle match networking - real-time action coordination
 */

export interface MatchHandlers {
  onActionVote?: (plan: ActionPlan, userId: string, turn: number) => void;
  onCommitTurn?: (turn: number) => void;
  onResolveTurn?: (payload: ResolvePayload) => void;
  onCursorMove?: (cursor: CursorPosition) => void;
  onDebugSkip?: (skipType: 'next' | 'boss') => void;
}

export interface SelectionHandlers {
  onSelectionPick?: (userId: string, cardId: string) => void;
  onSelectionSwap?: (userId: string, outId: string, inId: string) => void;
  onSelectionReady?: (userId: string, ready: boolean) => void;
  onSelectionCommit?: (loadouts: Loadout[]) => void;
}

export interface MapHandlers {
  onMapVote?: (userId: string, nodeId: string) => void;
  onMapVoteResult?: (selectedNodeId: string, votes: { [nodeId: string]: string[] }) => void;
  onCursorMove?: (cursor: CursorPosition) => void;
}

/**
 * Subscribe to battle match updates
 */
export async function subscribeMatch(
  lobbyId: string,
  handlers: MatchHandlers
): Promise<() => void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  
  if (!userId) {
    throw new Error('Not authenticated');
  }

  // Create match channel with presence
  const channel = supabase.channel(`match:${lobbyId}`, {
    config: {
      broadcast: { self: true }, // Allow host to receive their own messages
      presence: { key: userId },
    },
  });

  // Listen for combat messages
  channel.on('broadcast', { event: 'combat' }, ({ payload }) => {
    console.log('Received combat message:', payload);
    
    const message = parseCombatMessage(payload);
    if (!message) {
      console.error('Invalid combat message received:', payload);
      return;
    }

    console.log('Parsed combat message:', message);

    switch (message.t) {
      case 'action_vote':
        // Only process action votes from other players (not self)
        if (message.userId !== userId && handlers.onActionVote) {
          handlers.onActionVote(message.plan, message.userId, message.turn);
        }
        break;
      
      case 'commit_turn':
        // Process commit turn from anyone (including self)
        if (handlers.onCommitTurn) {
          handlers.onCommitTurn(message.turn);
        }
        break;
      
      case 'resolve_turn':
        // Process resolve turn from anyone (including self)
        if (handlers.onResolveTurn) {
          handlers.onResolveTurn(message.payload);
        }
        break;
      
      case 'cursor_move':
        // Process cursor updates from other players (not self)
        if (message.cursor.userId !== userId && handlers.onCursorMove) {
          handlers.onCursorMove(message.cursor);
        }
        break;
      
      case 'debug_skip':
        // Process debug skip from anyone (for synchronized testing)
        if (handlers.onDebugSkip) {
          handlers.onDebugSkip(message.skipType);
        }
        break;
    }
  });

  // Subscribe to channel
  channel.subscribe((status) => {
    console.log(`Match channel status: ${status}`);
  });

  console.log(`Subscribed to match: ${lobbyId}`);

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
    console.log(`Unsubscribed from match: ${lobbyId}`);
  };
}

/**
 * Send action plan
 */
export async function sendPlan(
  lobbyId: string,
  plan: ActionPlan,
  turn: number
): Promise<void> {
  console.log(`sendPlan called: lobbyId=${lobbyId}, plan=${JSON.stringify(plan)}, turn=${turn}`);
  
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  console.log(`Current userId: ${userId}`);

  if (!userId) {
    throw new Error('Not authenticated - userId is null');
  }

  if (!lobbyId) {
    throw new Error('Lobby ID is required');
  }

  const message: CombatMessage = {
    t: 'action_vote',
    plan,
    userId,
    turn,
  };

  console.log(`Sending message:`, message);

  try {
    const channel = supabase.channel(`match:${lobbyId}`);
    const result = await channel.send({
      type: 'broadcast',
      event: 'combat',
      payload: message,
    });

    console.log(`Channel send result:`, result);
    console.log(`Sent action plan: ${plan.type} for turn ${turn}`);
  } catch (error) {
    console.error('Error in channel.send:', error);
    throw new Error(`Network error sending action plan: ${error.message || error}`);
  }
}

/**
 * Send commit turn (host only)
 */
export async function sendCommit(
  lobbyId: string,
  turn: number
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const message: CombatMessage = {
    t: 'commit_turn',
    turn,
  };

  const channel = supabase.channel(`match:${lobbyId}`);
  await channel.send({
    type: 'broadcast',
    event: 'combat',
    payload: message,
  });

  console.log(`Sent commit turn: ${turn}`);
}

/**
 * Send resolve turn (host only)
 */
export async function sendResolve(
  lobbyId: string,
  payload: ResolvePayload
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const message: CombatMessage = {
    t: 'resolve_turn',
    payload,
  };

  const channel = supabase.channel(`match:${lobbyId}`);
  await channel.send({
    type: 'broadcast',
    event: 'combat',
    payload: message,
  });

  console.log(`Sent resolve turn: ${payload.turn} with ${payload.effects.length} effects`);
}

/**
 * Send cursor position update
 */
export async function sendCursor(
  lobbyId: string,
  x: number,
  y: number,
  userName?: string,
  color?: string
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return; // Silently fail if not authenticated
  }

  const cursor: CursorPosition = {
    x,
    y,
    userId,
    userName,
    color,
  };

  const message: CombatMessage = {
    t: 'cursor_move',
    cursor,
  };

  const channel = supabase.channel(`match:${lobbyId}`);
  // Fire and forget - don't await
  channel.send({
    type: 'broadcast',
    event: 'combat',
    payload: message,
  });
}

/**
 * Send debug skip command
 */
export async function sendDebugSkip(
  lobbyId: string,
  skipType: 'next' | 'boss'
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return; // Silently fail if not authenticated
  }

  const message: CombatMessage = {
    t: 'debug_skip',
    skipType,
  };

  const channel = supabase.channel(`match:${lobbyId}`);
  await channel.send({
    type: 'broadcast',
    event: 'combat',
    payload: message,
  });

  console.log(`Sent debug skip: ${skipType}`);
}

/**
 * Get current match participants
 */
export async function getMatchParticipants(lobbyId: string): Promise<string[]> {
  const supabase = getSupabase();
  const channel = supabase.channel(`match:${lobbyId}`);

  return new Promise((resolve) => {
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const participants = Object.keys(state);
      resolve(participants);
    });

    channel.subscribe();
  });
}

/**
 * Subscribe to card selection updates
 */
export async function subscribeSelection(
  lobbyId: string,
  handlers: SelectionHandlers
): Promise<() => void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const channel = supabase.channel(`selection:${lobbyId}`, {
    config: {
      broadcast: { self: true },
      presence: { key: userId },
    },
  });

  channel.on('broadcast', { event: 'selection' }, ({ payload }) => {
    console.log('Received selection message:', payload);
    
    const message = parseSelectionMessage(payload);
    if (!message) {
      console.error('Invalid selection message received:', payload);
      return;
    }

    switch (message.t) {
      case 'selection_pick':
        if (handlers.onSelectionPick) {
          handlers.onSelectionPick(message.userId, message.cardId);
        }
        break;
      
      case 'selection_swap':
        if (handlers.onSelectionSwap) {
          handlers.onSelectionSwap(message.userId, message.outId, message.inId);
        }
        break;
      
      case 'selection_ready':
        if (handlers.onSelectionReady) {
          handlers.onSelectionReady(message.userId, message.ready);
        }
        break;
      
      case 'selection_commit':
        if (handlers.onSelectionCommit) {
          handlers.onSelectionCommit(message.loadouts);
        }
        break;
    }
  });

  channel.subscribe((status) => {
    console.log(`Selection channel status: ${status}`);
  });

  console.log(`Subscribed to selection: ${lobbyId}`);

  return () => {
    supabase.removeChannel(channel);
    console.log(`Unsubscribed from selection: ${lobbyId}`);
  };
}

/**
 * Send card pick selection
 */
export async function sendSelectPick(
  lobbyId: string,
  cardId: string
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const message: SelectionMessage = {
    t: 'selection_pick',
    userId,
    cardId,
  };

  const channel = supabase.channel(`selection:${lobbyId}`);
  await channel.send({
    type: 'broadcast',
    event: 'selection',
    payload: message,
  });

  console.log(`Sent selection pick: ${cardId}`);
}

/**
 * Send card swap selection
 */
export async function sendSelectSwap(
  lobbyId: string,
  outId: string,
  inId: string
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const message: SelectionMessage = {
    t: 'selection_swap',
    userId,
    outId,
    inId,
  };

  const channel = supabase.channel(`selection:${lobbyId}`);
  await channel.send({
    type: 'broadcast',
    event: 'selection',
    payload: message,
  });

  console.log(`Sent selection swap: ${outId} -> ${inId}`);
}

/**
 * Send ready state
 */
export async function sendSelectReady(
  lobbyId: string,
  ready: boolean
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const message: SelectionMessage = {
    t: 'selection_ready',
    userId,
    ready,
  };

  const channel = supabase.channel(`selection:${lobbyId}`);
  await channel.send({
    type: 'broadcast',
    event: 'selection',
    payload: message,
  });

  console.log(`Sent selection ready: ${ready}`);
}

/**
 * Send selection commit (host only)
 */
export async function sendSelectCommit(
  lobbyId: string,
  loadouts: Loadout[]
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const message: SelectionMessage = {
    t: 'selection_commit',
    loadouts,
  };

  const channel = supabase.channel(`selection:${lobbyId}`);
  await channel.send({
    type: 'broadcast',
    event: 'selection',
    payload: message,
  });

  console.log(`Sent selection commit with ${loadouts.length} loadouts`);
}

/**
 * Subscribe to map updates
 */
export async function subscribeMap(
  lobbyId: string,
  handlers: MapHandlers
): Promise<() => void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  
  if (!userId) {
    throw new Error('Not authenticated');
  }

  // Create map channel
  const channel = supabase.channel(`map:${lobbyId}`, {
    config: {
      broadcast: { self: true },
      presence: { key: userId },
    },
  });

  // Handle map votes
  channel.on('broadcast', { event: 'map_vote' }, (payload) => {
    console.log('Received map vote:', payload);
    const { userId: voterId, nodeId } = payload.payload;
    if (voterId !== userId) {
      handlers.onMapVote?.(voterId, nodeId);
    }
  });

  // Handle map vote results
  channel.on('broadcast', { event: 'map_vote_result' }, (payload) => {
    console.log('Received map vote result:', payload);
    const { selectedNodeId, votes } = payload.payload;
    handlers.onMapVoteResult?.(selectedNodeId, votes);
  });

  // Handle cursor movements
  channel.on('broadcast', { event: 'map_cursor' }, (payload) => {
    const cursor = payload.payload as CursorPosition;
    // Don't process our own cursor
    if (cursor.userId !== userId) {
      handlers.onCursorMove?.(cursor);
    }
  });

  // Subscribe to channel
  const { error } = await channel.subscribe();
  if (error) {
    throw new Error(`Failed to subscribe to map channel: ${error.message}`);
  }

  console.log(`Subscribed to map channel: ${lobbyId}`);

  // Return unsubscribe function
  return () => {
    channel.unsubscribe();
  };
}

/**
 * Send map vote
 */
export async function sendMapVote(lobbyId: string, nodeId: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const { error } = await supabase.channel(`map:${lobbyId}`).send({
    type: 'broadcast',
    event: 'map_vote',
    payload: {
      userId,
      nodeId,
    },
  });

  if (error) {
    console.error('Failed to send map vote:', error);
    throw new Error(`Failed to send map vote: ${error.message}`);
  }

  console.log(`Sent map vote: ${nodeId}`);
}

/**
 * Send map vote result (host only)
 */
export async function sendMapVoteResult(
  lobbyId: string, 
  selectedNodeId: string, 
  votes: { [nodeId: string]: string[] }
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.channel(`map:${lobbyId}`).send({
    type: 'broadcast',
    event: 'map_vote_result',
    payload: {
      selectedNodeId,
      votes,
    },
  });

  if (error) {
    console.error('Failed to send map vote result:', error);
    throw new Error(`Failed to send map vote result: ${error.message}`);
  }

  console.log(`Sent map vote result: ${selectedNodeId}`, votes);
}

/**
 * Send cursor position update for map scene
 */
export async function sendMapCursor(
  lobbyId: string,
  x: number,
  y: number,
  userName?: string,
  color?: string
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return; // Silently fail if not authenticated
  }

  const cursor: CursorPosition = {
    x,
    y,
    userId,
    userName,
    color,
  };

  const channel = supabase.channel(`map:${lobbyId}`);
  // Fire and forget - don't await
  channel.send({
    type: 'broadcast',
    event: 'map_cursor',
    payload: cursor,
  });
}