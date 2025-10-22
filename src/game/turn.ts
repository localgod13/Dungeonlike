/**
 * Turn-based state machine for lockstep gameplay
 */

export enum TurnPhase {
  Idle = 'Idle',
  Planning = 'Planning', // Players queue actions
  Resolving = 'Resolving', // Host resolves actions deterministically
  EnemyTurn = 'EnemyTurn', // Enemies act
}

export interface TurnState {
  phase: TurnPhase;
  round: number;
  turnNumber: number;
  seed: number;
}

export class TurnManager {
  private state: TurnState;
  private listeners: Set<(state: TurnState) => void>;

  constructor(seed: number) {
    this.state = {
      phase: TurnPhase.Idle,
      round: 1,
      turnNumber: 0,
      seed,
    };
    this.listeners = new Set();
  }

  getState(): TurnState {
    return { ...this.state };
  }

  subscribe(callback: (state: TurnState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this.getState()));
  }

  setPhase(phase: TurnPhase): void {
    this.state.phase = phase;
    this.notify();
  }

  startPlanning(): void {
    this.state.phase = TurnPhase.Planning;
    this.state.turnNumber++;
    this.notify();
  }

  startResolving(): void {
    this.state.phase = TurnPhase.Resolving;
    this.notify();
  }

  startEnemyTurn(): void {
    this.state.phase = TurnPhase.EnemyTurn;
    this.notify();
  }

  endTurn(): void {
    this.state.phase = TurnPhase.Idle;
    this.notify();
  }

  nextRound(): void {
    this.state.round++;
    this.state.turnNumber = 0;
    this.state.phase = TurnPhase.Idle;
    this.notify();
  }

  reset(seed: number): void {
    this.state = {
      phase: TurnPhase.Idle,
      round: 1,
      turnNumber: 0,
      seed,
    };
    this.notify();
  }
}





















