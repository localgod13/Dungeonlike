import { Actor } from '../../net/proto';

export interface WorldConfig {
  key: string;
  name: string;
  bossStage: number;
  backgroundForStage: (stage: number) => string;
  generateEnemiesForStage: (stage: number) => Actor[];
}

export const world2Config: WorldConfig = {
  key: 'world2',
  name: 'World 2',
  bossStage: 6,
  backgroundForStage: (stage: number) => {
    if (stage === 6) return 'bossbg2'; // Demon boss background
    if (stage === 2) return 'battleground2'; // Use Battleground2 for stage 2
    return 'battleground1'; // Use Battleground1 for stages 1, 3, 4, 5
  },
  generateEnemiesForStage: (stage: number): Actor[] => {
    // Slightly tougher variants and new compositions
    switch (stage) {
      case 1:
        return [
          { id: 'enemy_1', side: 'enemy', name: 'Flying Demon', hp: 55, maxHp: 55, ap: 6 },
        ];
      case 2:
        return [
          { id: 'enemy_1', side: 'enemy', name: 'Skele Mage', hp: 65, maxHp: 65, ap: 6 },
          { id: 'enemy_2', side: 'enemy', name: 'Goblin', hp: 55, maxHp: 55, ap: 6 },
        ];
      case 3:
        return [
          { id: 'enemy_1', side: 'enemy', name: 'Flying Demon', hp: 60, maxHp: 60, ap: 6 },
          { id: 'enemy_2', side: 'enemy', name: 'Skele Mage', hp: 65, maxHp: 65, ap: 6 },
        ];
      case 4:
      case 5:
        return [
          { id: 'enemy_1', side: 'enemy', name: 'Skele Mage', hp: 70, maxHp: 70, ap: 6 },
          { id: 'enemy_2', side: 'enemy', name: 'Flying Demon', hp: 60, maxHp: 60, ap: 6 },
          { id: 'enemy_3', side: 'enemy', name: 'Goblin', hp: 55, maxHp: 55, ap: 6 },
        ];
      case 6:
        return [
          { id: 'boss_2', side: 'enemy', name: 'Demon Boss', hp: 200, maxHp: 200, ap: 6 },
        ];
      default: {
        const enemyCount = Math.min(2 + Math.floor((stage - 6) / 2), 3);
        const baseHP = 75 + ((stage - 6) * 10);
        const enemyTypes = ['Skele Mage', 'Goblin', 'Flying Demon'];
        return Array.from({ length: enemyCount }, (_, i) => ({
          id: `enemy_${i + 1}`,
          side: 'enemy' as const,
          name: enemyTypes[i % enemyTypes.length] + (enemyCount > 1 ? ` ${i + 1}` : ''),
          hp: baseHP,
          maxHp: baseHP,
          ap: 6,
        }));
      }
    }
  },
};

export default world2Config;


