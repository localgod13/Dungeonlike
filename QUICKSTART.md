# Quick Start Guide

## 🚀 Installation & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser** to `http://localhost:3000`

## 🎮 What You'll See

### Main Menu
- Click **"PLAY"** to enter the lobby

### Lobby
- Shows connected players (currently single-player mode)
- Click **"Start Game"** to begin

### Gameplay (Run Scene)
- A tiled dungeon room with walls and floor
- A blue circle (the "Vessel") in the center
- HUD at the top showing:
  - **Phase**: Current turn phase (Idle/Planning/Resolving/EnemyTurn)
  - **Round**: Current round number
  - **Seed**: Random seed for this run (in hex)

## 🎯 Current Features

### Turn-Based Gameplay
1. Press `SPACE` to start **Planning** phase
2. Click any floor tile to plan the Vessel's movement
   - A semi-transparent highlight appears at the target location
3. Press `SPACE` again to **Resolve** the turn
   - The Vessel smoothly moves to the planned position
4. Press `SPACE` to start the next turn

### Controls
- `SPACE` - Start planning / Resolve turn
- `CLICK` - Plan movement (during Planning phase)
- `ESC` - Return to main menu

## 📁 Project Structure

```
/src
  /scenes        # Phaser scenes (Boot → Preload → MainMenu → Lobby → Run)
    Boot.ts      # Initial setup
    Preload.ts   # Asset loading
    MainMenu.ts  # Title screen
    Lobby.ts     # Player gathering
    Run.ts       # Main gameplay

  /game          # Core game logic
    config.ts    # Game configuration
    grid.ts      # Tile grid system
    vessel.ts    # Shared pawn (the Vessel)
    turn.ts      # Turn state machine
    rng.ts       # Seeded random number generator
    cards.ts     # Card system (placeholder)

  /net           # Networking (prepared for multiplayer)
    supa.ts      # Supabase client
    lobby.ts     # Lobby management
    proto.ts     # Network protocol schemas
    realtime.ts  # Real-time communication

  /ui            # UI components
    hud.ts       # Top bar (phase, round, seed)
    lobbyUi.ts   # Lobby interface
    voteUi.ts    # Action voting panel

  main.ts        # Entry point
```

## 🔧 Architecture Highlights

### Modular Design
- Each system is self-contained and testable
- Clear separation between game logic, networking, and UI
- Type-safe with TypeScript + Zod validation

### Turn System
- **State Machine**: Idle → Planning → Resolving → EnemyTurn
- **Deterministic**: All actions use seeded RNG
- **Observable**: Subscribe to state changes via `TurnManager`

### Grid System
- Orthographic tile grid (32x32px tiles)
- 20x15 room with walls on borders
- World ↔ Grid coordinate conversion
- Walkability checking

### Vessel (Shared Pawn)
- Single pawn controlled by all players
- Planned movement preview
- Smooth animated transitions
- Position synchronized across models

## 🌐 Multiplayer (3-Player Lobbies)

**Now fully functional!** The game supports real-time multiplayer lobbies:

### Features
- **Anonymous Authentication**: No signup required, just enter a name
- **Code-Based Joining**: Share a 5-character code to invite friends
- **3-Player Cap**: Enforced at both database and UI level
- **Realtime Updates**: Ready states sync instantly via Supabase Realtime
- **Row Level Security**: Lobbies are private - only members can see data
- **Host Controls**: Only host can start the game (when all ready)

### Setup Required
See [README.md](./README.md) for complete Supabase setup instructions:
1. Create Supabase project
2. Get API credentials
3. Create `.env` with credentials
4. Run `supabase-schema.sql` in SQL Editor
5. Enable anonymous auth

### Quick Test
```bash
# Open 3 browser tabs
# Tab 1: Create lobby, copy code
# Tab 2 & 3: Join using code
# All: Click Ready
# Host: Start Run when all ready
```

## 🐛 Development

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

### Build for Production
```bash
npm run build
npm run preview
```

### Debug Mode
When running in dev mode, the game instance is available in the console:
```javascript
window.game  // Phaser.Game instance
```

## ✅ Acceptance Criteria Met

✓ **Vite + TypeScript + Phaser 3** scaffold  
✓ **Modular folder structure** (/scenes, /game, /net, /ui)  
✓ **Phaser config**: pixelArt on, DPR aware, fixed 60 FPS, resize handling  
✓ **Grid renderer**: Orthographic tiles, walls/floors  
✓ **Shared vessel**: Circle sprite with movement preview highlight  
✓ **Turn state machine**: Idle → Planning → Resolving → EnemyTurn  
✓ **HUD**: Top bar with Phase, Round#, Seed  
✓ **Scene flow**: Boot → Preload → MainMenu → Lobby → Run  
✓ **Interactive**: Click to plan movement, SPACE to advance turns  

## 🎨 Visual Design

- **Dark theme**: Black background, dark gray walls/floors
- **Vessel**: Blue circle with white outline
- **Highlight**: Light blue semi-transparent preview
- **HUD**: Phase color-coded (blue=Planning, orange=Resolving, red=Enemy)
- **Grid lines**: Subtle gray lines for tile visibility

## 🚧 Next Steps

Ready for **Prompt 2** when you are! The foundation is solid:
- Turn system works perfectly
- Grid and movement are smooth
- UI is functional and clean
- Network layer is ready for activation
- Code is modular and maintainable

Enjoy exploring the dungeon! 🏰

