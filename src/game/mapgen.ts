/**
 * Map Generation for Slay the Spire-style node-based progression
 */

export enum NodeType {
  Battle = 'BATTLE',
  Shop = 'SHOP',
  Event = 'EVENT',
  Boss = 'BOSS',
  Start = 'START',
}

export interface MapNode {
  id: string;
  type: NodeType;
  layer: number; // Vertical position (0 = start, max = boss)
  column: number; // Horizontal position within layer
  connections: string[]; // IDs of connected nodes in next layer
  visited: boolean;
}

export interface GameMap {
  nodes: Map<string, MapNode>;
  layers: number;
  seed: number;
}

export interface MapGenConfig {
  layers: number; // How many rows (typically 12-15)
  minNodesPerLayer: number; // Min nodes per row (3)
  maxNodesPerLayer: number; // Max nodes per row (5)
  connectionDensity: number; // How connected paths are (0.5-0.8)
  shopFrequency: number; // Chance of shop (0.15)
  eventFrequency: number; // Chance of event (0.25)
  seed?: number;
}

const DEFAULT_CONFIG: MapGenConfig = {
  layers: 7, // 7 layers for better fit and pacing
  minNodesPerLayer: 2,
  maxNodesPerLayer: 5, // Allow wider layers
  connectionDensity: 0.65,
  shopFrequency: 0.15,
  eventFrequency: 0.20,
};

/**
 * Simple seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Generate a procedural map
 */
export function generateMap(config: Partial<MapGenConfig> = {}): GameMap {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const seed = cfg.seed || Date.now();
  const rng = new SeededRandom(seed);
  const nodes = new Map<string, MapNode>();

  // Layer 0: Single start node
  const startNode: MapNode = {
    id: 'node_0_0',
    type: NodeType.Start,
    layer: 0,
    column: 0,
    connections: [],
    visited: false,
  };
  nodes.set(startNode.id, startNode);

  // Generate middle layers with INTERESTING, asymmetrical layouts
  for (let layer = 1; layer < cfg.layers - 1; layer++) {
    let nodeCount: number;
    const layerRoll = rng.next();
    
    // Create strategic patterns - not random!
    if (layer === 1) {
      // Layer 1: Always diverge (2-3 paths from start)
      nodeCount = rng.nextInt(2, 3);
    } else if (layer === Math.floor(cfg.layers / 2)) {
      // Middle layer: WIDE - lots of choices (shop/event opportunities)
      nodeCount = rng.nextInt(4, cfg.maxNodesPerLayer);
    } else if (layer === cfg.layers - 2) {
      // Before boss: Funnel down (2-3 nodes, creates tension)
      nodeCount = rng.nextInt(2, 3);
    } else {
      // Other layers: Varied
      if (layerRoll < 0.25) {
        // 25% single chokepoint (forces through one node)
        nodeCount = 1;
      } else if (layerRoll < 0.45) {
        // 20% narrow (2 choices)
        nodeCount = 2;
      } else if (layerRoll < 0.75) {
        // 30% medium (3 choices)
        nodeCount = 3;
      } else {
        // 25% wide (4-5 choices)
        nodeCount = rng.nextInt(4, cfg.maxNodesPerLayer);
      }
    }
    
    // Special nodes strategically placed
    const isMiddleLayer = (layer === Math.floor(cfg.layers / 2));
    const isLateLayer = (layer >= cfg.layers - 3);
    
    for (let col = 0; col < nodeCount; col++) {
      const nodeId = `node_${layer}_${col}`;
      
      // Type distribution based on strategic importance
      let type: NodeType;
      const roll = rng.next();
      
      // Middle layer: Higher chance of shops/events (50%)
      if (isMiddleLayer) {
        if (roll < 0.25) {
          type = NodeType.Shop;
        } else if (roll < 0.50) {
          type = NodeType.Event;
        } else {
          type = NodeType.Battle;
        }
      }
      // Late game: More battles, fewer shops
      else if (isLateLayer) {
        if (roll < 0.08) {
          type = NodeType.Shop;
        } else if (roll < 0.18) {
          type = NodeType.Event;
        } else {
          type = NodeType.Battle;
        }
      }
      // Normal layers
      else {
        if (roll < cfg.shopFrequency) {
          type = NodeType.Shop;
        } else if (roll < cfg.shopFrequency + cfg.eventFrequency) {
          type = NodeType.Event;
        } else {
          type = NodeType.Battle;
        }
      }

      const node: MapNode = {
        id: nodeId,
        type,
        layer,
        column: col,
        connections: [],
        visited: false,
      };
      
      nodes.set(nodeId, node);
    }
  }

  // Final layer: Single boss node
  const bossNode: MapNode = {
    id: `node_${cfg.layers - 1}_0`,
    type: NodeType.Boss,
    layer: cfg.layers - 1,
    column: 0,
    connections: [],
    visited: false,
  };
  nodes.set(bossNode.id, bossNode);

  // Create connections between layers
  for (let layer = 0; layer < cfg.layers - 1; layer++) {
    const currentLayerNodes = Array.from(nodes.values()).filter(n => n.layer === layer);
    const nextLayerNodes = Array.from(nodes.values()).filter(n => n.layer === layer + 1);

    for (const currentNode of currentLayerNodes) {
      // Each node connects to 1-3 nodes in the next layer
      const connectionCount = rng.nextInt(1, Math.min(3, nextLayerNodes.length));
      
      // Prefer nearby nodes (by column)
      const sortedNext = [...nextLayerNodes].sort((a, b) => {
        const distA = Math.abs(a.column - currentNode.column);
        const distB = Math.abs(b.column - currentNode.column);
        return distA - distB;
      });

      // Add connections with some randomness
      const candidateIndices = sortedNext
        .map((_, i) => i)
        .filter(() => rng.next() < cfg.connectionDensity || currentNode.connections.length < connectionCount);

      // Ensure at least one connection
      if (candidateIndices.length === 0) {
        candidateIndices.push(0);
      }

      // Add connections (limit to connectionCount)
      for (let i = 0; i < Math.min(connectionCount, candidateIndices.length); i++) {
        const targetNode = sortedNext[candidateIndices[i]];
        if (!currentNode.connections.includes(targetNode.id)) {
          currentNode.connections.push(targetNode.id);
        }
      }
    }

    // Ensure all nodes in next layer have at least one incoming connection
    for (const nextNode of nextLayerNodes) {
      const hasIncoming = currentLayerNodes.some(n => n.connections.includes(nextNode.id));
      if (!hasIncoming && currentLayerNodes.length > 0) {
        const randomSource = currentLayerNodes[rng.nextInt(0, currentLayerNodes.length - 1)];
        randomSource.connections.push(nextNode.id);
      }
    }
  }

  return {
    nodes,
    layers: cfg.layers,
    seed,
  };
}

/**
 * Get all nodes in a specific layer
 */
export function getNodesInLayer(map: GameMap, layer: number): MapNode[] {
  return Array.from(map.nodes.values())
    .filter(node => node.layer === layer)
    .sort((a, b) => a.column - b.column);
}

/**
 * Get nodes that can be visited next (connected to visited nodes)
 */
export function getAvailableNodes(map: GameMap): MapNode[] {
  const available: MapNode[] = [];
  
  for (const node of map.nodes.values()) {
    if (node.visited) continue;
    
    // Start node is always available
    if (node.type === NodeType.Start) {
      available.push(node);
      continue;
    }
    
    // Check if any parent is visited
    const hasVisitedParent = Array.from(map.nodes.values()).some(
      parent => parent.connections.includes(node.id) && parent.visited
    );
    
    if (hasVisitedParent) {
      available.push(node);
    }
  }
  
  return available;
}

/**
 * Mark a node as visited and return its type (for scene transition)
 */
export function visitNode(map: GameMap, nodeId: string): NodeType | null {
  const node = map.nodes.get(nodeId);
  if (!node) return null;
  
  node.visited = true;
  return node.type;
}

