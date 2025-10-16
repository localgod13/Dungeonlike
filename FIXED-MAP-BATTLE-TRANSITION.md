# Fixed: Map to Battle Transition Errors

## Problem

When transitioning from MapScene → CardSelectScene → BattleScene, two critical errors occurred:

### Error 1: Scene Context Issues
```
TypeError: Cannot read properties of undefined (reading 'sys')
at BattleScene.refreshLogEntries (BattleScene.ts:2824)
```

**Cause**: BattleScene was trying to create UI text objects before the scene was fully active/ready.

### Error 2: Stale Network Callbacks
```
TypeError: Cannot read properties of null (reading 'drawImage')
at CardSelectScene.updatePlayerStatus (CardSelectScene.ts:341)
```

**Cause**: CardSelectScene was still receiving and processing network updates after transitioning away to BattleScene, trying to update destroyed UI elements.

## Root Causes

1. **Scene Lifecycle Issues**: Scenes were transitioning before properly cleaning up
2. **Network Callbacks**: Supabase subscriptions were still active after scene transition
3. **Race Conditions**: UI elements being created/updated in transitioning scenes

## Solutions Implemented

### 1. Added Scene Ready Checks (BattleScene)

```typescript
// In addCombatLogEntry()
if (!this.scene.isActive() || !this.add) {
  console.warn('Cannot add combat log entry: scene not ready');
  return;
}

// In refreshLogEntries()
if (!this.scene.isActive()) {
  console.warn('Cannot refresh log entries: scene not active');
  return;
}
```

**Why**: Prevents UI operations on scenes that aren't fully ready or are shutting down.

### 2. Early Network Unsubscribe (CardSelectScene)

```typescript
private transitionToBattle(loadouts: Loadout[]): void {
  // Unsubscribe from network updates BEFORE transitioning
  if (this.unsubscribe) {
    this.unsubscribe();
    this.unsubscribe = null;
  }
  
  // Then transition
  this.scene.start('BattleScene', { ... });
}
```

**Why**: Ensures network callbacks stop firing before the scene transitions, preventing stale updates.

### 3. Guard All Network Callbacks (CardSelectScene)

Added to all network handlers:
- `handleRemotePick()`
- `handleRemoteSwap()`
- `handleRemoteReady()`
- `handleCommit()`

```typescript
private handleRemoteReady(userId: string, ready: boolean): void {
  // Safety check: don't process if scene is shutting down
  if (!this.scene.isActive()) return;
  
  // ... rest of handler
}
```

**Why**: Last line of defense - even if callbacks fire, they won't try to update UI if scene is inactive.

### 4. Map Seed Persistence

Added proper data flow to maintain the same map across battles:

```typescript
// Flow: MapScene → CardSelectScene → BattleScene → MapScene (same map!)

// MapScene stores and passes seed
this.scene.start('CardSelectScene', {
  lobbyId: this.lobbyId,
  players: this.players,
  mapSeed: this.gameMap.seed, // Pass along
});

// CardSelectScene receives and passes seed
init(data: { lobbyId: string; players: Player[]; mapSeed?: number }): void {
  this.mapSeed = data.mapSeed;
}

// BattleScene receives and passes seed back
init(data: { ... mapSeed?: number }): void {
  this.mapSeed = data.mapSeed;
}

// Returns to same map after victory
this.scene.start('MapScene', {
  lobbyId: this.lobbyId,
  players: this.players,
  mapSeed: this.mapSeed || Date.now(),
});
```

**Why**: Players now return to the SAME map after each battle, maintaining progression.

## Testing Checklist

✅ MapScene → Battle node → Card Select → Battle → MapScene (back to same map)
✅ No console errors during transitions
✅ Network callbacks don't fire after scene change
✅ UI elements only created when scene is ready
✅ Same map persists across multiple battles

## Technical Details

### Scene Lifecycle in Phaser

1. **init()** - Scene initialized with data
2. **create()** - Scene fully created, ready for objects
3. **update()** - Game loop
4. **shutdown()** - Scene stopping (but not destroyed)
5. **destroy()** - Scene fully destroyed

### Why `scene.start()` Wasn't Enough

`scene.start()` does stop the current scene and start a new one, BUT:
- Network callbacks can still have references to the old scene
- Async operations might complete after transition starts
- Scene might be "inactive" but not fully shut down yet

### The Fix Strategy

1. **Defensive Programming**: Check scene state before any UI operation
2. **Explicit Cleanup**: Unsubscribe before transitioning, not in shutdown
3. **Data Continuity**: Pass state through scene chain to maintain context

## Performance Impact

Minimal - safety checks are simple boolean checks that execute in microseconds.

## Future Improvements

1. **Scene Manager**: Create a centralized scene transition manager
2. **State Machine**: Implement proper state machine for scene transitions
3. **Event Bus**: Use event bus instead of direct scene transitions
4. **Map Persistence**: Save map state to database for multiplayer sync

## Related Files

- `src/scenes/BattleScene.ts` - Added scene ready checks
- `src/scenes/CardSelectScene.ts` - Fixed network callback lifecycle
- `src/scenes/MapScene.ts` - Added map seed passing
- `src/game/mapgen.ts` - Map generation (unchanged)

## Lessons Learned

1. **Always check scene state** before creating/modifying objects
2. **Unsubscribe early** - don't wait for shutdown hooks
3. **Network callbacks outlive scenes** - guard against this
4. **Phaser scene transitions aren't instant** - race conditions are real
5. **Pass state explicitly** - don't rely on scene persistence

## Credits

Fixed the transition issues while maintaining the core map generation system.

