/**
 * AP (Action Points) economy rules
 */

export const AP_START = 5;
export const AP_PER_ROUND = 5;
export const AP_CAP = 10; // Maximum AP a player can have

/**
 * Get starting AP for a new battle
 */
export function startBattleAP(): number {
  return AP_START;
}

/**
 * Refresh AP at the start of a new round
 * @param current Current AP value
 * @returns New AP value after refresh (capped at AP_CAP)
 */
export function refreshAP(current: number): number {
  return Math.min(AP_CAP, current + AP_PER_ROUND);
}

/**
 * Check if a player can afford to play a card
 * @param currentAP Player's current AP
 * @param cost Card's AP cost
 * @returns True if player can afford the card
 */
export function canAfford(currentAP: number, cost: number): boolean {
  return currentAP >= cost;
}

/**
 * Deduct AP after playing a card
 * @param currentAP Player's current AP
 * @param cost Card's AP cost
 * @returns New AP value after deduction
 */
export function spendAP(currentAP: number, cost: number): number {
  return Math.max(0, currentAP - cost);
}

