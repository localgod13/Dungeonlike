# D10 Dice Roll System

## How It Works

Every chance-based event now uses a **10-sided dice (d10)** with numbers 1-10.

### Formula
```
threshold = ceil((100 - successPercent) / 10) + 1
success = (roll >= threshold)
```

### Examples

| Success Chance | Threshold | Succeeding Rolls | Count |
|---------------|-----------|------------------|-------|
| **70%** | 4+ | 4,5,6,7,8,9,10 | 7/10 ✓ |
| **60%** | 5+ | 5,6,7,8,9,10 | 6/10 ✓ |
| **50%** | 6+ | 6,7,8,9,10 | 5/10 ✓ |
| **40%** | 7+ | 7,8,9,10 | 4/10 ✓ |
| **30%** | 8+ | 8,9,10 | 3/10 ✓ |
| **20%** | 9+ | 9,10 | 2/10 ✓ |
| **10%** | 10 | 10 | 1/10 ✓ |

---

## Visual Experience

### 1. **Setup Phase** (shows before roll)
```
ROLLING D10...
Need 4+ to succeed
     ?
```

### 2. **Rolling Phase** (1 second animation)
Numbers cycle rapidly:
```
ROLLING D10...
Need 4+ to succeed
     7
```

### 3. **Result Phase** (shows final result)
```
ROLLING D10...
Need 4+ to succeed
     8  ← GREEN (success) or RED (fail)
  SUCCESS!
   8 ≥ 4
```

---

## In-Game Examples

### Intimidate Bandits (70% success)
```
ROLLING D10...
Need 4+ to succeed
[Numbers cycle: 2, 9, 1, 5, 3...]
     6  ← GREEN
  SUCCESS!
   6 ≥ 4
```
**Result:** Bandits flee, you gain 25 gold!

---

### Drink Cursed Fountain (50% success for card, 50% for damage)
```
ROLLING D10...
Need 6+ to succeed
[Numbers cycle: 8, 2, 7, 4, 1...]
     3  ← RED
  FAILED!
   3 < 6
```
**Result:** You take 15 damage from the cursed waters!

---

### Steal From Shrine (50% chance of curse)
```
ROLLING D10...
Need 6+ to succeed
[Numbers cycle: 5, 9, 2, 6, 8...]
     7  ← GREEN
  SUCCESS!
   7 ≥ 6
```
**Result:** You avoid the curse and keep the gold!

---

## Technical Details

- **Duration:** 1 second roll animation + 2 seconds result display
- **Sound:** Click on each number cycle, special sound on result
- **Animation:** Numbers bounce and change color on final result
- **Clear Feedback:** Shows both the comparison (8 ≥ 4) and outcome

---

## Why This Is Better

✅ **Transparent** - You see the exact roll and threshold  
✅ **Realistic** - Actual dice mechanics, not hidden RNG  
✅ **Tense** - Watching numbers cycle builds suspense  
✅ **Fair** - Easy to verify the math (70% = 7 out of 10 numbers)  
✅ **D&D-like** - Familiar to tabletop RPG players

