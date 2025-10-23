/**
 * Deck Management System
 * Handles card deck building, drawing, and cycling for the deckbuilder mechanics
 */

import { Card, getCardById } from './cards';

export interface DeckState {
  drawPile: string[]; // Card IDs in draw pile (remaining cards)
  hand: string[]; // Card IDs currently in hand (4 cards drawn)
  discardPile: string[]; // Card IDs that have been played/discarded
  reusableCharges: Map<string, number>; // Track charges for reusable items per battle
  consumableInventory: Map<string, number>; // Track consumable item counts (persists)
}

/**
 * Reusable item charge limits per battle
 */
export const REUSABLE_CHARGES: Record<string, number> = {
  'Firebomb': 3,
  'PoisonDart': 4,
  'LightningRod': 2,
  'HealingSalve': 3,
  'BerserkerPotion': 2,
  'SmokeGrenade': 2,
};

/**
 * Create a new deck state from a list of card IDs
 */
export function createDeck(cardIds: string[], consumableInventory?: Map<string, number>): DeckState {
  if (cardIds.length !== 10) {
    console.warn(`Deck should have exactly 10 cards, got ${cardIds.length}`);
  }

  // Initialize reusable charges
  const reusableCharges = new Map<string, number>();
  cardIds.forEach(cardId => {
    if (REUSABLE_CHARGES[cardId]) {
      reusableCharges.set(cardId, REUSABLE_CHARGES[cardId]);
    }
  });

  // Initialize consumable inventory
  const consumableInv = new Map<string, number>();
  if (consumableInventory) {
    // Copy the provided consumable inventory
    consumableInventory.forEach((count, cardId) => {
      consumableInv.set(cardId, count);
    });
  }

  // Shuffle the deck
  const shuffledDeck = [...cardIds];
  shuffleDeck(shuffledDeck);

  // Draw initial hand of 4 cards
  const hand = shuffledDeck.splice(0, 4);

  return {
    drawPile: shuffledDeck,
    hand,
    discardPile: [],
    reusableCharges,
    consumableInventory: consumableInv,
  };
}

/**
 * Shuffle a deck using Fisher-Yates algorithm
 */
function shuffleDeck(deck: string[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

/**
 * Draw one card from the draw pile to hand
 * Automatically reshuffles discard pile when draw pile is empty
 * 
 * NOTE: Animation callback is called AFTER the card is added to hand,
 * so the hand UI must be created AFTER this function returns
 */
export function drawCard(state: DeckState, onDrawAnimation?: (cardId: string, position: number, delay: number) => void, animationDelay: number = 0): string | null {
  console.log(`[Deck] Drawing card. Before: Hand=${state.hand.length}, DrawPile=${state.drawPile.length}, Discard=${state.discardPile.length}`);
  
  // If draw pile is empty, reshuffle discard pile (excluding consumables)
  if (state.drawPile.length === 0 && state.discardPile.length > 0) {
    console.log('[Deck] 🔄 Draw pile empty! Reshuffling discard pile...');
    
    // Filter out consumables from discard pile before reshuffling
    const nonConsumableCards = state.discardPile.filter(cardId => {
      const card = getCardById(cardId);
      return !card || card.type !== 'consumable';
    });
    
    const consumableCards = state.discardPile.filter(cardId => {
      const card = getCardById(cardId);
      return card && card.type === 'consumable';
    });
    
    console.log(`[Deck] 📦 Reshuffling ${nonConsumableCards.length} non-consumable cards, removing ${consumableCards.length} consumables`);
    
    state.drawPile = [...nonConsumableCards];
    state.discardPile = []; // Clear discard pile
    shuffleDeck(state.drawPile);
    console.log(`[Deck] ✓ Reshuffled ${state.drawPile.length} cards back into draw pile`);
  }
  
  // If still no cards available, return null
  if (state.drawPile.length === 0) {
    console.log('[Deck] ⚠️ No more cards available to draw');
    return null;
  }
  
  // Draw one card
  const card = state.drawPile.shift();
  if (card) {
    state.hand.push(card);
    console.log(`[Deck] Drew ${card}. After: Hand=${state.hand.length}, DrawPile=${state.drawPile.length}, Discard=${state.discardPile.length}`);
    
    // Store the card ID and position for animation callback
    // Animation callback will be triggered later, after hand UI is created
    if (onDrawAnimation) {
      // Use setTimeout to defer animation until after hand UI is created
      setTimeout(() => {
        onDrawAnimation(card, state.hand.length - 1, animationDelay);
      }, 100); // Delay to ensure hand UI is created first and cards can be hidden
    }
  }
  
  return card || null;
}

/**
 * Draw cards at the start of each turn to maintain hand size
 * Only draws if hand is below target size
 */
export function drawCardsAtTurnStart(state: DeckState, onDrawAnimation?: (cardId: string, position: number, delay: number) => void): void {
  console.log(`[Deck] === TURN START DRAW ===`);
  console.log(`[Deck] Current hand size: ${state.hand.length}`);
  
  const TARGET_HAND_SIZE = 4;
  const cardsNeeded = Math.max(0, TARGET_HAND_SIZE - state.hand.length);
  
  if (cardsNeeded === 0) {
    console.log(`[Deck] Hand is already full (${state.hand.length} cards)`);
    return;
  }
  
  console.log(`[Deck] Need to draw ${cardsNeeded} cards`);
  
  const ANIMATION_STAGGER_MS = 200; // Delay between each card animation
  
  for (let i = 0; i < cardsNeeded; i++) {
    const animationDelay = i * ANIMATION_STAGGER_MS; // 0ms, 200ms, 400ms, 600ms
    const card = drawCard(state, onDrawAnimation, animationDelay);
    if (!card) {
      console.log(`[Deck] Could only draw ${i} cards before running out`);
      break;
    }
  }
  
  console.log(`[Deck] Final hand size: ${state.hand.length}`);
  console.log(`[Deck] === TURN START DRAW END ===`);
}

/**
 * Play a card from hand and automatically discard it
 * Returns true if card was successfully played and discarded
 */
export function playCard(state: DeckState, cardId: string, onDiscardAnimation?: (cardId: string, position: number, delay: number) => void, animationDelay: number = 0): boolean {
  if (!state.hand.includes(cardId)) {
    console.error(`[Deck] Card ${cardId} not in hand`);
    return false;
  }

  // Find the position of the card in hand before removing it
  const handPosition = state.hand.indexOf(cardId);

  // Check if it's a reusable item with charges
  if (REUSABLE_CHARGES[cardId]) {
    const charges = state.reusableCharges.get(cardId) || 0;
    if (charges <= 0) {
      console.warn(`[Deck] No charges left for ${cardId}`);
      return false;
    }
    state.reusableCharges.set(cardId, charges - 1);
    console.log(`[Deck] Used ${cardId}, ${charges - 1} charges remaining`);
  }

  // Check if it's a consumable item
  const card = getCardById(cardId);
  if (card && card.type === 'consumable') {
    const count = state.consumableInventory.get(cardId) || 0;
    if (count <= 0) {
      console.warn(`[Deck] No consumables left for ${cardId}`);
      return false;
    }
    state.consumableInventory.set(cardId, count - 1);
    console.log(`[Deck] Used consumable ${cardId}, ${count - 1} remaining`);
    
    // Consumables are discarded normally but won't be reshuffled back
    // They'll only be available again if obtained through loot/shop
  }

  // Remove card from hand and add to discard pile (for ALL cards including consumables)
  const handIndex = state.hand.indexOf(cardId);
  if (handIndex !== -1) {
    state.hand.splice(handIndex, 1);
    state.discardPile.push(cardId);
    console.log(`[Deck] Played and discarded ${cardId}. Hand=${state.hand.length}, Discard=${state.discardPile.length}`);
    
    // Trigger discard animation if callback provided
    if (onDiscardAnimation) {
      onDiscardAnimation(cardId, handPosition, animationDelay);
    }
  }

  return true;
}

/**
 * Get remaining charges for a reusable item
 */
export function getRemainingCharges(state: DeckState, cardId: string): number {
  return state.reusableCharges.get(cardId) || 0;
}

/**
 * Get remaining consumable count
 */
export function getRemainingConsumables(state: DeckState, cardId: string): number {
  return state.consumableInventory.get(cardId) || 0;
}

/**
 * Add a consumable item to inventory
 */
export function addConsumable(state: DeckState, cardId: string, count: number = 1): void {
  const currentCount = state.consumableInventory.get(cardId) || 0;
  state.consumableInventory.set(cardId, currentCount + count);
  console.log(`[Deck] Added ${count}x ${cardId}, total: ${currentCount + count}`);
}

/**
 * Reset reusable charges for a new battle
 */
export function resetReusableCharges(state: DeckState): void {
  state.reusableCharges.clear();
  
  // Re-initialize charges for reusable items in deck
  const allCards = [...state.drawPile, ...state.hand, ...state.discardPile];
  allCards.forEach(cardId => {
    if (REUSABLE_CHARGES[cardId]) {
      state.reusableCharges.set(cardId, REUSABLE_CHARGES[cardId]);
    }
  });

  console.log('[Deck] Reset reusable item charges for new battle');
}

/**
 * Check if a card can be played (has charges/consumables available)
 */
export function canPlayCard(state: DeckState, cardId: string): boolean {
  if (!state.hand.includes(cardId)) {
    return false;
  }

  // Check reusable charges
  if (REUSABLE_CHARGES[cardId]) {
    const charges = state.reusableCharges.get(cardId) || 0;
    return charges > 0;
  }

  // Check consumable inventory
  const card = getCardById(cardId);
  if (card && card.type === 'consumable') {
    const count = state.consumableInventory.get(cardId) || 0;
    return count > 0;
  }

  // Regular cards can always be played
  return true;
}

/**
 * Get deck statistics
 */
export function getDeckStats(state: DeckState): {
  totalCards: number;
  handSize: number;
  drawPileSize: number;
  discardSize: number;
} {
  return {
    totalCards: state.drawPile.length + state.hand.length + state.discardPile.length,
    handSize: state.hand.length,
    drawPileSize: state.drawPile.length,
    discardSize: state.discardPile.length,
  };
}

