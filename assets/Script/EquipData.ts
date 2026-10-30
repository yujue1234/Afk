import { SpriteFrame } from 'cc';

/** 装备部位（value 为中文显示名） */
export enum EquipType {
    HELMET = '头盔',
    WEAPON = '武器',
    ARMOR = '胸甲',
    NECKLACE = '项链',
    BOOTS = '靴子',
    SHIELD = '盾牌',
}

/** 装备品质（value 为中文显示名） */
export enum EquipQuality {
    COMMON = '普通',
    UNCOMMON = '优秀',
    RARE = '稀有',
    EPIC = '史诗',
    LEGENDARY = '传说',
}

/** 部位 -> 图标文件前缀（对应 resources/equip_icons/ 下的命名） */
const TYPE_ICON_PREFIX: Record<EquipType, string> = {
    [EquipType.HELMET]: 'helmet',
    [EquipType.WEAPON]: 'sword',
    [EquipType.ARMOR]: 'armor',
    [EquipType.NECKLACE]: 'necklace',
    [EquipType.BOOTS]: 'boots',
    [EquipType.SHIELD]: 'shield',
};

/** 品质 -> 图标文件后缀 */
const QUALITY_ICON_SUFFIX: Record<EquipQuality, string> = {
    [EquipQuality.COMMON]: 'common',
    [EquipQuality.UNCOMMON]: 'uncommon',
    [EquipQuality.RARE]: 'rare',
    [EquipQuality.EPIC]: 'epic',
    [EquipQuality.LEGENDARY]: 'legendary',
};

/**
 * 强化等级文字颜色（+1 ~ +9 用红色强调）。
 * 背包格子、强化页格子、详情弹窗统一用它，改颜色只改这一处。
 */
export const STRENGTHEN_TEXT_COLOR = '#FF503C';

/** 品质颜色（弹窗装备名染色用） */
export const QUALITY_COLOR: Record<EquipQuality, string> = {
    [EquipQuality.COMMON]: '#FFFFFF',
    [EquipQuality.UNCOMMON]: '#66CC66',
    [EquipQuality.RARE]: '#4A9EFF',
    [EquipQuality.EPIC]: '#B96AFF',
    [EquipQuality.LEGENDARY]: '#FFA033',
};

/**
 * ==================== 数值占位配置 ====================
 * 具体数值还在设计，定稿后只需要改这两个表，其余代码不用动。
 * create() 会按"部位基础值 × 品质倍率"生成基础数值，
 * 最终显示数值 = 基础数值 × 强化倍率（每级 +15%）。
 *
 * 【调平衡思路】
 *  - 武器 = 唯一的攻击来源（攻击是最强属性，直接缩短战斗时间）
 *  - 头盔/胸甲/靴子/盾牌 = 防御 + 生命（保证能扛住一整关）
 *  - 项链 = 暴击系（暴击是"锦上添花"，但这里给足数值，让暴击流有存在感）
 *
 * 【v2 拉长（2026-09-11）】
 *  整体数值 ×≈2.5，让升级的"数字变大"更有正反馈；
 *  暴击单独加强：武器 3%→4%、项链 5%→6%，配合拉长后的品质/强化倍率，
 *  传说满强化暴击率能到 94%（原来只有 45%）。
 */
interface StatBlock {
    atk: number;
    def: number;
    maxHp: number;
    critRate: number;    // 暴击率，0.04 = +4%
    critDamage: number;  // 暴击伤害加成，0.3 = +30%（在基础150%上叠加）
    luck: number;
}

const BASE_STATS: Record<EquipType, StatBlock> = {
    [EquipType.WEAPON]:   { atk: 25, def: 0,  maxHp: 0,   critRate: 0.04, critDamage: 0,    luck: 0 },
    [EquipType.HELMET]:   { atk: 0,  def: 10, maxHp: 100, critRate: 0,    critDamage: 0,    luck: 0 },
    [EquipType.ARMOR]:    { atk: 0,  def: 16, maxHp: 180, critRate: 0,    critDamage: 0,    luck: 0 },
    [EquipType.NECKLACE]: { atk: 8,  def: 0,  maxHp: 0,   critRate: 0.06, critDamage: 0.30, luck: 3 },
    [EquipType.BOOTS]:    { atk: 0,  def: 5,  maxHp: 75,  critRate: 0,    critDamage: 0,    luck: 5 },
    [EquipType.SHIELD]:   { atk: 0,  def: 22, maxHp: 145, critRate: 0,    critDamage: 0,    luck: 0 },
};

/**
 * 品质倍率（v2 拉长）：1 → 1.5 → 2.1 → 2.9 → 4.0
 * 相邻档位从 +35% 拉到 +40%~45%，让"升一档品质"的体感差距更大。
 * （原来 1/1.35/1.75/2.3/3.0，最高档只有 3 倍，拉长后 4 倍。）
 */
const QUALITY_MULTIPLIER: Record<EquipQuality, number> = {
    [EquipQuality.COMMON]: 1,
    [EquipQuality.UNCOMMON]: 1.5,
    [EquipQuality.RARE]: 2.1,
    [EquipQuality.EPIC]: 2.9,
    [EquipQuality.LEGENDARY]: 4.0,
};

export class EquipData {
    /** 自增 id，用于过期回调校验 */
    private static nextId = 1;

    id: number;
    name: string;
    type: EquipType;
    quality: EquipQuality;

    // ========== 最终数值（= 基础数值 × 强化倍率），由 recalcStats() 维护 ==========
    atk: number = 0;
    def: number = 0;
    maxHp: number = 0;
    critRate: number = 0;
    critDamage: number = 0;
    luck: number = 0;

    // ==================== 强化系统 ====================

    /** 强化等级，0 ~ STRENGTHEN_MAX_LEVEL */
    strengthenLevel: number = 0;

    /** 强化最高等级 */
    static readonly STRENGTHEN_MAX_LEVEL = 9;

    /** 每级强化属性提升比例：+1 = 115% ... +9 = 235%（v2 从 +10% 拉到 +15%） */
    static readonly STRENGTHEN_BONUS = 0.15;

    /**
     * 强化基础花费：第 level 级强化一次消耗 BASE * (level + 1) 金币。
     * +0→+1 只要 150，+8→+9 要 1350。
     * （v2 数值整体拉长 2.5 倍，这里从 100 提到 150，比 2.5 倍温和，避免强化变成无底洞。）
     */
    static readonly STRENGTHEN_COST_BASE = 150;

    /** 计算第 level 级（0 起）强化一次的金币花费 */
    static strengthenCostAt(level: number): number {
        const lv = Math.max(0, Math.min(EquipData.STRENGTHEN_MAX_LEVEL - 1, Math.floor(level)));
        return EquipData.STRENGTHEN_COST_BASE * (lv + 1);
    }

    /**
     * 升级成功率表：下标 = 当前强化等级，值 = 本次冲击下一级的成功概率。
     * v2 又放宽了中高段位（0.8/0.7/0.6/0.5/0.4），一身 +9 的期望金币从"天文数字"降到
     * 约 7 万，玩家刷 5~8 把能推进一步。
     */
    static readonly SUCCESS_RATES: readonly number[] = [
        1.0,  // +0 → +1：100%
        0.95, // +1 → +2：95%
        0.9,  // +2 → +3：90%
        0.85, // +3 → +4：85%
        0.8,  // +4 → +5：80%
        0.7,  // +5 → +6：70%
        0.6,  // +6 → +7：60%
        0.5,  // +7 → +8：50%
        0.4,  // +8 → +9：40%
    ];

    /**
     * 暴击率上限：暴击率同时吃"品质倍率 × 强化倍率"两层乘算，
     * 满配（传说 +9）理论值 0.94，为防后续调数值溢出 100%，这里做一次兜底。
     */
    static readonly CRIT_RATE_CAP = 1.0;

    /** 当前强化一次的花费（ForgeManager 用） */
    get strengthenCost(): number {
        return EquipData.strengthenCostAt(this.strengthenLevel);
    }

    /** 基础数值（品质修正后、未强化），强化以它为基数放大 */
    private baseAtk = 0;
    private baseDef = 0;
    private baseMaxHp = 0;
    private baseCritRate = 0;
    private baseCritDamage = 0;
    private baseLuck = 0;

    /** 兼容旧字段：图标由格子按 iconPath 动态加载，一般不需要外部传入 */
    icon: SpriteFrame | null = null;

    constructor(type: EquipType, quality: EquipQuality, name?: string) {
        this.id = EquipData.nextId++;
        this.type = type;
        this.quality = quality;
        this.name = name ?? `${quality}${type}`; // 如"稀有武器"，名字系统设计好后可换

        const base = BASE_STATS[type];
        const mult = QUALITY_MULTIPLIER[quality];
        this.baseAtk = Math.round(base.atk * mult);
        this.baseDef = Math.round(base.def * mult);
        this.baseMaxHp = Math.round(base.maxHp * mult);
        this.baseCritRate = Math.round(base.critRate * mult * 1000) / 1000;
        this.baseCritDamage = Math.round(base.critDamage * mult * 1000) / 1000;
        this.baseLuck = Math.round(base.luck * mult);

        this.recalcStats();
    }

    /** 当前强化倍率（+0 = 1.0，+9 = 1.9） */
    get strengthenMultiplier(): number {
        return 1 + this.strengthenLevel * EquipData.STRENGTHEN_BONUS;
    }

    /** 本次强化的成功率（0~1） */
    get successRate(): number {
        const idx = Math.min(this.strengthenLevel, EquipData.SUCCESS_RATES.length - 1);
        return EquipData.SUCCESS_RATES[idx];
    }

    /** 是否还能继续强化 */
    canStrengthen(): boolean {
        return this.strengthenLevel < EquipData.STRENGTHEN_MAX_LEVEL;
    }

    /** 强化成功：等级 +1 并重算数值（是否成功由调用方 roll，这里只负责生效） */
    strengthen(): void {
        if (!this.canStrengthen()) return;
        this.strengthenLevel++;
        this.recalcStats();
    }

    /** 按当前强化等级重算最终数值 */
    private recalcStats(): void {
        const m = this.strengthenMultiplier;
        this.atk = Math.round(this.baseAtk * m);
        this.def = Math.round(this.baseDef * m);
        this.maxHp = Math.round(this.baseMaxHp * m);
        // 暴击率单独兜底：两层乘算后不能超过 100%
        this.critRate = Math.min(
            EquipData.CRIT_RATE_CAP,
            Math.round(this.baseCritRate * m * 1000) / 1000,
        );
        this.critDamage = Math.round(this.baseCritDamage * m * 1000) / 1000;
        this.luck = Math.round(this.baseLuck * m);
    }

    /** resources 下的图标路径（不含 /spriteFrame 后缀），如 equip_icons/sword_rare */
    get iconPath(): string {
        return `equip_icons/${TYPE_ICON_PREFIX[this.type]}_${QUALITY_ICON_SUFFIX[this.quality]}`;
    }

    /** 弹窗用的数值行，只显示非零项 */
    getStatLines(): string[] {
        const lines: string[] = [];
        if (this.atk > 0) lines.push(`攻击力  +${this.atk}`);
        if (this.def > 0) lines.push(`防御力  +${this.def}`);
        if (this.maxHp > 0) lines.push(`生命上限  +${this.maxHp}`);
        if (this.critRate > 0) lines.push(`暴击率  +${Math.round(this.critRate * 100)}%`);
        if (this.critDamage > 0) lines.push(`暴击伤害  +${Math.round(this.critDamage * 100)}%`);
        if (this.luck > 0) lines.push(`幸运  +${this.luck}`);
        return lines;
    }

    /** 测试用：随机生成一件装备 */
    static createRandom(): EquipData {
        const types = Object.values(EquipType);
        const qualities = Object.values(EquipQuality);
        const type = types[Math.floor(Math.random() * types.length)];
        const quality = qualities[Math.floor(Math.random() * qualities.length)];
        return new EquipData(type, quality);
    }

    // ==================== 存档序列化 ====================

    /** 存档导出：只存必要字段，数值由构造 + 强化等级重算 */
    toJSON(): { type: string; quality: string; name: string; level: number } {
        return {
            type: this.type,
            quality: this.quality,
            name: this.name,
            level: this.strengthenLevel,
        };
    }

    /** 存档导入：还原装备（数据非法时返回 null，调用方按空格处理） */
    static fromJSON(j: any): EquipData | null {
        try {
            if (!j || !j.type || !j.quality) return null;
            const e = new EquipData(j.type as EquipType, j.quality as EquipQuality, j.name);
            const lv = Math.max(0, Math.min(EquipData.STRENGTHEN_MAX_LEVEL, Math.floor(j.level || 0)));
            for (let i = 0; i < lv; i++) e.strengthen();
            return e;
        } catch (e) {
            console.warn('[EquipData] fromJSON 失败', e);
            return null;
        }
    }
}
