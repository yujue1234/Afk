import { _decorator, Component, Sprite, SpriteFrame, Label, Button, Node, Color, resources, EventTouch } from 'cc';
import { ShopItem } from './ShopItem';
const { ccclass, property } = _decorator;

/**
 * 商店商品单元 —— 挂在 shop_cell.prefab / 场景里的 6 个 cell 根节点上
 *
 * 依赖子节点：
 *  - ItemIcon（Sprite，装备图标，点击可查看词条）
 *  - PriceLabel（Label，显示金币价格，可选）
 *  - BuyBtn（Button，购买按钮）
 *  - SoldMask（任意节点，可选，售罄时变灰遮罩）
 */
@ccclass('ShopCell')
export class ShopCell extends Component {
    @property(Sprite)
    itemIcon: Sprite | null = null;

    @property(Label)
    priceLabel: Label | null = null;

    @property(Button)
    buyBtn: Button | null = null;

    /** 购买按钮上的 Label（脚本会自动改文字） */
    @property(Label)
    buyBtnLabel: Label | null = null;

    /** 售罄遮罩，留空则只把按钮文字改成"已售" */
    @property(Node)
    soldMask: Node | null = null;

    /** 当前商品数据 */
    shopItem: ShopItem | null = null;

    /** 点击购买按钮的回调：参数 = 本 cell */
    onBuyClick: ((cell: ShopCell) => void) | null = null;

    /** 点击装备图标的回调：参数 = 本 cell */
    onIconClick: ((cell: ShopCell) => void) | null = null;

    onLoad() {
        if (!this.itemIcon) {
            this.itemIcon = this.node.getChildByName('ItemIcon')?.getComponent(Sprite) ?? null;
        }
        if (!this.priceLabel) {
            this.priceLabel = this.node.getChildByName('PriceLabel')?.getComponent(Label) ?? null;
        }
        if (!this.buyBtn) {
            this.buyBtn = this.node.getChildByName('BuyBtn')?.getComponent(Button) ?? null;
        }
        if (!this.buyBtnLabel && this.buyBtn) {
            this.buyBtnLabel = this.buyBtn.node.getComponentInChildren(Label) ?? null;
        }
        if (!this.soldMask) {
            this.soldMask = this.node.getChildByName('SoldMask') ?? null;
        }

        if (this.itemIcon) {
            this.itemIcon.sizeMode = Sprite.SizeMode.CUSTOM;
            // 点击图标查看装备词条
            this.itemIcon.node.on(Node.EventType.TOUCH_END, this.onIconTouched, this);
        }

        if (this.buyBtn) {
            this.buyBtn.node.on(Button.EventType.CLICK, this.onClick, this);
        }
    }

    onDestroy() {
        // 场景重载/销毁时引擎可能已把组件的 node 引用置空，必须先判空
        if (this.itemIcon && this.itemIcon.node && this.itemIcon.node.isValid) {
            this.itemIcon.node.off(Node.EventType.TOUCH_END, this.onIconTouched, this);
        }
        if (this.buyBtn && this.buyBtn.node && this.buyBtn.node.isValid) {
            this.buyBtn.node.off(Button.EventType.CLICK, this.onClick, this);
        }
    }

    private onClick() {
        if (this.shopItem?.sold) return;
        this.onBuyClick?.(this);
    }

    private onIconTouched(event: EventTouch) {
        event.propagationStopped = true; // 防止触发 cell 其它点击
        this.onIconClick?.(this);
    }

    /** 绑定商品数据并刷新显示 */
    setItem(item: ShopItem) {
        this.shopItem = item;
        this.refreshUI();

        if (!item) {
            this.clearIcon();
            return;
        }

        const wantId = item.equip.id;
        resources.load(`${item.equip.iconPath}/spriteFrame`, SpriteFrame, (err, sf) => {
            if (err) {
                console.warn(`[ShopCell] 图标加载失败: ${item.equip.iconPath}`, err);
                return;
            }
            if (!this.isValid || this.shopItem?.equip.id !== wantId) return;
            if (this.itemIcon) this.itemIcon.spriteFrame = sf;
        });
    }

    /** 刷新价格、按钮文字、售罄态（购买后调用） */
    refreshUI() {
        const item = this.shopItem;
        if (!item) {
            if (this.priceLabel) this.priceLabel.string = '';
            if (this.buyBtnLabel) this.buyBtnLabel.string = '购买';
            if (this.buyBtn) this.buyBtn.interactable = true;
            if (this.soldMask) this.soldMask.active = false;
            this.clearIcon();
            return;
        }

        if (this.priceLabel) {
            this.priceLabel.string = item.priceText;
        }

        if (item.sold) {
            if (this.buyBtnLabel) this.buyBtnLabel.string = '已售';
            if (this.buyBtn) this.buyBtn.interactable = false;
            if (this.soldMask) this.soldMask.active = true;
            if (this.itemIcon) this.itemIcon.color = new Color(255, 255, 255, 120);
        } else {
            if (this.buyBtnLabel) this.buyBtnLabel.string = '购买';
            if (this.buyBtn) this.buyBtn.interactable = true;
            if (this.soldMask) this.soldMask.active = false;
            if (this.itemIcon) this.itemIcon.color = Color.WHITE;
        }
    }

    private clearIcon() {
        if (this.itemIcon) this.itemIcon.spriteFrame = null;
        if (this.itemIcon) this.itemIcon.color = Color.WHITE;
    }
}
