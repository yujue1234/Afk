import { EquipData, EquipQuality, EquipType } from './EquipData';

/**
 * 单关卡配置
 *
 * 【数值怎么定的】
 * 用脚本把 BattleManager 的战斗逻辑逐帧复现，然后反推每关的怪物数值，
 * 目标是"刚好让对应档位的装备能打过，但打完只剩约 28% 血"（v2 比 v1 更难）。
 *
 *   第1关 ← 裸装            （重要：保证开局不卡死，打不过也能刷金币）
 *   第2关 ← 6 件普通
 *   第3关 ← 6 件优秀
 *   第4关 ← 6 件稀有
 *   第5关 ← 6 件史诗
 *   第6关 ← 6 件史诗 +3
 *   第7关 ← 6 件史诗 +6
 *   第8关 ← 6 件史诗 +9
 *
 * 每个档位只够推一关，上一档必败 —— 这就是"阶段性变强"。
 * 传说装备不在掉落池里（只能去商店刷新买），所以掉落池最高只到史诗。
 *
 * 想整体调难度：只改这张表的 minionHp/minionAtk（Boss 会同步感受），
 * 或者直接改 PlayerData.baseMaxHp。
 */
export interface StageConfig {
    /** 关卡编号 1~8 */
    id: number;
    /** 关卡显示名 */
    name: string;
    /** 小怪血量 */
    minionHp: number;
    /** 小怪攻击 */
    minionAtk: number;
    /** Boss 血量 */
    bossHp: number;
    /** Boss 攻击 */
    bossAtk: number;
    /** 通关金币奖励 */
    goldReward: number;
    /** 首通元宝奖励 */
    diamondReward: number;
    /** 掉落品质池：围绕本关目标线上下一档波动 */
    dropQualityPool: EquipQuality[];
}

/** 关卡配置表（按主页地图顺序 1~8）—— v2 数值拉长版 */
export const STAGES: StageConfig[] = [
    {
        id: 1, name: '矿洞入口',
        minionHp: 125, minionAtk: 16, bossHp: 325, bossAtk: 29,
        goldReward: 400, diamondReward: 5,
        dropQualityPool: [EquipQuality.COMMON, EquipQuality.COMMON, EquipQuality.UNCOMMON],
    },
    {
        id: 2, name: '迷雾沼泽',
        minionHp: 315, minionAtk: 48, bossHp: 820, bossAtk: 86,
        goldReward: 700, diamondReward: 8,
        dropQualityPool: [EquipQuality.COMMON, EquipQuality.UNCOMMON, EquipQuality.RARE],
    },
    {
        id: 3, name: '骸骨荒原',
        minionHp: 430, minionAtk: 70, bossHp: 1120, bossAtk: 126,
        goldReward: 1100, diamondReward: 12,
        dropQualityPool: [EquipQuality.UNCOMMON, EquipQuality.RARE, EquipQuality.RARE],
    },
    {
        id: 4, name: '熔岩裂谷',
        minionHp: 580, minionAtk: 100, bossHp: 1510, bossAtk: 180,
        goldReward: 2200, diamondReward: 16,
        dropQualityPool: [EquipQuality.UNCOMMON, EquipQuality.RARE, EquipQuality.EPIC],
    },
    {
        id: 5, name: '幽暗森林',
        minionHp: 840, minionAtk: 150, bossHp: 2185, bossAtk: 270,
        goldReward: 3000, diamondReward: 22,
        dropQualityPool: [EquipQuality.RARE, EquipQuality.EPIC, EquipQuality.EPIC],
    },
    {
        id: 6, name: '霜冻废墟',
        minionHp: 1285, minionAtk: 253, bossHp: 3340, bossAtk: 455,
        goldReward: 4200, diamondReward: 28,
        dropQualityPool: [EquipQuality.RARE, EquipQuality.EPIC, EquipQuality.EPIC],
    },
    {
        id: 7, name: '天空遗迹',
        minionHp: 1800, minionAtk: 382, bossHp: 4680, bossAtk: 688,
        goldReward: 7500, diamondReward: 36,
        dropQualityPool: [EquipQuality.EPIC, EquipQuality.EPIC, EquipQuality.EPIC],
    },
    {
        id: 8, name: '深渊魔域',
        minionHp: 2395, minionAtk: 539, bossHp: 6225, bossAtk: 970,
        goldReward: 10000, diamondReward: 50,
        dropQualityPool: [EquipQuality.EPIC, EquipQuality.EPIC, EquipQuality.EPIC],
    },
];

/** 玩家攻击间隔（秒） */
export const PLAYER_ATTACK_INTERVAL = 1.0;
/** 怪物攻击间隔（秒） */
export const MONSTER_ATTACK_INTERVAL = 1.5;

/** 战斗失败保底金币比例（防止"打不过 → 没钱买装备 → 更打不过"的死循环） */
export const DEFEAT_GOLD_RATIO = 0.25;
/** 战斗失败保底金币下限 */
export const DEFEAT_GOLD_MIN = 50;

/** 每点幸运提供的金币收益加成（1%） */
export const LUCK_GOLD_BONUS = 0.01;
/** 每点幸运提供的"掉落提升一档"概率上限 */
export const LUCK_DROP_MAX_CHANCE = 0.5;
/** 每点幸运对应的掉落提升概率 */
export const LUCK_DROP_PER_POINT = 0.01;

/** 每点幸运提供的"掉落元宝"概率（1%），属于小概率额外惊喜 */
export const LUCK_DIAMOND_PER_POINT = 0.01;
/** 幸运掉落元宝的概率上限（30%） */
export const LUCK_DIAMOND_MAX_CHANCE = 0.3;
/** 幸运掉落元宝的单次数量 */
export const LUCK_DIAMOND_AMOUNT = 1;

/**
 * 生成关卡掉落装备
 * @param stage 关卡配置
 * @param luck  玩家幸运值：幸运越高，越容易在掉落池里往上抬一档
 */
export function createStageDrop(stage: StageConfig, luck: number = 0): EquipData {
    const pool = stage.dropQualityPool;
    let idx = Math.floor(Math.random() * pool.length);

    // 幸运加成：有概率把掉落品质往上抬一档（不会超过池子上限）
    if (luck > 0 && pool.length > 1) {
        const chance = Math.min(LUCK_DROP_MAX_CHANCE, luck * LUCK_DROP_PER_POINT);
        if (Math.random() < chance && idx < pool.length - 1) idx++;
    }

    const quality = pool[idx];
    const types = Object.values(EquipType);
    const type = types[Math.floor(Math.random() * types.length)];
    return new EquipData(type, quality, `${quality}${type}`);
}

/**
 * 幸运掉落元宝：小概率触发，幸运越高越容易出。
 * @param luck 玩家幸运值
 * @returns 本次掉落的元宝数量（0 表示没触发）
 */
export function rollLuckyDiamond(luck: number): number {
    if (luck <= 0) return 0;
    const chance = Math.min(LUCK_DIAMOND_MAX_CHANCE, luck * LUCK_DIAMOND_PER_POINT);
    return Math.random() < chance ? LUCK_DIAMOND_AMOUNT : 0;
}
