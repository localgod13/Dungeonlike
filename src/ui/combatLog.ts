import Phaser from 'phaser';

/**
 * CombatLog UI Module
 * Manages the combat log display in the bottom-right corner
 */
export class CombatLog {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private entries: Phaser.GameObjects.Text[] = [];
  private isExpanded = false;
  private expandButton: Phaser.GameObjects.Container | null = null;
  private scrollOffset = 0;
  private maxScrollOffset = 0;
  private scrollIndicator: Phaser.GameObjects.Text | null = null;
  
  private readonly LOG_WIDTH = 220;
  private readonly LOG_HEIGHT_COLLAPSED = 80;
  private readonly LOG_HEIGHT_EXPANDED = 300;
  private readonly START_Y = 28;
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    
    // Calculate position (bottom-right corner)
    const logX = scene.scale.width - this.LOG_WIDTH - 10;
    const logY = scene.scale.height - this.LOG_HEIGHT_COLLAPSED - 10;
    
    // Create container
    this.container = scene.add.container(logX, logY);
    this.container.setDepth(1000);
    
    // Create UI elements
    this.createBackground();
    this.createTitle();
    this.createScrollIndicator();
    this.createExpandButton();
    
    // Add initial entry
    this.addEntry('Battle begins!', '#4a90e2');
  }
  
  private createBackground(): void {
    const logBg = this.scene.add.rectangle(
      this.LOG_WIDTH / 2,
      this.LOG_HEIGHT_COLLAPSED / 2,
      this.LOG_WIDTH,
      this.LOG_HEIGHT_COLLAPSED,
      0x1a1a1a,
      0.9
    );
    logBg.setStrokeStyle(1, 0x4a90e2, 0.6);
    logBg.setName('logBg');
    
    // Enable mouse wheel scrolling
    logBg.setInteractive();
    logBg.on('wheel', (_pointer: any, _deltaX: number, deltaY: number) => {
      this.handleScroll(deltaY);
    });
    
    this.container.add(logBg);
  }
  
  private createTitle(): void {
    const logTitle = this.scene.add.text(10, 10, 'Combat Log', {
      fontSize: '14px',
      color: '#4a90e2',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    logTitle.setOrigin(0, 0);
    logTitle.setName('logTitle');
    this.container.add(logTitle);
  }
  
  private createScrollIndicator(): void {
    this.scrollIndicator = this.scene.add.text(
      this.LOG_WIDTH / 2,
      this.LOG_HEIGHT_COLLAPSED - 10,
      '▲ Scroll for more',
      {
        fontSize: '9px',
        color: '#888888',
        fontFamily: 'Arial, sans-serif',
        align: 'center',
      }
    );
    this.scrollIndicator.setOrigin(0.5);
    this.scrollIndicator.setVisible(false);
    this.container.add(this.scrollIndicator);
  }
  
  private createExpandButton(): void {
    const buttonSize = 20;
    const buttonX = this.LOG_WIDTH - 10; // 10px from right edge
    const buttonY = 10; // 10px from top
    
    this.expandButton = this.scene.add.container(buttonX, buttonY);
    this.expandButton.setDepth(1000);
    
    // Button background
    const bg = this.scene.add.rectangle(0, 0, buttonSize, buttonSize, 0x4a90e2, 0.8);
    bg.setStrokeStyle(1, 0xffffff, 0.5);
    bg.setInteractive({ useHandCursor: false });
    bg.setName('bg');
    
    // Arrow icon
    const arrow = this.scene.add.text(0, 0, '▼', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    arrow.setOrigin(0.5);
    arrow.setName('arrow');
    
    // Hover effects
    bg.on('pointerover', () => bg.setFillStyle(0x5aa0f2, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x4a90e2, 0.8));
    
    // Click to toggle
    bg.on('pointerdown', () => this.toggleExpand());
    
    this.expandButton.add([bg, arrow]);
    this.container.add(this.expandButton);
  }
  
  private toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
    
    const logHeight = this.isExpanded ? this.LOG_HEIGHT_EXPANDED : this.LOG_HEIGHT_COLLAPSED;
    const logX = this.scene.scale.width - this.LOG_WIDTH - 10;
    const logY = this.scene.scale.height - logHeight - 10;
    
    // Update background size and position
    const logBg = this.container.getByName('logBg') as Phaser.GameObjects.Rectangle;
    if (logBg) {
      logBg.setSize(this.LOG_WIDTH, logHeight);
      logBg.setPosition(this.LOG_WIDTH / 2, logHeight / 2);
    }
    
    // Update container position
    this.container.setPosition(logX, logY);
    
    // Update expand button position
    if (this.expandButton) {
      const buttonX = this.LOG_WIDTH - 10;
      const buttonY = 10;
      this.expandButton.setPosition(buttonX, buttonY);
      
      // Update arrow icon
      const arrow = this.expandButton.getByName('arrow') as Phaser.GameObjects.Text;
      if (arrow) {
        arrow.setText(this.isExpanded ? '▲' : '▼');
      }
    }
    
    // Update scroll indicator position
    if (this.scrollIndicator) {
      this.scrollIndicator.setPosition(this.LOG_WIDTH / 2, logHeight - 10);
    }
    
    // Refresh entries
    this.refreshEntries();
  }
  
  public addEntry(message: string, color: string = '#ffffff'): void {
    // Safety check - just try to create the entry
    try {
    
    // Create entry text - create it WITHOUT adding to scene first
    // We'll add it to container in refreshEntries
    const entry = this.scene.make.text({
      x: 0,
      y: 0,
      text: `• ${message}`,
      style: {
        fontSize: '11px',
        color,
        fontFamily: 'Arial, sans-serif',
        wordWrap: { width: 195 },
        align: 'left',
        lineSpacing: 2,
      },
      add: false, // DON'T add to scene automatically!
    });
    
    entry.setOrigin(0, 0);
    
    // Store entry
    this.entries.push(entry);
    
    // Auto-scroll to bottom
    this.scrollOffset = 999999;
    
    // Refresh display
    this.refreshEntries();
    
    // Highlight newest entry
    entry.setAlpha(1);
    this.scene.tweens.add({
      targets: entry,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    } catch (error) {
      console.warn('Cannot add combat log entry:', error);
    }
  }
  
  private refreshEntries(): void {
    const logHeight = this.isExpanded ? this.LOG_HEIGHT_EXPANDED : this.LOG_HEIGHT_COLLAPSED;
    const entrySpacing = this.isExpanded ? 4 : 3;
    const visibleHeight = logHeight - 40; // Minus title and scroll indicator
    
    // Remove all entries from container (but don't destroy them)
    this.entries.forEach(entry => {
      if (entry && entry.scene === this.scene && this.container.list.includes(entry)) {
        this.container.remove(entry, false);
      }
    });
    
    // Calculate total content height
    let totalContentHeight = 0;
    this.entries.forEach(entry => {
      totalContentHeight += entry.height + entrySpacing;
    });
    
    // Calculate max scroll offset
    this.maxScrollOffset = Math.max(0, totalContentHeight - visibleHeight);
    
    // Clamp scroll offset
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxScrollOffset));
    
    // Position entries with scroll offset applied
    let currentY = this.START_Y - this.scrollOffset;
    const entriesToShow: Phaser.GameObjects.Text[] = [];
    
    this.entries.forEach((entry, index) => {
      if (!entry || entry.scene !== this.scene) {
        console.warn('Skipping invalid log entry from old scene');
        return;
      }
      
      const entryHeight = entry.height;
      
      // Only add entries visible in viewport
      if (currentY + entryHeight >= this.START_Y - 10 && currentY <= this.START_Y + visibleHeight + 10) {
        entry.setPosition(10, currentY);
        this.container.add(entry);
        entriesToShow.push(entry);
        
        // Fade based on position
        const alpha = 0.4 + (index / this.entries.length) * 0.6;
        entry.setAlpha(Math.max(0.4, Math.min(1, alpha)));
      }
      
      currentY += entryHeight + entrySpacing;
    });
    
    // Update scroll indicator visibility
    if (this.scrollIndicator) {
      this.scrollIndicator.setVisible(this.maxScrollOffset > 0);
    }
  }
  
  private handleScroll(deltaY: number): void {
    const scrollSpeed = 20;
    this.scrollOffset += deltaY * scrollSpeed * 0.01;
    
    // Clamp scroll offset
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxScrollOffset));
    
    // Refresh display
    this.refreshEntries();
  }
  
  public clear(): void {
    // Destroy all entries
    this.entries.forEach(entry => {
      if (entry && entry.scene === this.scene) {
        entry.destroy();
      }
    });
    
    // Clear array
    this.entries = [];
    
    // Reset scroll
    this.scrollOffset = 0;
    this.maxScrollOffset = 0;
    
    // Refresh display
    this.refreshEntries();
    
    console.log('Combat log cleared for new stage');
  }
  
  public updatePosition(): void {
    const logHeight = this.isExpanded ? this.LOG_HEIGHT_EXPANDED : this.LOG_HEIGHT_COLLAPSED;
    const logX = this.scene.scale.width - this.LOG_WIDTH - 10;
    const logY = this.scene.scale.height - logHeight - 10;
    this.container.setPosition(logX, logY);
  }
  
  public destroy(): void {
    // Destroy all entries
    this.clear();
    
    // Destroy container (which will destroy all its children)
    if (this.container) {
      this.container.destroy();
    }
  }
}

