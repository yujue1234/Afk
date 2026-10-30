import { STAGES } from './StageData';

/**
 * 玩家全局数据 —— 纯数据单例，不依赖任何节点/组件
 * 金币、元宝等跨页面读写的数值统一放这里，避免各 Manager 各存一份。
 * TopBarManager 只负责显示，数据源永远是 PlayerData。
 */
export class PlayerData {
    private static _instance: PlayerData | null = null;

    /** 全局唯一实例 */
    static get instance(): PlayerData {
        if (!this._instance) this._instance = new PlayerData();
        return this._instance;
    }

    /**
     * 金币（初始 1500）。
     * v2：开局白送 6 件普通装备，所以不用再留"买齐一身普通"的钱；
     * 1500 大概够买 2 件优秀装，剩下的靠刷第 2 关。
     */
    gold: number = 1500;

    /**
     * 元宝（商店刷新 5 元宝/次、传说装备 50 元宝/件）。
     * 初始 200 是为了方便测试（能刷 40 次 / 买 4 件传说），正式上线前改成 0~50。
     */
    diamond: number = 200;

    // ========== 玩家基础属性（裸值，不穿装备也生效，数值定稿后只改这里） ==========
    readonly baseAtk: number = 25;
    readonly baseDef: number = 0;
    /** 生命上限：560 是关键数值（v2 从 220 拉长到 560）。
     *  一场战斗玩家要挨 20~30 次攻击，血量太低会"必死"。
     *  裸装血量必须 ≈ 第 1 关小怪单次攻击的 15~20 倍，否则开局就卡死。 */
    readonly baseMaxHp: number = 560;
    readonly baseCritRate: number = 0;
    readonly baseLuck: number = 0;

    /**
     * 已首通关卡集合（关卡 id）。
     * 它同时承担两个职责：
     *  1. 首通时发放元宝奖励（只发一次）
     *  2. 关卡解锁 —— 通关第 N 关才会解锁第 N+1 关
     * 会随存档一起持久化（SaveManager.collect → clearedStages）。
     */
    private _clearedStages: Set<number> = new Set();

    /** 增加金币 */
    addGold(amount: number): void {
        if (amount <= 0) return;
        this.gold += amount;
    }

    /** 增加元宝 */
    addDiamond(amount: number): void {
        if (amount <= 0) return;
        this.diamond += amount;
    }

    /**
     * 消耗金币
     * @returns true 扣款成功；false 金币不足（不扣款）
     */
    costGold(amount: number): boolean {
        if (this.gold < amount) return false;
        this.gold -= amount;
        return true;
    }

    /** 消耗元宝 */
    costDiamond(amount: number): boolean {
        if (this.diamond < amount) return false;
        this.diamond -= amount;
        return true;
    }

    /** 是否已首通某关 */
    isStageCleared(stageId: number): boolean {
        return this._clearedStages.has(stageId);
    }

    /** 标记首通 */
    markStageCleared(stageId: number): void {
        this._clearedStages.add(stageId);
    }

    /**
     * 关卡解锁判断 —— 整个游戏只有这一处规则，地图页和战斗页都调它。
     *
     * 规则：
     *  - 第 1 关（索引 0）永远解锁，保证新号开局有得打，不会卡死
     *  - 第 N 关解锁的条件 = 第 N-1 关已通关（即 STAGES[N-1] 在 clearedStages 里）
     *
     * @param stageIndex 关卡索引（0 起，和地图 mapFrames 下标一一对应）
     */
    isStageUnlocked(stageIndex: number): boolean {
        if (stageIndex <= 0) return true;
        const prev = STAGES[stageIndex - 1];
        // 配置表比地图张数短时不做限制，避免把玩家永远挡在门外
        if (!prev) return true;
        return this._clearedStages.has(prev.id);
    }

    // ==================== 存档支持（SaveManager 调用） ====================

    /** 存档恢复：一次性还原金币/元宝/通关记录 */
    restoreFromSave(gold: number, diamond: number, clearedIds: number[]): void {
        if (Number.isFinite(gold) && gold >= 0) this.gold = Math.floor(gold);
        if (Number.isFinite(diamond) && diamond >= 0) this.diamond = Math.floor(diamond);
        this._clearedStages = new Set(clearedIds.filter((id) => Number.isFinite(id)));
    }

    /** 存档导出：已首通关卡列表 */
    get clearedStageList(): number[] {
        return Array.from(this._clearedStages);
    }
}
