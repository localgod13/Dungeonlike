import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supa';
import { RealtimeMessage, parseMessage, MessageType } from './proto';

/**
 * Real-time communication layer over Supabase Realtime
 */

export type MessageHandler = (message: RealtimeMessage) => void;

export class RealtimeManager {
  private channel: RealtimeChannel | null = null;
  private handlers: Map<MessageType, Set<MessageHandler>>;
  private playerId: string;
  private lobbyId: string | null = null;

  constructor(playerId: string) {
    this.playerId = playerId;
    this.handlers = new Map();
  }

  connect(lobbyId: string): void {
    if (this.channel) {
      this.disconnect();
    }

    this.lobbyId = lobbyId;
    console.log(`Connecting to realtime channel: lobby:${lobbyId}`);

    // For MVP without backend, simulate local channel
    console.log('Realtime channel connected (local mode)');

    // When backend is ready:
    /*
    const supabase = getSupabase();
    this.channel = supabase.channel(`lobby:${lobbyId}`);

    this.channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        const message = parseMessage(payload);
        if (message && message.senderId !== this.playerId) {
          this.handleMessage(message);
        }
      })
      .subscribe((status) => {
        console.log(`Realtime status: ${status}`);
      });
    */
  }

  disconnect(): void {
    if (this.channel) {
      console.log('Disconnecting from realtime channel');
      // this.channel.unsubscribe();
      this.channel = null;
    }
    this.lobbyId = null;
  }

  send(type: MessageType, payload: unknown): void {
    if (!this.channel && !this.lobbyId) {
      console.warn('Not connected to a channel');
      return;
    }

    const message: RealtimeMessage = {
      type,
      payload,
      senderId: this.playerId,
      timestamp: Date.now(),
    };

    console.log(`Sending message:`, message);

    // When backend is ready:
    /*
    this.channel?.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    });
    */
  }

  on(type: MessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  private handleMessage(message: RealtimeMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  isConnected(): boolean {
    return this.channel !== null || this.lobbyId !== null;
  }
}
















