import { _decorator, Component, Sprite, SpriteFrame, Button, Label, resources, Node, Color } from 'cc';
import { EquipData, STRENGTHEN_TEXT_COLOR } from './EquipData';
const { ccclass, property } = _decorator;

/** +N 的红色（转成 Color 对象复用，避免每帧 new） */
const LEVEL_RED = new Color().fromHEX(STRENGTHEN_TEXT_COLOR);

/**
 * 背包格子组件 —— 挂在 BagItemSlot.prefab 根节点上
 * 依赖子节点：
 *  - ItemIcon   （Sprite，显示装备图标）
 *  - LevelLabel （Label，可选，显示强化等级 +1~+9，未强化时为空）
 *  - Selected   （Sprite，可选，选中高亮框，默认隐藏，用于强化页选中态）
 * 子节点没做也不报错，对应功能自动跳过。
 */
@ccclass('BagItemSlot')
export class BagItemSlot extends Component {
    /** 装备图标，拖 ItemIcon 节点上的 Sprite；留空则自动按名字查找 */
    @property(Sprite)
    itemIcon: Sprite | null = null;

    /** 强化等级标签，拖 LevelLabel 上的 Label；留空则自动按名字查找 */
    @property(Label)
    levelLabel: Label | null = null;

    /** 当前格子里的装备，null 表示空格子 */
    data: EquipData | null = null;

    /** 点击回调，由 BagManager / ForgeManager 注入 */
    onSlotClick: ((slot: BagItemSlot) => void) | null = null;

    /** 选中高亮框节点（强化页用） */
    private selectedNode: Node | null = null;

    onLoad() {
        if (!this.itemIcon) {
            this.itemIcon = this.node.getChildByName('ItemIcon')?.getComponent(Sprite) ?? null;
        }
        if (!this.levelLabel) {
            this.levelLabel = this.node.getChildByName('LevelLabel')?.getComponent(Label) ?? null;
        }
        this.selectedNode = this.node.getChildByName('Selected') ?? null;
        if (this.selectedNode) this.selectedNode.active = false;

        if (this.itemIcon) {
            // 强制按节点大小显示，避免图标原始尺寸撑出格子
            this.itemIcon.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        // 用 Button 而不是裸 TOUCH_END，滚动 ScrollView 拖动时不会误触发点击
        let btn = this.node.getComponent(Button);
        if (!btn) btn = this.node.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        this.node.on(Button.EventType.CLICK, this.onClick, this);
    }

    onDestroy() {
        if (this.node && this.node.isValid) {
            this.node.off(Button.EventType.CLICK, this.onClick, this);
        }
    }

    private onClick() {
        if (this.data && this.onSlotClick) {
            this.onSlotClick(this);
        }
    }

    /** 设置格子内容（data 为 null 等同清空） */
    setItem(data: EquipData | null) {
        this.data = data;
        if (!data) {
            this.clearIcon();
            this.refreshLevel();
            return;
        }
        const wantId = data.id;
        resources.load(`${data.iconPath}/spriteFrame`, SpriteFrame, (err, sf) => {
            // 过期回调保护：加载期间格子内容可能已变化或节点已销毁
            if (err) {
                console.warn(`[BagItemSlot] 图标加载失败: ${data.iconPath}`, err);
                return;
            }
            if (!this.isValid || !this.data || this.data.id !== wantId) return;
            if (this.itemIcon) this.itemIcon.spriteFrame = sf;
        });
        this.refreshLevel();
    }

    /**
     * 刷新强化等级显示：+1 ~ +9 用红色强调，未强化时为空。
     * 背包页和强化页共用这个预制体，所以改这一处两边同时生效。
     * 每次都重设颜色，避免格子被回收复用后残留上一件装备的颜色状态。
     */
    refreshLevel() {
        if (!this.levelLabel) return;
        if (this.data && this.data.strengthenLevel > 0) {
            this.levelLabel.string = `+${this.data.strengthenLevel}`;
            this.levelLabel.color = LEVEL_RED;
        } else {
            this.levelLabel.string = '';
        }
    }

    /** 设置选中态（强化页点击格子后高亮） */
    setSelected(on: boolean) {
        if (this.selectedNode) this.selectedNode.active = on;
    }

    private clearIcon() {
        if (this.itemIcon) this.itemIcon.spriteFrame = null;
    }
}
