# Map Scene Voting & Cursor Tracking - FIXED

## 🐛 **Issues Fixed**

### **1. Voting Not Working Properly**
**Problem:** Votes weren't being tracked correctly in multiplayer

**Root Cause:**
- Own votes were being excluded from `mapVotes` Map
- Vote counting logic was checking `mapVotes.size + (myVote ? 1 : 0)`
- This caused confusion about whether all players had voted

**Solution:**
- Store ALL votes (including own) in `mapVotes` Map
- Vote recording now adds to `mapVotes` immediately
- Network echo also adds to `mapVotes` (no filtering of own votes)
- Simplified vote checking: just check `mapVotes.size >= totalPlayers`

### **2. Missing Cursor Tracking**
**Problem:** Couldn't see other players' cursors in map scene

**Root Cause:**
- No cursor tracking system in MapScene
- No subscription to cursor movement events

**Solution:**
- Added cursor tracking infrastructure
- Subscribe to `onCursorMove` in network
- Send cursor updates on `pointermove` event
- Display remote cursors with player names

---

## ✅ **Changes Made**

### **File: `src/scenes/MapScene.ts`**

#### **1. Added Cursor Tracking Variables:**
```typescript
// Cursor tracking
private remoteCursors = new Map<string, Phaser.GameObjects.Container>();
private cursorThrottle = 0;
private readonly CURSOR_THROTTLE_MS = 50;
```

#### **2. Fixed Vote Tracking:**
```typescript
// Before
private mapVotes = new Map<string, string>(); // Remote only
private myVote: string | null = null; // Separate tracking

// After
private mapVotes = new Map<string, string>(); // ALL votes including own!
```

#### **3. Fixed Vote Recording:**
```typescript
// In voteForNode():
if (this.userId) {
  this.mapVotes.set(this.userId, nodeId); // Add own vote to map
  console.log(`My vote recorded: ${this.userId} -> ${nodeId}`);
}
```

#### **4. Fixed Vote Checking:**
```typescript
// Before
const votesReceived = this.mapVotes.size + (this.myVote ? 1 : 0);

// After
const votesReceived = this.mapVotes.size; // Already includes everyone
```

#### **5. Fixed Vote Resolution:**
```typescript
// Before
// Add remote votes
for (const [userId, nodeId] of this.mapVotes.entries()) { ... }
// Add my vote separately
if (this.myVote) { ... }

// After
// Add all votes from mapVotes (already includes everyone)
for (const [userId, nodeId] of this.mapVotes.entries()) { ... }
```

#### **6. Added Cursor Methods:**
```typescript
private sendCursorPosition(x: number, y: number): void {
  // Throttle updates to 50ms
  // Send to network
}

private handleCursorMove(cursor: CursorPosition): void {
  // Create/update cursor visual
  // Show player name label
  // Smooth position updates
}
```

#### **7. Setup Cursor Subscription:**
```typescript
subscribeMap(this.lobbyId, {
  onMapVote: this.handleRemoteVote.bind(this),
  onMapVoteResult: this.handleVoteResult.bind(this),
  onCursorMove: this.handleCursorMove.bind(this), // NEW!
})

// Setup cursor sending
this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
  this.sendCursorPosition(pointer.x, pointer.y);
});
```

#### **8. Added showVoted() Visual Feedback:**
```typescript
showVoted(): void {
  // Bounce animation
  // Checkmark sparkle effect
}
```

---

## 🎯 **How It Works Now**

### **Voting Flow:**

**Turn 1 - Player 1 Votes:**
```
1. Player 1 clicks node "battle_3"
2. Vote added locally: mapVotes.set(player1_userId, "battle_3")
3. Vote sent to network
4. UI updates: "1/2 votes"
5. Host checks: 1 < 2, waiting...
```

**Turn 2 - Player 2 Votes:**
```
1. Player 2 clicks node "battle_3"
2. Vote added locally: mapVotes.set(player2_userId, "battle_3")
3. Vote sent to network
4. UI updates: "2/2 votes"
5. Host checks: 2 >= 2, RESOLVE!
6. Host counts votes and broadcasts result
7. All players transition to selected node
```

### **Cursor Tracking:**

**Continuous:**
```
1. Player moves mouse
2. sendCursorPosition() throttles to 50ms
3. Cursor position broadcasted
4. Other players receive cursor update
5. Remote cursor visual created/updated
6. Player name label shown
7. Smooth tween animation
```

---

## 🎨 **Visual Features**

### **Voting UI:**
- Shows "X/Y votes" progress
- Shows your selected node
- Updates in real-time

### **Cursor Display:**
- Green pointer triangle
- Player name label with black background
- Smooth movement with tweens
- Auto-cleanup on scene shutdown

### **Vote Feedback:**
- Node bounces when clicked
- Checkmark ✓ appears and floats up
- Fades out after 1 second

---

## 🔍 **Debug Logging**

**Vote Tracking:**
```
📨 Remote vote from user123: battle_3
Current vote map: [['user123', 'battle_3'], ['user456', 'shop_2']]
📊 Vote check: 2/2 votes received
✅ All votes received, resolving...
```

**Missing Votes:**
```
⏳ Waiting for more votes (1 remaining)
Missing votes from: ['Player2']
```

---

## ✅ **Testing Checklist**

- [x] Two players can see each other's cursors
- [x] Cursor shows correct player name
- [x] Voting UI shows both players' votes
- [x] "1/2 votes" updates to "2/2 votes"
- [x] All players transition when voting complete
- [x] Visual feedback on node selection
- [x] No duplicate vote processing
- [x] Host correctly resolves ties

---

## 🚀 **Result**

✅ **Voting system now works correctly** - tracks all votes and transitions when complete  
✅ **Cursor tracking implemented** - see other players' mouse positions and names  
✅ **Better debug logging** - clear visibility into vote state  
✅ **Visual feedback** - bouncy animations and checkmarks  

Players can now properly vote together and see each other's interactions on the map! 🗺️✨

