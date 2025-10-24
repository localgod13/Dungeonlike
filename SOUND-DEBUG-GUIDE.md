# Debugging Sound Issues

## Problem: Weaken Sound Not Playing

### Step 1: Check Browser Console

Open your browser's Developer Tools (F12) and check the Console tab for these messages:

#### During Loading (Preload Scene):
```
[Preload] Loading sound assets...
[preloadSounds] Loading sound assets...
[preloadSounds] Queuing sfx_weaken from https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/weaken.mp3
[preloadSounds] Queued 6 sound files
```

**Look for:**
- ❌ `[Preload] Failed to load file: sfx_weaken` - Sound failed to load
- ✅ No errors = Sound loaded successfully

#### During Battle (When Using Weaken Card):
```
Animation: VFX from party_1 to enemy_1 (vulnerable)
VFX note detected: vulnerable
Playing Weaken sound...
[SoundManager] playCardSound called for: Weaken
[SoundManager] Mapped to sound key: sfx_weaken
[SoundManager] playSfx called for key: sfx_weaken, enabled: true
[SoundManager] Playing sfx_weaken at volume 0.56
[SoundManager] Sound sfx_weaken started playing
```

### Step 2: Common Issues & Solutions

#### Issue 1: Sound File Not Loading (CORS Error)
**Error:** `Failed to load file: sfx_weaken` or CORS policy error

**Solution:**
- The URL is already using jsDelivr CDN, which should prevent CORS
- Try accessing the URL directly in your browser: https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/weaken.mp3
- If it doesn't load, the file might not exist at that location

#### Issue 2: Sound Not Found in Cache
**Error:** `Sound not found in cache: sfx_weaken`

**Cause:** Sound didn't load during Preload scene

**Solution:**
1. Check if you see the loading logs in Step 1
2. Make sure you went through the Preload scene (didn't skip it)
3. Try refreshing the page completely (Ctrl+Shift+R)

#### Issue 3: SFX Disabled
**Warning:** `SFX disabled, skipping sound: sfx_weaken`

**Solution:**
In the browser console, type:
```javascript
// Enable SFX
game.scene.getScene('BattleScene').soundManager.toggleSfx(true);
```

#### Issue 4: Volume Too Low
**Check:** Look for the volume in the console: `Playing sfx_weaken at volume 0.XX`

**Solution:**
If volume is very low (< 0.1), increase it in console:
```javascript
// Set SFX volume to 100%
game.scene.getScene('BattleScene').soundManager.setSfxVolume(1.0);

// Set master volume to 100%
game.scene.getScene('BattleScene').soundManager.setMasterVolume(1.0);
```

#### Issue 5: VFX Not Triggering
**Missing:** You don't see `VFX note detected: vulnerable` in console

**Cause:** Weaken card's VFX effect isn't being created

**Solution:**
1. Make sure you're actually using the Weaken card (not another card)
2. Make sure the card requires a target and you're selecting an enemy
3. Check that the battle is actually resolving turns

### Step 3: Manual Sound Test

Test if the sound system works at all by running this in the console during battle:

```javascript
// Get the sound manager
const sm = game.scene.getScene('BattleScene').soundManager;

// Try to play weaken sound directly
sm.playSfx('sfx_weaken', { volume: 1.0 });

// If that doesn't work, check what sounds are loaded
console.log('Loaded sounds:', game.scene.getScene('BattleScene').cache.audio.getKeys());
```

### Step 4: Check Available Sounds

Run this to see all loaded sounds:

```javascript
const scene = game.scene.getScene('BattleScene');
console.log('Available audio files:', scene.cache.audio.getKeys());
```

You should see:
```
['sfx_strike', 'sfx_nova', 'sfx_mend', 'sfx_guard', 'sfx_bash', 'sfx_weaken']
```

If `sfx_weaken` is missing, the file didn't load.

### Step 5: Verify Sound File URL

Test the URL directly:
1. Open: https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/weaken.mp3
2. You should hear the sound play in your browser
3. If you get a 404 or error, the file doesn't exist at that location

### Step 6: Check Card Usage

Make sure you're using the Weaken card correctly:

1. **During Planning Phase**: Select the Weaken card from your hand
2. **Select Target**: Click on an enemy to target
3. **Lock Action**: Click "LOCK TURN"
4. **Wait for Resolution**: The sound should play when the VFX triggers

### Expected Flow:

```
Player selects Weaken card
  ↓
Player selects enemy target
  ↓
Player locks action
  ↓
Turn resolves
  ↓
Combat system creates VULN effect with note: 'vulnerable'
  ↓
BattleScene.onVfx callback detects note === 'vulnerable'
  ↓
SoundManager.playCardSound('Weaken') is called
  ↓
SoundManager.playSfx('sfx_weaken') is called
  ↓
Sound plays!
```

### Quick Fix Checklist:

- [ ] Refresh page completely (Ctrl+Shift+R)
- [ ] Check console for load errors
- [ ] Verify sound file URL works in browser
- [ ] Check that SFX is enabled
- [ ] Check volume levels
- [ ] Verify you're using Weaken card (not another card)
- [ ] Check that you're targeting an enemy
- [ ] Wait for turn resolution (don't skip animations)

### Still Not Working?

If none of the above helps, please provide:
1. Full console output when loading the game
2. Full console output when using Weaken card
3. Any red error messages in console
4. Screenshot of the issue

This will help diagnose the exact problem!























