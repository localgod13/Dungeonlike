# Map System Documentation

## Overview

The map system provides a Slay the Spire-style node-based progression system for the dungeon crawler. After each battle, players navigate through a procedurally generated map with different node types.

## Architecture

### Files
- **`src/game/mapgen.ts`** - Map generation logic and algorithms
- **`src/scenes/MapScene.ts`** - Visual representation and interaction

## Map Generation

### Node Types
- **Start** (▲) - Entry point, blue accent color
- **Battle** (⚔) - Combat encounters, red (#ff4444)
- **Shop** (◆) - Purchase items/upgrades, gold (#ffaa00)
- **Event** (?) - Random events, blue (#44aaff)
- **Boss** (☠) - Final battle, purple (#aa44ff)

### Generation Algorithm

The map is generated procedurally with configurable parameters:

```typescript
{
  layers: 14,              // Number of vertical rows
  minNodesPerLayer: 3,     // Minimum nodes per row
  maxNodesPerLayer: 5,     // Maximum nodes per row
  connectionDensity: 0.6,  // Path connectivity (0-1)
  shopFrequency: 0.15,     // 15% chance for shop
  eventFrequency: 0.25,    // 25% chance for event
  seed: <number>           // Deterministic generation
}
```

**Layer Structure:**
1. Layer 0: Single start node
2. Layers 1-(n-1): Mixed node types based on frequencies
3. Layer n: Single boss node

**Connection Rules:**
- Each node connects to 1-3 nodes in the next layer
- Connections prefer nearby nodes (by column)
- All nodes have at least one incoming connection
- Paths diverge and converge for player choice

### Seeded Random Generation

Uses a custom seeded RNG for deterministic map generation:
- Same seed always produces the same map
- Important for multiplayer synchronization
- Can replay interesting seeds

## Visual Design

### Color Scheme
Consistent with existing game art style:
- Background: Dark (#0a0a0a) with subtle grid pattern
- Connections: Blue accent with transparency
- Node colors: Type-specific (see Node Types above)
- Available nodes: Pulsing glow effect
- Visited nodes: Dimmed (40% opacity)

### Layout
- **Vertical**: Bottom-to-top progression
- **Spacing**: 100px between layers, 120px between nodes
- **Starting position**: Bottom of screen (y=620)
- **Camera**: Scrollable for tall maps

### Node States
1. **Unavailable** (Gray)
   - Not yet accessible
   - Opacity: 60%
   - No interaction

2. **Available** (Full color)
   - Can be selected
   - Pulsing glow animation
   - Hover: Scale to 115%
   - Click: Animate and transition

3. **Visited** (Dimmed)
   - Already completed
   - Opacity: 40%
   - No interaction

## User Interaction

### Navigation
- **Mouse Wheel**: Scroll up/down through map
- **Keyboard**: Arrow keys or W/S to scroll
- **Click**: Select available node

### Node Selection
1. Player clicks on an available node
2. Node scales down briefly (feedback)
3. Node is marked as visited
4. Connected nodes become available
5. Scene transitions based on node type:
   - Battle/Boss → CardSelectScene
   - Shop → ShopScene (TODO)
   - Event → EventScene (TODO)

## Game Flow Integration

### Current Flow
```
MainMenu → Lobby → CardSelectScene → BattleScene → MapScene → ...
```

### After Battle
- **Victory**: Transition to MapScene
- **Defeat**: Return to Lobby

### Map Persistence
Currently, a new map is generated after each battle. 

**TODO**: Implement map state persistence:
```typescript
interface RunState {
  mapSeed: number;
  visitedNodes: string[];
  currentLayer: number;
}
```

## Testing

### Development Mode
A "Test Map" button is available in the Lobby (DEV mode only):
- Located below the Back button
- Instantly launches MapScene
- Uses test lobby data

### Testing Different Seeds
```typescript
// In Lobby test button or console:
scene.start('MapScene', {
  lobbyId: 'test',
  players: [{ userId: 'test', name: 'Player', isHost: true }],
  mapSeed: 12345, // Try different seeds!
});
```

## Future Enhancements

### High Priority
1. **Shop Scene** - Purchase cards, relics, remove cards
2. **Event Scene** - Random encounters, choices, rewards
3. **Map State Persistence** - Save/load map progress
4. **Run State Management** - Track entire run (gold, relics, etc.)

### Medium Priority
5. **Rest Sites** - Heal HP, upgrade cards
6. **Elite Battles** - Harder enemies, better rewards
7. **Branching Paths** - More meaningful choice between paths
8. **Mini-boss Nodes** - Mid-run checkpoints

### Low Priority
9. **Path Preview** - Show what's ahead before choosing
10. **Tooltips** - Hover over nodes for details
11. **Animations** - Particle effects on node types
12. **Music** - Atmospheric map music

## Configuration

### Adjusting Map Difficulty
Edit `src/game/mapgen.ts` DEFAULT_CONFIG:

```typescript
// Longer run
layers: 20

// More shops
shopFrequency: 0.25

// More interconnected paths
connectionDensity: 0.8

// Wider maps
maxNodesPerLayer: 7
```

### Visual Customization
Edit constants in `MapScene`:

```typescript
private readonly NODE_RADIUS = 30;      // Node size
private readonly LAYER_HEIGHT = 100;    // Vertical spacing
private readonly NODE_SPACING = 120;    // Horizontal spacing
private readonly MAP_START_Y = 620;     // Starting position
```

## API Reference

### MapGen Functions

```typescript
// Generate new map
generateMap(config?: Partial<MapGenConfig>): GameMap

// Get nodes in specific layer
getNodesInLayer(map: GameMap, layer: number): MapNode[]

// Get nodes player can visit
getAvailableNodes(map: GameMap): MapNode[]

// Mark node as visited
visitNode(map: GameMap, nodeId: string): NodeType | null
```

### Data Structures

```typescript
interface MapNode {
  id: string;           // Unique identifier
  type: NodeType;       // Node type enum
  layer: number;        // Vertical position (0 = start)
  column: number;       // Horizontal position in layer
  connections: string[]; // Connected node IDs
  visited: boolean;     // Has been visited
}

interface GameMap {
  nodes: Map<string, MapNode>;
  layers: number;
  seed: number;
}
```

## Troubleshooting

### Map doesn't scroll
- Check camera bounds are set correctly
- Verify scroll factor on fixed UI elements

### Nodes not clickable
- Ensure nodes are marked as available
- Check depth/z-index ordering
- Verify node positions are within camera bounds

### Connections look wrong
- Check getNodePosition() calculations
- Verify connection logic in generateMap()
- Ensure nodes exist before drawing connections

### Same map every time
- Pass different seed to generateMap()
- Use Date.now() or random seed per run
- Store seed in run state for persistence

## Credits

Inspired by Slay the Spire's map system with customizations for multiplayer co-op dungeon crawler gameplay.

