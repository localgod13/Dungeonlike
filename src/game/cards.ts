/**
 * Card catalog and type definitions
 */

export type Target = 'none' | 'ally' | 'enemy' | 'all_enemies' | 'all_allies';

export type CardOpcode = 'DMG' | 'HEAL' | 'GUARD' | 'VULN' | 'STUN' | 'AOE_DMG' | 'TAUNT' | 'DOT' | 'SELF_GUARD' | 'BUFF' | 'CLEANSE' | 'BLIND' | 'ULTIMATE_GAIN' | 'REVIVE';

export type CardType = 'attack' | 'defense' | 'magic' | 'neutral';

export interface Card {
  id: string;
  name: string;
  ap: number;          // AP cost to play
  target: Target;
  opcode: CardOpcode;
  power: number;       // magnitude for effect
  desc: string;
  type: CardType;      // Visual card type for image selection
  class?: string;      // Class restriction: 'Warrior', 'Huntress', 'Mage', or undefined for universal
}

/**
 * WARRIOR CARDS - Melee combat, defense, and tanking abilities
 */
export const WARRIOR_CARDS: Card[] = [
  { 
    id: 'Slash', 
    name: 'Slash', 
    ap: 3, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 7, 
    desc: 'Deal 7 melee damage',
    type: 'attack',
    class: 'Warrior'
  },
  { 
    id: 'ShieldWall', 
    name: 'Shield Wall', 
    ap: 2, 
    target: 'ally', 
    opcode: 'GUARD', 
    power: 5, 
    desc: 'Give 5 Shield to an ally',
    type: 'defense',
    class: 'Warrior'
  },
  { 
    id: 'Taunt', 
    name: 'Taunt', 
    ap: 2, 
    target: 'enemy', 
    opcode: 'TAUNT', 
    power: 2, 
    desc: 'Force enemy to target you for 2 turns',
    type: 'defense',
    class: 'Warrior'
  },
  { 
    id: 'HeavyStrike', 
    name: 'Heavy Strike', 
    ap: 4, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 11, 
    desc: 'Deal 11 massive melee damage',
    type: 'attack',
    class: 'Warrior'
  },
  { 
    id: 'DefensiveStance', 
    name: 'Defensive Stance', 
    ap: 3, 
    target: 'none', 
    opcode: 'SELF_GUARD', 
    power: 8, 
    desc: 'Grant yourself 8 Shield',
    type: 'defense',
    class: 'Warrior'
  },
  { 
    id: 'Cleave', 
    name: 'Cleave', 
    ap: 5, 
    target: 'all_enemies', 
    opcode: 'AOE_DMG', 
    power: 5, 
    desc: 'Deal 5 damage to all enemies',
    type: 'attack',
    class: 'Warrior'
  },
];

/**
 * HUNTRESS CARDS - Ranged combat with arrows and agility
 */
export const HUNTRESS_CARDS: Card[] = [
  { 
    id: 'ArrowShot', 
    name: 'Arrow Shot', 
    ap: 2, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 5, 
    desc: 'Fire an arrow for 5 damage',
    type: 'attack',
    class: 'Huntress'
  },
  { 
    id: 'MultiShot', 
    name: 'Multi-Shot', 
    ap: 4, 
    target: 'all_enemies', 
    opcode: 'AOE_DMG', 
    power: 3, 
    desc: 'Fire arrows at all enemies for 3 each',
    type: 'attack',
    class: 'Huntress'
  },
  { 
    id: 'PiercingArrow', 
    name: 'Piercing Arrow', 
    ap: 4, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 10, 
    desc: 'Pierce armor for 10 damage',
    type: 'attack',
    class: 'Huntress'
  },
  { 
    id: 'PoisonArrow', 
    name: 'Poison Arrow', 
    ap: 3, 
    target: 'enemy', 
    opcode: 'DOT', 
    power: 4, 
    desc: 'Poison: 4 damage per turn for 2 turns',
    type: 'attack',
    class: 'Huntress'
  },
  { 
    id: 'RapidFire', 
    name: 'Rapid Fire', 
    ap: 5, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 13, 
    desc: 'Unleash rapid arrows for 13 damage',
    type: 'attack',
    class: 'Huntress'
  },
  { 
    id: 'EvasiveManeuver', 
    name: 'Evasive Maneuver', 
    ap: 2, 
    target: 'none', 
    opcode: 'SELF_GUARD', 
    power: 4, 
    desc: 'Dodge and gain 4 Shield',
    type: 'defense',
    class: 'Huntress'
  },
];

/**
 * MAGE CARDS - Fire magic and elemental spells
 */
export const MAGE_CARDS: Card[] = [
  { 
    id: 'Fireball', 
    name: 'Fireball', 
    ap: 3, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 8, 
    desc: 'Hurl a fireball for 8 damage',
    type: 'magic',
    class: 'Mage'
  },
  { 
    id: 'FlameNova', 
    name: 'Flame Nova', 
    ap: 5, 
    target: 'all_enemies', 
    opcode: 'AOE_DMG', 
    power: 6, 
    desc: 'Explode flames dealing 6 to all',
    type: 'magic',
    class: 'Mage'
  },
  { 
    id: 'Inferno', 
    name: 'Inferno', 
    ap: 4, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 12, 
    desc: 'Unleash inferno for 12 damage',
    type: 'magic',
    class: 'Mage'
  },
  { 
    id: 'BurningCurse', 
    name: 'Burning Curse', 
    ap: 3, 
    target: 'enemy', 
    opcode: 'DOT', 
    power: 5, 
    desc: 'Curse: 5 burn damage per turn for 2 turns',
    type: 'magic',
    class: 'Mage'
  },
  { 
    id: 'FireShield', 
    name: 'Fire Shield', 
    ap: 2, 
    target: 'none', 
    opcode: 'SELF_GUARD', 
    power: 6, 
    desc: 'Conjure fire shield for 6 defense',
    type: 'defense',
    class: 'Mage'
  },
  { 
    id: 'MeteorStrike', 
    name: 'Meteor Strike', 
    ap: 6, 
    target: 'enemy', 
    opcode: 'DMG', 
    power: 16, 
    desc: 'Call down a meteor for 16 massive damage',
    type: 'magic',
    class: 'Mage'
  },
];

/**
 * NEUTRAL REUSABLE ITEMS - Tools/weapons that recharge each battle
 * Available to all classes, limited charges per battle
 */
export const NEUTRAL_REUSABLE_ITEMS: Card[] = [
  {
    id: 'Firebomb',
    name: 'Firebomb',
    ap: 4,
    target: 'all_enemies',
    opcode: 'DOT',
    power: 8, // 8 initial damage + 2 burn per turn for 3 turns
    desc: '💣 Deal 8 damage to ALL enemies + burn for 3 turns',
    type: 'neutral',
    class: undefined, // Neutral - any class can use
  },
  {
    id: 'PoisonDart',
    name: 'Poison Dart',
    ap: 2,
    target: 'enemy',
    opcode: 'DOT',
    power: 5, // 5 initial damage + 3 poison per turn for 2 turns
    desc: '🐍 Deal 5 damage + poison for 2 turns',
    type: 'neutral',
    class: undefined,
  },
  {
    id: 'LightningRod',
    name: 'Lightning Rod',
    ap: 3,
    target: 'none',
    opcode: 'TAUNT', // Changed to TAUNT which will give shield + force targeting
    power: 8, // Gives shield + redirects attacks
    desc: '⚡ Gain 8 Shield + next enemy targets you',
    type: 'neutral',
    class: undefined,
  },
  {
    id: 'HealingSalve',
    name: 'Healing Salve',
    ap: 3,
    target: 'ally',
    opcode: 'CLEANSE', // Changed to CLEANSE which heals + removes effect
    power: 12,
    desc: '🧴 Heal ally for 12 HP + remove 1 effect',
    type: 'neutral',
    class: undefined,
  },
  {
    id: 'BerserkerPotion',
    name: 'Berserker Potion',
    ap: 4,
    target: 'all_allies',
    opcode: 'BUFF', // Changed to BUFF for damage boost
    power: 4, // +4 damage to all allies next attack
    desc: '🍺 All allies gain +4 damage on next attack',
    type: 'neutral',
    class: undefined,
  },
  {
    id: 'SmokeGrenade',
    name: 'Smoke Grenade',
    ap: 3,
    target: 'all_enemies',
    opcode: 'BLIND', // Changed to BLIND for damage + miss effect
    power: 6,
    desc: '💨 Deal 6 damage to all + enemies miss next attack',
    type: 'neutral',
    class: undefined,
  },
];

/**
 * NEUTRAL CONSUMABLE ITEMS - Forever limited potions (actual loot)
 * These are consumed permanently when used, can be found as loot or bought in shops
 */
export const NEUTRAL_CONSUMABLE_ITEMS: Card[] = [
  {
    id: 'GreaterHealthPotion',
    name: 'Greater Health Potion',
    ap: 2,
    target: 'ally',
    opcode: 'HEAL',
    power: 25,
    desc: '❤️ Heal ally for 25 HP (Consumable)',
    type: 'defense',
    class: undefined,
  },
  {
    id: 'DamagePotion',
    name: 'Damage Potion',
    ap: 3,
    target: 'enemy',
    opcode: 'DMG',
    power: 15,
    desc: '⚡ Deal 15 corrosive damage (Consumable)',
    type: 'attack',
    class: undefined,
  },
  {
    id: 'ShieldPotion',
    name: 'Shield Potion',
    ap: 2,
    target: 'ally',
    opcode: 'GUARD',
    power: 10,
    desc: '🛡️ Give ally 10 Shield (Consumable)',
    type: 'defense',
    class: undefined,
  },
  {
    id: 'ExplosiveVial',
    name: 'Explosive Vial',
    ap: 4,
    target: 'all_enemies',
    opcode: 'AOE_DMG',
    power: 12,
    desc: '💥 Deal 12 damage to ALL enemies (Consumable)',
    type: 'attack',
    class: undefined,
  },
  {
    id: 'UltimateElixir',
    name: 'Ultimate Elixir',
    ap: 1,
    target: 'none',
    opcode: 'ULTIMATE_GAIN', // Changed to ULTIMATE_GAIN for ultimate power
    power: 25, // 25% ultimate power
    desc: '⚡ Gain 25% ultimate power (Consumable)',
    type: 'magic',
    class: undefined,
  },
  {
    id: 'ReviveCrystal',
    name: 'Revive Crystal',
    ap: 5,
    target: 'ally',
    opcode: 'REVIVE', // Changed to REVIVE for reviving dead allies
    power: 75, // 75% HP revive
    desc: '💎 Revive dead ally at 75% HP (Consumable)',
    type: 'magic',
    class: undefined,
  },
];

/**
 * ULTIMATE CARDS - Powerful abilities that require ultimate meter (0 AP cost)
 * Defined before CARD_POOL so they can be included
 */
export const ULTIMATE_CARDS: Card[] = [
  // Warrior Ultimate
  { 
    id: 'BerserkRage', 
    name: 'Berserk Rage', 
    ap: 0, // Costs ultimate meter instead
    target: 'all_enemies', 
    opcode: 'AOE_DMG', 
    power: 28, // 3 single hits + 1 AOE finisher × 7 damage each
    desc: '⚡ ULTIMATE: 4-hit combo! 7 damage per strike. Final hit is AOE to ALL enemies!',
    type: 'attack',
    class: 'Warrior'
  },
  
  // Huntress Ultimate
  { 
    id: 'RainOfArrows', 
    name: 'Rain of Arrows', 
    ap: 0, // Costs ultimate meter instead
    target: 'all_enemies', 
    opcode: 'AOE_DMG', 
    power: 15, 
    desc: '⚡ ULTIMATE: Rain down 15 arrows dealing 15 damage to ALL enemies!',
    type: 'magic', // Use magic card with glow
    class: 'Huntress'
  },
  
  // Mage Ultimate
  { 
    id: 'Meteor', 
    name: 'Meteor Shower', 
    ap: 0, // Costs ultimate meter instead
    target: 'all_enemies', 
    opcode: 'AOE_DMG', 
    power: 18, 
    desc: '⚡ ULTIMATE: Summon a METEOR SHOWER dealing 18 damage to ALL enemies!',
    type: 'magic',
    class: 'Mage'
  },
];

/**
 * Legacy shared pool - kept for backwards compatibility
 * @deprecated Use class-specific card pools instead
 */
export const CARD_POOL: Card[] = [
  ...WARRIOR_CARDS,
  ...HUNTRESS_CARDS,
  ...MAGE_CARDS,
  ...ULTIMATE_CARDS, // Include ultimate cards so getCardById can find them
  ...NEUTRAL_REUSABLE_ITEMS,
  ...NEUTRAL_CONSUMABLE_ITEMS,
];

/**
 * Get cards for a specific class (class-specific cards only, no neutrals)
 */
export function getCardsForClass(className: string): Card[] {
  switch (className) {
    case 'Warrior':
      return WARRIOR_CARDS;
    case 'Huntress':
      return HUNTRESS_CARDS;
    case 'Mage':
      return MAGE_CARDS;
    default:
      console.warn(`Unknown class: ${className}, returning Warrior cards as default`);
      return WARRIOR_CARDS;
  }
}

/**
 * Get all available cards for deck building (class-specific + neutral reusable)
 * Total: 6 class cards + 6 neutral items = 12 cards
 * Players choose 10 for their deck
 */
export function getAllAvailableCardsForClass(className: string): Card[] {
  const classCards = getCardsForClass(className);
  // Only include reusable items in card selection, NOT consumables
  // Consumables are obtained through loot/shops only
  return [...classCards, ...NEUTRAL_REUSABLE_ITEMS];
}

/**
 * Get neutral reusable items
 */
export function getNeutralReusableItems(): Card[] {
  return NEUTRAL_REUSABLE_ITEMS;
}

/**
 * Get neutral consumable items
 */
export function getNeutralConsumableItems(): Card[] {
  return NEUTRAL_CONSUMABLE_ITEMS;
}

/**
 * Check if a card is a consumable item
 */
export function isConsumableItem(cardId: string): boolean {
  return NEUTRAL_CONSUMABLE_ITEMS.some(c => c.id === cardId);
}

/**
 * Check if a card is a reusable item
 */
export function isReusableItem(cardId: string): boolean {
  return NEUTRAL_REUSABLE_ITEMS.some(c => c.id === cardId);
}

/**
 * Get a card by its ID (searches all class pools)
 */
export function getCardById(id: string): Card | undefined {
  return CARD_POOL.find(c => c.id === id);
}

/**
 * Get ultimate card for a specific class
 */
export function getUltimateCardForClass(characterClass: string): Card | undefined {
  return ULTIMATE_CARDS.find(c => c.class === characterClass);
}

/**
 * Validate if a card requires a target selection
 */
export function requiresTarget(card: Card): boolean {
  return card.target !== 'none' && card.target !== 'all_enemies' && card.target !== 'all_allies';
}
