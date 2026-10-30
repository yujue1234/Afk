import { _decorator, Component, Node, Button, Sprite, SpriteFrame, Label, Color, UITransform, Layers, builtinResMgr, tween, Vec3 } from 'cc';
import { BattleManager } from './BattleManager';
import { PlayerData } from './PlayerData';
import { STAGES } from './StageData';
const { ccclass, property } = _decorator;

/**
 * 关卡选择（地图轮播）—— 挂在主页的地图节点上
 *
 * ==================== 关卡解锁规则 ====================
 * 唯一规则定义在 PlayerData.isStageUnlocked()：
 *   - 第 1 关永远开放（保证新号开局有得打，不会卡死）
 *   - 第 N 关必须"通关第 N-1 关"才解锁
 *
 * 判断依据是 PlayerData 里的 clearedStages（已首通关卡集合），
 * 它在 BattleManager 打赢时写入，并且随存档持久化 —— 所以退出重进后解锁状态还在。
 *
 * 表现分两层：
 *   1. 翻页层：默认允许翻看未解锁的关卡（让玩家知道后面还有什么，有目标感），
 *      把 allowPreviewLocked 设为 false 就变成"只能翻到已解锁的关卡"。
 *   2. 进入层：未解锁的关卡点"进入战斗"会被拦下并闪一下提示。
 *
 * 锁定表现节点（lockMask / lockTipLabel）留空的话，代码会自动生成，
 * 编辑器里不用做任何事；想换成美术做的锁图标就把 lockMask 拖进来。
 */
@ccclass('MapManager')
export class MapManager extends Component {

    // 1. 拖拽一个固定的“地图显示节点”进来（只需要一个Sprite节点）
    @property({ type: Sprite })
    public mapDisplay: Sprite = null!;

    // 2. 把你准备好的 8 张图片素材，按顺序拖进这个数组
    @property({ type: [SpriteFrame] })
    public mapFrames: SpriteFrame[] = [];

    @property({ type: Button })
    public btnLeft: Button = null!;
    @property({ type: Button })
    public btnRight: Button = null!;

    @property({ type: Button })
    public enterBtn: Button = null!;

    @property({ type: BattleManager })
    public battleManager: BattleManager | null = null;

    // ==================== 锁定表现（都可留空，代码自动生成） ====================

    /** 未解锁时盖在地图上的遮罩节点（留空自动生成一块半透明黑） */
    @property({ type: Node, tooltip: '未解锁时盖在地图上的遮罩，留空自动生成' })
    public lockMask: Node | null = null;

    /** 未解锁时的提示文字（留空自动生成一行"通关《XX》后解锁"） */
    @property({ type: Label, tooltip: '未解锁时的提示文字，留空自动生成' })
    public lockTipLabel: Label | null = null;

    /** 是否允许左右翻看未解锁的关卡（true=允许浏览、进入时拦截；false=根本翻不过去） */
    @property({ tooltip: '是否允许翻看未解锁关卡。true=能看不能打（推荐），false=翻都翻不过去' })
    public allowPreviewLocked: boolean = true;

    private currentIndex: number = 0;

    /**
     * 上次刷新时"已解锁到的最高关卡索引"。
     * 用来识别"刚刚打赢了一关"这件事：解锁数变大了就把地图自动翻到新解锁的那一关，
     * 玩家回主页后不用自己再翻一次。
     */
    private lastUnlockedIndex: number = -1;

    start() {
        // 默认定位到"最新解锁"的那一关（老玩家不用每次从第 1 关重新翻）
        this.currentIndex = this.getMaxUnlockedIndex();
        this.lastUnlockedIndex = this.currentIndex;
        this.updateMap();

        // 绑定按钮点击事件
        if (this.btnLeft && this.btnLeft.node) {
            this.btnLeft.node.on(Button.EventType.CLICK, this.onPrev, this);
        } else {
            console.warn('[MapManager] btnLeft 未绑定，左切按钮无效');
        }

        if (this.btnRight && this.btnRight.node) {
            this.btnRight.node.on(Button.EventType.CLICK, this.onNext, this);
        } else {
            console.warn('[MapManager] btnRight 未绑定，右切按钮无效');
        }

        if (this.enterBtn && this.enterBtn.node) {
            this.enterBtn.node.on(Button.EventType.CLICK, this.onEnterBattle, this);
            console.log('[MapManager] 进入战斗按钮已绑定');
        } else {
            console.warn('[MapManager] enterBtn 未绑定，点击“进入战斗”不会触发战斗');
        }

        if (!this.battleManager && !BattleManager.instance) {
            console.warn('[MapManager] battleManager 未绑定且 BattleManager.instance 为空，进入战斗将无效');
        } else {
            console.log('[MapManager] 战斗管理器已引用');
        }

        this.logUnlockState();
    }

    /**
     * 每次主页重新显示时刷一遍。
     * 战斗结束回主页（PageManager 会把主页内容节点重新 active）会走这里，
     * 所以"刚通关 → 新关卡解锁 → 地图自动翻过去"就是靠它生效的。
     */
    onEnable() {
        if (this.mapFrames.length === 0) return;
        this.syncToLatestUnlocked();
        this.updateMap();
    }

    // ==================== 解锁判断 ====================

    /** 当前关卡是否已解锁（规则见 PlayerData.isStageUnlocked） */
    public isStageUnlocked(index: number): boolean {
        return PlayerData.instance.isStageUnlocked(index);
    }

    /** 已解锁到的最大关卡索引（0 起） */
    public getMaxUnlockedIndex(): number {
        const total = this.mapFrames.length > 0
            ? Math.min(STAGES.length, this.mapFrames.length)
            : STAGES.length;
        let i = 0;
        while (i < total - 1 && PlayerData.instance.isStageUnlocked(i + 1)) i++;
        return i;
    }

    /** 解锁进度变大时（刚打赢），把地图自动翻到新解锁的那一关 */
    private syncToLatestUnlocked(): void {
        const maxIdx = this.getMaxUnlockedIndex();
        if (maxIdx !== this.lastUnlockedIndex) {
            if (this.lastUnlockedIndex >= 0 && maxIdx > this.lastUnlockedIndex) {
                this.currentIndex = maxIdx;
                console.log(`[MapManager] 解锁新关卡，地图自动翻到第 ${maxIdx + 1} 关`);
            }
            this.lastUnlockedIndex = maxIdx;
        }
    }

    /** 打印一次解锁进度，方便在编辑器控制台排查 */
    private logUnlockState(): void {
        const total = Math.min(STAGES.length, this.mapFrames.length || STAGES.length);
        const states = STAGES.slice(0, total).map((s, i) => {
            const unlocked = PlayerData.instance.isStageUnlocked(i);
            return `${s.name}(${unlocked ? '开' : '锁'})`;
        });
        console.log(`[MapManager] 关卡解锁状态：${states.join(' ')}`);
    }

    // ==================== 显示 ====================

    // 更新显示当前索引的图片
    updateMap() {
        if (this.mapFrames.length === 0) {
            console.warn("还没有放入地图素材！");
            return;
        }
        if (!this.mapDisplay) {
            console.warn('[MapManager] mapDisplay 未绑定，无法切换地图');
            return;
        }
        // 核心就这一句：直接把图片赋值给 Sprite 组件
        this.mapDisplay.spriteFrame = this.mapFrames[this.currentIndex];
        this.refreshLockState();
    }

    /** 按当前关卡的解锁状态，刷新遮罩和提示文字 */
    private refreshLockState(): void {
        this.ensureLockUI();
        const unlocked = this.isStageUnlocked(this.currentIndex);

        if (this.lockMask) this.lockMask.active = !unlocked;

        if (this.lockTipLabel) {
            if (unlocked) {
                this.lockTipLabel.node.active = false;
            } else {
                const prevName = STAGES[this.currentIndex - 1]?.name ?? '上一关';
                this.lockTipLabel.node.active = true;
                this.lockTipLabel.string = `通关《${prevName}》后解锁`;
            }
        }
    }

    /**
     * 遮罩和提示文字都没绑定时，代码就地生成一套，编辑器里零配置。
     * 生成原则和 ItemDetailPopup 一致：节点必须设 UI_2D 层，否则摄像机看不到。
     */
    private ensureLockUI(): void {
        const parent = this.mapDisplay ? this.mapDisplay.node : null;
        if (!parent) return;

        const parentUI = parent.getComponent(UITransform);
        // 尺寸兜底：地图节点没铺满屏幕 / 没挂 UITransform 时，退回设计分辨率，保证遮罩一定盖满
        const w = parentUI && parentUI.width >= 360 ? parentUI.width : 720;
        const h = parentUI && parentUI.height >= 640 ? parentUI.height : 1280;
        // 锚点兜底：地图节点锚点不是 (0.5, 0.5) 时，遮罩按锚点偏移对齐父节点中心
        const ax = parentUI ? parentUI.anchorX : 0.5;
        const ay = parentUI ? parentUI.anchorY : 0.5;

        // 1) 遮罩：半透明黑，透明度刻意留低（能看清地图轮廓，只是明显变暗）
        if (!this.lockMask) {
            const mask = new Node('LockMask');
            mask.layer = Layers.Enum.UI_2D;
            mask.addComponent(UITransform).setContentSize(w, h);
            mask.setPosition((0.5 - ax) * w, (0.5 - ay) * h, 0);
            parent.addChild(mask);

            const sp = mask.addComponent(Sprite);
            sp.spriteFrame = builtinResMgr.get<SpriteFrame>('default-sprite/spriteFrame');
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.color = new Color(0, 0, 0, 120);

            this.lockMask = mask;
        }

        // 2) 提示文字：放在遮罩下半部分，不压住地图中央的图案
        if (!this.lockTipLabel && this.lockMask) {
            const n = new Node('LockTip');
            n.layer = Layers.Enum.UI_2D;
            n.addComponent(UITransform).setContentSize(w * 0.9, 80);
            n.setPosition(0, -h * 0.32, 0);
            this.lockMask.addChild(n);

            const lb = n.addComponent(Label);
            lb.fontSize = 42;
            lb.isBold = true;
            lb.horizontalAlign = Label.HorizontalAlign.CENTER;
            lb.verticalAlign = Label.VerticalAlign.CENTER;
            lb.overflow = Label.Overflow.NONE;
            lb.color = new Color(255, 214, 102, 255); // 暖黄色，在暗遮罩上醒目

            this.lockTipLabel = lb;
        }
    }

    /** 点到未解锁关卡时闪一下提示，告诉玩家"不是没反应，是打不了" */
    private flashLockTip(): void {
        const n = this.lockTipLabel ? this.lockTipLabel.node : null;
        if (!n || !n.isValid || !n.active) return;
        n.setScale(1, 1, 1);
        tween(n)
            .to(0.08, { scale: new Vec3(1.18, 1.18, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    // ==================== 翻页 ====================

    onPrev() {
        this.currentIndex--;
        // 如果小于0，跳到最后一张（实现循环切换）
        if (this.currentIndex < 0) {
            this.currentIndex = this.mapFrames.length - 1;
        }
        if (!this.allowPreviewLocked) {
            // 不允许预览时，直接跳回已解锁的最大关卡
            this.currentIndex = Math.min(this.currentIndex, this.getMaxUnlockedIndex());
        }
        this.updateMap();
    }

    onNext() {
        this.currentIndex++;
        // 如果超过最大张数，跳回第一张
        if (this.currentIndex >= this.mapFrames.length) {
            this.currentIndex = 0;
        }
        if (!this.allowPreviewLocked) {
            this.currentIndex = Math.min(this.currentIndex, this.getMaxUnlockedIndex());
        }
        this.updateMap();
    }

    // ==================== 进入战斗 ====================

    /** 点击进入战斗：先过解锁校验，再把当前选中的关卡索引传给 BattleManager */
    private onEnterBattle() {
        if (!this.isStageUnlocked(this.currentIndex)) {
            const prevName = STAGES[this.currentIndex - 1]?.name ?? '上一关';
            console.log(`[MapManager] 第 ${this.currentIndex + 1} 关未解锁，需先通关《${prevName}》`);
            this.flashLockTip();
            return; // 关键：直接 return，不会调到 startBattle
        }

        console.log(`[MapManager] 点击进入战斗，当前关卡索引=${this.currentIndex}`);
        const bm = this.battleManager || BattleManager.instance;
        if (!bm) {
            console.warn('[MapManager] 未找到 BattleManager，请检查 BattlePage 是否已挂载该组件');
            return;
        }
        try {
            bm.startBattle(this.currentIndex);
        } catch (e) {
            console.error('[MapManager] 调用 BattleManager.startBattle 时出错：', e);
        }
    }
}
