# Sound System Documentation

## Overview

The sound manager provides centralized control for all audio in the game, including sound effects (SFX) and background music.

## Features

- **Automatic Card Sound Mapping**: Each card automatically plays its associated sound effect
- **Volume Control**: Separate volume controls for SFX, music, and master volume
- **Toggle Controls**: Enable/disable music and SFX independently
- **Automatic Cleanup**: Sounds are cleaned up after playing to prevent memory leaks
- **Smooth Transitions**: Fade in/out support for background music
- **Scene-Based Music**: Different music for Main Menu and Battle scenes

## Sound Assets

All sound files are loaded from the jsDelivr CDN for optimal performance and CORS compatibility:

### Sound Effects

| Card/Action | Sound File | CDN URL |
|-------------|------------|---------|
| Strike | strike.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/strike.mp3` |
| Nova | nova.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/nova.mp3` |
| Mend | heals.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/heals.mp3` |
| Guard | guard.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/guard.mp3` |
| Bash | bash.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/bash.mp3` |
| Weaken | weaken.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/weaken.mp3` |

### Background Music

| Scene | Music File | CDN URL |
|-------|------------|---------|
| Main Menu | title.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/title.mp3` |
| Battle Scene | battle1.mp3 | `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/battle1.mp3` |

## Architecture

### Files Modified/Created

1. **`src/game/sound.ts`** (NEW)
   - Core `SoundManager` class
   - Sound asset configuration
   - Helper function for preloading

2. **`src/scenes/Preload.ts`** (UPDATED)
   - Added sound preloading using `preloadSounds()`
   - Loads both SFX and background music

3. **`src/scenes/BattleScene.ts`** (UPDATED)
   - Added SoundManager instance
   - Plays battle music on scene start with fade in (2 second fade)
   - Music starts 2 seconds into the track (skips intro)
   - Sound playback integrated into animation callbacks
   - Cleanup on scene shutdown/destroy

4. **`src/scenes/MainMenu.ts`** (UPDATED)
   - Added SoundManager instance
   - Plays title music on scene start
   - Music continues when transitioning to Lobby

5. **`src/scenes/Lobby.ts`** (UPDATED)
   - Added SoundManager instance
   - Continues title music from MainMenu
   - Fades out music when transitioning to card selection (1.5 second fade)

6. **`src/scenes/CardSelectScene.ts`** (UPDATED)
   - Added SoundManager instance
   - Ensures title music is fully stopped when scene starts
   - Silent scene for card selection focus

4. **`src/game/combat.ts`** (UPDATED)
   - Card names passed to strike/heal/guard functions
   - Enables proper sound mapping for card actions

## Usage

### Playing Card Sounds

The system automatically plays sounds when cards are used:

```typescript
// Automatically plays when Strike card is used
this.soundManager.playCardSound('Strike');

// Works for all cards: Strike, Nova, Mend, Guard, Bash, Weaken
```

### Playing Custom Sound Effects

```typescript
// Play any loaded sound
this.soundManager.playSfx('sfx_strike', { 
  volume: 0.8,  // Optional: 0.0 to 1.0
  loop: false,  // Optional: loop the sound
  rate: 1.0     // Optional: playback speed
});
```

### Playing Background Music

```typescript
// Play battle music (loops by default)
this.soundManager.playMusic('music_battle', {
  volume: 0.3,  // 30% volume
  loop: true
});

// Play music starting at a specific position
this.soundManager.playMusic('music_battle', {
  volume: 0.3,
  loop: true,
  seek: 2.0  // Start 2 seconds into the track
});

// Play music with fade in effect
this.soundManager.playMusicWithFadeIn('music_battle', {
  volume: 0.3,
  loop: true,
  seek: 2.0  // Optional: start at specific position
}, 2000); // 2 second fade in duration

// Stop current music immediately
this.soundManager.stopMusic();

// Fade out current music over time
this.soundManager.fadeOutMusic(1500); // 1.5 seconds

// Fade in currently playing music from 0
this.soundManager.fadeInMusic(1000); // 1 second
```

### Volume Controls

```typescript
// Set master volume (affects all sounds)
this.soundManager.setMasterVolume(0.7); // 70%

// Set SFX volume
this.soundManager.setSfxVolume(0.8); // 80%

// Set music volume
this.soundManager.setMusicVolume(0.5); // 50%
```

### Toggle Audio

```typescript
// Toggle SFX on/off
this.soundManager.toggleSfx(true);  // Enable
this.soundManager.toggleSfx(false); // Disable
this.soundManager.toggleSfx();      // Toggle current state

// Toggle music on/off
this.soundManager.toggleMusic(true);
```

## Integration with Battle System

Sounds are triggered automatically during battle animations:

1. **onStrike**: Plays the card's sound (Strike, Nova, etc.)
2. **onHit**: No longer plays duplicate sound (prevents double-playing Strike)
3. **onGuard**: Plays the Guard sound
4. **onHeal**: Plays the Mend (healing) sound
5. **onVfx**: Plays Weaken or Bash sounds for status effects

## Music Flow

The game uses smooth music transitions between scenes:

1. **Main Menu** → Title music plays and loops
2. **Lobby** → Title music continues seamlessly
3. **Start Run** → Title music fades out over 1.5 seconds
4. **Card Selection** → Silent (no music, focus on card choices)
5. **Battle Start** → Battle music fades in over 2 seconds starting at 2 seconds into the track
6. **Battle End** → Battle music stops, returns to menu with title music

## Adding New Sounds

### Adding Sound Effects

1. **Update `SOUND_ASSETS` in `src/game/sound.ts`**:
   ```typescript
   export const SOUND_ASSETS = {
     // ... existing sounds ...
     sfx_newcard: 'https://cdn.jsdelivr.net/gh/user/repo@main/path/to/sound.mp3',
   };
   ```

2. **Update the sound mapping** in `getCardSoundKey()`:
   ```typescript
   private getCardSoundKey(cardName: string): string | null {
     const soundMap: Record<string, string> = {
       // ... existing mappings ...
       'NewCard': 'sfx_newcard',
     };
     return soundMap[cardName] || null;
   }
   ```

3. **The sound will automatically play** when the card is used!

### Adding Background Music

1. **Add music file to `SOUND_ASSETS`**:
   ```typescript
   export const SOUND_ASSETS = {
     // ... existing sounds ...
     music_newscene: 'https://cdn.jsdelivr.net/gh/user/repo@main/music/newscene.mp3',
   };
   ```

2. **Play in your scene**:
   ```typescript
   // Simple play
   this.soundManager.playMusic('music_newscene', { volume: 0.3, loop: true });
   
   // With fade in and seek
   this.soundManager.playMusicWithFadeIn('music_newscene', {
     volume: 0.3,
     loop: true,
     seek: 1.5  // Start 1.5 seconds in
   }, 1500); // 1.5 second fade
   ```

## Best Practices

- **Use jsDelivr CDN format** for all GitHub assets (prevents CORS issues)
- **Keep SFX short** (< 2 seconds) for responsive gameplay
- **Use volume parameter** to balance different sound effects
- **Clean up looping sounds** when no longer needed

## Troubleshooting

### Sound Not Playing

1. Check browser console for errors
2. Verify sound file URL is accessible (test in browser)
3. Ensure sound is loaded in Preload scene
4. Check that SFX is enabled: `soundManager.toggleSfx(true)`

### CORS Errors

- Make sure you're using jsDelivr CDN URLs, not direct GitHub URLs
- Format: `https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}`
- NOT: `https://github.com/{user}/{repo}/raw/...`

### Volume Too Loud/Quiet

- Adjust individual sound volume: `playSfx('key', { volume: 0.5 })`
- Adjust category volume: `setSfxVolume(0.7)`
- Adjust master volume: `setMasterVolume(0.8)`

## Future Enhancements

Potential improvements:

- [ ] Audio sprite system for faster loading
- [ ] Sound effect variations for repeated actions
- [ ] Positional audio (3D sound)
- [ ] Dynamic music system (battle intensity)
- [ ] Sound preferences persistence (localStorage)
- [ ] Audio ducking (lower music when SFX plays)

