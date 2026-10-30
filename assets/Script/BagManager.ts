import { _decorator, Component, Node, Prefab, Button, instantiate, Layout, UITransform, Size } from 'cc';
import { EquipData, EquipQuality, EquipType } from './EquipData';
import { BagItemSlot } from './BagItemSlot';
import { EquipSlot } from './EquipSlot';
import { ItemDetailPopup } from './ItemDetailPopup';
import { TopBarManager } from './TopBarManager';
import { PlayerData } from './PlayerData';
import { SaveManager } from './SaveManager';
const { ccclass, property } = _decorator;

/**
 * 背包页总控 —— 挂在场景 BackpackContent 节点上
 *
 * 功能：
 *  - 初始 4 排 × 5 列 = 20 格，扩容按钮每点一次 +1 排（5 格），暂无上限
 *  - 穿戴/卸下/丢弃，弹窗由 ItemDetailPopup 动态生成
 *  - 穿戴变化后自动汇总属性刷新 TopBar
 *  - addItem() 供战斗掉落等外部模块调用，背包满返回 false（捡不了就不捡）
 *  - 全新账号开局赠送 6 件普通装备（每个部位一件），保证前期不至于裸装卡死
 */
@ccclass('BagManager')
export class BagManager extends Component {
    public static instance: BagManager | null = null;

    /** BagItemSlot 预制体 */
    @property(Prefab)
    slotPrefab: Prefab | null = null;

    /** ScrollView 的 content 节点（需挂 Layout：GRID / 5 列 / ResizeMode=CONTAINER） */
    @property(Node)
    gridContent: Node | null = null;

    /**
     * 6 个装备槽（按部位文字匹配，不要求数组顺序）。
     * 脚本会根据 EquipSlot 子节点 PartLabel 的 string 去匹配 EquipType，
     * 所以编辑器里只要保证每个槽的“部位文字”正确即可（如"武器"/"头盔"/"胸甲"/"项链"/"靴子"/"盾牌"）。
     */
    @property([EquipSlot])
    equipSlots: EquipSlot[] = [];

    /** 扩容按钮 */
    @property(Node)
    expandBtn: Node | null = null;

    /** 顶栏，用于刷新汇总属性（留空则不刷新） */
    @property(TopBarManager)
    topBar: TopBarManager | null = null;

    /** （可选）测试按钮：点击随机生成一件装备塞进背包，验证用，可留空 */
    @property(Node)
    testBtn: Node | null = null;

    public static readonly COLS = 5;        // 每排格数
    public static readonly INIT_ROWS = 4;   // 初始排数

    /** 背包格子 UI 列表（与 bagItems 一一对应） */
    private bagSlots: BagItemSlot[] = [];
    /** 背包数据，null 表示空格 */
    private bagItems: (EquipData | null)[] = [];

    onLoad() {
        BagManager.instance = this;
    }

    start() {
        this.configureGridLayout();
        this.initBagSlots();
        this.initEquipSlots();

        if (this.expandBtn) {
            this.expandBtn.on(Button.EventType.CLICK, this.expand, this);
        }
        if (this.testBtn) {
            this.testBtn.on(Button.EventType.CLICK, this.addTestEquip, this);
        }

        // 全新账号（没有任何存档）开局送 6 件普通装备
        if (!SaveManager.hasSaveData()) {
            this.grantStarterEquips();
        }

        this.recomputeStats();
        // 金币数据源统一在 PlayerData，开局同步显示到 TopBar
        if (this.topBar) this.topBar.setGold(PlayerData.instance.gold);
        // 存档：注册到 SaveManager（PageManager.onLoad 时可能已恢复本地存档，这里恢复背包）
        SaveManager.registerBagManager(this);
    }

    onDisable() {
        // 离开背包页时关闭可能残留的详情弹窗（弹窗挂在 Canvas 上，不随页面隐藏）
        ItemDetailPopup.closeActive();
    }

    onDestroy() {
        // 注意：这里原本写了两遍 onDestroy，后一个会静默覆盖前一个，
        // 导致静态 instance 不会被清空（下次进页面拿到的是已销毁的组件）。已合并为一处。
        if (BagManager.instance === this) BagManager.instance = null;
        // expandBtn / testBtn 挂的都是 Node（事件注册在 Node 上），直接用 Node 的 off 解绑
        if (this.expandBtn && this.expandBtn.isValid) {
            this.expandBtn.off(Button.EventType.CLICK, this.expand, this);
        }
        if (this.testBtn && this.testBtn.isValid) {
            this.testBtn.off(Button.EventType.CLICK, this.addTestEquip, this);
        }
    }

    // ==================== 初始化 ====================

    /** 强制把 ScrollView content 的 Layout 设成 5 列网格，确保 5 个一排 */
    private configureGridLayout() {
        if (!this.gridContent) return;

        // 删掉 Cocos 默认的 "ScrollView content" Label，否则会被 Layout 当格子排进去
        const placeholder = this.gridContent.getChildByName('item');
        if (placeholder) placeholder.removeFromParent();

        const ui = this.gridContent.getComponent(UITransform);
        if (ui) {
            // 5 格 × 100 + 4 间距 × 10 = 540
            ui.setContentSize(540, ui.height);
        }

        // 让 ScrollView 的 view 也足够宽，避免水平方向被裁剪
        const view = this.gridContent.parent;
        if (view) {
            const viewUI = view.getComponent(UITransform);
            if (viewUI) {
                // 4 行 × 100 + 3 间距 × 10 = 430；横向刚好 5 列
                viewUI.setContentSize(540, 430);
            }
        }

        let layout = this.gridContent.getComponent(Layout);
        if (!layout) layout = this.gridContent.addComponent(Layout);

        layout.type = Layout.Type.GRID;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.cellSize = new Size(100, 100);
        layout.spacingX = 10;
        layout.spacingY = 10;
        layout.startAxis = Layout.AxisDirection.HORIZONTAL;
        layout.constraint = Layout.Constraint.FIXED_COL;
        layout.constraintNum = 5;
        layout.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
        layout.horizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
        layout.updateLayout();
    }

    /** 生成初始 20 个格子 */
    private initBagSlots() {
        if (!this.gridContent || !this.slotPrefab) {
            console.warn('[BagManager] gridContent 或 slotPrefab 未绑定');
            return;
        }
        // 清掉手动放进 content 的旧格子，避免和运行时生成的重复
        for (const child of this.gridContent.children.slice()) {
            if (child.getComponent(BagItemSlot)) {
                child.removeFromParent();
            }
        }
        for (let i = 0; i < BagManager.INIT_ROWS * BagManager.COLS; i++) {
            this.createSlot();
        }
    }

    private createSlot() {
        if (!this.gridContent || !this.slotPrefab) return;
        const node = instantiateSafe(this.slotPrefab, this.gridContent);
        const slot = node.getComponent(BagItemSlot);
        if (!slot) {
            console.warn('[BagManager] 预制体上缺少 BagItemSlot 组件');
            return;
        }
        slot.onSlotClick = (s) => this.onBagSlotClicked(s);
        this.bagSlots.push(slot);
        this.bagItems.push(null);
    }

    /** 绑定装备槽点击 */
    private initEquipSlots() {
        for (const slot of this.equipSlots) {
            slot.onSlotClick = (s) => this.onEquipSlotClicked(s);
        }
    }

    /**
     * 开局赠送 6 件普通装备（每个部位一件），并且**直接穿在身上**。
     * 只在"全新账号"时调用 —— 有存档的玩家不会重复领。
     *
     * 为什么直接穿：新号裸装打第 1 关虽然也能过，但玩家得先学会"进背包 → 点装备 → 穿戴"
     * 这一串操作才能有战斗力，开局体验太劝退。直接穿好 = 进游戏就能正常打，
     * 背包里的教学交给后续掉落装备去完成。
     *
     * 注意：这里必须走 findEquipSlot 找槽位，不能写死下标 ——
     * 编辑器里槽位顺序可以被拖乱，而 findEquipSlot 是"先按部位文字匹配、再按默认顺序兜底"。
     */
    private grantStarterEquips(): void {
        const types: EquipType[] = [
            EquipType.WEAPON, EquipType.HELMET, EquipType.ARMOR,
            EquipType.NECKLACE, EquipType.BOOTS, EquipType.SHIELD,
        ];
        let equippedCount = 0;
        for (const t of types) {
            const equip = new EquipData(t, EquipQuality.COMMON, `新手${t}`);
            const slot = this.findEquipSlot(t);
            if (slot && !slot.data) {
                // 正常路径：对应部位有空槽，直接穿上
                slot.setItem(equip);
                equippedCount++;
            } else {
                // 兜底：槽位缺失或已被占用（理论上不会发生），退回背包，保证装备不丢
                this.addItem(equip);
                console.warn(`[BagManager] 新手装备 ${t} 未能自动穿戴，已放入背包`);
            }
        }
        console.log(`[BagManager] 已发放新手装备：6 件普通，其中直接穿戴 ${equippedCount} 件`);
    }

    // ==================== 对外接口（战斗模块将来调用） ====================

    /**
     * 往背包添加一件装备
     * @returns true 成功入包；false 背包已满（捡不了就不捡）
     */
    public addItem(item: EquipData): boolean {
        const idx = this.getFirstEmptyIndex();
        if (idx < 0) return false;
        this.bagItems[idx] = item;
        this.bagSlots[idx].setItem(item);
        return true;
    }

    /** 测试入口：随机生成一件装备放进背包，满了不放入 */
    public addTestEquip() {
        const ok = this.addItem(EquipData.createRandom());
        if (!ok) console.log('[BagManager] 背包已满，测试装备未放入');
    }

    /** 扩容：+1 排（5 格）。当前免费无限，将来要收费/限次在这里加判断 */
    public expand() {
        for (let i = 0; i < BagManager.COLS; i++) {
            this.createSlot();
        }
    }

    /** 背包是否已满 */
    public isFull(): boolean {
        return this.getFirstEmptyIndex() < 0;
    }

    /** 拿到背包里所有非空装备（强化页/商店页用） */
    public getAllItems(): EquipData[] {
        return this.bagItems.filter((i): i is EquipData => i !== null);
    }

    /**
     * 装备属性变化后调用（如强化页升级了背包里的装备）：
     * 刷新背包格子的 +N 显示，并重算 TopBar 属性（若该装备已穿戴）。
     */
    public refreshAfterStrengthen() {
        for (const slot of this.bagSlots) slot.refreshLevel();
        this.recomputeStats();
    }

    // ==================== 存档支持（SaveManager 调用） ====================

    /** 存档导出：背包数组（带空位 null 占位，保持格子顺序） */
    public getSaveBag(): (object | null)[] {
        return this.bagItems.map((it) => (it ? it.toJSON() : null));
    }

    /** 存档导出：6 个装备槽按槽位顺序序列化 */
    public getSaveEquipped(): (object | null)[] {
        return this.equipSlots.map((s) => (s.data ? s.data.toJSON() : null));
    }

    /** 存档恢复：还原背包 + 穿戴，并刷新属性显示 */
    public restoreBag(bag: (any | null)[], equipped: (any | null)[]): void {
        // 存档背包比当前格子多时（存档前扩容过），补足格子
        while (this.bagItems.length < bag.length) this.createSlot();

        // 先全部清空
        for (let i = 0; i < this.bagItems.length; i++) {
            this.bagItems[i] = null;
            if (this.bagSlots[i]) this.bagSlots[i].setItem(null);
        }
        for (const slot of this.equipSlots) slot.clearItem();

        // 还原背包
        for (let i = 0; i < bag.length && i < this.bagItems.length; i++) {
            const j = bag[i];
            if (!j) continue;
            const e = EquipData.fromJSON(j);
            if (!e) continue;
            this.bagItems[i] = e;
            this.bagSlots[i].setItem(e);
        }

        // 还原穿戴（按部位找槽，找不到的装备退回背包空位）
        for (const j of equipped) {
            if (!j) continue;
            const e = EquipData.fromJSON(j);
            if (!e) continue;
            const slot = this.findEquipSlot(e.type);
            if (slot && !slot.data) {
                slot.setItem(e);
            } else {
                const idx = this.getFirstEmptyIndex();
                if (idx >= 0) {
                    this.bagItems[idx] = e;
                    this.bagSlots[idx].setItem(e);
                }
            }
        }

        this.recomputeStats();
        if (this.topBar) this.topBar.setGold(PlayerData.instance.gold);
        console.log('[BagManager] 存档恢复完成');
    }

    // ==================== 交互 ====================

    /** 点击背包格子：在格子旁边弹出小操作框（穿戴/丢弃） */
    private onBagSlotClicked(slot: BagItemSlot) {
        const idx = this.bagSlots.indexOf(slot);
        if (idx < 0 || !this.bagItems[idx]) return;
        const equip = this.bagItems[idx]!;
        ItemDetailPopup.closeActive();
        ItemDetailPopup.show(slot.node, {
            equip,
            from: 'bag',
            onEquip: () => this.equipFromBag(idx),
            onDiscard: () => this.discardFromBag(idx),
        });
    }

    /** 点击装备槽：在槽旁边弹出小操作框（卸下/丢弃） */
    private onEquipSlotClicked(slot: EquipSlot) {
        if (!slot.data) return;
        const equip = slot.data;
        ItemDetailPopup.closeActive();
        ItemDetailPopup.show(slot.node, {
            equip,
            from: 'equipped',
            onUnequip: () => this.unequipFromSlot(slot),
            onDiscard: () => {
                slot.clearItem();
                this.recomputeStats();
            },
        });
    }

    // ==================== 穿戴 / 卸下 / 丢弃 ====================

    /** 从背包穿戴：同部位已有装备则自动换回背包 */
    private equipFromBag(index: number) {
        const item = this.bagItems[index];
        if (!item) return;
        const slot = this.findEquipSlot(item.type);
        if (!slot) return;

        if (slot.data) {
            // 换装：旧装备回到刚才腾出的格子
            this.bagItems[index] = slot.data;
            this.bagSlots[index].setItem(slot.data);
        } else {
            this.bagItems[index] = null;
            this.bagSlots[index].setItem(null);
        }
        slot.setItem(item);
        this.recomputeStats();
    }

    /** 从装备槽卸下：背包满则失败（防止装备丢失） */
    private unequipFromSlot(slot: EquipSlot) {
        if (!slot.data) return;
        const idx = this.getFirstEmptyIndex();
        if (idx < 0) {
            console.log('[BagManager] 背包已满，无法卸下');
            return;
        }
        this.bagItems[idx] = slot.data;
        this.bagSlots[idx].setItem(slot.data);
        slot.clearItem();
        this.recomputeStats();
    }

    /** 从背包丢弃 */
    private discardFromBag(index: number) {
        this.bagItems[index] = null;
        this.bagSlots[index].setItem(null);
    }

    // ==================== 工具 ====================

    private getFirstEmptyIndex(): number {
        return this.bagItems.indexOf(null);
    }

    private findEquipSlot(type: EquipType): EquipSlot | null {
        // 优先按槽位上显示的部位文字匹配（避免 slotType 绑定错导致装备穿错位置）
        const byLabel = this.equipSlots.find((s) => s.partLabel?.string === type);
        if (byLabel) return byLabel;

        // 兜底：按数组下标顺序（默认布局：武器/头盔/胸甲/项链/靴子/盾牌）
        const order: EquipType[] = [
            EquipType.WEAPON,
            EquipType.HELMET,
            EquipType.ARMOR,
            EquipType.NECKLACE,
            EquipType.BOOTS,
            EquipType.SHIELD,
        ];
        const idx = order.indexOf(type);
        if (idx >= 0 && idx < this.equipSlots.length) {
            return this.equipSlots[idx] ?? null;
        }
        return null;
    }

    /** 汇总已穿戴装备属性，刷新 TopBar（以 PlayerData 里的玩家裸值为基础叠加） */
    private recomputeStats() {
        if (!this.topBar) return;
        const base = PlayerData.instance;
        let atk = base.baseAtk, def = base.baseDef, maxHp = base.baseMaxHp;
        let critRate = base.baseCritRate, critDamage = 0, luck = base.baseLuck;
        for (const slot of this.equipSlots) {
            if (!slot.data) continue;
            atk += slot.data.atk;
            def += slot.data.def;
            maxHp += slot.data.maxHp;
            critRate += slot.data.critRate;
            critDamage += slot.data.critDamage;
            luck += slot.data.luck;
            // 调试日志：穿脱装备时看每一件贡献了哪些属性
            console.log(`[BagManager] 装备槽 ${slot.node.name}(${slot.partLabel?.string}) 穿戴：${slot.data.name}，maxHp=${slot.data.maxHp}, atk=${slot.data.atk}, def=${slot.data.def}`);
        }
        console.log(`[BagManager] 汇总属性 => maxHp=${maxHp}, atk=${atk}, def=${def}, critRate=${critRate}, critDamage=${critDamage}, luck=${luck}`);
        this.topBar.setAtk(atk);
        this.topBar.setDefense(def);
        this.topBar.setMaxHp(maxHp);
        this.topBar.setCurHp(maxHp); // 穿脱装备后血量回满，避免 max 变高后不满血
        // 暴击率封顶 100%（品质倍率 × 强化倍率两层乘算，理论上满配 94%，这里兜底）
        this.topBar.setCritRate(Math.min(1, critRate));
        this.topBar.setCritDamage(1.5 + critDamage); // 基础 150% + 装备加成
        this.topBar.setLuck(luck);
    }
}

/** 实例化预制体并挂到父节点 */
function instantiateSafe(prefab: Prefab, parent: Node): Node {
    const node = instantiate(prefab);
    parent.addChild(node);
    return node;
}
