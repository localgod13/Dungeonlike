import Phaser from 'phaser';
import { setupCustomCursor } from '../utils/cursor';

/**
 * Intro video scene - plays before the main menu
 * Skippable only if player has seen it before (first time is mandatory)
 */
export class IntroScene extends Phaser.Scene {
  private videoElement: HTMLVideoElement | null = null;
  private skipText: Phaser.GameObjects.Text | null = null;
  private hasSeenIntro = false;

  constructor() {
    super('IntroScene');
  }

  init(): void {
    // Check if player has seen the intro before
    this.hasSeenIntro = localStorage.getItem('hasSeenIntro') === 'true';
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Set up custom cursor
    setupCustomCursor(this);

    // Set black background
    this.cameras.main.setBackgroundColor('#000000');

    // Create HTML5 video element
    this.videoElement = document.createElement('video');
    this.videoElement.src = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/video/Introtest.mp4';
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.style.position = 'fixed';
    this.videoElement.style.top = '0';
    this.videoElement.style.left = '0';
    this.videoElement.style.width = '100%';
    this.videoElement.style.height = '100%';
    this.videoElement.style.objectFit = 'contain';
    this.videoElement.style.backgroundColor = '#000000';
    this.videoElement.style.zIndex = '1000';
    this.videoElement.autoplay = true;
    this.videoElement.muted = false;

    // Add video to DOM
    document.body.appendChild(this.videoElement);

    // When video ends, mark as seen and go to main menu
    this.videoElement.addEventListener('ended', () => {
      this.goToPreload();
    });

    // Only allow skipping if player has seen intro before
    if (this.hasSeenIntro) {
      console.log('Returning player - skip controls enabled');
      
      // Make video cursor indicate it's clickable
      this.videoElement.style.cursor = 'pointer';
      
      // Add click listener to video element to skip
      this.videoElement.addEventListener('click', () => {
        this.skipIntro();
      });

      // Add keyboard listeners to document for skip
      const handleKeyPress = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          this.skipIntro();
        }
      };
      document.addEventListener('keydown', handleKeyPress);

      // Store handler for cleanup
      (this.videoElement as any).keyHandler = handleKeyPress;

      // Show skip text immediately for returning players
      this.skipText = this.add.text(width / 2, height - 50, 'Click anywhere to skip', {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 },
      });
      this.skipText.setOrigin(0.5);
      this.skipText.setAlpha(0.7);
      this.skipText.setDepth(2000);

      // Make the entire screen clickable to skip
      this.input.on('pointerdown', () => {
        this.skipIntro();
      });

      // Also allow space or enter key to skip
      this.input.keyboard?.on('keydown-SPACE', () => {
        this.skipIntro();
      });
      this.input.keyboard?.on('keydown-ENTER', () => {
        this.skipIntro();
      });
    } else {
      // First time player - no skip controls
      console.log('First time player - skipping disabled, watching full intro');
    }
  }

  private skipIntro(): void {
    // Mark intro as seen
    localStorage.setItem('hasSeenIntro', 'true');

    // Go to preload
    this.goToPreload();
  }

  private goToPreload(): void {
    // Mark intro as seen
    localStorage.setItem('hasSeenIntro', 'true');

    // Clean up keyboard listener
    if (this.videoElement && (this.videoElement as any).keyHandler) {
      document.removeEventListener('keydown', (this.videoElement as any).keyHandler);
    }

    // Clean up video element
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.remove();
      this.videoElement = null;
    }

    // Transition directly to main menu (assets already loaded in Preload)
    this.scene.start('MainMenu');
  }

  shutdown(): void {
    // Clean up keyboard listener
    if (this.videoElement && (this.videoElement as any).keyHandler) {
      document.removeEventListener('keydown', (this.videoElement as any).keyHandler);
    }

    // Clean up video element
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.remove();
      this.videoElement = null;
    }

    // Remove Phaser event listeners
    this.input.off('pointerdown');
    this.input.keyboard?.off('keydown-SPACE');
    this.input.keyboard?.off('keydown-ENTER');
  }
}
