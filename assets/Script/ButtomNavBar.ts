import { _decorator, Component, Button, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('BottomNavBar')
export class BottomNavBar extends Component {
    // 当前按钮对应背景的索引，每个按钮填不同的数字
    @property
    targetSceneIndex: number = 0;

    // 编辑器拖入层级里的 BackGroud 父节点
    @property(Node)
    backgroundRoot: Node | null = null;

    private pageMgr: any = null;

    onLoad() {
        // 从背景根节点获取管理器组件
        if (this.backgroundRoot) {
            this.pageMgr = this.backgroundRoot.getComponent('PageManager');
        }

        // 绑定按钮点击事件
        const btn = this.getComponent(Button);
        if (btn) {
            btn.node.on(Button.EventType.CLICK, this.onClick, this);
        } else {
            console.warn(`节点 ${this.node.name} 缺少 Button 组件，请添加`);
        }
    }

    private onClick(): void {
        if (this.pageMgr) {
            this.pageMgr.switchToScene(this.targetSceneIndex);
        } else {
            console.warn('未找到 PageManager 组件，请检查 backgroundRoot 是否正确');
        }
    }

    onDestroy() {
        const btn = this.getComponent(Button);
        if (btn && btn.node && btn.node.isValid) {
            btn.node.off(Button.EventType.CLICK, this.onClick, this);
        }
    }
}



