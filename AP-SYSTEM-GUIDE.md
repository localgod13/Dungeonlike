# AP (Action Points) System Guide

## Overview

The AP system allows players to manage their resources strategically, enabling powerful combo plays by accumulating Action Points across multiple rounds.

## Core Mechanics

### AP Gain & Accumulation

- **Starting AP**: 5 AP at the beginning of battle (Turn 1 only)
- **AP Per Round**: +5 AP at the start of each round (Turn 2+)
- **AP Accumulation**: AP carries over between rounds (doesn't reset!)
- **AP Cap**: Maximum 30 AP (prevents infinite accumulation)

### AP Economy

| Card | AP Cost | Effect |
|------|---------|--------|
| Guard | 2 AP | Give 3 Shield to an ally |
| Weaken | 2 AP | Apply Vulnerable (+2 damage taken) |
| Strike | 3 AP | Deal 6 damage |
| Mend | 3 AP | Heal 6 HP |
| Bash | 4 AP | Stun target |
| Nova | 5 AP | Deal 4 damage to ALL enemies |

## How It Works

### Playing Cards

1. **Select a card** from your hand
2. **Choose a target** (if required)
3. **Card is played immediately** - AP is deducted
4. **You can play another card** if you have enough AP
5. **Click "END TURN"** when you're done playing cards

### Example Turn

```
Turn 1 (Start of Battle):
  AP: 5 (starting AP, no refresh)

Play Strike (3 AP):
  AP: 5 - 3 = 2 remaining
  
Play Guard (2 AP):
  AP: 2 - 2 = 0 remaining
  
End Turn (no AP left)

Turn 2:
  AP: 0 + 5 = 5  ✓ AP refreshed!
```

### Saving AP for Combos

```
Turn 1: Skip turn (save 5 starting AP)
  AP: 5 (no gain on turn 1)

Turn 2: Skip turn again (save all AP)  
  AP: 5 + 5 = 10

Turn 3: Skip one more time!
  AP: 10 + 5 = 15

Turn 4: Unleash combo!
  Play Strike (3 AP): AP = 12
  Play Strike (3 AP): AP = 9
  Play Nova (5 AP): AP = 4
  Total: 11 AP spent in one turn!
```

## Strategy Tips

### 1. **Early Game Banking**
Skip the first 2-3 rounds to accumulate 10-15 AP for a devastating combo.
- Turn 1: 5 AP (starting amount)
- Turn 2: 10 AP (if skipped turn 1)
- Turn 3: 15 AP (if skipped turns 1-2)

### 2. **Efficient Spending**
- Use low-cost cards (Guard, Weaken) when AP is low
- Save high-cost cards (Nova, Bash) for when you have 10+ AP

### 3. **Defensive Turns**
When enemies are weakened or guarding, skip your turn to save AP for later.

### 4. **Combo Planning**
- **Weaken + Strike**: Apply Vulnerable (2 AP) then Strike (3 AP) = 8 damage for 5 AP total
- **Weaken + Nova**: Vulnerable (2 AP) then Nova (5 AP) = 6 AOE damage for 7 AP total
- **Triple Strike**: Save 9 AP to play 3 Strikes in one turn = 18 damage!
- **Guard + Mend + Strike**: Full support combo (2+3+3=8 AP)
- **Double Weaken + Strike**: Stack vulnerable (if implemented) for even more damage

### 5. **Team Coordination**
- One player guards while others save AP
- Rotate who spends AP vs. who saves
- Coordinate big combo turns

## UI Indicators

### AP Display
- Top of hand shows: **"AP: 12/30"** (current / maximum)
- Updates in real-time as you play cards

### Round Start Notification
When a new round begins (Turn 2+), you'll see:
```
+5 AP
Total: 10 AP
```
Note: You won't see this notification on Turn 1 since you start with 5 AP.

### Card Queue Display
When you play cards, you'll see:
```
✓ Strike queued! AP: 7/10 | 1 card(s) ready
✓ Guard queued! AP: 5/7 | 2 card(s) ready
```

### End Turn Button
Shows how many cards you've queued:
```
🔒 END TURN (2 cards)
```

### Skip Turn Button
Bottom right corner, shows how much AP you'll save:
```
⏩ Skip (Save 10 AP)
```

## Multi-Action Combat

**All queued cards are now executed in sequence!**

When you play multiple cards in one turn:
1. Cards execute in the order you played them
2. Status effects apply immediately to subsequent actions
3. 800ms animation delay between each card for visual clarity

**Example:**
```
Turn: 10 AP
1. Play Weaken on Enemy (2 AP) → Enemy becomes vulnerable
2. Play Strike on Enemy (3 AP) → Deals 6 + 2 = 8 damage!
3. Play Guard on Ally (2 AP) → Ally gains 3 shield
Total: 7 AP spent, 3 cards executed in one turn!
```

## Future Enhancements

Planned improvements:
- [x] Multi-action resolution (play all queued cards in one turn) ✓ DONE
- [ ] AP transfer between players
- [ ] Cards that generate AP
- [ ] AP cost reduction effects
- [ ] Visual AP meter/bar
- [ ] AP gain on enemy defeat
- [ ] Vulnerability stacking (multiple Weakens = +4, +6 damage, etc.)

## FAQ

**Q: What happens if I don't spend all my AP?**  
A: It carries over! You'll have even more AP next round.

**Q: Can I go over 30 AP?**  
A: No, AP is capped at 30 to prevent infinite accumulation.

**Q: Does skipping a turn do anything?**  
A: Yes! It saves all your AP for future rounds while your team acts.

**Q: Can I play multiple cards in one turn?**  
A: Yes! Play as many cards as you have AP for. They'll execute in sequence with 800ms between each action.

**Q: What if I run out of AP mid-combo?**  
A: Cards you can't afford are grayed out in your hand. You can only select cards you have AP for.

