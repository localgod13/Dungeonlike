/**
 * Deck Management System
 * Handles card deck building, drawing, and cycling for the deckbuilder mechanics
 */

import { Card, getCardById } from './cards';

export interface DeckState {
  deck: string[]; // Card IDs in deck (all 10 cards)
  hand: string[]; // Card IDs currently in hand (4 cards drawn)
  discardPile: string[]; // Card IDs that have been played this cycle
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
export function createDeck(cardIds: string[]): DeckState {
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

  // Shuffle the deck
  const shuffledDeck = [...cardIds];
  shuffleDeck(shuffledDeck);

  // Draw initial hand of 4 cards
  const hand = shuffledDeck.splice(0, 4);

  return {
    deck: shuffledDeck,
    hand,
    discardPile: [],
    reusableCharges,
    consumableInventory: new Map(),
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
 * Draw 4 new cards from the deck
 * Properly handles reshuffling when deck runs out mid-draw
 */
export function drawCards(state: DeckState): void {
  console.log(`[Deck] === DRAW PHASE START ===`);
  console.log(`[Deck] Before: Hand=${state.hand.length}, Deck=${state.deck.length}, Discard=${state.discardPile.length}`);
  
  // Move current hand to discard pile
  state.discardPile.push(...state.hand);
  state.hand = [];
  console.log(`[Deck] Moved hand to discard. Deck=${state.deck.length}, Discard=${state.discardPile.length}`);

  // Draw 4 cards, reshuffling if needed
  const TARGET_HAND_SIZE = 4;
  let cardsDrawn = 0;
  
  while (cardsDrawn < TARGET_HAND_SIZE) {
    // If deck is empty, reshuffle discard pile
    if (state.deck.length === 0 && state.discardPile.length > 0) {
      console.log('[Deck] 🔄 Deck empty! Reshuffling discard pile...');
      state.deck = [...state.discardPile];
      state.discardPile = [];
      shuffleDeck(state.deck);
      console.log(`[Deck] ✓ Reshuffled ${state.deck.length} cards back into deck`);
    }
    
    // If still no cards available, we're done
    if (state.deck.length === 0) {
      console.log('[Deck] ⚠️ No more cards available to draw');
      break;
    }
    
    // Draw one card
    const card = state.deck.shift();
    if (card) {
      state.hand.push(card);
      cardsDrawn++;
    }
  }

  console.log(`[Deck] Drew ${cardsDrawn} cards. Final: Hand=${state.hand.length}, Deck=${state.deck.length}, Discard=${state.discardPile.length}`);
  console.log(`[Deck] Hand contents:`, state.hand);
  console.log(`[Deck] === DRAW PHASE END ===`);
}

/**
 * Play a card from hand (for tracking purposes)
 * Cards stay in hand until end of turn when drawCards is called
 */
export function playCard(state: DeckState, cardId: string): boolean {
  if (!state.hand.includes(cardId)) {
    console.error(`[Deck] Card ${cardId} not in hand`);
    return false;
  }

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
  if (card && card.desc.includes('(Consumable)')) {
    const count = state.consumableInventory.get(cardId) || 0;
    if (count <= 0) {
      console.warn(`[Deck] No consumables left for ${cardId}`);
      return false;
    }
    state.consumableInventory.set(cardId, count - 1);
    console.log(`[Deck] Used consumable ${cardId}, ${count - 1} remaining`);
    
    // Remove from deck permanently if no more left
    if (count - 1 <= 0) {
      removeCardFromDeck(state, cardId);
    }
  }

  return true;
}

/**
 * Remove a card from the deck permanently (for consumed items)
 */
function removeCardFromDeck(state: DeckState, cardId: string): void {
  // Remove from hand
  const handIndex = state.hand.indexOf(cardId);
  if (handIndex !== -1) {
    state.hand.splice(handIndex, 1);
  }

  // Remove from deck
  const deckIndex = state.deck.indexOf(cardId);
  if (deckIndex !== -1) {
    state.deck.splice(deckIndex, 1);
  }

  // Remove from discard
  const discardIndex = state.discardPile.indexOf(cardId);
  if (discardIndex !== -1) {
    state.discardPile.splice(discardIndex, 1);
  }

  console.log(`[Deck] Permanently removed ${cardId} from deck`);
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
  const allCards = [...state.deck, ...state.hand, ...state.discardPile];
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
  if (card && card.desc.includes('(Consumable)')) {
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
  deckSize: number;
  discardSize: number;
} {
  return {
    totalCards: state.deck.length + state.hand.length + state.discardPile.length,
    handSize: state.hand.length,
    deckSize: state.deck.length,
    discardSize: state.discardPile.length,
  };
}

