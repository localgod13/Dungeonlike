/**
 * Card catalog and type definitions
 */

export type Target = 'none' | 'ally' | 'enemy' | 'all_enemies';

export type CardOpcode = 'DMG' | 'HEAL' | 'GUARD' | 'VULN' | 'STUN' | 'AOE_DMG';

export type CardType = 'attack' | 'defense' | 'magic';

export interface Card {
  id: string;
  name: string;
  ap: number;          // AP cost to play
  target: Target;
  opcode: CardOpcode;
  power: number;       // magnitude for effect
  desc: string;
  type: CardType;      // Visual card type for image selection
}

/**
 * Shared pool of cards available for selection
 */
export const CARD_POOL: Card[] = [
  { 
    id: 'Strike', 
    name: 'Strike', 
    ap: 3, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 6, 
    desc: 'Deal 6 damage',
    type: 'attack'
  },
  { 
    id: 'Guard', 
    name: 'Guard', 
    ap: 2, 
    target: 'ally', 
    opcode: 'GUARD', 
    power: 3, 
    desc: 'Give 3 Shield',
    type: 'defense'
  },
  { 
    id: 'Mend', 
    name: 'Mend', 
    ap: 3, 
    target: 'ally', 
    opcode: 'HEAL', 
    power: 6, 
    desc: 'Heal 6 HP',
    type: 'magic'
  },
  { 
    id: 'Weaken', 
    name: 'Weaken', 
    ap: 2, 
    target: 'enemy', 
    opcode: 'VULN', 
    power: 2, 
    desc: 'Apply 2 Vulnerable (this turn)',
    type: 'magic'
  },
  { 
    id: 'Bash', 
    name: 'Bash', 
    ap: 4, 
    target: 'enemy', 
    opcode: 'STUN', 
    power: 1, 
    desc: 'Stun target (skip next action)',
    type: 'attack'
  },
  { 
    id: 'Nova', 
    name: 'Nova', 
    ap: 5, 
    target: 'all_enemies', 
    opcode: 'AOE_DMG', 
    power: 4, 
    desc: 'Deal 4 to all enemies',
    type: 'attack'
  },
];

/**
 * Get a card by its ID
 */
export function getCardById(id: string): Card | undefined {
  return CARD_POOL.find(c => c.id === id);
}

/**
 * Validate if a card requires a target selection
 */
export function requiresTarget(card: Card): boolean {
  return card.target !== 'none' && card.target !== 'all_enemies';
}
