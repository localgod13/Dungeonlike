import { Actor } from '../../net/proto';

export interface WorldConfig {
  key: string;
  name: string;
  bossStage: number;
  backgroundForStage: (stage: number) => string;
  generateEnemiesForStage: (stage: number) => Actor[];
}

export const world1Config: WorldConfig = {
  key: 'world1',
  name: 'World 1',
  bossStage: 6,
  backgroundForStage: (stage: number) => {
    if (stage === 6) return 'bossbg';
    if (stage === 2) return 'battleground2';
    return 'battleground1';
  },
  generateEnemiesForStage: (stage: number): Actor[] => {
    switch (stage) {
      case 1:
        return [
          { id: 'enemy_1', side: 'enemy', name: 'Flying Demon', hp: 40, maxHp: 40, ap: 5 },
        ];
      case 2:
        return [
          { id: 'enemy_1', side: 'enemy', name: 'Goblin', hp: 45, maxHp: 45, ap: 5 },
          { id: 'enemy_2', side: 'enemy', name: 'Goblin', hp: 45, maxHp: 45, ap: 5 },
        ];
      case 3:
        return [
          { id: 'enemy_1', side: 'enemy', name: 'Skele Mage', hp: 55, maxHp: 55, ap: 5 },
          { id: 'enemy_2', side: 'enemy', name: 'Goblin', hp: 45, maxHp: 45, ap: 5 },
        ];
      case 4:
      case 5:
        return [
          { id: 'enemy_1', side: 'enemy', name: stage === 4 ? 'Flying Demon' : 'Skele Mage', hp: 50, maxHp: 50, ap: 5 },
          { id: 'enemy_2', side: 'enemy', name: 'Goblin', hp: 45, maxHp: 45, ap: 5 },
          { id: 'enemy_3', side: 'enemy', name: stage === 4 ? 'Goblin' : 'Flying Demon', hp: 40, maxHp: 40, ap: 5 },
        ];
      case 6:
        return [
          { id: 'boss_1', side: 'enemy', name: 'Minotaur', hp: 150, maxHp: 150, ap: 5 },
        ];
      default: {
        const enemyCount = Math.min(2 + Math.floor((stage - 6) / 2), 3);
        const baseHP = 60 + ((stage - 6) * 8);
        const enemyTypes = ['Skele Mage', 'Goblin', 'Flying Demon'];
        return Array.from({ length: enemyCount }, (_, i) => ({
          id: `enemy_${i + 1}`,
          side: 'enemy' as const,
          name: enemyTypes[i % enemyTypes.length] + (enemyCount > 1 ? ` ${i + 1}` : ''),
          hp: baseHP,
          maxHp: baseHP,
          ap: 5,
        }));
      }
    }
  },
};

export default world1Config;


