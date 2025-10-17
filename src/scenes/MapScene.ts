import Phaser from 'phaser';
import { generateMap, GameMap, MapNode, NodeType, getNodesInLayer, getAvailableNodes, visitNode } from '../game/mapgen';
import { COLORS } from '../game/config';
import { SoundManager } from '../game/sound';
import { subscribeMap, sendMapVote, sendMapVoteResult } from '../net/match';

/**
 * Map scene - Slay the Spire style node-based progression
 */
export class MapScene extends Phaser.Scene {
  private gameMap!: GameMap;
  private nodeVisuals = new Map<string, NodeVisual>();
  private soundManager: SoundManager | null = null;
  private currentNodeId: string | null = null; // Track player's current position
  private playerMarker: Phaser.GameObjects.Container | null = null; // Visual marker for current position
  
  // Scene data
  private lobbyId: string | null = null;
  private players: any[] = [];
  private userId: string | null = null;
  private isHost = false;
  
  // Voting system
  private mapVotes = new Map<string, string>(); // userId -> nodeId
  private myVote: string | null = null;
  private votingUI: Phaser.GameObjects.Container | null = null;
  private unsubscribe: (() => void) | null = null;
  
  // Layout constants
  private readonly NODE_RADIUS = 25;
  private readonly LAYER_HEIGHT = 80; // Spacing for 7 layers
  private readonly NODE_SPACING = 150; // Reduced horizontal spread to avoid overlap
  private readonly MAP_START_Y = 650; // Moved down to avoid taskbar
  private readonly MAP_MARGIN_LEFT = 220; // Left margin for spacing
  private readonly MAP_MARGIN_RIGHT = 220; // Right margin to avoid legend
  
  constructor() {
    super('MapScene');
  }

  init(data: { lobbyId?: string; players?: any[]; mapSeed?: number; visitedNodes?: string[]; currentNodeId?: string }): void {
    this.lobbyId = data.lobbyId || null;
    this.players = data.players || [];
    this.currentNodeId = data.currentNodeId || null;
    
    console.log('Map scene initialized', { 
      lobbyId: this.lobbyId, 
      seed: data.mapSeed,
      visitedNodes: data.visitedNodes,
      currentNodeId: this.currentNodeId
    });
    
    // Generate map with same seed to get same structure
    this.gameMap = generateMap({ seed: data.mapSeed });
    
    // Restore visited node state
    if (data.visitedNodes) {
      data.visitedNodes.forEach(nodeId => {
        const node = this.gameMap.nodes.get(nodeId);
        if (node) {
          node.visited = true;
          console.log(`Restored visited state for node: ${nodeId}`);
        }
      });
    }
    
    // If no current node specified, find the most recent visited node (highest layer)
    if (!this.currentNodeId && data.visitedNodes && data.visitedNodes.length > 0) {
      const visitedNodesArray = data.visitedNodes
        .map(id => this.gameMap.nodes.get(id))
        .filter(n => n !== undefined) as MapNode[];
      
      if (visitedNodesArray.length > 0) {
        // Get the visited node with the highest layer (most progress)
        const mostRecentNode = visitedNodesArray.reduce((max, node) => 
          node.layer > max.layer ? node : max
        );
        this.currentNodeId = mostRecentNode.id;
        console.log(`Set current node to most recent: ${this.currentNodeId} at layer ${mostRecentNode.layer}`);
      }
    }
    
    // If still no current node, default to start
    if (!this.currentNodeId) {
      const startNode = Array.from(this.gameMap.nodes.values()).find(n => n.type === NodeType.Start);
      if (startNode) {
        this.currentNodeId = startNode.id;
        console.log(`Set current node to start: ${this.currentNodeId}`);
      }
    }
    
    console.log(`Map generated with ${this.gameMap.nodes.size} nodes, ${data.visitedNodes?.length || 0} visited`);
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Fantasy dark background with gradient
    this.cameras.main.setBackgroundColor('#0d0820');
    
    // Create fantasy background
    this.createFantasyBackground();

    // Initialize sound
    this.soundManager = new SoundManager(this);

    // Fantasy-styled title with glow effect
    const titleShadow = this.add.text(width / 2 + 2, 42, 'THE PATH AHEAD', {
      fontSize: '52px',
      color: '#1a0f2e',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold italic',
    });
    titleShadow.setOrigin(0.5);
    titleShadow.setDepth(999);

    const title = this.add.text(width / 2, 40, 'THE PATH AHEAD', {
      fontSize: '52px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold italic',
      stroke: '#8b6914',
      strokeThickness: 3,
    });
    title.setOrigin(0.5);
    title.setDepth(1000);
    
    // Glowing animation on title
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.7 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Instructions with fantasy styling
    const instructions = this.add.text(width / 2, 95, 'Choose your destiny...', {
      fontSize: '20px',
      color: '#b8a890',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      stroke: '#000000',
      strokeThickness: 3,
    });
    instructions.setOrigin(0.5);
    instructions.setDepth(1000);

    // Legend
    this.createLegend();

    // Camera - no scrolling needed, map fits on screen
    this.cameras.main.setBounds(0, 0, width, height);
    
    // Render map
    this.renderMap();
    
    // Mark start node as visited if it's the current node
    const startNode = Array.from(this.gameMap.nodes.values()).find(n => n.type === NodeType.Start);
    if (startNode && !this.currentNodeId) {
      startNode.visited = true;
      this.currentNodeId = startNode.id;
    }
    
    // Create player marker on current node
    if (this.currentNodeId) {
      this.createPlayerMarker(this.currentNodeId);
    }
    
    // Update available nodes (only forward progression)
    this.updateAvailableNodes();
    
    // Setup networking if multiple players
    if (this.players.length > 1 && this.lobbyId) {
      this.setupVoting();
    }
    
    // No scrolling needed - map fits on screen!
  }

  private async getCurrentUserId(): Promise<string | null> {
    try {
      const { getCurrentUserId } = await import('../net/supa');
      return await getCurrentUserId();
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  private setupVoting(): void {
    if (!this.lobbyId) return;

    subscribeMap(this.lobbyId, {
      onMapVote: this.handleRemoteVote.bind(this),
      onMapVoteResult: this.handleVoteResult.bind(this),
    }).then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
      console.log('Map voting system initialized');
    }).catch((error) => {
      console.error('Failed to setup voting:', error);
    });
  }

  private handleRemoteVote(userId: string, nodeId: string): void {
    console.log(`Remote vote from ${userId}: ${nodeId}`);
    
    // Don't process our own votes
    if (userId === this.userId) return;
    
    this.mapVotes.set(userId, nodeId);
    this.updateVotingUI();
    
    // If host, check if all players voted
    if (this.isHost) {
      this.checkAllVotesIn();
    }
  }

  private handleVoteResult(selectedNodeId: string, votes: { [nodeId: string]: string[] }): void {
    console.log('Received vote result:', selectedNodeId, votes);
    
    // Transition to the selected node
    const node = this.gameMap.nodes.get(selectedNodeId);
    if (node) {
      this.transitionToNode(node);
    }
  }

  private checkAllVotesIn(): void {
    if (!this.isHost) return;
    
    const totalPlayers = this.players.length;
    const votesReceived = this.mapVotes.size + (this.myVote ? 1 : 0);
    
    if (votesReceived >= totalPlayers) {
      console.log('All votes received, resolving...');
      this.resolveVotes();
    }
  }

  private resolveVotes(): void {
    // Count votes for each node
    const voteCounts = new Map<string, string[]>();
    
    // Add remote votes
    for (const [userId, nodeId] of this.mapVotes.entries()) {
      if (!voteCounts.has(nodeId)) {
        voteCounts.set(nodeId, []);
      }
      voteCounts.get(nodeId)!.push(userId);
    }
    
    // Add my vote
    if (this.myVote) {
      if (!voteCounts.has(this.myVote)) {
        voteCounts.set(this.myVote, []);
      }
      voteCounts.get(this.myVote)!.push(this.userId!);
    }
    
    // Find winner(s)
    let maxVotes = 0;
    let winningNodes: string[] = [];
    
    for (const [nodeId, voters] of voteCounts.entries()) {
      if (voters.length > maxVotes) {
        maxVotes = voters.length;
        winningNodes = [nodeId];
      } else if (voters.length === maxVotes) {
        winningNodes.push(nodeId);
      }
    }
    
    // Select winner (coin toss if tie)
    const selectedNodeId = winningNodes[Math.floor(Math.random() * winningNodes.length)];
    
    console.log(`Vote resolution: ${selectedNodeId} wins with ${maxVotes} votes`);
    
    // Convert Map to object for network
    const votesObject: { [nodeId: string]: string[] } = {};
    for (const [nodeId, voters] of voteCounts.entries()) {
      votesObject[nodeId] = voters;
    }
    
    // Broadcast result
    if (this.lobbyId) {
      sendMapVoteResult(this.lobbyId, selectedNodeId, votesObject).catch(err => {
        console.error('Failed to send vote result:', err);
      });
    }
  }

  private updateVotingUI(): void {
    // Remove old UI
    if (this.votingUI) {
      this.votingUI.destroy();
    }
    
    if (this.players.length <= 1) return;
    
    // Create voting status UI
    this.votingUI = this.add.container(50, this.scale.height - 100);
    this.votingUI.setScrollFactor(0);
    this.votingUI.setDepth(1000);
    
    const bg = this.add.rectangle(0, 0, 300, 80, 0x1a0f2e, 0.9);
    bg.setStrokeStyle(2, 0x8b7355, 0.8);
    this.votingUI.add(bg);
    
    // Voting status text
    const totalPlayers = this.players.length;
    const votesReceived = this.mapVotes.size + (this.myVote ? 1 : 0);
    
    const statusText = this.add.text(0, -15, 'Voting for Path...', {
      fontSize: '16px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    statusText.setOrigin(0.5);
    this.votingUI.add(statusText);
    
    const progressText = this.add.text(0, 10, `${votesReceived}/${totalPlayers} votes`, {
      fontSize: '14px',
      color: '#b8a890',
      fontFamily: 'Georgia, serif',
    });
    progressText.setOrigin(0.5);
    this.votingUI.add(progressText);
    
    // Show current votes
    if (this.myVote) {
      const myVoteText = this.add.text(0, 30, `Your vote: ${this.getNodeTypeName(this.myVote)}`, {
        fontSize: '12px',
        color: '#44ff88',
        fontFamily: 'Georgia, serif',
      });
      myVoteText.setOrigin(0.5);
      this.votingUI.add(myVoteText);
    }
  }

  private getNodeTypeName(nodeId: string): string {
    const node = this.gameMap.nodes.get(nodeId);
    if (!node) return 'Unknown';
    
    switch (node.type) {
      case NodeType.Battle: return 'Battle';
      case NodeType.Shop: return 'Shop';
      case NodeType.Event: return 'Event';
      case NodeType.Boss: return 'Boss';
      default: return 'Unknown';
    }
  }

  private createFantasyBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Create gradient background
    const graphics = this.add.graphics();
    
    // Dark purple/blue gradient
    graphics.fillGradientStyle(0x0d0820, 0x0d0820, 0x1a0f2e, 0x1a0f2e, 1, 1, 1, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.setDepth(-100);
    
    // Add stars
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2 + 0.5;
      const alpha = Math.random() * 0.5 + 0.3;
      
      const star = this.add.circle(x, y, size, 0xffffff, alpha);
      star.setDepth(-90);
      
      // Twinkling animation
      this.tweens.add({
        targets: star,
        alpha: alpha * 0.3,
        duration: Math.random() * 2000 + 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    
    // Add subtle mist/fog effect at bottom
    const mist = this.add.graphics();
    mist.fillGradientStyle(0x2a1f3d, 0x2a1f3d, 0x0d0820, 0x0d0820, 0.3, 0.3, 0, 0);
    mist.fillRect(0, height - 200, width, 200);
    mist.setDepth(-95);
    
    // Decorative corner elements
    this.createCornerDecorations();
  }

  private createCornerDecorations(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Top corners - fantasy brackets
    const cornerGraphics = this.add.graphics();
    cornerGraphics.lineStyle(3, 0x8b7355, 0.6);
    
    // Top left corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(20, 140);
    cornerGraphics.lineTo(20, 20);
    cornerGraphics.lineTo(140, 20);
    cornerGraphics.strokePath();
    
    // Top right corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(width - 20, 140);
    cornerGraphics.lineTo(width - 20, 20);
    cornerGraphics.lineTo(width - 140, 20);
    cornerGraphics.strokePath();
    
    // Bottom left corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(20, height - 140);
    cornerGraphics.lineTo(20, height - 20);
    cornerGraphics.lineTo(140, height - 20);
    cornerGraphics.strokePath();
    
    // Bottom right corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(width - 20, height - 140);
    cornerGraphics.lineTo(width - 20, height - 20);
    cornerGraphics.lineTo(width - 140, height - 20);
    cornerGraphics.strokePath();
    
    cornerGraphics.setDepth(999);
    cornerGraphics.setScrollFactor(0);
  }

  private createLegend(): void {
    const legendX = this.scale.width - 200;
    const legendY = 160;
    const container = this.add.container(legendX, legendY);
    container.setDepth(1000);
    container.setScrollFactor(0); // Fixed to camera

    // Fantasy-styled background
    const bg = this.add.rectangle(0, 0, 190, 200, 0x1a0f2e, 0.85);
    bg.setStrokeStyle(3, 0x8b7355, 0.8);
    container.add(bg);

    const legendTitle = this.add.text(0, -85, 'PATHS', {
      fontSize: '20px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold italic',
      stroke: '#000000',
      strokeThickness: 2,
    });
    legendTitle.setOrigin(0.5);
    container.add(legendTitle);

    const entries = [
      { type: 'Battle', color: 0xc72c41, icon: '⚔' },
      { type: 'Shop', color: 0xd4af37, icon: '◆' },
      { type: 'Event', color: 0x6a5acd, icon: '?' },
      { type: 'Boss', color: 0x8b0000, icon: '☠' },
    ];

    entries.forEach((entry, i) => {
      const y = -45 + i * 38;
      
      // Node preview
      const circle = this.add.circle(-55, y, 14, entry.color);
      circle.setStrokeStyle(2, 0xffd700, 0.7);
      container.add(circle);
      
      const icon = this.add.text(-55, y, entry.icon, {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      });
      icon.setOrigin(0.5);
      container.add(icon);
      
      const text = this.add.text(-30, y, entry.type, {
        fontSize: '16px',
        color: '#b8a890',
        fontFamily: 'Georgia, serif',
      });
      text.setOrigin(0, 0.5);
      container.add(text);
    });
  }

  private renderMap(): void {
    const width = this.scale.width;
    
    // First, draw all connections as fantasy paths
    const connectionGraphics = this.add.graphics();
    connectionGraphics.setDepth(1);

    for (const node of this.gameMap.nodes.values()) {
      const nodePos = this.getNodePosition(node);
      
      for (const targetId of node.connections) {
        const targetNode = this.gameMap.nodes.get(targetId);
        if (targetNode) {
          const targetPos = this.getNodePosition(targetNode);
          
          // Create a slightly curved path using Phaser curves
          const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(nodePos.x, nodePos.y),
            new Phaser.Math.Vector2(
              (nodePos.x + targetPos.x) / 2 + (Math.random() - 0.5) * 20,
              (nodePos.y + targetPos.y) / 2
            ),
            new Phaser.Math.Vector2(targetPos.x, targetPos.y)
          );
          
          // Outer glow
          connectionGraphics.lineStyle(6, 0x4a3f5f, 0.2);
          curve.draw(connectionGraphics, 32);
          
          // Inner path
          connectionGraphics.lineStyle(3, 0x7a6b8f, 0.4);
          curve.draw(connectionGraphics, 32);
        }
      }
    }

    // Then draw nodes on top
    for (const node of this.gameMap.nodes.values()) {
      const visual = new NodeVisual(this, node, this.getNodePosition(node), this.NODE_RADIUS);
      visual.on('click', () => this.handleNodeClick(node));
      this.nodeVisuals.set(node.id, visual);
    }
  }

  private getNodePosition(node: MapNode): { x: number; y: number } {
    const layerNodes = getNodesInLayer(this.gameMap, node.layer);
    const layerWidth = (layerNodes.length - 1) * this.NODE_SPACING;
    
    // Calculate available width (screen width minus margins)
    const availableWidth = this.scale.width - this.MAP_MARGIN_LEFT - this.MAP_MARGIN_RIGHT;
    
    // Center the layer within available space
    const startX = this.MAP_MARGIN_LEFT + (availableWidth - layerWidth) / 2;
    
    // Add horizontal jitter for more organic, asymmetrical look
    // Use node ID as seed for consistent positions across rerenders
    const jitterSeed = parseInt(node.id.split('_').join(''), 36) % 1000;
    const jitter = ((jitterSeed / 1000) - 0.5) * 30; // ±15px variation (reduced from 40)
    
    return {
      x: startX + node.column * this.NODE_SPACING + jitter,
      y: this.MAP_START_Y - node.layer * this.LAYER_HEIGHT,
    };
  }

  private createPlayerMarker(nodeId: string): void {
    const node = this.gameMap.nodes.get(nodeId);
    if (!node) return;
    
    const pos = this.getNodePosition(node);
    
    // Remove old marker if exists
    if (this.playerMarker) {
      this.playerMarker.destroy();
    }
    
    // Create new marker
    this.playerMarker = this.add.container(pos.x, pos.y);
    this.playerMarker.setDepth(100); // Above nodes
    
    // Fantasy player marker (scaled to smaller nodes)
    const outerGlow = this.add.circle(0, 0, this.NODE_RADIUS + 15, 0xffd700, 0.4);
    this.playerMarker.add(outerGlow);
    
    // Multiple rings for fantasy effect
    const ring1 = this.add.circle(0, 0, this.NODE_RADIUS + 11, 0x44ff88, 0.3);
    ring1.setStrokeStyle(2, 0xffd700, 0.8);
    this.playerMarker.add(ring1);
    
    const innerCircle = this.add.circle(0, 0, this.NODE_RADIUS + 8, 0x32cd32, 0.95);
    innerCircle.setStrokeStyle(3, 0xffd700, 1);
    this.playerMarker.add(innerCircle);
    
    // Shadow for depth
    const iconShadow = this.add.text(1, 1, '⚔', {
      fontSize: '28px',
      color: '#000000',
    });
    iconShadow.setOrigin(0.5);
    iconShadow.setAlpha(0.5);
    this.playerMarker.add(iconShadow);
    
    const playerIcon = this.add.text(0, 0, '⚔', {
      fontSize: '28px',
    });
    playerIcon.setOrigin(0.5);
    this.playerMarker.add(playerIcon);
    
    // Pulsing glow animation
    this.tweens.add({
      targets: outerGlow,
      scale: { from: 1, to: 1.4 },
      alpha: { from: 0.4, to: 0.1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Ring rotation for magical effect
    this.tweens.add({
      targets: ring1,
      angle: 360,
      duration: 4000,
      repeat: -1,
      ease: 'Linear',
    });
    
    console.log(`Created player marker at node ${nodeId}`);
  }

  private updateAvailableNodes(): void {
    // Get nodes that are directly connected from current node and in higher layer
    let availableIds = new Set<string>();
    
    if (this.currentNodeId) {
      const currentNode = this.gameMap.nodes.get(this.currentNodeId);
      if (currentNode) {
        // Only nodes connected to current node are available
        currentNode.connections.forEach(connectedId => {
          const connectedNode = this.gameMap.nodes.get(connectedId);
          // Only allow forward progression (higher layer = further up the map)
          if (connectedNode && !connectedNode.visited && connectedNode.layer > currentNode.layer) {
            availableIds.add(connectedId);
          }
        });
        
        console.log(`Available nodes from ${this.currentNodeId}:`, Array.from(availableIds));
      }
    } else {
      // Fallback to old behavior if no current node
      const available = getAvailableNodes(this.gameMap);
      availableIds = new Set(available.map(n => n.id));
    }
    
    for (const [id, visual] of this.nodeVisuals.entries()) {
      const node = this.gameMap.nodes.get(id)!;
      const isCurrent = id === this.currentNodeId;
      visual.setAvailable(availableIds.has(id));
      visual.setVisited(node.visited);
      visual.setCurrent(isCurrent);
    }
  }

  private handleNodeClick(node: MapNode): void {
    // Check if node is available (connected to current node and forward only)
    let isAvailable = false;
    
    if (this.currentNodeId) {
      const currentNode = this.gameMap.nodes.get(this.currentNodeId);
      if (currentNode) {
        isAvailable = currentNode.connections.includes(node.id) && 
                      !node.visited && 
                      node.layer > currentNode.layer;
      }
    } else {
      const available = getAvailableNodes(this.gameMap);
      isAvailable = available.some(n => n.id === node.id);
    }
    
    if (!isAvailable) {
      console.log('Node not available - can only move forward through connected paths');
      return;
    }

    console.log(`Selected node: ${node.id} (${node.type})`);
    
    if (this.players.length > 1) {
      // Multiplayer: Vote for this node
      this.voteForNode(node.id);
    } else {
      // Single player: Direct transition
      this.transitionDirectly(node);
    }
  }

  private async voteForNode(nodeId: string): Promise<void> {
    this.myVote = nodeId;
    this.updateVotingUI();
    
    // Send vote
    if (this.lobbyId) {
      try {
        await sendMapVote(this.lobbyId, nodeId);
        console.log(`Voted for node: ${nodeId}`);
      } catch (error) {
        console.error('Failed to send vote:', error);
      }
    }
    
    // If host, check if all votes are in
    if (this.isHost) {
      this.checkAllVotesIn();
    }
  }

  private transitionDirectly(node: MapNode): void {
    // Mark as visited and update current position
    visitNode(this.gameMap, node.id);
    this.currentNodeId = node.id;
    
    // Update visuals
    this.createPlayerMarker(this.currentNodeId);
    this.updateAvailableNodes();
    
    // Transition based on node type
    this.time.delayedCall(300, () => {
      this.transitionToNode(node);
    });
  }

  private transitionToNode(node: MapNode): void {
    // Get list of visited node IDs
    const visitedNodes = Array.from(this.gameMap.nodes.values())
      .filter(n => n.visited)
      .map(n => n.id);
    
    switch (node.type) {
      case NodeType.Battle:
      case NodeType.Boss:
        console.log('Transitioning to battle...');
        
        // TODO: Generate enemy loadout based on difficulty
        this.scene.start('CardSelectScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.gameMap.seed, // Pass map seed to maintain continuity
          visitedNodes: visitedNodes, // Pass visited nodes to maintain progress
          currentNodeId: this.currentNodeId, // Pass current position
        });
        break;
        
      case NodeType.Shop:
        console.log('Transitioning to shop...');
        this.scene.start('ShopScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.gameMap.seed,
          visitedNodes: visitedNodes,
          currentNodeId: this.currentNodeId,
          nodeId: node.id,
        });
        break;
        
      case NodeType.Event:
        console.log('Transitioning to event...');
        this.scene.start('EventScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.gameMap.seed,
          visitedNodes: visitedNodes,
          currentNodeId: this.currentNodeId,
          nodeId: node.id,
        });
        break;
        
      case NodeType.Start:
        // Start node just opens up the next layer
        console.log('Journey begins...');
        break;
    }
  }


  shutdown(): void {
    // Cleanup
    this.nodeVisuals.clear();
    
    // Unsubscribe from network
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  destroy(): void {
    this.shutdown();
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
  }
}

/**
 * Visual representation of a map node
 */
class NodeVisual extends Phaser.GameObjects.Container {
  private circle: Phaser.GameObjects.Arc;
  private icon: Phaser.GameObjects.Text;
  private node: MapNode;
  private isAvailable = false;
  private isVisited = false;
  private isCurrent = false;
  private glowCircle: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, node: MapNode, position: { x: number; y: number }, radius: number) {
    super(scene, position.x, position.y);
    this.node = node;
    
    scene.add.existing(this);
    this.setDepth(10);

    // Outer magical glow (for available nodes)
    this.glowCircle = scene.add.circle(0, 0, radius + 10, this.getNodeColor(), 0.4);
    this.glowCircle.setVisible(false);
    this.add(this.glowCircle);

    // Fantasy-styled main circle with inner shadow
    const shadow = scene.add.circle(1, 1, radius, 0x000000, 0.5);
    this.add(shadow);

    this.circle = scene.add.circle(0, 0, radius, this.getNodeColor());
    this.circle.setStrokeStyle(4, this.getNodeBorderColor(), 0.9);
    this.add(this.circle);
    
    // Inner highlight for depth
    const highlight = scene.add.circle(-3, -3, radius - 6, 0xffffff, 0.15);
    this.add(highlight);

    // Icon with shadow
    const iconShadow = scene.add.text(1, 1, this.getNodeIcon(), {
      fontSize: '22px',
      color: '#000000',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    iconShadow.setOrigin(0.5);
    iconShadow.setAlpha(0.5);
    this.add(iconShadow);

    this.icon = scene.add.text(0, 0, this.getNodeIcon(), {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    this.icon.setOrigin(0.5);
    this.add(this.icon);

    // Interactive
    this.circle.setInteractive({ useHandCursor: true });
    this.circle.on('pointerover', () => this.onHover());
    this.circle.on('pointerout', () => this.onHoverOut());
    this.circle.on('pointerdown', () => this.onClick());
  }

  private getNodeColor(): number {
    switch (this.node.type) {
      case NodeType.Start:
        return 0x4a90e2; // Blue
      case NodeType.Battle:
        return 0xc72c41; // Deep red
      case NodeType.Shop:
        return 0xd4af37; // Gold
      case NodeType.Event:
        return 0x6a5acd; // Slate blue
      case NodeType.Boss:
        return 0x8b0000; // Dark red
      default:
        return 0x666666;
    }
  }

  private getNodeBorderColor(): number {
    switch (this.node.type) {
      case NodeType.Start:
        return 0x7fc8f8; // Light blue
      case NodeType.Battle:
        return 0xff6b7a; // Light red
      case NodeType.Shop:
        return 0xffd700; // Bright gold
      case NodeType.Event:
        return 0x9370db; // Medium purple
      case NodeType.Boss:
        return 0xff4500; // Orange-red
      default:
        return 0x888888;
    }
  }

  private getNodeIcon(): string {
    switch (this.node.type) {
      case NodeType.Start:
        return '▲';
      case NodeType.Battle:
        return '⚔';
      case NodeType.Shop:
        return '◆';
      case NodeType.Event:
        return '?';
      case NodeType.Boss:
        return '☠';
      default:
        return '•';
    }
  }

  setAvailable(available: boolean): void {
    this.isAvailable = available;
    this.updateVisuals();
  }

  setVisited(visited: boolean): void {
    this.isVisited = visited;
    this.updateVisuals();
  }

  setCurrent(current: boolean): void {
    this.isCurrent = current;
    this.updateVisuals();
  }

  private updateVisuals(): void {
    // Current node is hidden (player marker is on top)
    if (this.isCurrent) {
      this.circle.setAlpha(0);
      this.icon.setAlpha(0);
      this.glowCircle.setVisible(false);
    } else if (this.isVisited) {
      this.circle.setAlpha(0.4);
      this.icon.setAlpha(0.4);
      this.glowCircle.setVisible(false);
      this.circle.setStrokeStyle(4, 0x666666, 0.5);
    } else if (this.isAvailable) {
      this.circle.setAlpha(1);
      this.icon.setAlpha(1);
      this.glowCircle.setVisible(true);
      this.circle.setStrokeStyle(4, 0xffffff, 1);
      
      // Pulse animation for available nodes
      this.scene.tweens.add({
        targets: this.glowCircle,
        alpha: { from: 0.3, to: 0.6 },
        scale: { from: 1, to: 1.2 },
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.circle.setAlpha(0.6);
      this.icon.setAlpha(0.6);
      this.glowCircle.setVisible(false);
      this.circle.setStrokeStyle(4, 0x444444, 0.6);
    }
  }

  private onHover(): void {
    if (!this.isAvailable || this.isVisited) return;
    
    this.scene.tweens.add({
      targets: this,
      scale: 1.15,
      duration: 100,
      ease: 'Power2',
    });
  }

  private onHoverOut(): void {
    if (!this.isAvailable || this.isVisited) return;
    
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 100,
      ease: 'Power2',
    });
  }

  private onClick(): void {
    if (!this.isAvailable || this.isVisited) return;
    
    // Click animation
    this.scene.tweens.add({
      targets: this,
      scale: 0.9,
      duration: 100,
      yoyo: true,
      ease: 'Power2',
      onComplete: () => {
        this.emit('click');
      },
    });
  }
}

