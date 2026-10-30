import { _decorator, Component, Node, Sprite, Label, macro, resources, SpriteFrame } from 'cc';
import { PageManager } from './PageManager';
import { TopBarManager } from './TopBarManager';
import { PlayerData } from './PlayerData';
import { BagManager } from './BagManager';
import { STAGES, StageConfig, PLAYER_ATTACK_INTERVAL, MONSTER_ATTACK_INTERVAL, createStageDrop,
         rollLuckyDiamond, DEFEAT_GOLD_RATIO, DEFEAT_GOLD_MIN, LUCK_GOLD_BONUS } from './StageData';
const { ccclass, property } = _decorator;

/**
 * 战斗页总控 —— 挂在 BattlePage 节点上
 * - 进入后自动回合制互砍：玩家先攻，怪物后攻
 * - 每关 3 个小怪 + 1 个 Boss
 * - 怪物血条不显示，玩家血量同步到顶部 TopBar
 * - 胜利/失败后 2 秒自动回主页
 */
@ccclass('BattleManager')
export class BattleManager extends Component {
    public static instance: BattleManager | null = null;

    @property(PageManager)
    pageManager: PageManager | null = null;

    @property(Node)
    bottomNavBar: Node | null = null;

    @property(Sprite)
    backgroundSprite: Sprite | null = null;

    @property(Sprite)
    monsterSprite: Sprite | null = null;

    @property(Label)
    resultLabel: Label | null = null;

    @property(Label)
    stageNameLabel: Label | null = null;

    @property(TopBarManager)
    topBar: TopBarManager | null = null;

    /** 按关卡顺序拖入 8 张背景 SpriteFrame */
    @property([SpriteFrame])
    bgFrames: SpriteFrame[] = [];

    private currentStage: StageConfig | null = null;
    private wave = 0;              // 0~2 小怪，3 Boss
    private monsterCurHp = 0;
    private isBoss = false;
    private isBattling = false;
    private pendingLoad = 0;     // 资源加载计数，防止加载期间攻击判定错乱

    onLoad() {
        BattleManager.instance = this;
    }

    onDestroy() {
        if (BattleManager.instance === this) BattleManager.instance = null;
    }

    onDisable() {
        // 玩家手动切页时强制结束战斗，清理计时器
        if (this.isBattling) this.endBattle(false);
        // 兜底：确保 BackGroud 根节点的村庄背景恢复显示
        this.setHomeBgVisible(true);
    }

    /**
     * 控制 BackGroud 根节点上那张常驻村庄背景 Sprite 的显隐。
     * BackGroud 的渲染层级在 BattlePage 之上，不禁用会把战斗背景整个盖住。
     */
    private setHomeBgVisible(visible: boolean) {
        const bgRootSprite = this.pageManager ? this.pageManager.node.getComponent(Sprite) : null;
        if (bgRootSprite) bgRootSprite.enabled = visible;
    }

    /**
     * 外部入口：从 MapManager 传入当前选中的关卡索引（0~7）
     */
    public startBattle(stageIndex: number) {
        if (stageIndex < 0 || stageIndex >= STAGES.length) {
            console.warn(`[BattleManager] 关卡索引越界: ${stageIndex}`);
            return;
        }
        // 二次保险：MapManager 在入口已经拦过一次，但 startBattle 是公共方法，
        // 将来可能被别的入口（"继续挑战"按钮之类）调用，这里再校验一遍解锁状态。
        // 规则只有 PlayerData.isStageUnlocked 一处定义，不存在两套逻辑对不上的问题。
        if (!PlayerData.instance.isStageUnlocked(stageIndex)) {
            const prevName = STAGES[stageIndex - 1]?.name ?? '上一关';
            console.warn(`[BattleManager] 第 ${stageIndex + 1} 关未解锁，需先通关《${prevName}》，已取消进入战斗`);
            return;
        }
        if (this.isBattling) return;

        this.currentStage = STAGES[stageIndex];
        this.wave = 0;
        this.isBattling = true;
        this.pendingLoad = 0;

        // 切页 + 隐藏底栏
        if (this.pageManager) this.pageManager.switchToScene(5);
        if (this.bottomNavBar) this.bottomNavBar.active = false;
        if (this.resultLabel) this.resultLabel.node.active = false;

        // 关键：BackGroud 根节点自带的村庄背景 Sprite 层级在战斗页之上，必须禁用，否则盖住战斗背景
        this.setHomeBgVisible(false);

        // 背景
        const bgNodeName = this.backgroundSprite ? this.backgroundSprite.node.name : 'null';
        const bgNodeActive = this.backgroundSprite ? this.backgroundSprite.node.active : false;
        const bgFrame = this.bgFrames[stageIndex];
        const looksLikeSpriteFrame = bgFrame && (bgFrame as any).texture !== undefined;
        console.log(`[BattleManager] 关卡 ${stageIndex + 1}，bgFrames 长度=${this.bgFrames.length}，bgFrame=${bgFrame ? bgFrame.name : 'undefined'}，looksLikeSpriteFrame=${looksLikeSpriteFrame}，backgroundSprite=${bgNodeName}(active=${bgNodeActive})`);

        const trySetBg = (sf: SpriteFrame | null) => {
            if (!this.backgroundSprite || !sf) return false;
            this.backgroundSprite.spriteFrame = sf;
            const ok = this.backgroundSprite.spriteFrame === sf;
            if (ok) this.backgroundSprite.node.active = true;
            return ok;
        };

        if (this.backgroundSprite && bgFrame && looksLikeSpriteFrame) {
            const ok = trySetBg(bgFrame);
            if (ok) {
                console.log(`[BattleManager] 背景已切换为 ${bgFrame.name}`);
            } else {
                console.warn('[BattleManager] bgFrames 元素赋值失败，可能拖入类型错误（应拖 .spriteFrame 子资源），将尝试 fallback');
            }
        }

        if (!this.backgroundSprite || !this.backgroundSprite.spriteFrame) {
            const fallbackPath = `level_bg/level${String(stageIndex + 1).padStart(2, '0')}_720x1280/spriteFrame`;
            console.log(`[BattleManager] 尝试 fallback 加载背景: ${fallbackPath}`);
            resources.load(fallbackPath, SpriteFrame, (err, sf) => {
                if (err) {
                    console.error(`[BattleManager] 背景 fallback 加载失败: ${fallbackPath}`, err);
                    return;
                }
                if (trySetBg(sf)) {
                    console.log(`[BattleManager] 背景 fallback 切换成功: ${fallbackPath} -> node=${this.backgroundSprite?.node.name}`);
                }
            });
        }

        // 关卡名
        if (this.stageNameLabel) {
            this.stageNameLabel.string = this.currentStage.name;
            this.stageNameLabel.node.active = true;
        }

        // 进战斗把血量回满（若之后要做“跨战斗保留血量”，改这里即可）
        const maxHp = this.topBar ? this.topBar.getMaxHp() : PlayerData.instance.baseMaxHp;
        this.topBar?.setCurHp(maxHp);

        // 刷出第一波怪并开始自动战斗
        this.spawnWave();
        this.schedule(this.onPlayerAttack, PLAYER_ATTACK_INTERVAL, macro.REPEAT_FOREVER, 0.1);
        this.schedule(this.onMonsterAttack, MONSTER_ATTACK_INTERVAL, macro.REPEAT_FOREVER, 0.5);
    }

    /** 刷出当前波次的怪 */
    private spawnWave() {
        if (!this.currentStage) return;
        this.isBoss = this.wave >= 3;
        this.monsterCurHp = this.isBoss ? this.currentStage.bossHp : this.currentStage.minionHp;

        const path = this.isBoss
            ? `monsters/m0${this.currentStage.id}_boss/spriteFrame`
            : `monsters/m0${this.currentStage.id}_minion/spriteFrame`;

        console.log(`[BattleManager] 加载怪物: ${path}，monsterSprite=${this.monsterSprite ? this.monsterSprite.node.name : 'null'}`);
        this.pendingLoad++;
        resources.load(path, SpriteFrame, (err, sf) => {
            this.pendingLoad--;
            if (err) {
                console.error(`[BattleManager] 加载怪物图失败: ${path}。请检查：1. 文件是否在 assets/resources/monsters/ 下；2. 文件名是否为 m0${this.currentStage.id}_${this.isBoss ? 'boss' : 'minion'}.png；3. 资源导入后子资源名为 .spriteFrame`, err);
                return;
            }
            if (this.monsterSprite) {
                this.monsterSprite.spriteFrame = sf;
                this.monsterSprite.node.active = true;
                console.log(`[BattleManager] 怪物加载成功: ${path} -> ${sf.name}`);
            } else {
                console.warn('[BattleManager] monsterSprite 未绑定，怪物图加载成功但无法显示');
            }
        });
    }

    /** 玩家攻击回调 */
    private onPlayerAttack() {
        if (!this.isBattling || !this.currentStage || this.pendingLoad > 0) return;

        const atk = this.topBar ? this.topBar.getAtk() : PlayerData.instance.baseAtk;
        const critRate = this.topBar ? this.topBar.getCritRate() : 0;
        const critDamage = this.topBar ? this.topBar.getCritDamage() : 1.5;

        // 伤害公式：atk * (1 + 暴击率 * (0.5 + 暴伤加成))
        // 其中暴伤加成 = 总暴伤 - 基础 150%
        const critBonus = critDamage - 1.5;
        const damage = Math.max(1, Math.round(atk * (1 + critRate * (0.5 + critBonus))));

        this.monsterCurHp -= damage;
        if (this.monsterCurHp <= 0) {
            this.onWaveCleared();
        }
    }

    /** 怪物攻击回调 */
    private onMonsterAttack() {
        if (!this.isBattling || !this.currentStage || this.pendingLoad > 0) return;

        const monsterAtk = this.isBoss ? this.currentStage.bossAtk : this.currentStage.minionAtk;
        const def = this.topBar ? this.topBar.getDefense() : PlayerData.instance.baseDef;
        const damage = Math.max(1, monsterAtk * 100 / (100 + def));

        const curHp = (this.topBar?.getCurHp() ?? 0) - damage;
        this.topBar?.setCurHp(curHp);

        if (curHp <= 0) {
            this.endBattle(false);
        }
    }

    /** 当前波次被击败 */
    private onWaveCleared() {
        this.wave++;
        if (this.wave >= 4) {
            this.endBattle(true);
        } else {
            this.spawnWave();
        }
    }

    /** 结束战斗 */
    private endBattle(victory: boolean) {
        if (!this.isBattling) return;
        this.isBattling = false;
        this.unschedule(this.onPlayerAttack);
        this.unschedule(this.onMonsterAttack);

        if (victory && this.currentStage) {
            const stage = this.currentStage;
            const luck = this.topBar ? this.topBar.getLuck() : 0;

            // 金币奖励（幸运每点 +1% 收益）
            const goldGain = Math.floor(stage.goldReward * (1 + luck * LUCK_GOLD_BONUS));
            PlayerData.instance.addGold(goldGain);
            this.topBar?.setGold(PlayerData.instance.gold);

            // 首通元宝奖励
            if (!PlayerData.instance.isStageCleared(stage.id)) {
                PlayerData.instance.markStageCleared(stage.id);
                PlayerData.instance.addDiamond(stage.diamondReward);
                this.topBar?.setDiamond(PlayerData.instance.diamond);
            }

            // 幸运掉落元宝：小概率触发，幸运越高越容易出
            const luckyDiamond = rollLuckyDiamond(luck);
            if (luckyDiamond > 0) {
                PlayerData.instance.addDiamond(luckyDiamond);
                this.topBar?.setDiamond(PlayerData.instance.diamond);
                console.log(`[BattleManager] 幸运触发，额外掉落 ${luckyDiamond} 元宝（幸运 ${luck}）`);
            }

            // 关卡掉落（幸运会提高出高品的概率；背包满则丢弃，不弹提示）
            const drop = createStageDrop(stage, luck);
            if (!BagManager.instance || BagManager.instance.addItem(drop)) {
                console.log(`[BattleManager] 获得掉落：${drop.name}（幸运 ${luck}）`);
            } else {
                console.log('[BattleManager] 背包已满，掉落未获得');
            }

            const bonus = luckyDiamond > 0 ? `，幸运掉落 +${luckyDiamond} 元宝` : '';
            this.showResult(`胜利！ +${goldGain} 金币${bonus}`);
        } else {
            // 失败保底：给一小笔金币，避免"打不过 → 没钱买装备 → 更打不过"的死循环
            const stage = this.currentStage;
            const consolation = Math.max(
                DEFEAT_GOLD_MIN,
                Math.floor((stage ? stage.goldReward : 0) * DEFEAT_GOLD_RATIO),
            );
            PlayerData.instance.addGold(consolation);
            this.topBar?.setGold(PlayerData.instance.gold);

            this.showResult(`战斗失败 +${consolation} 金币安慰奖`);
        }

        // 2 秒后回主页
        this.scheduleOnce(() => this.returnHome(), 2);
    }

    private showResult(text: string) {
        if (this.resultLabel) {
            this.resultLabel.string = text;
            this.resultLabel.node.active = true;
        }
        if (this.stageNameLabel) this.stageNameLabel.node.active = false;
    }

    private returnHome() {
        if (this.pageManager) this.pageManager.switchToScene(0);
        if (this.bottomNavBar) this.bottomNavBar.active = true;
        if (this.resultLabel) this.resultLabel.node.active = false;

        // 恢复 BackGroud 根节点的村庄背景
        this.setHomeBgVisible(true);

        // 回主页后血量回满（想保留残血可注释掉）
        const maxHp = this.topBar ? this.topBar.getMaxHp() : PlayerData.instance.baseMaxHp;
        this.topBar?.setCurHp(maxHp);
    }
}
