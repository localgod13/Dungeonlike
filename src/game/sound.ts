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
  
  // Track active tweens to prevent crashes
  private activeTweens: Set<Phaser.Tweens.Tween> = new Set();

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
   * Play boss attack sound (alternates between two sounds)
   */
  private bossAttackCounter = 0;
  playBossAttack(): void {
    if (!this.soundsEnabled) return;
    
    this.bossAttackCounter++;
    const soundKey = this.bossAttackCounter % 2 === 1 ? 'sfx_boss_attack1' : 'sfx_boss_attack2';
    
    try {
      const volume = this.sfxVolume * this.masterVolume;
      
      // Vary the pitch/rate for different tones (0.8 to 1.2 range)
      const pitchVariation = 0.8 + (Math.random() * 0.4); // Random pitch between 0.8x and 1.2x
      
      const sound = this.scene.sound.add(soundKey, {
        volume,
        loop: false,
        rate: pitchVariation, // This changes the pitch/speed
      });
      
      sound.play();
      
      // Clean up after playing
      sound.on('complete', () => {
        sound.destroy();
      });
      
      console.log(`[SoundManager] Playing boss attack sound: ${soundKey} at ${pitchVariation.toFixed(2)}x rate`);
    } catch (error) {
      console.warn(`[SoundManager] Failed to play boss attack sound: ${soundKey}`, error);
    }
  }

  /**
   * Play boss hurt sound (randomly selects from three sounds)
   */
  playBossHurt(): void {
    if (!this.soundsEnabled) return;
    
    const hurtSounds = ['sfx_boss_hurt1', 'sfx_boss_hurt2', 'sfx_boss_hurt3'];
    const randomIndex = Math.floor(Math.random() * hurtSounds.length);
    const soundKey = hurtSounds[randomIndex];
    
    try {
      const volume = this.sfxVolume * this.masterVolume;
      
      // Vary the pitch/rate for different tones (0.7 to 1.3 range for hurt sounds)
      const pitchVariation = 0.7 + (Math.random() * 0.6); // Random pitch between 0.7x and 1.3x
      
      const sound = this.scene.sound.add(soundKey, {
        volume,
        loop: false,
        rate: pitchVariation, // This changes the pitch/speed
      });
      
      sound.play();
      
      // Clean up after playing
      sound.on('complete', () => {
        sound.destroy();
      });
      
      console.log(`[SoundManager] Playing boss hurt sound: ${soundKey} at ${pitchVariation.toFixed(2)}x rate`);
    } catch (error) {
      console.warn(`[SoundManager] Failed to play boss hurt sound: ${soundKey}`, error);
    }
  }

  /**
   * Play boss turn sound
   */
  playBossTurn(): void {
    if (!this.soundsEnabled) return;
    
    try {
      const volume = this.sfxVolume * this.masterVolume;
      
      // Vary the pitch/rate for different tones (0.9 to 1.1 range for turn sound)
      const pitchVariation = 0.9 + (Math.random() * 0.2); // Random pitch between 0.9x and 1.1x
      
      const sound = this.scene.sound.add('sfx_boss_turn', {
        volume,
        loop: false,
        rate: pitchVariation, // This changes the pitch/speed
      });
      
      sound.play();
      
      // Clean up after playing
      sound.on('complete', () => {
        sound.destroy();
      });
      
      console.log(`[SoundManager] Playing boss turn sound at ${pitchVariation.toFixed(2)}x rate`);
    } catch (error) {
      console.warn(`[SoundManager] Failed to play boss turn sound`, error);
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
        this.activeTweens.delete(fadeTween);
      },
      onUpdate: () => {
        // Check if music is still valid during tween
        if (!music || (music as any).destroyed) {
          console.log('[SoundManager] Music was destroyed during fade, stopping tween');
          fadeTween.stop();
          this.activeTweens.delete(fadeTween);
        }
      }
    });
    
    this.activeTweens.add(fadeTween);
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
          this.activeTweens.delete(fadeTween);
        },
        onUpdate: () => {
          // Check if music is still valid during tween
          if (!this.currentMusic || (this.currentMusic as any).destroyed) {
            console.log('[SoundManager] Music was destroyed during fade in, stopping tween');
            fadeTween.stop();
            this.activeTweens.delete(fadeTween);
          }
        }
      });
      
      this.activeTweens.add(fadeTween);
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
   * Track last played player hurt sound to avoid repeating
   */
  private lastPlayerHurtSound: 'sfx_player_hurt1' | 'sfx_player_hurt2' | null = null;

  /**
   * Play player hurt sound effect - alternates between two sounds with pitch variation
   * Never plays the same sound twice in a row
   */
  playPlayerHurt(): void {
    if (!this.soundsEnabled) return;
    
    // Alternate between the two hurt sounds, never playing the same one twice
    let soundKey: 'sfx_player_hurt1' | 'sfx_player_hurt2';
    if (this.lastPlayerHurtSound === 'sfx_player_hurt1') {
      soundKey = 'sfx_player_hurt2';
    } else if (this.lastPlayerHurtSound === 'sfx_player_hurt2') {
      soundKey = 'sfx_player_hurt1';
    } else {
      // First time playing, randomly pick one
      soundKey = Math.random() < 0.5 ? 'sfx_player_hurt1' : 'sfx_player_hurt2';
    }
    
    // Add pitch variation (0.85 to 1.15) for variety
    const pitchVariation = 0.85 + Math.random() * 0.3;
    
    // Update last played sound
    this.lastPlayerHurtSound = soundKey;
    
    console.log(`[SoundManager] Playing player hurt sound: ${soundKey} at rate ${pitchVariation.toFixed(2)}`);
    this.playSfx(soundKey, { volume: 0.7, rate: pitchVariation });
  }

  /**
   * Play card deal sound effect with pitch variation - randomly selects between two sounds
   */
  playCardDeal(): void {
    // Randomly select between two deal sounds
    const dealSound = Math.random() < 0.5 ? 'sfx_deal' : 'sfx_deal2';
    // Add pitch variation (0.85 to 1.15) for variety
    const pitchVariation = 0.85 + Math.random() * 0.3;
    console.log(`[SoundManager] Playing ${dealSound} at rate ${pitchVariation.toFixed(2)}`);
    this.playSfx(dealSound, { volume: 0.5, rate: pitchVariation });
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
      'Slash': 'sfx_warrior_slash',
      'Heavy Strike': 'sfx_warrior_heavy_strike',
      'Cleave': 'sfx_warrior_cleave',
      'Fireball': 'sfx_mage_fire1', // Mage fireball spell
      'Flame Nova': 'sfx_mage_fire1', // Flame Nova spell
      'Burn': 'sfx_mage_fire1', // Burn spell uses fire sound
    };

    return soundMap[cardName] || null;
  }

  /**
   * Clean up all sounds when scene is destroyed
   */
  destroy(): void {
    // Kill all active tweens first to prevent volume set errors
    this.activeTweens.forEach(tween => {
      if (tween && tween.isPlaying()) {
        tween.stop();
      }
    });
    this.activeTweens.clear();
    
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
  sfx_deal: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/deal.mp3',
  sfx_deal2: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/cardlick1.mp3',
  sfx_card_click: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/cardclick2.mp3',
  
  // Character attack sound effects
  sfx_mage_fire1: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/wizard/fire1.mp3',
  sfx_mage_fire2: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/wizard/fire2.mp3',
  sfx_huntress_arrow: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/huntress/arrow1.mp3',
  sfx_warrior_heavy_strike: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/warrior/heavystrike.mp3',
  sfx_warrior_cleave: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/warrior/cleave.mp3',
  sfx_warrior_slash: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/warrior/slash.mp3',
  
  // Boss sound effects
  sfx_boss_attack1: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/boss1/bossattack.mp3',
  sfx_boss_attack2: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/boss1/bossattack2.mp3',
  sfx_boss_hurt1: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/boss1/bosshurt.mp3',
  sfx_boss_hurt2: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/boss1/bosshurt2.mp3',
  sfx_boss_hurt3: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/boss1/bosshurt3.mp3',
  sfx_boss_turn: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/boss1/bossturn.mp3',
  sfx_minotaur_entrance: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/Minotaur/minentrance.mp3',
  sfx_player_hurt1: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/playersounds/playhurt1.mp3',
  sfx_player_hurt2: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/playersounds/playhurt2.mp3',
  
  // Background music (converted to jsDelivr CDN)
  music_battle: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/battle1.mp3',
  music_boss: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/boss1bgm.mp3',
  music_title: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/title.mp3',
  music_cardselect: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/cardselectbgm.mp3',
  music_map: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/music/mapmusic.mp3',
  music_merchant: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/merchantbgm.mp3',
  music_encounter: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/encounter1.mp3',
  sfx_victory: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sounds/victoryscreen.mp3',
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
