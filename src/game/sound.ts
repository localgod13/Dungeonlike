import Phaser from 'phaser';

/**
 * Sound Manager - Handles all audio in the game (music and SFX)
 * Provides centralized control for sound effects and background music
 */

export interface SoundConfig {
  volume?: number;
  loop?: boolean;
  rate?: number;
  seek?: number; // Start position in seconds
}

export class SoundManager {
  private scene: Phaser.Scene;
  private soundsEnabled: boolean = true;
  private musicEnabled: boolean = true;
  private masterVolume: number = 1.0;
  private sfxVolume: number = 0.7;
  private musicVolume: number = 0.5;
  
  // Sound effect references
  private sfxCache: Map<string, Phaser.Sound.BaseSound> = new Map();
  private currentMusic: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Play a sound effect by key
   */
  playSfx(key: string, config?: SoundConfig): void {
    console.log(`[SoundManager] playSfx called for key: ${key}, enabled: ${this.soundsEnabled}`);
    
    if (!this.soundsEnabled) {
      console.warn(`[SoundManager] SFX disabled, skipping sound: ${key}`);
      return;
    }

    // Check if the sound is actually loaded
    if (!this.scene.cache.audio.exists(key)) {
      console.error(`[SoundManager] Sound not found in cache: ${key}`);
      console.error(`[SoundManager] Available sounds:`, this.scene.cache.audio.getKeys());
      return;
    }

    try {
      const volume = (config?.volume ?? 1.0) * this.sfxVolume * this.masterVolume;
      console.log(`[SoundManager] Playing ${key} at volume ${volume}`);
      
      const sound = this.scene.sound.add(key, {
        volume,
        loop: config?.loop ?? false,
        rate: config?.rate ?? 1.0,
      });

      sound.play();
      console.log(`[SoundManager] Sound ${key} started playing`);
      
      // Clean up after playing (unless looping)
      if (!config?.loop) {
        sound.once('complete', () => {
          sound.destroy();
        });
      } else {
        // Store looping sounds for later control
        this.sfxCache.set(key, sound);
      }
    } catch (error) {
      console.error(`[SoundManager] Failed to play sound: ${key}`, error);
    }
  }

  /**
   * Play background music
   */
  playMusic(key: string, config?: SoundConfig): void {
    if (!this.musicEnabled) return;

    // Stop current music if playing
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic.destroy();
    }

    try {
      const volume = (config?.volume ?? 1.0) * this.musicVolume * this.masterVolume;
      this.currentMusic = this.scene.sound.add(key, {
        volume,
        loop: config?.loop ?? true,
        rate: config?.rate ?? 1.0,
      });

      // Start playing with seek if requested
      if (config?.seek && config.seek > 0) {
        console.log(`[SoundManager] Starting music at ${config.seek} seconds`);
        this.currentMusic.play({ seek: config.seek });
      } else {
        this.currentMusic.play();
      }
    } catch (error) {
      console.warn(`Failed to play music: ${key}`, error);
    }
  }

  /**
   * Stop current music
   */
  stopMusic(): void {
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic.destroy();
      this.currentMusic = null;
    }
  }

  /**
   * Fade out current music over specified duration
   * @param duration Duration in milliseconds (default: 1000ms)
   */
  fadeOutMusic(duration: number = 1000): void {
    if (!this.currentMusic) return;

    console.log(`[SoundManager] Fading out music over ${duration}ms`);
    
    const music = this.currentMusic;
    
    // Create a tween to fade out the volume
    const fadeTween = this.scene.tweens.add({
      targets: music,
      volume: 0,
      duration: duration,
      ease: 'Linear',
      onComplete: () => {
        console.log('[SoundManager] Music fade out complete, stopping music');
        if (music && !(music as any).destroyed) {
          music.stop();
          music.destroy();
        }
        if (this.currentMusic === music) {
          this.currentMusic = null;
        }
      },
      onUpdate: () => {
        // Check if music is still valid during tween
        if (!music || (music as any).destroyed) {
          console.log('[SoundManager] Music was destroyed during fade, stopping tween');
          fadeTween.stop();
        }
      }
    });
  }

  /**
   * Fade in current music from 0 to target volume
   * @param duration Duration in milliseconds (default: 1000ms)
   */
  fadeInMusic(duration: number = 1000): void {
    if (!this.currentMusic) return;

    const targetVolume = this.musicVolume * this.masterVolume;
    if ('setVolume' in this.currentMusic) {
      (this.currentMusic as any).setVolume(0);
    }
    
    console.log(`[SoundManager] Fading in music to ${targetVolume} over ${duration}ms`);
    
    const fadeTween = this.scene.tweens.add({
      targets: this.currentMusic,
      volume: targetVolume,
      duration: duration,
      ease: 'Linear',
      onComplete: () => {
        console.log('[SoundManager] Music fade in complete');
      },
      onUpdate: () => {
        // Check if music is still valid during tween
        if (!this.currentMusic || (this.currentMusic as any).destroyed) {
          console.log('[SoundManager] Music was destroyed during fade in, stopping tween');
          fadeTween.stop();
        }
      }
    });
  }

  /**
   * Play music with fade in from 0 to target volume
   * @param key Sound key to play
   * @param config Sound configuration (volume, loop, rate, seek)
   * @param fadeDuration Fade in duration in milliseconds (default: 1000ms)
   */
  playMusicWithFadeIn(key: string, config?: SoundConfig, fadeDuration: number = 1000): void {
    if (!this.musicEnabled) return;

    // Stop current music if playing
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic.destroy();
    }

    try {
      const targetVolume = (config?.volume ?? 1.0) * this.musicVolume * this.masterVolume;
      
      // Create music with 0 volume initially
      this.currentMusic = this.scene.sound.add(key, {
        volume: 0,
        loop: config?.loop ?? true,
        rate: config?.rate ?? 1.0,
      });

      // Start playing with seek if requested
      if (config?.seek && config.seek > 0) {
        console.log(`[SoundManager] Starting music at ${config.seek} seconds with fade in`);
        this.currentMusic.play({ seek: config.seek });
      } else {
        this.currentMusic.play();
      }

      // Fade in
      console.log(`[SoundManager] Fading in ${key} to ${targetVolume} over ${fadeDuration}ms`);
      
      const fadeTween = this.scene.tweens.add({
        targets: this.currentMusic,
        volume: targetVolume,
        duration: fadeDuration,
        ease: 'Linear',
        onComplete: () => {
          console.log('[SoundManager] Music fade in complete');
        },
        onUpdate: () => {
          // Check if music is still valid during tween
          if (!this.currentMusic || (this.currentMusic as any).destroyed) {
            console.log('[SoundManager] Music was destroyed during fade in, stopping tween');
            fadeTween.stop();
          }
        }
      });
    } catch (error) {
      console.warn(`Failed to play music with fade in: ${key}`, error);
    }
  }

  /**
   * Stop a specific sound effect
   */
  stopSfx(key: string): void {
    const sound = this.sfxCache.get(key);
    if (sound) {
      sound.stop();
      sound.destroy();
      this.sfxCache.delete(key);
    }
  }

  /**
   * Stop all sounds (music and SFX)
   */
  stopAll(): void {
    this.stopMusic();
    this.sfxCache.forEach(sound => {
      sound.stop();
      sound.destroy();
    });
    this.sfxCache.clear();
  }

  /**
   * Toggle sound effects on/off
   */
  toggleSfx(enabled?: boolean): void {
    this.soundsEnabled = enabled ?? !this.soundsEnabled;
    if (!this.soundsEnabled) {
      this.sfxCache.forEach(sound => sound.stop());
    }
  }

  /**
   * Toggle music on/off
   */
  toggleMusic(enabled?: boolean): void {
    this.musicEnabled = enabled ?? !this.musicEnabled;
    if (!this.musicEnabled && this.currentMusic) {
      this.currentMusic.pause();
    } else if (this.musicEnabled && this.currentMusic) {
      this.currentMusic.resume();
    }
  }

  /**
   * Set master volume (0.0 to 1.0)
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateAllVolumes();
  }

  /**
   * Set SFX volume (0.0 to 1.0)
   */
  setSfxVolume(volume: number): void {
    this.sfxVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateAllVolumes();
  }

  /**
   * Set music volume (0.0 to 1.0)
   */
  setMusicVolume(volume: number): void {
    this.musicVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateAllVolumes();
  }

  /**
   * Update volumes of all currently playing sounds
   */
  private updateAllVolumes(): void {
    if (this.currentMusic && 'setVolume' in this.currentMusic) {
      (this.currentMusic as any).setVolume(this.musicVolume * this.masterVolume);
    }
    
    this.sfxCache.forEach(sound => {
      if ('setVolume' in sound) {
        (sound as any).setVolume(this.sfxVolume * this.masterVolume);
      }
    });
  }

  /**
   * Card-specific sound effects
   */
  playCardSound(cardName: string): void {
    console.log(`[SoundManager] playCardSound called for: ${cardName}`);
    const soundKey = this.getCardSoundKey(cardName);
    console.log(`[SoundManager] Mapped to sound key: ${soundKey}`);
    if (soundKey) {
      this.playSfx(soundKey, { volume: 0.8 });
    } else {
      console.warn(`[SoundManager] No sound key found for card: ${cardName}`);
    }
  }

  /**
   * Play a random mage fire spell sound effect
   */
  playMageFireSpell(): void {
    // Randomly choose between fire1 and fire2
    const fireSound = Math.random() < 0.5 ? 'sfx_mage_fire1' : 'sfx_mage_fire2';
    // Add pitch variation (0.85 to 1.15) for variety
    const pitchVariation = 0.85 + Math.random() * 0.3;
    console.log(`[SoundManager] Playing mage fire spell: ${fireSound} at rate ${pitchVariation.toFixed(2)}`);
    this.playSfx(fireSound, { volume: 0.7, rate: pitchVariation });
  }

  /**
   * Play huntress arrow sound effect
   */
  playHuntressArrow(): void {
    // Add pitch variation (0.9 to 1.1) for variety
    const pitchVariation = 0.9 + Math.random() * 0.2;
    console.log(`[SoundManager] Playing huntress arrow sound at rate ${pitchVariation.toFixed(2)}`);
    this.playSfx('sfx_huntress_arrow', { volume: 0.6, rate: pitchVariation });
  }

  /**
   * Map card names to sound keys
   */
  private getCardSoundKey(cardName: string): string | null {
    const soundMap: Record<string, string> = {
      'Strike': 'sfx_strike',
      'Nova': 'sfx_nova',
      'Mend': 'sfx_mend',
      'Guard': 'sfx_guard',
      'Bash': 'sfx_bash',
      'Weaken': 'sfx_weaken',
    };

    return soundMap[cardName] || null;
  }

  /**
   * Clean up all sounds when scene is destroyed
   */
  destroy(): void {
    this.stopAll();
  }
}

/**
 * Sound asset keys and URLs for preloading
 */
export const SOUND_ASSETS = {
  // Card sound effects (converted to jsDelivr CDN)
  sfx_strike: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/strike.mp3',
  sfx_nova: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/nova.mp3',
  sfx_mend: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/heals.mp3',
  sfx_guard: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/guard.mp3',
  sfx_bash: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/bash.mp3',
  sfx_weaken: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/weaken.mp3',
  
  // Character attack sound effects
  sfx_mage_fire1: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/wizard/fire1.mp3',
  sfx_mage_fire2: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/wizard/fire2.mp3',
  sfx_huntress_arrow: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/huntress/arrow1.mp3',
  
  // Background music (converted to jsDelivr CDN)
  music_battle: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/battle1.mp3',
  music_title: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/title.mp3',
  music_cardselect: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/cardselectbgm.mp3',
  music_map: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/mapmusic.mp3',
} as const;

/**
 * Helper to preload all sound assets in a Phaser scene
 */
export function preloadSounds(scene: Phaser.Scene): void {
  console.log('[preloadSounds] Loading sound assets...');
  Object.entries(SOUND_ASSETS).forEach(([key, url]) => {
    console.log(`[preloadSounds] Queuing ${key} from ${url}`);
    scene.load.audio(key, url);
  });
  console.log(`[preloadSounds] Queued ${Object.keys(SOUND_ASSETS).length} sound files`);
}
