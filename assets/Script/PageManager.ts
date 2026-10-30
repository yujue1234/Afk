import { _decorator, Component, Node } from 'cc';
import { SaveManager } from './SaveManager';
const { ccclass, property } = _decorator;

@ccclass('PageManager')
export class PageManager extends Component {
    // 背景节点列表（原有）
    @property([Node])
    backgroundList: Node[] = [];

    // 【新增】中间内容节点列表
    @property([Node])
    contentList: Node[] = [];

    private currentIndex: number = 0;

    onLoad() {
        // 存档系统启动：本地存档恢复 + 微信云开发初始化 + 自动保存
        // （onLoad 先于所有 start，其他模块 start 里读金币/通关记录时已是存档值）
        SaveManager.bootstrap();
    }

    start() {
        // 初始化：只显示默认主页的背景+内容
        this.refreshDisplay();
    }

    /**
     * 对外切换接口，底部按钮直接调用
     * @param index 页面索引，0=主页，1=背包，2=锻造，3=商店，4=成就，5=战斗
     */
    public switchToScene(index: number): void {
        // 越界保护（以内容页数量为准，背景页可少于内容页）
        if (index < 0 || index >= this.contentList.length) {
            console.warn(`索引 ${index} 越界，共 ${this.contentList.length} 个页面`);
            return;
        }
        // 重复点击不处理
        if (index === this.currentIndex) return;

        this.currentIndex = index;
        this.refreshDisplay();
    }

    /**
     * 同步刷新背景层 + 内容层的显隐
     */
    private refreshDisplay(): void {
        // 更新背景显隐
        this.backgroundList.forEach((node, idx) => {
            if (node) node.active = idx === this.currentIndex;
        });

        // 更新中间内容显隐
        this.contentList.forEach((node, idx) => {
            if (node) node.active = idx === this.currentIndex;
        });
    }
}


