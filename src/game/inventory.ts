import { Card } from './cards';

/**
 * Player Inventory System
 * Tracks gold, permanent card collection, and consumable items
 */

export interface PlayerInventory {
  gold: number;
  permanentDeck: Card[]; // Cards that persist across battles
  consumables: Map<string, number>; // Card ID -> count
}

// Global inventory state (per player session)
const playerInventories = new Map<string, PlayerInventory>();

/**
 * Initialize inventory for a player
 */
export function initializeInventory(playerId: string): void {
  if (!playerInventories.has(playerId)) {
    playerInventories.set(playerId, {
      gold: 0,
      permanentDeck: [],
      consumables: new Map(),
    });
    console.log(`[Inventory] Initialized inventory for player ${playerId}`);
  }
}

/**
 * Get player's inventory
 */
export function getInventory(playerId: string): PlayerInventory | null {
  initializeInventory(playerId); // Ensure initialized
  return playerInventories.get(playerId) || null;
}

/**
 * Add gold to player's inventory
 */
export function addGold(playerId: string, amount: number): void {
  const inventory = getInventory(playerId);
  if (!inventory) return;
  
  inventory.gold += amount;
  console.log(`[Inventory] ${playerId} gained ${amount} gold (total: ${inventory.gold})`);
}

/**
 * Spend gold from player's inventory
 */
export function spendGold(playerId: string, amount: number): boolean {
  const inventory = getInventory(playerId);
  if (!inventory) return false;
  
  if (inventory.gold >= amount) {
    inventory.gold -= amount;
    console.log(`[Inventory] ${playerId} spent ${amount} gold (remaining: ${inventory.gold})`);
    return true;
  }
  
  console.log(`[Inventory] ${playerId} cannot afford ${amount} gold (has: ${inventory.gold})`);
  return false;
}

/**
 * Get player's gold
 */
export function getGold(playerId: string): number {
  const inventory = getInventory(playerId);
  return inventory?.gold || 0;
}

/**
 * Add a card to player's permanent deck
 */
export function addCardToDeck(playerId: string, card: Card): void {
  const inventory = getInventory(playerId);
  if (!inventory) return;
  
  // Check if it's a consumable
  if (card.class === undefined && (card.desc.includes('Consumable') || card.desc.includes('consumable'))) {
    // Add to consumables map
    const currentCount = inventory.consumables.get(card.id) || 0;
    inventory.consumables.set(card.id, currentCount + 1);
    console.log(`[Inventory] ${playerId} gained consumable: ${card.name} (count: ${currentCount + 1})`);
  } else {
    // Add to permanent deck (if not already present)
    if (!inventory.permanentDeck.some(c => c.id === card.id)) {
      inventory.permanentDeck.push(card);
      console.log(`[Inventory] ${playerId} added ${card.name} to permanent deck`);
    } else {
      console.log(`[Inventory] ${playerId} already has ${card.name} in deck`);
    }
  }
}

/**
 * Remove a consumable from inventory (when used)
 */
export function removeConsumable(playerId: string, cardId: string): boolean {
  const inventory = getInventory(playerId);
  if (!inventory) return false;
  
  const currentCount = inventory.consumables.get(cardId) || 0;
  if (currentCount > 0) {
    if (currentCount === 1) {
      inventory.consumables.delete(cardId);
    } else {
      inventory.consumables.set(cardId, currentCount - 1);
    }
    console.log(`[Inventory] ${playerId} used consumable (remaining: ${currentCount - 1})`);
    return true;
  }
  
  return false;
}

/**
 * Get player's permanent deck
 */
export function getPermanentDeck(playerId: string): Card[] {
  const inventory = getInventory(playerId);
  return inventory?.permanentDeck || [];
}

/**
 * Get player's consumables
 */
export function getConsumables(playerId: string): Map<string, number> {
  const inventory = getInventory(playerId);
  return inventory?.consumables || new Map();
}

/**
 * Get consumable count for a specific card
 */
export function getConsumableCount(playerId: string, cardId: string): number {
  const inventory = getInventory(playerId);
  return inventory?.consumables.get(cardId) || 0;
}

/**
 * Clear all inventories (when starting new run)
 */
export function clearAllInventories(): void {
  playerInventories.clear();
  console.log('[Inventory] Cleared all inventories');
}

/**
 * Reset player's inventory (new run)
 */
export function resetInventory(playerId: string): void {
  playerInventories.set(playerId, {
    gold: 0,
    permanentDeck: [],
    consumables: new Map(),
  });
  console.log(`[Inventory] Reset inventory for player ${playerId}`);
}

