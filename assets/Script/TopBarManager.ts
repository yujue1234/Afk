import { _decorator, Component, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TopBarManager')
export class TopBarManager extends Component {
    // ========== 原有属性 ==========
    @property(Label)
    goldLabel: Label | null = null;

    @property(Label)
    diamondLabel: Label | null = null;

    @property(Label)
    atkLabel: Label | null = null;

    // ========== 新增属性数值Label ==========
    @property(Label)
    defLabel: Label | null = null;        // 防御力数值

    @property(Label)
    maxHpLabel: Label | null = null;      // 生命上限数值

    @property(Label)
    critRateLabel: Label | null = null;   // 暴击率数值

    @property(Label)
    critDamageLabel: Label | null = null; // 暴击伤害数值

    @property(Label)
    luckLabel: Label | null = null;       // 幸运数值

    // ========== 内部数值存储 ==========
    private gold: number = 0;
    private diamond: number = 0;
    private atk: number = 0;
    private defense: number = 0;      // 防御力
    private maxHp: number = 560;      // 生命上限（和 PlayerData.baseMaxHp 保持一致）
    private curHp: number = 560;      // 当前生命值
    private critRate: number = 0;     // 暴击率：0~1 对应 0%~100%
    private critDamage: number = 1.5; // 暴击伤害：默认150%
    private luck: number = 0;         // 幸运值

    start() {
        // 初始化刷新所有显示
        this.curHp = this.maxHp;
        this.refreshAllLabel();
    }

    // ========== 数值读取（战斗模块需要） ==========
    public getAtk(): number { return this.atk; }
    public getDefense(): number { return this.defense; }
    public getMaxHp(): number { return this.maxHp; }
    public getCurHp(): number { return this.curHp; }
    public getCritRate(): number { return this.critRate; }
    public getCritDamage(): number { return this.critDamage; }
    public getLuck(): number { return this.luck; }

    // ========== 原有更新方法 ==========
    /** 更新金币 */
    public setGold(value: number): void {
        this.gold = value;
        if (this.goldLabel) {
            this.goldLabel.string = this.gold.toString();
        }
    }

    /** 更新元宝 */
    public setDiamond(value: number): void {
        this.diamond = value;
        if (this.diamondLabel) {
            this.diamondLabel.string = this.diamond.toString();
        }
    }

    /** 更新攻击力 */
    public setAtk(value: number): void {
        this.atk = value;
        if (this.atkLabel) {
            this.atkLabel.string = this.atk.toString();
        }
    }

    // ========== 新增更新方法 ==========
    /** 更新防御力 */
    public setDefense(value: number): void {
        this.defense = value;
        if (this.defLabel) {
            this.defLabel.string = this.defense.toString();
        }
    }

    /** 更新生命上限，同时限制当前血量不超过上限 */
    public setMaxHp(value: number): void {
        if (!Number.isFinite(value)) {
            console.warn(`[TopBarManager] setMaxHp 收到非法值: ${value}，强制改为 560`);
            value = 560;
        }
        // 防御性上限：单条 HP 不可能超过 10 万，超过说明计算/绑定异常
        if (value > 100000) {
            console.warn(`[TopBarManager] setMaxHp 异常过大: ${value}，已限制为 100000`);
            value = 100000;
        }
        this.maxHp = Math.max(1, Math.floor(value));
        if (this.curHp > this.maxHp) this.curHp = this.maxHp;
        this.refreshHpLabel();
    }

    /** 更新当前生命值（战斗用） */
    public setCurHp(value: number): void {
        if (!Number.isFinite(value)) {
            console.warn(`[TopBarManager] setCurHp 收到非法值: ${value}，强制改为当前上限`);
            value = this.maxHp;
        }
        this.curHp = Math.max(0, Math.min(Math.floor(value), this.maxHp));
        this.refreshHpLabel();
    }

    private refreshHpLabel(): void {
        if (this.maxHpLabel) {
            this.maxHpLabel.string = `${this.curHp}/${this.maxHp}`;
        }
    }

    /**
     * 更新暴击率
     * @param value 传入小数，自动转百分比显示，例如传 0.2 显示 20%
     */
    public setCritRate(value: number): void {
        // 暴击率封顶 100%，防止品质倍率 × 强化倍率两层乘算后显示成 "143%"
        this.critRate = Math.max(0, Math.min(1, value));
        if (this.critRateLabel) {
            this.critRateLabel.string = `${Math.floor(this.critRate * 100)}%`;
        }
    }

    /** 
     * 更新暴击伤害
     * @param value 传入小数，自动转百分比显示，例如传 1.5 显示 150%
     */
    public setCritDamage(value: number): void {
        this.critDamage = value;
        if (this.critDamageLabel) {
            this.critDamageLabel.string = `${Math.floor(this.critDamage * 100)}%`;
        }
    }

    /** 更新幸运值 */
    public setLuck(value: number): void {
        this.luck = value;
        if (this.luckLabel) {
            this.luckLabel.string = this.luck.toString();
        }
    }

    /** 批量刷新所有文本 */
    private refreshAllLabel(): void {
        this.setGold(this.gold);
        this.setDiamond(this.diamond);
        this.setAtk(this.atk);
        this.setDefense(this.defense);
        this.refreshHpLabel();
        this.setCritRate(this.critRate);
        this.setCritDamage(this.critDamage);
        this.setLuck(this.luck);
    }
}