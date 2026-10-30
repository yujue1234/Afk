import { _decorator, Component, Node, Button, Layout, UITransform, Size, Label } from 'cc';
import { EquipData, EquipQuality, EquipType } from './EquipData';
import { ShopItem, ShopCurrency } from './ShopItem';
import { ShopCell } from './ShopCell';
import { ItemDetailPopup } from './ItemDetailPopup';
import { BagManager } from './BagManager';
import { TopBarManager } from './TopBarManager';
import { PlayerData } from './PlayerData';
const { ccclass, property } = _decorator;

/**
 * 商店页总控 —— 挂在场景 ShopContent 节点上
 *
 * 功能：
 *  - 固定 6 个商品，点击"购买"按钮直接扣款进背包
 *  - 点击装备图标查看装备词条（仅显示属性，不购买）
 *  - 每次刷新消耗 5 元宝，重新生成 6 件新装备，限购状态重置
 *  - 普通~史诗用金币买，价格由品质和属性决定
 *  - 传说装备 50 元宝/件，且**只能从商店刷新获得**（关卡掉落池里没有传说）
 */
@ccclass('ShopManager')
export class ShopManager extends Component {
    /** 商店页 ScrollView 的 content 节点（里面放 6 个 shop_cell） */
    @property(Node)
    gridContent: Node | null = null;

    /** 刷新按钮 */
    @property(Node)
    refreshBtn: Node | null = null;

    /** 刷新按钮上的 Label（可选，脚本会显示"刷新 10元宝"） */
    @property(Label)
    refreshBtnLabel: Label | null = null;

    /** 顶栏，用于刷新金币/元宝显示（留空则不刷新） */
    @property(TopBarManager)
    topBar: TopBarManager | null = null;

    /** 背包页总控，买到的装备直接进背包 */
    @property(BagManager)
    bagManager: BagManager | null = null;

    /** （可选）结果提示 Label：显示"购买成功"/"金币不足"等 */
    @property(Label)
    resultLabel: Label | null = null;

    /** 每次刷新消耗的元宝（v2：10 → 5，让"刷出传说"这件事可重复尝试） */
    static readonly REFRESH_COST = 5;

    /** 传说装备固定售价（元宝）—— 传说只能从商店刷新获取，不进关卡掉落池 */
    static readonly LEGENDARY_DIAMOND_PRICE = 50;

    /** 商品数量（固定 6 个） */
    static readonly SLOT_COUNT = 6;

    /** 品质概率：普通/优秀/稀有/史诗/传说 */
    static readonly QUALITY_WEIGHTS: Record<EquipQuality, number> = {
        [EquipQuality.COMMON]: 40,
        [EquipQuality.UNCOMMON]: 30,
        [EquipQuality.RARE]: 20,
        [EquipQuality.EPIC]: 8,
        [EquipQuality.LEGENDARY]: 2,
    };

    /**
     * 品质对金币价的倍率。
     * 【原来的问题】1/2/4/8/20 + 价格本身已按属性折算 = 属性涨 2.2 倍价格涨 17.6 倍，
     * 导致"买 6 件绿装"远强于"买 2 件紫装"。
     * 现在收敛到 1/1.4/2/3/4.5：史诗 4.5 倍价换 2.3 倍属性，贵但不再离谱。
     */
    static readonly QUALITY_PRICE_MULT: Record<EquipQuality, number> = {
        [EquipQuality.COMMON]: 1,
        [EquipQuality.UNCOMMON]: 1.4,
        [EquipQuality.RARE]: 2.0,
        [EquipQuality.EPIC]: 3.0,
        [EquipQuality.LEGENDARY]: 4.5,
    };

    /** 当前 6 个商品 */
    private shopItems: ShopItem[] = [];
    /** 当前 6 个 cell 的 UI */
    private cells: ShopCell[] = [];

    onLoad() {
        this.configureGridLayout();
        this.collectCells();

        if (this.refreshBtn) {
            this.refreshBtn.on(Button.EventType.CLICK, this.onRefresh, this);
        }
        // 按钮文案优先用编辑器里手写的文本；只有文案为空时才由代码兜底生成，
        // 避免运行时覆盖美术/策划在场景里改好的按钮文字。
        if (this.refreshBtnLabel && !this.refreshBtnLabel.string) {
            this.refreshBtnLabel.string = `刷新 ${ShopManager.REFRESH_COST}元宝`;
        }
    }

    onEnable() {
        // 切到商店页时，确保有 6 个商品可显示
        if (this.shopItems.length === 0) {
            this.refreshShop(false); // 不扣元宝的首次填充
        } else {
            this.bindCells();
        }
        this.syncTopBar();
    }

    onDisable() {
        // 离开商店页时关闭可能残留的详情弹窗（弹窗挂在 Canvas 上，不随页面隐藏）
        ItemDetailPopup.closeActive();
    }

    onDestroy() {
        // refreshBtn 挂的是 Node（事件也是注册在 Node 上的），直接用 Node 的 off 解绑
        if (this.refreshBtn && this.refreshBtn.isValid) {
            this.refreshBtn.off(Button.EventType.CLICK, this.onRefresh, this);
        }
    }

    // ==================== 初始化 ====================

    /** 把 content 设成 3 列 2 行的网格布局 */
    private configureGridLayout() {
        if (!this.gridContent) return;

        const placeholder = this.gridContent.getChildByName('item');
        if (placeholder) placeholder.removeFromParent();

        const ui = this.gridContent.getComponent(UITransform);
        if (ui) {
            // 3 列 × 200 + 2 间距 × 20 = 640，左右留一点边距
            ui.setContentSize(640, ui.height);
        }

        const view = this.gridContent.parent;
        if (view) {
            const viewUI = view.getComponent(UITransform);
            if (viewUI) viewUI.setContentSize(640, viewUI.height);
        }

        let layout = this.gridContent.getComponent(Layout);
        if (!layout) layout = this.gridContent.addComponent(Layout);

        layout.type = Layout.Type.GRID;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.cellSize = new Size(200, 200);
        layout.spacingX = 20;
        layout.spacingY = 20;
        layout.startAxis = Layout.AxisDirection.HORIZONTAL;
        layout.constraint = Layout.Constraint.FIXED_COL;
        layout.constraintNum = 3;
        layout.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
        layout.horizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
        layout.updateLayout();
    }

    /** 收集 content 下已经摆好的 6 个 ShopCell */
    private collectCells() {
        this.cells = [];
        if (!this.gridContent) return;
        const found = this.gridContent.getComponentsInChildren(ShopCell);
        this.cells = found.slice(0, ShopManager.SLOT_COUNT);
        for (const cell of this.cells) {
            cell.onBuyClick = (c) => this.onCellBuyClicked(c);
            cell.onIconClick = (c) => this.onCellIconClicked(c);
        }
        if (this.cells.length < ShopManager.SLOT_COUNT) {
            console.warn(`[ShopManager] 只找到 ${this.cells.length} 个 ShopCell，需要 ${ShopManager.SLOT_COUNT} 个`);
        }
    }

    /** 重新把当前商品绑定到 cell（切换页面后防止引用断开） */
    private bindCells() {
        for (let i = 0; i < this.cells.length; i++) {
            const cell = this.cells[i];
            const item = this.shopItems[i] ?? null;
            cell.setItem(item);
            cell.onBuyClick = (c) => this.onCellBuyClicked(c);
            cell.onIconClick = (c) => this.onCellIconClicked(c);
        }
    }

    // ==================== 刷新商品 ====================

    /** 点击刷新按钮：扣元宝，重新生成 6 件商品 */
    private onRefresh() {
        if (!PlayerData.instance.costDiamond(ShopManager.REFRESH_COST)) {
            this.showResult('元宝不足');
            return;
        }
        this.refreshShop(false);
        this.syncTopBar();
        this.showResult('商品已刷新');
    }

    /**
     * 生成/刷新 6 个商品
     * @param cost 是否扣刷新费用（首次进入商店时不扣）
     */
    private refreshShop(cost: boolean) {
        if (cost && !PlayerData.instance.costDiamond(ShopManager.REFRESH_COST)) {
            this.showResult('元宝不足');
            return;
        }

        this.shopItems = [];
        for (let i = 0; i < ShopManager.SLOT_COUNT; i++) {
            const equip = this.createShopEquip();
            if (equip.quality === EquipQuality.LEGENDARY) {
                // 传说：固定 50 元宝，不按战力折算
                this.shopItems.push(new ShopItem(
                    equip, ShopManager.LEGENDARY_DIAMOND_PRICE, ShopCurrency.DIAMOND));
            } else {
                this.shopItems.push(new ShopItem(
                    equip, this.calcGoldPrice(equip), ShopCurrency.GOLD));
            }
        }
        this.bindCells();
    }

    /** 随机生成一件商店装备（按权重 roll 品质，部位均衡） */
    private createShopEquip(): EquipData {
        const types = Object.values(EquipType);
        const type = types[Math.floor(Math.random() * types.length)];
        const quality = this.rollQuality();
        return new EquipData(type, quality);
    }

    /** 按权重随机品质 */
    private rollQuality(): EquipQuality {
        const qualities = Object.values(EquipQuality);
        const weights = qualities.map((q) => ShopManager.QUALITY_WEIGHTS[q]);
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < qualities.length; i++) {
            r -= weights[i];
            if (r <= 0) return qualities[i];
        }
        return qualities[qualities.length - 1];
    }

    /** 计算商品金币价格（仅普通~史诗走这里；传说固定元宝价） */
    private calcGoldPrice(equip: EquipData): number {
        // 战力估值：按"这件装备对战斗的真实帮助"折算。
        // 攻击最值钱（直接缩短战斗时间），防御/生命其次，暴击和幸运属于锦上添花。
        // 原来的权重把暴击(1500)、幸运(30)估得太高，导致最没用的项链反而最贵。
        const power =
            equip.atk * 20 +
            equip.def * 12 +
            equip.maxHp * 2 +
            equip.luck * 10 +
            equip.critRate * 400 +
            equip.critDamage * 200;
        return Math.max(1, Math.floor(power * ShopManager.QUALITY_PRICE_MULT[equip.quality]));
    }

    // ==================== 购买 ====================

    /** 点击某个 cell 的购买按钮：按商品货币扣款，装备进背包 */
    private onCellBuyClicked(cell: ShopCell) {
        const item = cell.shopItem;
        if (!item || item.sold) return;

        const isDiamond = item.currency === ShopCurrency.DIAMOND;
        const paid = isDiamond
            ? PlayerData.instance.costDiamond(item.price)
            : PlayerData.instance.costGold(item.price);
        if (!paid) {
            this.showResult(isDiamond ? '元宝不足' : '金币不足');
            return;
        }

        if (!this.bagManager) {
            this.showResult('缺少 BagManager 引用');
            return;
        }
        if (this.bagManager.isFull()) {
            // 背包满：把钱退回去，避免玩家白扣
            if (isDiamond) PlayerData.instance.addDiamond(item.price);
            else PlayerData.instance.addGold(item.price);
            this.showResult('背包已满');
            return;
        }

        this.bagManager.addItem(item.equip);
        item.sold = true;

        // 找到对应的 cell 刷新售罄态
        const targetCell = this.cells.find((c) => c.shopItem === item);
        if (targetCell) targetCell.refreshUI();

        this.syncTopBar();
        this.showResult('购买成功');
    }

    /** 点击装备图标：查看词条详情 */
    private onCellIconClicked(cell: ShopCell) {
        const item = cell.shopItem;
        if (!item) return;
        ItemDetailPopup.show(cell.node, {
            equip: item.equip,
            from: 'shop',
            title: `${item.equip.name}（${item.priceText}）`,
        });
    }

    // ==================== 工具 ====================

    /** 把 PlayerData 的金币/元宝同步到 TopBar */
    private syncTopBar() {
        if (!this.topBar) return;
        this.topBar.setGold(PlayerData.instance.gold);
        this.topBar.setDiamond(PlayerData.instance.diamond);
    }

    private showResult(msg: string) {
        console.log(`[ShopManager] ${msg}`);
        if (this.resultLabel) this.resultLabel.string = msg;
    }
}
