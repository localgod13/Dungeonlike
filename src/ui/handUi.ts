import Phaser from 'phaser';
import { Card, getCardById } from '../game/cards';

/**
 * In-battle hand UI - displays player's 4-card loadout
 * Cards are enabled/disabled based on AP availability
 */

const CARD_WIDTH = 100;
const CARD_HEIGHT = 150; // Slightly smaller while maintaining 2:3 aspect ratio
const CARD_SPACING = 15;

export class HandUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private cardContainers: Map<string, Phaser.GameObjects.Container> = new Map();
  private currentAP = 0;
  private onCardSelect?: (cardId: string) => void;
  private selectedCardId: string | null = null;
  private ultimateCardId: string | null = null; // Track if ultimate is in hand
  private drawPileText: Phaser.GameObjects.Text | null = null;
  private discardPileText: Phaser.GameObjects.Text | null = null;
  private drawPileVisual: Phaser.GameObjects.Image | null = null;
  private discardPileVisual: Phaser.GameObjects.Image | null = null;
  private raisedCards: Set<string> = new Set(); // Track cards that are raised (played this round)

  constructor(
    scene: Phaser.Scene,
    cards: string[],
    onCardSelect?: (cardId: string) => void,
    hideCardsForAnimation?: string[] // Cards that should start hidden for draw animation
  ) {
    this.scene = scene;
    this.onCardSelect = onCardSelect;
    
    // Clean up any orphaned pile visuals from previous HandUI instances
    this.cleanupOrphanedPileVisuals();
    
    this.container = scene.add.container(0, 0);
    this.createHand(cards, hideCardsForAnimation);
    
    // Create pile indicators immediately (no delay) to prevent flicker
    this.createPileIndicators();
  }

  /**
   * Clean up any orphaned pile visuals from previous HandUI instances
   */
  private cleanupOrphanedPileVisuals(): void {
    console.log(`[HandUI] AGGRESSIVE cleanup of orphaned pile visuals`);
    
    // Find and destroy ANY existing pile visuals in the scene
    const allObjects = this.scene.children.list;
    for (let i = allObjects.length - 1; i >= 0; i--) {
      const obj = allObjects[i];
      if (obj && obj.name && (
        obj.name.includes('pile') || 
        obj.name.includes('Empty') ||
        obj.name.includes('drawPile') ||
        obj.name.includes('discardPile')
      )) {
        console.log(`[HandUI] DESTROYING orphaned object: ${obj.name}`);
        obj.destroy();
      }
    }
    
    // Also destroy any cardback images that might be orphaned (animated cards)
    for (let i = allObjects.length - 1; i >= 0; i--) {
      const obj = allObjects[i];
      if (obj && obj instanceof Phaser.GameObjects.Image && obj.texture && obj.texture.key === 'cardback') {
        console.log(`[HandUI] DESTROYING orphaned cardback image`);
        obj.destroy();
      }
    }
    
    // Also destroy any card type images that might be stuck (animated cards showing card faces)
    for (let i = allObjects.length - 1; i >= 0; i--) {
      const obj = allObjects[i];
      if (obj && obj instanceof Phaser.GameObjects.Image && obj.texture && 
          (obj.texture.key.startsWith('card_'))) {
        // Check if it's a small animated card (not a card in hand)
        const scale = (obj as Phaser.GameObjects.Image).scale;
        if (scale < 0.12) { // Animated cards are scaled at 0.08-0.117
          console.log(`[HandUI] DESTROYING orphaned animated card: ${obj.texture.key}`);
          obj.destroy();
        }
      }
    }
  }

  private createHand(cardIds: string[], hideCards?: string[]): void {
    const centerX = this.scene.scale.width / 2;
    const y = this.scene.scale.height - CARD_HEIGHT / 2 - 20;
    
    // Calculate starting X to center the hand
    const totalWidth = cardIds.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
    const startX = centerX - totalWidth / 2;

    cardIds.forEach((cardId, index) => {
      const card = getCardById(cardId);
      if (!card) return;

      const x = startX + index * (CARD_WIDTH + CARD_SPACING) + CARD_WIDTH / 2;
      const cardContainer = this.createCardDisplay(card, x, y);
      this.container.add(cardContainer);
      this.cardContainers.set(cardId, cardContainer);
      
      // Hide cards that will be animated in
      if (hideCards && hideCards.includes(cardId)) {
        cardContainer.setVisible(false);
      }
    });

    this.updateCardStates();
  }

  private createCardDisplay(card: Card, x: number, y: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setData('cardId', card.id);
    container.setData('apCost', card.ap);
    container.setData('originalY', y); // Store original Y position for raising

    // Card background image based on type
    const imageKey = `card_${card.type}`;
    const cardImage = this.scene.add.image(0, 0, imageKey);
    cardImage.setDisplaySize(CARD_WIDTH, CARD_HEIGHT);
    cardImage.setName('cardImage');
    
    // Apply gray tint to neutral cards for visual distinction
    if (card.type === 'neutral') {
      cardImage.setTint(0x888888); // Gray tint for neutral items
    }
    
    container.add(cardImage);

    // Border frame (for hover/selection effects)
    const bg = this.scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0);
    bg.setStrokeStyle(3, 0x444444, 0.8);
    bg.setName('bg');
    container.add(bg);

    // Disabled overlay (initially hidden)
    const disabledOverlay = this.scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.75);
    disabledOverlay.setName('disabledOverlay');
    disabledOverlay.setVisible(false);
    disabledOverlay.setDepth(10);
    container.add(disabledOverlay);

    // Card name (with shadow for better visibility over image)
    // Split multi-word titles and stack them vertically
    const words = card.name.split(' ');
    const displayText = words.length > 1 ? words.join('\n') : card.name;
    
    const nameText = this.scene.add.text(0, -CARD_HEIGHT / 2 + 45, displayText, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
      lineSpacing: -5,
    });
    nameText.setOrigin(0.5);
    nameText.setName('nameText');
    nameText.setDepth(20);
    container.add(nameText);

    // AP cost badge (smaller, top right corner - partially off card)
    const apBadge = this.scene.add.container(CARD_WIDTH / 2 - 5, -CARD_HEIGHT / 2 + 5);
    apBadge.setName('apBadge');
    apBadge.setDepth(20);
    
    const apBg = this.scene.add.circle(0, 0, 8, 0x000000, 0.9);
    apBg.setStrokeStyle(2, 0xffaa00, 1);
    apBadge.add(apBg);

    const apText = this.scene.add.text(0, 0, `${card.ap}`, {
      fontSize: '10px',
      color: '#ffaa00',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    apText.setOrigin(0.5);
    apBadge.add(apText);
    
    container.add(apBadge);

    // Description (no background box - just text with shadow)
    const descText = this.scene.add.text(0, 15, card.desc, {
      fontSize: '13px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 20 },
      stroke: '#000000',
      strokeThickness: 3,
      lineSpacing: -5,
    });
    descText.setOrigin(0.5);
    descText.setName('descText');
    descText.setDepth(20);
    container.add(descText);

    // Make interactive
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (this.canAffordCard(card.id)) {
        bg.setStrokeStyle(4, 0xffffff, 1);
        // Slight glow effect
        container.setScale(1.05);
      }
    });
    bg.on('pointerout', () => {
      const isSelected = this.selectedCardId === card.id;
      if (isSelected) {
        bg.setStrokeStyle(4, 0x44ff44, 1);
      } else {
        bg.setStrokeStyle(3, 0x444444, 0.8);
      }
      container.setScale(1);
    });
    bg.on('pointerdown', () => {
      // Play card click sound
      this.scene.sound.play('sfx_card_click', { volume: 0.6 });
      
      if (this.canAffordCard(card.id)) {
        this.selectCard(card.id);
      } else {
        this.flashNotEnoughAP();
      }
    });

    return container;
  }

  private canAffordCard(cardId: string): boolean {
    const card = getCardById(cardId);
    if (!card) return false;
    return this.currentAP >= card.ap;
  }

  private selectCard(cardId: string): void {
    console.log(`Selected card: ${cardId}`);

    // Deselect previous
    if (this.selectedCardId) {
      const prevContainer = this.cardContainers.get(this.selectedCardId);
      if (prevContainer) {
        const bg = prevContainer.getByName('bg') as Phaser.GameObjects.Rectangle;
        bg.setStrokeStyle(3, 0x444444, 0.8);
      }
    }

    // Select new
    this.selectedCardId = cardId;
    const container = this.cardContainers.get(cardId);
    if (container) {
      const bg = container.getByName('bg') as Phaser.GameObjects.Rectangle;
      bg.setStrokeStyle(4, 0x44ff44, 1);
    }

    // Notify callback
    if (this.onCardSelect) {
      this.onCardSelect(cardId);
    }
  }

  private flashNotEnoughAP(): void {
    // Flash a "Not enough AP" message
    const centerX = this.scene.scale.width / 2;
    const y = this.scene.scale.height - CARD_HEIGHT - 80;

    const text = this.scene.add.text(centerX, y, 'Not enough AP!', {
      fontSize: '20px',
      color: '#ff4444',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 },
    });
    text.setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        text.destroy();
      },
    });
  }

  private updateCardStates(): void {
    this.cardContainers.forEach((container, cardId) => {
      const card = getCardById(cardId);
      if (!card) return;

      const canAfford = this.canAffordCard(cardId);
      const isRaised = this.isCardRaised(cardId);
      const disabledOverlay = container.getByName('disabledOverlay') as Phaser.GameObjects.Rectangle;
      const bg = container.getByName('bg') as Phaser.GameObjects.Rectangle;
      const nameText = container.getByName('nameText') as Phaser.GameObjects.Text;
      const descText = container.getByName('descText') as Phaser.GameObjects.Text;

      if (canAfford || isRaised) {
        // Don't darken raised cards even if they can't be afforded anymore
        disabledOverlay.setVisible(false);
        bg.setInteractive({ useHandCursor: true });
        nameText.setAlpha(1);
        descText.setAlpha(1);
      } else {
        disabledOverlay.setVisible(true);
        bg.disableInteractive();
        nameText.setAlpha(0.5);
        descText.setAlpha(0.5);
        
        // Deselect if this was selected
        if (this.selectedCardId === cardId) {
          this.selectedCardId = null;
          bg.setStrokeStyle(3, 0x444444, 0.8);
        }
      }
    });
  }

  public setAP(ap: number): void {
    this.currentAP = ap;
    this.updateCardStates();
  }

  public getSelectedCard(): string | null {
    return this.selectedCardId;
  }

  public clearSelection(): void {
    if (this.selectedCardId) {
      const container = this.cardContainers.get(this.selectedCardId);
      if (container) {
        const bg = container.getByName('bg') as Phaser.GameObjects.Rectangle;
        bg.setStrokeStyle(3, 0x444444, 0.8);
      }
      this.selectedCardId = null;
    }
  }

  public destroy(): void {
    console.log(`[HandUI] Destroying HandUI instance`);
    
    // Destroy pile visuals directly (they're not in the main container)
    if (this.drawPileVisual) {
      this.drawPileVisual.destroy();
      this.drawPileVisual = null;
    }
    if (this.discardPileVisual) {
      this.discardPileVisual.destroy();
      this.discardPileVisual = null;
    }
    if (this.drawPileText) {
      this.drawPileText.destroy();
      this.drawPileText = null;
    }
    if (this.discardPileText) {
      this.discardPileText.destroy();
      this.discardPileText = null;
    }
    
    // Clear all references
    this.cardContainers.clear();
    this.selectedCardId = null;
    this.ultimateCardId = null;
    this.raisedCards.clear();
    
    this.container.destroy();
    console.log(`[HandUI] HandUI instance destroyed - pile visuals cleaned up`);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  /**
   * Add an ultimate card to the hand (displayed as rightmost card with glow)
   */
  public addUltimateCard(ultimateCardId: string): void {
    // Don't add if already present
    if (this.ultimateCardId === ultimateCardId) {
      console.log(`Ultimate card ${ultimateCardId} already in hand`);
      return;
    }

    const card = getCardById(ultimateCardId);
    if (!card) {
      console.error(`Ultimate card not found: ${ultimateCardId}`);
      return;
    }

    this.ultimateCardId = ultimateCardId;

    // Position ultimate card to the right of existing cards
    const centerX = this.scene.scale.width / 2;
    const y = this.scene.scale.height - CARD_HEIGHT / 2 - 20;
    
    // Calculate position for ultimate card (rightmost)
    const existingCardsCount = this.cardContainers.size;
    const totalWidth = existingCardsCount * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
    const x = centerX + totalWidth / 2 + CARD_SPACING + CARD_WIDTH / 2 + 30; // Extra spacing

    const cardContainer = this.createCardDisplay(card, x, y);
    
    // Add glowing effect to ultimate card
    this.addGlowEffect(cardContainer);
    
    this.container.add(cardContainer);
    this.cardContainers.set(ultimateCardId, cardContainer);

    console.log(`✨ Added ULTIMATE card to hand: ${card.name}`);
  }

  /**
   * Remove the ultimate card from the hand
   */
  public removeUltimateCard(): void {
    if (!this.ultimateCardId) return;

    const container = this.cardContainers.get(this.ultimateCardId);
    if (container) {
      container.destroy();
      this.cardContainers.delete(this.ultimateCardId);
      console.log(`Removed ultimate card: ${this.ultimateCardId}`);
    }

    this.ultimateCardId = null;
  }

  /**
   * Check if ultimate card is in hand
   */
  public hasUltimateCard(): boolean {
    return this.ultimateCardId !== null;
  }

  /**
   * Get the current ultimate card ID
   */
  public getUltimateCardId(): string | null {
    return this.ultimateCardId;
  }

  /**
   * Add pulsing glow effect to a card container
   */
  private addGlowEffect(cardContainer: Phaser.GameObjects.Container): void {
    const bg = cardContainer.getByName('bg') as Phaser.GameObjects.Rectangle;
    
    // Set initial glow
    bg.setStrokeStyle(5, 0xffff00, 1);
    
    // Pulse animation on border
    this.scene.tweens.add({
      targets: bg,
      alpha: { from: 1, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Don't scale the card image - just keep it at normal size
    // Add a subtle brightness pulse instead
    const cardImage = cardContainer.getByName('cardImage') as Phaser.GameObjects.Image;
    if (cardImage) {
      this.scene.tweens.add({
        targets: cardImage,
        alpha: { from: 1, to: 0.85 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Add glow circles around the card (instead of particles that expand bounds)
    const glowCircle1 = this.scene.add.circle(0, 0, 70, 0xffff00, 0);
    glowCircle1.setStrokeStyle(2, 0xffff00, 0.3);
    glowCircle1.setName('glowCircle1');
    
    const glowCircle2 = this.scene.add.circle(0, 0, 80, 0xffff00, 0);
    glowCircle2.setStrokeStyle(2, 0xffff00, 0.2);
    glowCircle2.setName('glowCircle2');
    
    cardContainer.add([glowCircle1, glowCircle2]);
    
    // Animate glow circles
    this.scene.tweens.add({
      targets: glowCircle1,
      scale: { from: 1, to: 1.1 },
      alpha: { from: 0.3, to: 0 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    this.scene.tweens.add({
      targets: glowCircle2,
      scale: { from: 1, to: 1.15 },
      alpha: { from: 0.2, to: 0 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    });
  }

  /**
   * Create visual indicators for draw pile and discard pile sizes
   */
  private createPileIndicators(): void {
    const y = this.scene.scale.height - CARD_HEIGHT - 60;
    const cardScale = 0.08;
    
    // Draw pile visual - LEFT SIDE - Simple image, starts hidden
    this.drawPileVisual = this.scene.add.image(55, y, 'cardback');
    this.drawPileVisual.setScale(cardScale);
    this.drawPileVisual.setVisible(false);
    this.drawPileVisual.setDepth(50);
    
    // Draw pile text - LEFT SIDE  
    this.drawPileText = this.scene.add.text(55, y + 100, 'Draw: 0', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 3 }
    });
    this.drawPileText.setOrigin(0.5, 0.5);
    this.drawPileText.setDepth(100);
    
    // Discard pile visual - RIGHT SIDE - Simple image, starts hidden
    this.discardPileVisual = this.scene.add.image(this.scene.scale.width - 55, y, 'cardback');
    this.discardPileVisual.setScale(cardScale);
    this.discardPileVisual.setVisible(false);
    this.discardPileVisual.setDepth(50);
    
    // Discard pile text - RIGHT SIDE
    this.discardPileText = this.scene.add.text(this.scene.scale.width - 55, y + 100, 'Discard: 0', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 3 }
    });
    this.discardPileText.setOrigin(0.5, 0.5);
    this.discardPileText.setDepth(100);
  }

  /**
   * Update the pile size indicators
   * SIMPLE: If count > 0 show image, if count == 0 hide image
   */
  updatePileIndicators(drawPileSize: number, discardPileSize: number): void {
    // Update text
    if (this.drawPileText) {
      this.drawPileText.setText(`Draw: ${drawPileSize}`);
    }
    if (this.discardPileText) {
      this.discardPileText.setText(`Discard: ${discardPileSize}`);
    }
    
    // SIMPLE: Show/hide based on count
    if (this.drawPileVisual) {
      this.drawPileVisual.setVisible(drawPileSize > 0);
    }
    if (this.discardPileVisual) {
      this.discardPileVisual.setVisible(discardPileSize > 0);
    }
  }

  /**
   * Animate drawing a card from draw pile to hand
   */
  animateDrawCard(cardId: string, targetHandPosition: number, delayMs: number = 0): void {
    console.log(`[HandUI] animateDrawCard called: cardId=${cardId}, position=${targetHandPosition}, delay=${delayMs}ms`);
    
    // Ensure pile visuals are created before animation
    if (!this.drawPileVisual) {
      console.log(`[HandUI] Creating pile indicators for animation`);
      this.createPileIndicators();
    }
    
    if (!this.drawPileVisual) {
      console.error(`[HandUI] Failed to create pile visuals for animation`);
      return;
    }

    // Get the card data to show the front
    const card = getCardById(cardId);
    if (!card) return;
    
    // Card should already be hidden when HandUI was created
    const cardContainer = this.cardContainers.get(cardId);
    if (!cardContainer) return;

    // Delay the animation start based on card index
    this.scene.time.delayedCall(delayMs, () => {
      // Check if drawPileVisual still exists before animating
      if (!this.drawPileVisual) {
        console.warn(`[HandUI] drawPileVisual destroyed before animation could start`);
        // Just show the card immediately without animation
        if (cardContainer) {
          cardContainer.setVisible(true);
        }
        return;
      }
      
      // Validate drawPileVisual position (should never be at 0,0 or too small)
      console.log(`[HandUI] drawPileVisual position: (${this.drawPileVisual.x}, ${this.drawPileVisual.y})`);
      if (this.drawPileVisual.x < 10 || this.drawPileVisual.y < 10) {
        console.error(`[HandUI] drawPileVisual has invalid position: (${this.drawPileVisual.x}, ${this.drawPileVisual.y})`);
        console.log(`[HandUI] Skipping animation, showing card immediately`);
        if (cardContainer) {
          cardContainer.setVisible(true);
        }
        return;
      }
      
      // Create a temporary card back for animation OFF-SCREEN first
      console.log(`[HandUI] Creating animated card at position: (${this.drawPileVisual.x}, ${this.drawPileVisual.y})`);
      const animatedCard = this.scene.add.image(
        -9999,  // Create OFF-SCREEN
        -9999, 
        'cardback'
      );
      animatedCard.setScale(0.08);
      animatedCard.setDepth(200 + targetHandPosition); // Stack animations
      animatedCard.setName('animatedDrawCard'); // Name it for easier debugging
      // NOW move it to the correct starting position
      animatedCard.setPosition(this.drawPileVisual.x, this.drawPileVisual.y);
      
      // Play card deal sound with pitch variation - randomly select between two sounds
      const dealSound = Math.random() < 0.5 ? 'sfx_deal' : 'sfx_deal2';
      const pitchVariation = 0.85 + Math.random() * 0.3;
      this.scene.sound.play(dealSound, { volume: 0.5, rate: pitchVariation });
      
      // Failsafe: destroy the animated card after 2 seconds if animation hasn't completed
      this.scene.time.delayedCall(2000, () => {
        if (animatedCard && animatedCard.active) {
          console.warn(`[HandUI] Failsafe: destroying orphaned animated card that didn't complete animation`);
          animatedCard.destroy();
        }
      });

      // Calculate target position in hand
      const centerX = this.scene.scale.width / 2;
      const handY = this.scene.scale.height - CARD_HEIGHT / 2 - 20;
      const totalWidth = 4 * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING; // Assuming 4 cards max
      const startX = centerX - totalWidth / 2;
      const targetX = startX + targetHandPosition * (CARD_WIDTH + CARD_SPACING) + CARD_WIDTH / 2;
      const targetY = handY;

      // Calculate the scale for hand cards (1024x1536 -> 120x180)
      const handCardScale = CARD_WIDTH / 1024; // ~0.117

      // Track if animation completed to prevent double-destroy
      let animationCompleted = false;
      
      // Animate the card from draw pile to hand (position and Y-scale only)
      this.scene.tweens.add({
        targets: animatedCard,
        x: targetX,
        y: targetY,
        scaleY: handCardScale, // Only animate Y scale, X scale is handled by flip animation
        duration: 600,
        ease: 'Power2.easeOut',
        onComplete: () => {
          // Remove the animated card
          if (!animationCompleted && animatedCard && animatedCard.active) {
            animationCompleted = true;
            animatedCard.destroy();
            console.log(`[HandUI] Animation completed, card destroyed`);
          }
          
          // Show the actual card in hand now
          if (cardContainer) {
            cardContainer.setVisible(true);
          }
        }
      });

      // Add a flip animation that reveals the card face halfway through (X-scale only)
      this.scene.tweens.add({
        targets: animatedCard,
        scaleX: 0, // Flip to invisible (side view)
        duration: 300, // First half of animation
        ease: 'Power2.easeIn',
        onComplete: () => {
          // Switch to card front image
          if (animatedCard && animatedCard.active) {
            animatedCard.setTexture(`card_${card.type}`);
            
            // Flip back out to reveal the card face
            this.scene.tweens.add({
              targets: animatedCard,
              scaleX: handCardScale, // Flip to full scale
              duration: 300, // Second half of animation
              ease: 'Power2.easeOut'
            });
          }
        }
      });

      // Add a subtle rotation during animation
      this.scene.tweens.add({
        targets: animatedCard,
        rotation: Math.PI * 0.15, // Slight rotation
        duration: 600,
        ease: 'Sine.easeInOut'
      });
    });
  }

  /**
   * Animate discarding a card from hand to discard pile
   */
  animateDiscardCard(cardId: string, sourceHandPosition: number, delayMs: number = 0): void {
    if (!this.discardPileVisual) return;

    // Find the card container in hand
    const cardContainer = this.cardContainers.get(cardId);
    if (!cardContainer) return;

    // Create a temporary card for animation (use the actual card image)
    const card = getCardById(cardId);
    if (!card) return;

    // Calculate the scale for hand cards (1024x1536 -> 120x180)
    const handCardScale = CARD_WIDTH / 1024; // ~0.117

    // Get the card's current WORLD position before hiding it
    const startX = cardContainer.x + this.container.x; // Convert to world coordinates
    const startY = cardContainer.y + this.container.y;

    // Hide the card from hand immediately
    cardContainer.setVisible(false);

    // Delay the animation start based on card index
    this.scene.time.delayedCall(delayMs, () => {
      // Check if discardPileVisual still exists before animating
      if (!this.discardPileVisual) {
        console.warn(`[HandUI] discardPileVisual destroyed before animation could start`);
        return;
      }
      
      const animatedCard = this.scene.add.image(
        -9999,  // Create OFF-SCREEN
        -9999, 
        `card_${card.type}` // Start with card face
      );
      animatedCard.setScale(handCardScale); // Start at hand card size
      animatedCard.setDepth(200 + sourceHandPosition); // Stack animations
      animatedCard.setName('animatedDiscardCard'); // Name it for easier debugging
      // NOW move it to the correct starting position
      animatedCard.setPosition(startX, startY);

      // Calculate target position in discard pile (discardPileVisual is already in world coordinates)
      const targetX = this.discardPileVisual.x;
      const targetY = this.discardPileVisual.y;

      // Animate the card from hand to discard pile
      this.scene.tweens.add({
        targets: animatedCard,
        x: targetX,
        y: targetY,
        scaleX: 0.08, // Scale down to pile card size
        scaleY: 0.08,
        duration: 500,
        ease: 'Power2.easeIn',
        onComplete: () => {
          // Remove the animated card
          console.log(`[HandUI] Destroying animated discard card for ${cardId}`);
          animatedCard.destroy();
          
          // Card is already hidden, no need to refresh
        }
      });

      // Add a flip animation that turns the card to back halfway through (opposite of draw)
      this.scene.tweens.add({
        targets: animatedCard,
        scaleX: 0, // Flip to invisible (side view)
        duration: 250, // First half of animation
        ease: 'Power2.easeIn',
        onComplete: () => {
          // Switch to card back image
          animatedCard.setTexture('cardback');
          
          // Flip back out to reveal the card back
          this.scene.tweens.add({
            targets: animatedCard,
            scaleX: 0.08, // Flip to discard pile scale
            duration: 250, // Second half of animation
            ease: 'Power2.easeOut'
          });
        }
      });

      // Add rotation during animation
      this.scene.tweens.add({
        targets: animatedCard,
        rotation: Math.PI * 0.15, // Spin the card
        duration: 500,
        ease: 'Power2.easeIn'
      });

      // Fade out slightly
      this.scene.tweens.add({
        targets: animatedCard,
        alpha: 0.7,
        duration: 500,
        ease: 'Power2.easeIn'
      });
    });
  }

  /**
   * Raise a card to indicate it's been played this round
   * Cards remain raised until discarded
   */
  public raiseCard(cardId: string): void {
    const container = this.cardContainers.get(cardId);
    if (!container) return;

    // Mark as raised
    this.raisedCards.add(cardId);

    // Get original Y position (stored in data)
    const originalY = container.getData('originalY') || container.y;
    container.setData('originalY', originalY);

    // Animate card up by 15px
    this.scene.tweens.add({
      targets: container,
      y: originalY - 15,
      duration: 300,
      ease: 'Power2.easeOut',
    });

    console.log(`📈 Card ${cardId} raised!`);
  }

  /**
   * Reset all raised cards back to normal position
   * Called when cards are discarded at end of turn
   */
  public resetRaisedCards(): void {
    this.raisedCards.forEach(cardId => {
      const container = this.cardContainers.get(cardId);
      if (!container) return;

      const originalY = container.getData('originalY');
      if (originalY !== undefined) {
        // Animate card back down to original position
        this.scene.tweens.add({
          targets: container,
          y: originalY,
          duration: 300,
          ease: 'Power2.easeOut',
        });
      }
    });

    this.raisedCards.clear();
    console.log('📉 All raised cards reset');
  }

  /**
   * Check if a card is currently raised
   */
  public isCardRaised(cardId: string): boolean {
    return this.raisedCards.has(cardId);
  }

  /**
   * Refresh the hand display (called after animations)
   */
  private refreshHand(): void {
    // This would be called by the parent to refresh the hand UI
    // The parent should handle updating the card containers
  }
}

