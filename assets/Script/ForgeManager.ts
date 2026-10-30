import { _decorator, Component, Node, Prefab, Button, instantiate, Layout, UITransform, Size, Label } from 'cc';
import { EquipData } from './EquipData';
import { BagItemSlot } from './BagItemSlot';
import { BagManager } from './BagManager';
import { TopBarManager } from './TopBarManager';
import { PlayerData } from './PlayerData';
const { ccclass, property } = _decorator;

/**
 * 强化页总控 —— 挂在场景 ForgeContent 节点上
 *
 * 功能：
 *  - 列出背包中所有装备（点击选中，出现高亮框）
 *  - 点强化按钮：扣金币 → 按成功率 roll
 *      花费：150 × (当前等级 + 1)，即 +0→+1 花 150，+8→+9 花 1350
 *      成功：等级 +1（最高 +9），属性按每级 +15% 提升
 *      失败：金币照扣，等级不变（不降级）
 *  - 金币统一走 PlayerData，TopBar 实时刷新
 */
@ccclass('ForgeManager')
export class ForgeManager extends Component {
    /** BagItemSlot 预制体（和背包页共用） */
    @property(Prefab)
    slotPrefab: Prefab | null = null;

    /** 强化页 ScrollView 的 content 节点 */
    @property(Node)
    gridContent: Node | null = null;

    /** 强化按钮 */
    @property(Node)
    forgeBtn: Node | null = null;

    /** 顶栏，用于刷新金币显示（留空则不刷新） */
    @property(TopBarManager)
    topBar: TopBarManager | null = null;

    /** 背包页总控，用于读取装备列表 */
    @property(BagManager)
    bagManager: BagManager | null = null;

    /** （可选）结果提示 Label：显示"强化成功 +3"/"强化失败"等，留空则只打控制台 */
    @property(Label)
    resultLabel: Label | null = null;

    /** 强化页的格子列表 */
    private slotList: BagItemSlot[] = [];
    /** 当前选中的装备 */
    private selectedItem: EquipData | null = null;
    /** 当前选中的格子 */
    private selectedSlot: BagItemSlot | null = null;

    onLoad() {
        this.configureGridLayout();
        if (this.forgeBtn) {
            this.forgeBtn.on(Button.EventType.CLICK, this.onForgeClick, this);
        }
    }

    onEnable() {
        // 每次切到强化页都重新拉一遍背包数据（新增装备/丢弃装备会同步）
        this.refreshGrid();
    }

    onDestroy() {
        // forgeBtn 挂的是 Node（事件也是注册在 Node 上的），直接用 Node 的 off 解绑
        if (this.forgeBtn && this.forgeBtn.isValid) {
            this.forgeBtn.off(Button.EventType.CLICK, this.onForgeClick, this);
        }
    }

    // ==================== 初始化 ====================

    /** 强制把强化页 content 的 Layout 设成 5 列网格（和背包页一致） */
    private configureGridLayout() {
        if (!this.gridContent) return;

        // 删掉复制 ScrollView 时可能带过来的默认 "item" Label
        const placeholder = this.gridContent.getChildByName('item');
        if (placeholder) placeholder.removeFromParent();

        const ui = this.gridContent.getComponent(UITransform);
        if (ui) {
            // 5 格 × 100 + 4 间距 × 10 = 540
            ui.setContentSize(540, ui.height);
        }

        const view = this.gridContent.parent;
        if (view) {
            const viewUI = view.getComponent(UITransform);
            if (viewUI) viewUI.setContentSize(540, viewUI.height);
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

    /** 清空并按背包当前内容重建格子 */
    private refreshGrid() {
        if (!this.gridContent || !this.slotPrefab) {
            console.warn('[ForgeManager] gridContent 或 slotPrefab 未绑定');
            return;
        }
        // 清掉旧格子
        for (const child of this.gridContent.children.slice()) {
            if (child.getComponent(BagItemSlot)) {
                child.removeFromParent();
            }
        }
        this.slotList = [];
        this.selectedItem = null;
        this.selectedSlot = null;

        const items = this.bagManager ? this.bagManager.getAllItems() : [];
        for (const item of items) {
            const node = instantiate(this.slotPrefab);
            this.gridContent.addChild(node);
            const slot = node.getComponent(BagItemSlot);
            if (!slot) {
                console.warn('[ForgeManager] 预制体上缺少 BagItemSlot 组件');
                continue;
            }
            slot.onSlotClick = (s) => this.onSlotClicked(s);
            slot.setItem(item);
            this.slotList.push(slot);
        }
    }

    // ==================== 交互 ====================

    /** 点击格子：切换选中，显示高亮框 */
    private onSlotClicked(slot: BagItemSlot) {
        // 取消旧选中
        if (this.selectedSlot) this.selectedSlot.setSelected(false);
        // 点同一个格子 = 取消选中
        if (this.selectedSlot === slot) {
            this.selectedSlot = null;
            this.selectedItem = null;
            return;
        }
        this.selectedSlot = slot;
        this.selectedItem = slot.data;
        slot.setSelected(true);
    }

    /** 点强化按钮 */
    private onForgeClick() {
        if (!this.selectedItem) {
            this.showResult('请先选择一件装备');
            return;
        }
        const item = this.selectedItem;

        if (!item.canStrengthen()) {
            this.showResult(`已达到最高等级 +${EquipData.STRENGTHEN_MAX_LEVEL}`);
            return;
        }

        const cost = item.strengthenCost;
        if (!PlayerData.instance.costGold(cost)) {
            this.showResult(`金币不足（需要 ${cost} 金币）`);
            return;
        }
        // 扣款成功，金币实时上屏
        if (this.topBar) this.topBar.setGold(PlayerData.instance.gold);

        // roll 点
        const rate = item.successRate;
        if (Math.random() < rate) {
            item.strengthen();
            this.showResult(`强化成功！ +${item.strengthenLevel}  (${Math.round(rate * 100)}%成功)`);
            // 刷新选中格子的 +N 显示
            if (this.selectedSlot) this.selectedSlot.refreshLevel();
        } else {
            this.showResult(`强化失败... (${Math.round(rate * 100)}%成功)`);
        }

        // 背包页的 +N 显示和 TopBar 属性同步刷新
        if (this.bagManager) this.bagManager.refreshAfterStrengthen();
    }

    /** 结果提示：优先显示到 resultLabel，没有就打控制台 */
    private showResult(msg: string) {
        console.log(`[ForgeManager] ${msg}`);
        if (this.resultLabel) this.resultLabel.string = msg;
    }
}
