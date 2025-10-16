import { z } from 'zod';

/**
 * Network protocol schemas using Zod for validation
 * Tight payloads for efficient real-time communication
 */

// Actor and combat types
export const ActorIdSchema = z.string();
export const ActorSchema = z.object({
  id: ActorIdSchema,
  side: z.enum(['party', 'enemy']),
  name: z.string(),
  hp: z.number(),
  maxHp: z.number(),
  ap: z.number(),
});

export const ActionTypeSchema = z.enum(['Attack', 'Guard', 'Skill', 'Skip', 'Card']);
export const ActionPlanSchema = z.object({
  by: ActorIdSchema,
  type: ActionTypeSchema,
  target: ActorIdSchema.optional(),
  cardId: z.string().optional(), // For Card actions
});

export const ResolveSeedSchema = z.object({
  turn: z.number(),
  seed: z.number(),
});

export const EffectSchema = z.object({
  at: z.number(),
  kind: z.enum(['hit', 'heal', 'guard', 'miss', 'vfx']),
  src: ActorIdSchema,
  dst: ActorIdSchema.optional(),
  value: z.number().optional(),
  note: z.string().optional(),
});

export const ResolvePayloadSchema = z.object({
  turn: z.number(),
  seed: z.number(),
  order: z.array(ActorIdSchema),
  effects: z.array(EffectSchema),
  post: z.array(ActorSchema),
});

// Cursor position schema
export const CursorPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  userId: z.string(),
  userName: z.string().optional(),
  color: z.string().optional(),
});

// Card selection types
export type CardId = string;

export const LoadoutSchema = z.object({
  userId: z.string(),
  cards: z.array(z.string()).max(4), // Up to 4 cards
});

export const SelectionMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('selection_pick'),
    userId: z.string(),
    cardId: z.string(),
  }),
  z.object({
    t: z.literal('selection_swap'),
    userId: z.string(),
    outId: z.string(),
    inId: z.string(),
  }),
  z.object({
    t: z.literal('selection_ready'),
    userId: z.string(),
    ready: z.boolean(),
  }),
  z.object({
    t: z.literal('selection_commit'),
    loadouts: z.array(LoadoutSchema),
  }),
]);

// Combat message types
export const CombatMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('action_vote'),
    plan: ActionPlanSchema,
    userId: z.string(),
    turn: z.number(),
  }),
  z.object({
    t: z.literal('commit_turn'),
    turn: z.number(),
  }),
  z.object({
    t: z.literal('resolve_turn'),
    payload: ResolvePayloadSchema,
  }),
  z.object({
    t: z.literal('cursor_move'),
    cursor: CursorPositionSchema,
  }),
]);

// Legacy lobby types (keep existing)
export const ActionTypeSchema_Legacy = z.enum(['move', 'card', 'ping', 'ready', 'lock']);

// Grid position
export const GridPosSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

// Player action (legacy)
export const PlayerActionSchema = z.object({
  playerId: z.string(),
  type: ActionTypeSchema_Legacy,
  targetPos: GridPosSchema.optional(),
  cardId: z.string().optional(),
  timestamp: z.number(),
});

// Lobby state
export const LobbyPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().optional(),
  isReady: z.boolean(),
  isHost: z.boolean(),
});

export const LobbyStateSchema = z.object({
  id: z.string(),
  players: z.array(LobbyPlayerSchema),
  maxPlayers: z.number().int().min(1).max(8),
  seed: z.number().int().optional(),
  started: z.boolean(),
});

// Turn resolution (legacy)
export const TurnResolutionSchema = z.object({
  turnNumber: z.number().int(),
  actions: z.array(PlayerActionSchema),
  seed: z.number().int(),
  timestamp: z.number(),
});

// Real-time messages
export const MessageTypeSchema = z.enum([
  'join',
  'leave',
  'action',
  'ready',
  'lock',
  'resolve',
  'ping',
  'sync',
]);

export const RealtimeMessageSchema = z.object({
  type: MessageTypeSchema,
  payload: z.any(),
  senderId: z.string(),
  timestamp: z.number(),
});

// Type exports
export type ActorId = z.infer<typeof ActorIdSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type ResolveSeed = z.infer<typeof ResolveSeedSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type ResolvePayload = z.infer<typeof ResolvePayloadSchema>;
export type CursorPosition = z.infer<typeof CursorPositionSchema>;
export type CombatMessage = z.infer<typeof CombatMessageSchema>;
export type Loadout = z.infer<typeof LoadoutSchema>;
export type SelectionMessage = z.infer<typeof SelectionMessageSchema>;

// Legacy types
export type ActionType_Legacy = z.infer<typeof ActionTypeSchema_Legacy>;
export type GridPos = z.infer<typeof GridPosSchema>;
export type PlayerAction = z.infer<typeof PlayerActionSchema>;
export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;
export type LobbyState = z.infer<typeof LobbyStateSchema>;
export type TurnResolution = z.infer<typeof TurnResolutionSchema>;
export type MessageType = z.infer<typeof MessageTypeSchema>;
export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>;

// Payload size limits (bytes)
export const LIMITS = {
  MAX_PAYLOAD_SIZE: 1024, // 1KB max per message
  MAX_ACTIONS_PER_TURN: 8, // One action per player max
  SYNC_INTERVAL_MS: 1000, // State sync every 1s
  ACTION_TIMEOUT_MS: 30000, // 30s to submit action
};

// Helper to validate and parse messages
export function parseMessage(raw: unknown): RealtimeMessage | null {
  try {
    return RealtimeMessageSchema.parse(raw);
  } catch (e) {
    console.error('Invalid message:', e);
    return null;
  }
}

// Helper to validate combat messages
export function parseCombatMessage(raw: unknown): CombatMessage | null {
  try {
    return CombatMessageSchema.parse(raw);
  } catch (e) {
    console.error('Invalid combat message:', e);
    console.error('Raw payload:', raw);
    
    // Log specific field errors for debugging
    if (e.errors) {
      e.errors.forEach((error: any) => {
        console.error(`Field error: ${error.path.join('.')} - ${error.message}`);
      });
    }
    
    return null;
  }
}

// Helper to validate selection messages
export function parseSelectionMessage(raw: unknown): SelectionMessage | null {
  try {
    return SelectionMessageSchema.parse(raw);
  } catch (e) {
    console.error('Invalid selection message:', e);
    console.error('Raw payload:', raw);
    return null;
  }
}

