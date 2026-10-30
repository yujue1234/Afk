import { _decorator, Component, Sprite, SpriteFrame, Button, Label, resources, Enum } from 'cc';
import { EquipData, EquipType } from './EquipData';
const { ccclass, property } = _decorator;

/**
 * 装备槽组件 —— 挂在 EquipSlot.prefab 根节点上
 * 依赖子节点：
 *   ItemIcon （Sprite，装备图标，默认可隐藏）
 *   PartLabel（Label，空槽时显示部位名，如"武器"）
 * 两个引用都可以留空，脚本会自动按子节点名字查找
 */
@ccclass('EquipSlot')
export class EquipSlot extends Component {
    /** 该槽对应的装备部位（编辑器里通过下拉框选择） */
    @property({ type: Enum(EquipType), displayName: '装备部位' })
    slotType: EquipType = EquipType.WEAPON;

    /** 装备图标，留空自动找名为 ItemIcon 的子节点 */
    @property(Sprite)
    itemIcon: Sprite | null = null;

    /** 部位文字，留空自动找名为 PartLabel 的子节点 */
    @property(Label)
    partLabel: Label | null = null;

    /** 当前穿戴的装备，null 表示未穿戴 */
    data: EquipData | null = null;

    /** 点击回调，由 BagManager 注入 */
    onSlotClick: ((slot: EquipSlot) => void) | null = null;

    onLoad() {
        if (!this.itemIcon) {
            this.itemIcon = this.node.getChildByName('ItemIcon')?.getComponent(Sprite) ?? null;
        }
        if (this.itemIcon) {
            this.itemIcon.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        if (!this.partLabel) {
            this.partLabel = this.node.getChildByName('PartLabel')?.getComponent(Label) ?? null;
        }
        let btn = this.node.getComponent(Button);
        if (!btn) btn = this.node.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        this.node.on(Button.EventType.CLICK, this.onClick, this);
        this.refresh();
    }

    onDestroy() {
        if (this.node && this.node.isValid) {
            this.node.off(Button.EventType.CLICK, this.onClick, this);
        }
    }

    private onClick() {
        if (this.onSlotClick) this.onSlotClick(this);
    }

    /** 穿上装备：显示图标、隐藏部位文字 */
    setItem(data: EquipData) {
        this.data = data;
        const wantId = data.id;
        resources.load(`${data.iconPath}/spriteFrame`, SpriteFrame, (err, sf) => {
            if (err) {
                console.warn(`[EquipSlot] 图标加载失败: ${data.iconPath}`, err);
                return;
            }
            if (!this.isValid || !this.data || this.data.id !== wantId) return;
            if (this.itemIcon) this.itemIcon.spriteFrame = sf;
        });
        this.refresh();
    }

    /** 卸下装备：显示部位文字、清空图标 */
    clearItem() {
        this.data = null;
        if (this.itemIcon) this.itemIcon.spriteFrame = null;
        this.refresh();
    }

    /** 刷新显示状态（图标/部位文字互斥） */
    refresh() {
        if (this.itemIcon) this.itemIcon.node.active = !!this.data;
        if (this.partLabel) {
            this.partLabel.node.active = !this.data;
            // 保留编辑器里预设的部位文字（如"武器"），不在代码里覆盖
        }
    }
}
