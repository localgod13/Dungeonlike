# Supabase Setup Checklist

Complete these steps to enable multiplayer lobbies with 3-player cap, realtime updates, and RLS security.

## ✅ Checklist

### 1. Supabase Project Setup
- [ ] Create account at [supabase.com](https://supabase.com)
- [ ] Create new project (name: "darkest-like" or similar)
- [ ] Set strong database password
- [ ] Choose region close to your location
- [ ] Wait for project initialization (~2 min)

### 2. Get Credentials
- [ ] Go to **Settings** → **API** in Supabase dashboard
- [ ] Copy **Project URL** (e.g., `https://xxx.supabase.co`)
- [ ] Copy **anon public key** (long string under "Project API keys")

### 3. Configure Local Environment
- [ ] Copy `.env.example` to `.env`
  ```bash
  cp .env.example .env
  ```
- [ ] Edit `.env` and paste your credentials:
  ```env
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGc...your-key-here
  ```

### 4. Run SQL Schema
- [ ] Go to **SQL Editor** in Supabase dashboard
- [ ] Click **New Query**
- [ ] Open `supabase-schema.sql` in your project
- [ ] Copy **entire file contents**
- [ ] Paste into SQL editor
- [ ] Click **Run** (or `Ctrl+Enter`)
- [ ] Verify success: "Schema setup complete! Tables created successfully."

### 5. Enable Anonymous Auth
- [ ] Go to **Authentication** → **Providers**
- [ ] Find **Anonymous sign-ins**
- [ ] Toggle to **ON** (should turn green)
- [ ] Click **Save**

### 6. Install Dependencies
- [ ] Run `npm install` in project directory

### 7. Test Setup
- [ ] Run `npm run dev`
- [ ] Open `http://localhost:3000`
- [ ] Enter a name and click Continue
- [ ] Should reach Create/Join lobby screen ✅

---

## 🧪 Testing 3-Player Cap & Realtime

### Multi-Tab Test

1. **Open 3 browser tabs** (or use incognito/different browsers)

2. **Tab 1 (Host)**:
   - Enter name (e.g., "Alice")
   - Click "Create Lobby"
   - **Copy the 5-character code** displayed
   - You should see:
     - Code at top with "Copy" button
     - 3 slots (Slot 1 filled with your name + 👑 Host)
     - Ready button
     - Leave button
     - Start Run button (disabled - "Need 1+ players")

3. **Tab 2 (Player 2)**:
   - Enter name (e.g., "Bob")
   - Paste code in input field
   - Click "Join Lobby"
   - You should see:
     - Same code
     - 2 slots filled (Alice as host, Bob as not ready)
     - Ready button
     - Leave button
     - NO Start button (not host)

4. **Tab 3 (Player 3)**:
   - Enter name (e.g., "Charlie")
   - Paste code
   - Click "Join Lobby"
   - All tabs update instantly showing 3 members ✅

5. **Tab 4 (4th attempt - should FAIL)**:
   - Enter name (e.g., "Dave")
   - Paste code
   - Click "Join Lobby"
   - **Should see error**: "Lobby is full (max 3 players)" ✅

### Ready State Test

1. In **Tab 1** (Alice), click **Ready**
   - Button turns green with "✓ Ready"
   - **All other tabs update instantly** showing Alice as ready ✅

2. In **Tab 2** (Bob), click **Ready**
   - All tabs update ✅

3. In **Tab 3** (Charlie), click **Ready**
   - All tabs show all 3 players ready ✅
   - **Tab 1** (host): "Start Run" button becomes enabled ✅

4. In **Tab 1** (Alice), click **Start Run**
   - All tabs transition to game scene simultaneously ✅

### Capacity Enforcement Test

The 3-player cap is enforced at **3 levels**:

1. **Client-side check** (UX): Shows error before attempting DB insert
2. **RLS Policy** (`lobby_has_capacity` function): DB rejects insert if ≥3 members
3. **UI validation**: Only shows 3 slots maximum

---

## 🔒 Testing RLS Security

### Verify Lobbies Are Private

1. **Tab 1**: Create lobby, note the lobby ID from console logs
2. **Tab 2**: Don't join - stay on create/join screen
3. **Tab 2 Console** (F12 → Console):
   ```js
   // Try to read all lobbies
   const { data } = await window.supabase.from('lobbies').select('*');
   console.log(data);
   ```
   **Expected**: Empty array `[]` or only lobbies you're a member of
   **NOT EXPECTED**: Seeing Tab 1's lobby (RLS blocked it) ✅

4. **Tab 2**: Now join Tab 1's lobby
5. **Tab 2 Console**:
   ```js
   const { data } = await window.supabase.from('lobbies').select('*');
   console.log(data);
   ```
   **Expected**: Now you CAN see the lobby (you're a member) ✅

---

## 🐛 Troubleshooting

### "Missing Supabase credentials" Error
- Check `.env` file exists in project root
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
- Restart dev server after changing `.env`

### "Failed to create lobby" Error
- Run SQL schema: Make sure you executed `supabase-schema.sql`
- Check Supabase dashboard → Table Editor → verify `lobbies` and `lobby_members` tables exist

### "Authentication failed" Error
- Go to Supabase **Authentication** → **Providers**
- Verify **Anonymous sign-ins** is enabled (toggled ON)

### Can't Join Lobby (Code Not Found)
- Code is case-insensitive but must be exact 5 characters
- Verify lobby hasn't already started
- Check host hasn't left (deletes lobby)

### Realtime Not Working (Changes Don't Sync)
- Verify Supabase project is running (not paused)
- Check browser console for Realtime connection errors
- Ensure SQL schema included realtime publication setup

### 4th Player Can Join (Cap Not Working)
- Re-run `supabase-schema.sql` to ensure `lobby_has_capacity` function exists
- Check RLS policies are enabled on `lobby_members` table
- Verify policy `"members.insert self if capacity"` exists

---

## 📊 What Gets Created in Supabase

### Tables
- `lobbies` - Lobby metadata (code, created_by, started_at)
- `lobby_members` - Member list (lobby_id, user_id, name, is_host, ready)

### Functions
- `lobby_has_capacity(lobby_id)` - Returns false if ≥3 members

### RLS Policies
- `lobbies.insert by creator` - Only creator can create lobby
- `lobbies.select for members` - Only members can read lobby
- `lobbies.update by host` - Only host can start game
- `members.insert self if capacity` - Users can join if <3 members
- `members.select in my lobby` - Can see members in your lobby
- `members.update self` - Can update own ready state
- `members.delete self` - Can leave lobby

### Realtime
- Both tables added to `supabase_realtime` publication
- Enables instant member list updates
- Enables instant ready state changes

---

## ✨ Success Criteria

You've completed setup successfully if:

✅ Can enter name and authenticate  
✅ Can create lobby and see 5-char code  
✅ Can join lobby with code (in different tab)  
✅ 3rd player can join  
✅ 4th player gets "Lobby is full" error  
✅ Ready state updates instantly across all tabs  
✅ Host sees "Start Run" enable when all ready  
✅ Clicking "Start Run" transitions all tabs to game  
✅ RLS prevents seeing lobbies you're not in  

---

## 📝 Next Steps After Setup

Once multiplayer lobbies work:
- Implement shared Vessel movement
- Add turn coordination system
- Build card voting mechanics
- Add enemies and combat
- Create dungeon generation

Happy dungeon crawling! 🏰

