import { _decorator, Component, Node, Label, Sprite, SpriteFrame, Color, Button, UITransform, Layers, builtinResMgr, director, Vec3, EventTouch } from 'cc';
import { EquipData, EquipType, EquipQuality, QUALITY_COLOR, STRENGTHEN_TEXT_COLOR } from './EquipData';
const { ccclass } = _decorator;

/** 弹窗来源：背包里的装备显示"穿戴"，身上的装备显示"卸下"，商店里的装备只显示属性 */
export type PopupSource = 'bag' | 'equipped' | 'shop';

export interface PopupOptions {
    equip: EquipData;
    from: PopupSource;
    /** 自定义标题（不填则使用装备名） */
    title?: string;
    /** 点击"穿戴"（仅 from='bag' 时出现该按钮） */
    onEquip?: () => void;
    /** 点击"卸下"（仅 from='equipped' 时出现该按钮） */
    onUnequip?: () => void;
    /** 点击"丢弃"（仅 from='bag' / 'equipped' 时出现该按钮） */
    onDiscard?: () => void;
}

/**
 * 装备操作/详情小弹窗 —— 纯代码动态生成，不需要预制体
 * 用法：ItemDetailPopup.show(slotNode, { equip, from: 'bag', onEquip() {...} })
 * 弹窗挂在 Canvas 下，显示在被点击格子/装备槽旁边，点击外部任意位置或关闭按钮消失
 */
@ccclass('ItemDetailPopup')
export class ItemDetailPopup extends Component {
    private options: PopupOptions | null = null;

    private static activePopup: ItemDetailPopup | null = null;

    /** 关闭当前已打开的小弹窗（ BagManager 可在打开新弹窗前调用） */
    static closeActive() {
        if (ItemDetailPopup.activePopup && ItemDetailPopup.activePopup.isValid) {
            ItemDetailPopup.activePopup.close();
        }
        ItemDetailPopup.activePopup = null;
    }

    /**
     * 在目标节点旁边生成操作小弹窗
     * @param targetNode 被点击的格子或装备槽节点，弹窗会显示在它旁边
     * @param opt 装备数据 + 按钮回调
     */
    static show(targetNode: Node, opt: PopupOptions): ItemDetailPopup | null {
        if (!targetNode || !targetNode.isValid) return null;

        // 关掉之前的弹窗，保证同时只有一个
        ItemDetailPopup.closeActive();

        const canvas = director.getScene()?.getChildByName('Canvas');
        if (!canvas) return null;

        const isShop = opt.from === 'shop';
        // 商店详情只显示属性，不需要操作按钮，面板窄一点
        const panelW = isShop ? 260 : 200;
        const panelH = isShop ? 360 : 220;
        const root = createNode('ItemDetailPopup', canvas, panelW, panelH);
        const popup = root.addComponent(ItemDetailPopup);
        popup.options = opt;
        ItemDetailPopup.activePopup = popup;

        // ---------- 位置：挂在目标节点旁边，做简单边界修正 ----------
        const targetUI = targetNode.getComponent(UITransform);
        const worldPos = targetUI ? targetUI.convertToWorldSpaceAR(new Vec3(0, 0, 0)) : targetNode.worldPosition.clone();
        const canvasUI = canvas.getComponent(UITransform);
        const localPos = canvasUI ? canvasUI.convertToNodeSpaceAR(worldPos) : new Vec3(0, 0, 0);

        // 默认放在目标右侧；如果太靠右则放到左侧
        let x = localPos.x + (isShop ? 120 : 90);
        const halfW = root.getComponent(UITransform)?.width ?? 100;
        if (x + halfW > 360) {
            x = localPos.x - (isShop ? 120 : 90);
        }

        // Y 轴对齐目标中心，若太靠上则往下偏移
        let y = localPos.y;
        const halfH = (root.getComponent(UITransform)?.height ?? 110) * 0.5;
        if (y + halfH > 640) y = localPos.y - halfH + 50;
        if (y - halfH < -640) y = localPos.y + halfH - 50;

        root.setPosition(x, y, 0);

        // ---------- 面板背景 ----------
        const panel = createNode('Panel', root, panelW, panelH);
        panel.setPosition(0, 0, 0);
        const panelSprite = panel.addComponent(Sprite);
        panelSprite.spriteFrame = whiteSprite();
        panelSprite.color = new Color(45, 33, 22, 245);

        // ---------- 标题：装备名（品质染色） ----------
        const nameLabel = createLabel('NameLabel', panel, panelW - 20, 36, panelH * 0.5 - 30, 22, true);
        nameLabel.string = opt.title ?? opt.equip.name;
        nameLabel.color = new Color().fromHEX(QUALITY_COLOR[opt.equip.quality]);

        // ---------- 商店/详情：显示属性列表 ----------
        if (isShop) {
            popup.addStatRows(panel, opt.equip, panelW - 30);
        }

        // ---------- 按钮区 ----------
        if (!isShop) {
            // 主操作：穿戴 / 卸下
            if (opt.from === 'bag') {
                popup.addActionBtn(panel, 'EquipBtn', '穿戴', new Color(76, 145, 72, 255), 22, () => {
                    popup.close();
                    opt.onEquip?.();
                });
            } else {
                popup.addActionBtn(panel, 'UnequipBtn', '卸下', new Color(76, 145, 72, 255), 22, () => {
                    popup.close();
                    opt.onUnequip?.();
                });
            }

            // 丢弃
            popup.addActionBtn(panel, 'DiscardBtn', '丢弃', new Color(180, 62, 52, 255), -48, () => {
                popup.close();
                opt.onDiscard?.();
            });

            // 关闭
            popup.addActionBtn(panel, 'CloseBtn', '关闭', new Color(96, 86, 74, 255), -118, () => {
                popup.close();
            });
        } else {
            // 商店详情只有关闭按钮
            popup.addActionBtn(panel, 'CloseBtn', '关闭', new Color(96, 86, 74, 255), -panelH * 0.5 + 40, () => {
                popup.close();
            });
        }

        // ---------- 点击弹窗外部关闭（不吞点击） ----------
        // 在 Canvas 上监听 TOUCH_START：事件会从被点中的节点冒泡上来。
        // 若点击目标不在弹窗内部，则关闭弹窗；因为不拦截事件，
        // 被点中的按钮（如商店的"购买"）仍会正常触发，一次点击两件事都完成。
        const onCanvasTouch = (event: EventTouch) => {
            if (!root.isValid) return;
            let n: Node | null = event.target as Node | null;
            let inside = false;
            while (n) {
                if (n === root) { inside = true; break; }
                n = n.parent;
            }
            if (!inside) popup.close();
        };
        canvas.on(Node.EventType.TOUCH_START, onCanvasTouch);
        (popup as any).__canvasTouch = onCanvasTouch;
        (popup as any).__canvasNode = canvas;

        return popup;
    }

    /** 生成一个按钮节点 */
    private addActionBtn(parent: Node, name: string, text: string, bg: Color, y: number, cb: () => void) {
        const btnNode = createNode(name, parent, 170, 50);
        btnNode.setPosition(0, y, 0);
        const sp = btnNode.addComponent(Sprite);
        sp.spriteFrame = whiteSprite();
        sp.color = bg;

        const lb = createLabel(`${name}Label`, btnNode, 170, 50, 0, 24, true);
        lb.string = text;
        lb.color = new Color(255, 248, 232, 255);

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        btnNode.on(Button.EventType.CLICK, cb, this);
    }

    /** 商店详情：显示装备属性列表（highlight = 用强化红色强调） */
    private addStatRows(parent: Node, equip: EquipData, rowW: number) {
        const rows: { label: string; value: string; highlight?: boolean }[] = [
            { label: '部位', value: equip.type as string },
            { label: '品质', value: equip.quality as string },
            { label: '攻击', value: `${equip.atk}` },
            { label: '防御', value: `${equip.def}` },
            { label: '生命', value: `${equip.maxHp}` },
            { label: '暴击率', value: `${Math.round(equip.critRate * 100)}%` },
            { label: '暴击伤害', value: `${Math.round(equip.critDamage * 100)}%` },
            { label: '幸运', value: `${equip.luck}` },
        ];
        if (equip.strengthenLevel > 0) {
            rows.push({ label: '强化', value: `+${equip.strengthenLevel}`, highlight: true });
        }

        const startY = 60;
        const gapY = 32;
        for (let i = 0; i < rows.length; i++) {
            const row = createNode(`StatRow${i}`, parent, rowW, 30);
            row.setPosition(0, startY - i * gapY, 0);

            const label = createLabel(`StatLabel${i}`, row, rowW * 0.5, 30, 0, 20, false);
            label.string = `${rows[i].label}:`;
            label.horizontalAlign = Label.HorizontalAlign.LEFT;
            label.node.setPosition(-rowW * 0.25, 0, 0);

            const value = createLabel(`StatValue${i}`, row, rowW * 0.5, 30, 0, 20, false);
            value.string = rows[i].value;
            value.horizontalAlign = Label.HorizontalAlign.RIGHT;
            value.node.setPosition(rowW * 0.25, 0, 0);
            // 强化等级和格子上的 +N 用同一个红色，视觉上统一
            if (rows[i].highlight) value.color = new Color().fromHEX(STRENGTHEN_TEXT_COLOR);
        }
    }

    close() {
        // 移除 Canvas 上的监听，防止残留
        const handler = (this as any).__canvasTouch as ((e: EventTouch) => void) | undefined;
        const canvasNode = (this as any).__canvasNode as Node | undefined;
        if (handler && canvasNode && canvasNode.isValid) {
            canvasNode.off(Node.EventType.TOUCH_START, handler);
        }
        if (this.isValid) this.node.destroy();
        if (ItemDetailPopup.activePopup === this) {
            ItemDetailPopup.activePopup = null;
        }
    }
}

// ==================== 工具函数 ====================

/** 白底 SpriteFrame（引擎内置资源） */
function whiteSprite(): SpriteFrame {
    return builtinResMgr.get<SpriteFrame>('default-sprite/spriteFrame');
}

/** 创建一个 UI 节点（自动设置层级和尺寸） */
function createNode(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D; // UI 节点必须设为 UI_2D 层，否则相机看不到
    n.addComponent(UITransform).setContentSize(w, h);
    parent.addChild(n);
    return n;
}

/** 创建一个 Label 节点 */
function createLabel(name: string, parent: Node, w: number, h: number, y: number, fontSize: number, bold: boolean): Label {
    const n = createNode(name, parent, w, h);
    n.setPosition(0, y, 0);
    const lb = n.addComponent(Label);
    lb.fontSize = fontSize;
    lb.isBold = bold;
    lb.horizontalAlign = Label.HorizontalAlign.CENTER;
    lb.verticalAlign = Label.VerticalAlign.CENTER;
    lb.overflow = Label.Overflow.NONE;
    return lb;
}
