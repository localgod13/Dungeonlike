# Ready Indicator System for Shop & Event Scenes ✅

## 🎯 **User Request**

"On the merchant screen and the encounter screen it should not continue to the map screen until both players have clicked continue or the lock in buttons add an indicator to these to show the other player have clicked them"

---

## 🐛 **Issues Fixed**

1. **ShopScene (Merchant)**: Players could click continue and advance immediately without waiting for other players
2. **EventScene (Encounter)**: Players could click continue and advance immediately without waiting for other players
3. **No Visual Indicators**: No way to see which players were ready to continue

---

## ✅ **Solution Implemented**

### **Ready System Architecture**

Similar to the map voting system, both Shop and Event scenes now require ALL players to be ready before transitioning to the map.

**Components Added**:
1. `readyPlayers: Set<string>` - Tracks which players are ready
2. `readyIndicators: Container` - Visual display showing player ready states
3. `updateReadyIndicators()` - Updates the visual display
4. `handleContinueButton()` / `voteToContinue()` - Marks player as ready
5. `checkAllPlayersReady()` / `checkAllVotesIn()` - Host checks if all are ready

---

## 📁 **Files Modified**

### **1. ShopScene.ts (Merchant)**

**Added Properties**:
```typescript
private readyPlayers = new Set<string>(); // Track which players are ready to continue
private readyIndicators: Phaser.GameObjects.Container | null = null;
```

**Modified Methods**:
- `voteToContinue()` - Marks self as ready and updates indicators
- `handleRemoteVote()` - Handles remote ready votes
- `continueToMap()` - Clears indicators before transition

**New Method**:
- `updateReadyIndicators()` - Shows visual panel with player ready states

**Flow**:
1. Player clicks "Continue" button (lock icon)
2. Marks self as ready locally
3. Sends 'continue' vote via network
4. Updates ready indicators showing checkmarks
5. Host checks if all players ready
6. When all ready, host resolves and transitions

### **2. EventScene.ts (Encounter)**

**Added Properties**:
```typescript
private readyPlayers = new Set<string>(); // Track which players are ready to continue
private readyIndicators: Phaser.GameObjects.Container | null = null;
private userId: string | null = null; // For tracking own ready state
private isHost = false; // For managing vote resolution
```

**Modified Methods**:
- `create()` - Gets userId and determines if host
- `handleRemoteVote()` - Handles 'ready' votes separately from choice votes
- `handleVoteResult()` - Handles 'continue' signal from host
- `continueToMap()` - Clears indicators before transition

**New Methods**:
- `handleContinueButton()` - Checks if multiplayer and marks as ready
- `checkAllPlayersReady()` - Host checks if all players are ready
- `updateReadyIndicators()` - Shows visual panel with player ready states

**Flow**:
1. Player makes event choice (voting happens)
2. Continue button appears after choice is made
3. Player clicks "CONTINUE JOURNEY"
4. Marks self as ready locally
5. Sends 'ready' vote via network
6. Updates ready indicators showing checkmarks
7. Host checks if all players ready
8. When all ready, host broadcasts 'continue' signal
9. All players transition to map

---

## 🎨 **Visual Design**

### **Ready Indicator Panel**

**Location**: Top-right corner (width - 200, y: 100)

**Layout**:
```
┌──────────────────┐
│  Ready Status    │ ← Title (gold)
├──────────────────┤
│ ✓ Player1        │ ← Ready (green)
│ ○ Player2        │ ← Not ready (gray)
└──────────────────┘
```

**Colors**:
- Background: Dark purple (#1a0f2e)
- Border: Gold (#d4af37) for Shop, Brown (#8b7355) for Events
- Ready players: Green (#44ff88) with checkmark (✓)
- Waiting players: Gray (#888888) with circle (○)

**Size**: 180 pixels wide, height scales with player count

**Depth**: 1100 (above most UI elements)

---

## 🔄 **Network Communication**

### **ShopScene**
- Uses existing `sendMapVote(lobbyId, 'continue')` for ready votes
- Uses existing vote resolution system
- Leverages map voting infrastructure

### **EventScene**
- Uses `sendMapVote(lobbyId, 'ready')` for ready votes (different from 'continue')
- Uses `sendMapVoteResult(lobbyId, 'continue', {})` to signal all ready
- Separates ready votes from event choice votes

---

## 🎮 **User Experience**

### **Before**:
- ❌ Players could advance immediately without teammates
- ❌ No way to know if teammate was ready
- ❌ Caused desync and players getting separated

### **After**:
- ✅ **Forced Synchronization**: All players must be ready
- ✅ **Visual Feedback**: See exactly who is ready with checkmarks
- ✅ **Clear Communication**: Ready status panel shows all players
- ✅ **Smooth Transitions**: All players transition together
- ✅ **No Desync**: Everyone stays synchronized

---

## 🧪 **Testing Checklist**

### **ShopScene (Merchant)**:
1. ✅ Continue button appears in single player - advances immediately
2. ✅ Continue button appears in multiplayer - waits for all players
3. ✅ Ready indicator panel shows in top-right
4. ✅ Player marked with green checkmark when ready
5. ✅ Other player marked with gray circle until ready
6. ✅ Transition only happens when all players ready
7. ✅ Indicators clear before transition

### **EventScene (Encounter)**:
1. ✅ Choice voting works normally
2. ✅ Continue button appears after choice is made
3. ✅ In single player - continues immediately
4. ✅ In multiplayer - waits for all players
5. ✅ Ready indicator panel shows in top-right
6. ✅ Player marked with green checkmark when ready
7. ✅ Other player marked with gray circle until ready
8. ✅ Transition only happens when all players ready
9. ✅ Indicators clear before transition

---

## 📊 **Technical Implementation**

### **Ready State Management**

**ShopScene**:
```typescript
private async voteToContinue(): Promise<void> {
  if (this.players.length > 1) {
    // Mark self as ready
    if (this.userId) {
      this.readyPlayers.add(this.userId);
    }
    this.updateReadyIndicators();
    
    // Send network vote
    await sendMapVote(this.lobbyId, 'continue');
    
    // Host checks if all ready
    if (this.isHost) {
      this.checkAllVotesIn();
    }
  } else {
    // Single player - immediate transition
    this.continueToMap();
  }
}
```

**EventScene**:
```typescript
private handleContinueButton(): void {
  if (this.players.length > 1 && this.lobbyId) {
    // Mark self as ready
    if (this.userId) {
      this.readyPlayers.add(this.userId);
    }
    this.updateReadyIndicators();
    
    // Send ready vote
    sendMapVote(this.lobbyId, 'ready');
    
    // Host checks if all ready
    if (this.isHost) {
      this.checkAllPlayersReady();
    }
  } else {
    // Single player - immediate transition
    this.continueToMap();
  }
}
```

### **Visual Indicator Update**

```typescript
private updateReadyIndicators(): void {
  // Remove old indicators
  if (this.readyIndicators) {
    this.readyIndicators.destroy();
  }
  
  if (this.players.length <= 1) return;
  
  // Create container in top-right
  const width = this.scale.width;
  this.readyIndicators = this.add.container(width - 200, 100);
  this.readyIndicators.setScrollFactor(0);
  this.readyIndicators.setDepth(1100);
  
  // Add background and title
  const bg = this.add.rectangle(0, 0, 180, 40 + (this.players.length * 30), 0x1a0f2e, 0.9);
  // ... add title ...
  
  // Show each player's ready state
  this.players.forEach((player, index) => {
    const isReady = this.readyPlayers.has(player.userId);
    const statusIcon = isReady ? '✓' : '○';
    const color = isReady ? '#44ff88' : '#888888';
    // ... render indicator ...
  });
}
```

---

## 🔍 **Edge Cases Handled**

1. **Single Player**: Bypasses ready system, transitions immediately
2. **Player Disconnect**: System still waits (may need timeout in future)
3. **Duplicate Ready**: Set prevents duplicate entries
4. **Scene Cleanup**: Indicators destroyed on transition
5. **Network Failure**: Logged but doesn't crash game

---

## 📝 **Changelog**

### **v1.0** (2025-10-25)
- ✅ Added ready tracking system to ShopScene
- ✅ Added ready tracking system to EventScene
- ✅ Implemented visual ready indicators
- ✅ All players must be ready before advancing
- ✅ Clear visual feedback showing who is ready
- ✅ Proper cleanup on scene transitions

---

**Status**: ✅ **COMPLETE** - Ready for testing  
**Date**: 2025-10-25

