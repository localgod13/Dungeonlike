/**
 * Item system - Data structures and utilities for game items
 */

export enum ItemType {
  WEAPON = 'weapon',
  ARMOR = 'armor',
  ACCESSORY = 'accessory',
  CONSUMABLE = 'consumable',
  QUEST = 'quest',
}

export enum ItemRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}

export interface BaseItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: ItemRarity;
  icon: string;
  cost: number;
}

export interface WeaponItem extends BaseItem {
  type: ItemType.WEAPON;
  attackPower: number;
  durability?: number;
  specialEffects?: string[];
}

export interface ArmorItem extends BaseItem {
  type: ItemType.ARMOR;
  defense: number;
  durability?: number;
  specialEffects?: string[];
}

export interface AccessoryItem extends BaseItem {
  type: ItemType.ACCESSORY;
  specialEffects: string[];
  statBonuses?: {
    health?: number;
    mana?: number;
    attack?: number;
    defense?: number;
  };
}

export interface ConsumableItem extends BaseItem {
  type: ItemType.CONSUMABLE;
  effect: string;
  value: number;
  stackable: boolean;
}

export interface QuestItem extends BaseItem {
  type: ItemType.QUEST;
  questId: string;
  isKeyItem: boolean;
}

export type GameItem = WeaponItem | ArmorItem | AccessoryItem | ConsumableItem | QuestItem;

// Item generation utilities
export function generateShopItems(seed: number, playerLevel: number = 1): GameItem[] {
  const items: GameItem[] = [];
  
  // TODO: Use seed for deterministic generation
  // TODO: Scale items based on player level
  
  // Sample items for now
  items.push({
    id: 'iron_sword',
    name: 'Iron Sword',
    description: 'A sturdy blade forged from iron',
    type: ItemType.WEAPON,
    rarity: ItemRarity.COMMON,
    icon: '⚔️',
    cost: 75,
    attackPower: 8,
    durability: 100,
  });
  
  items.push({
    id: 'health_potion',
    name: 'Health Potion',
    description: 'Restores 50 HP',
    type: ItemType.CONSUMABLE,
    rarity: ItemRarity.COMMON,
    icon: '🧪',
    cost: 25,
    effect: 'heal',
    value: 50,
    stackable: true,
  });
  
  items.push({
    id: 'leather_armor',
    name: 'Leather Armor',
    description: 'Basic protection made from treated leather',
    type: ItemType.ARMOR,
    rarity: ItemRarity.COMMON,
    icon: '🛡️',
    cost: 60,
    defense: 5,
    durability: 80,
  });
  
  return items;
}

export function generateEventRewards(seed: number, eventType: string): GameItem[] {
  const rewards: GameItem[] = [];
  
  // TODO: Generate rewards based on event type and seed
  
  switch (eventType) {
    case 'mysterious_merchant':
      rewards.push({
        id: 'mysterious_crystal',
        name: 'Mysterious Crystal',
        description: 'A glowing crystal that pulses with inner light',
        type: ItemType.ACCESSORY,
        rarity: ItemRarity.UNCOMMON,
        icon: '💎',
        cost: 0,
        specialEffects: ['mana_regen'],
        statBonuses: {
          mana: 20,
        },
      });
      break;
      
    case 'ancient_shrine':
      rewards.push({
        id: 'divine_blessing',
        name: 'Divine Blessing',
        description: 'A blessing from the ancient gods',
        type: ItemType.ACCESSORY,
        rarity: ItemRarity.RARE,
        icon: '✨',
        cost: 0,
        specialEffects: ['damage_resistance', 'health_regen'],
        statBonuses: {
          health: 30,
          defense: 3,
        },
      });
      break;
  }
  
  return rewards;
}

// Item utility functions
export function getItemRarityColor(rarity: ItemRarity): string {
  switch (rarity) {
    case ItemRarity.COMMON: return '#ffffff';
    case ItemRarity.UNCOMMON: return '#44ff88';
    case ItemRarity.RARE: return '#4a90e2';
    case ItemRarity.EPIC: return '#8b44ff';
    case ItemRarity.LEGENDARY: return '#ff6b35';
    default: return '#ffffff';
  }
}

export function getItemTypeIcon(type: ItemType): string {
  switch (type) {
    case ItemType.WEAPON: return '⚔️';
    case ItemType.ARMOR: return '🛡️';
    case ItemType.ACCESSORY: return '💍';
    case ItemType.CONSUMABLE: return '🧪';
    case ItemType.QUEST: return '🗝️';
    default: return '❓';
  }
}

export function canPlayerAffordItem(item: GameItem, playerGold: number): boolean {
  return playerGold >= item.cost;
}

export function getItemDisplayName(item: GameItem): string {
  const rarityPrefix = item.rarity !== ItemRarity.COMMON ? `[${item.rarity.toUpperCase()}] ` : '';
  return `${rarityPrefix}${item.name}`;
}
