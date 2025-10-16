# Darkest-Like

A turn-based, online co-op dungeon crawler where up to 8 players coordinate to control a single shared pawn (the "Vessel") on a grid.

## Features

- **Lockstep Turn System**: All actions are queued and resolved deterministically
- **Vote/Host Resolve**: Players queue intended actions; host resolves them in order
- **Seeded RNG**: Deterministic gameplay using seeded random number generation
- **Real-time Coordination**: Tight network protocol over Supabase Realtime
- **Card-based Actions**: Players play cards from role-based decks (coming soon)

## Tech Stack

- **Phaser 3**: Game engine
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Supabase**: Backend and real-time communication
- **Zod**: Runtime type validation
- **Zustand**: State management (coming soon)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- **Supabase account** (required for multiplayer lobbies)

### Installation

```bash
npm install
```

### Supabase Setup

#### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Name your project (e.g., "darkest-like")
4. Set a strong database password
5. Choose a region close to you
6. Wait for project to be ready (~2 minutes)

#### 2. Get API Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy your **Project URL** (under Project API)
3. Copy your **anon/public key** (under Project API keys)

#### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### 4. Run SQL Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase-schema.sql` (in project root)
4. Paste into the SQL editor
5. Click **Run** or press `Ctrl+Enter`
6. Verify success message: "Schema setup complete! Tables created successfully."

#### 5. Enable Anonymous Auth (Important!)

1. Go to **Authentication** → **Providers**
2. Find **Anonymous sign-ins** and toggle it **ON**
3. Save changes

### Development

```bash
npm run dev
```

The game will open at `http://localhost:3000`

### Testing Multiplayer (3-Player Lobbies)

1. **Open 3 browser tabs** (or use incognito windows)
2. **Tab 1**: Enter name → Create Lobby → Copy the 5-char code
3. **Tab 2**: Enter name → Join Lobby → Paste code
4. **Tab 3**: Enter name → Join Lobby → Paste code
5. **Try a 4th tab**: Should see "Lobby is full (max 3)" error ✅
6. All tabs: Click **Ready** (updates instant across tabs) ✅
7. **Host (Tab 1)**: Click **Start Run** when all ready ✅

### Verifying RLS Security

Test that lobbies are private:

1. Create a lobby in Tab 1
2. Open browser DevTools → Console in Tab 2
3. Try to query another lobby directly:
```js
// This should FAIL (returns empty or error) because of RLS
const { data } = await supabase.from('lobbies').select('*');
console.log(data); // Should not see Tab 1's lobby
```
✅ RLS is working if you can't see other players' lobbies

### Build

```bash
npm run build
npm run preview
```

## Project Structure

```
/src
  /scenes        # Phaser scenes (Boot, Preload, MainMenu, Lobby, Run)
  /game          # Core game logic (grid, vessel, turn system, RNG)
  /net           # Networking (Supabase, lobby, protocol, realtime)
  /ui            # UI components (HUD, lobby UI, vote UI)
  main.ts        # Entry point
```

## How to Play

1. **Main Menu**: Click "PLAY" to enter the lobby
2. **Lobby**: Wait for other players (currently single-player)
3. **Gameplay**:
   - Press `SPACE` to start planning phase
   - Click on a tile to plan the Vessel's movement
   - Press `SPACE` again to resolve the turn
   - Watch the Vessel move to the planned position
4. **Controls**:
   - `SPACE`: Start/resolve turn
   - `ESC`: Return to main menu
   - `Click`: Plan movement during Planning phase

## Game Concepts

### Turn Phases

1. **Idle**: Between turns, waiting for next round
2. **Planning**: Players queue their intended actions
3. **Resolving**: Host executes all actions deterministically
4. **Enemy Turn**: Enemies take their actions (coming soon)

### The Vessel

The shared pawn that all players control together. Each player votes on where to move and what actions to take.

### Coordination

- Players can ping locations on the grid (coming soon)
- Ready/Lock buttons prevent accidental actions
- Action previews show what others have queued

## Roadmap

- [x] Basic grid renderer
- [x] Shared vessel (pawn)
- [x] Turn state machine
- [x] HUD display
- [x] Planning phase with movement preview
- [ ] Enemies and combat
- [ ] Card system
- [ ] Role-based decks
- [ ] Multiplayer lobby
- [ ] Real-time synchronization
- [ ] Dungeon generation
- [ ] Loot and progression

## Development

### Code Style

```bash
npm run lint
npm run format
```

### Key Modules

- **config.ts**: Game configuration and Phaser setup
- **grid.ts**: Tile grid system (orthographic view)
- **vessel.ts**: Shared pawn logic
- **turn.ts**: Turn-based state machine
- **rng.ts**: Seeded RNG for deterministic gameplay
- **proto.ts**: Network protocol schemas

## License

MIT

## Credits

Inspired by Darkest Dungeon's tactical gameplay and co-op coordination mechanics.

