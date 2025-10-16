/**
 * AP (Action Points) economy rules
 * 
 * AP System Design:
 * - Players start with 5 AP at battle start
 * - Players gain 5 AP at the start of each round
 * - AP accumulates between rounds (doesn't reset)
 * - Maximum AP is capped at 30 to prevent infinite accumulation
 * - Players can skip turns to save AP for powerful combos
 * 
 * Card Costs:
 * - Guard: 2 AP
 * - Weaken: 2 AP
 * - Strike: 3 AP
 * - Mend: 3 AP
 * - Bash: 4 AP
 * - Nova: 5 AP (powerful AOE)
 * 
 * Strategy:
 * - Save AP over multiple rounds to unleash powerful combos
 * - Skip turns when enemies are guarding to build up AP
 * - Use low-cost cards early, save for high-cost cards later
 */

export const AP_START = 5;
export const AP_PER_ROUND = 5;
export const AP_CAP = 30; // Maximum AP a player can have (allows saving for combos)

/**
 * Get starting AP for a new battle
 */
export function startBattleAP(): number {
  return AP_START;
}

/**
 * Refresh AP at the start of a new round
 * AP accumulates - doesn't reset!
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

