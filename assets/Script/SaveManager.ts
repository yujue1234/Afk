import { sys } from 'cc';
import { PlayerData } from './PlayerData';

// 微信小游戏全局对象（其他平台不存在，所有使用处都做了运行时判断）
declare const wx: any;

/** 单件装备的序列化格式 */
export interface EquipSaveJSON {
    type: string;
    quality: string;
    name: string;
    level: number;
}

/** 完整存档格式 */
export interface SaveJSON {
    version: number;
    gold: number;
    diamond: number;
    clearedStages: number[];
    bag: (EquipSaveJSON | null)[];
    equipped: (EquipSaveJSON | null)[];
    savedAt: number;
}

/**
 * 存档管理器 —— 本地（sys.localStorage）+ 微信云开发 双写
 *
 * 设计：
 *  - 本地存档永远是第一道保险，云端是跨设备/清缓存恢复用
 *  - 启动：先恢复本地；若云端存档比本地新（savedAt 更大），用云端覆盖
 *  - 自动保存：每 30 秒对比一次快照，有变化才写（本地 + 云端）
 *  - 微信退后台（onHide）时强制保存一次
 *  - 背包模块通过 registerBagManager() 注册引用，避免循环 import
 *
 * 接入步骤（微信云开发）：
 *  1. 微信开发者工具 → 工具栏「云开发」→ 开通并创建环境，拿到环境 ID
 *  2. 云开发控制台 → 数据库 → 添加集合 saves → 权限设为「仅创建者可读写」
 *  3. 把环境 ID 填到下面 CLOUD_ENV（留空则用默认环境）
 *  4. game.json 需含 "cloud": true（build-templates 已配好）
 */
export class SaveManager {
    /** localStorage 存档键 */
    private static readonly KEY = 'fightworld_save_v1';
    /** 云数据库集合名（需在云开发控制台手动创建） */
    private static readonly COLLECTION = 'saves';
    /** 云开发环境 ID：开通后填这里，留空 = 用默认环境 */
    static CLOUD_ENV = '';

    private static started = false;
    private static cloudReady = false;
    /** 云端存档记录 _id（拿到后直接 update，避免每次查询） */
    private static cloudDocId: string | null = null;
    /** 上次保存的内容快照（不含时间戳），用于判断有没有变化 */
    private static lastSnapshot = '';
    /** 背包管理器引用（BagManager.start 时注册） */
    private static bagManager: any = null;
    /** 背包还没初始化时暂存的背包存档 */
    private static pendingBagRestore: { bag: (EquipSaveJSON | null)[]; equipped: (EquipSaveJSON | null)[] } | null = null;

    /** 入口：PageManager.onLoad 里调用（onLoad 先于所有 start，保证读数据的模块拿到的是存档值） */
    static bootstrap(): void {
        if (this.started) return;
        this.started = true;

        // 1) 本地存档立即恢复（金币/元宝/通关记录先生效）
        const local = this.loadLocal();
        if (local) this.apply(local);

        // 2) 微信：初始化云能力，异步比对云端存档
        this.initCloud();
        if (this.cloudReady) {
            this.loadCloud((cloud) => {
                if (!cloud) return;
                const cur = this.loadLocal();
                if (!cur || (cloud.savedAt || 0) > (cur.savedAt || 0)) {
                    this.apply(cloud);
                    this.saveLocalWith(cloud);
                    console.log('[SaveManager] 云端存档更新，已恢复云存档');
                }
            });
        }

        // 3) 自动保存：每 30 秒检查一次变化 + 微信退后台时保存
        setInterval(() => this.flush(), 30000);
        try {
            if (typeof wx !== 'undefined' && wx.onHide) {
                wx.onHide(() => this.flush());
            }
        } catch (e) { /* 非微信平台忽略 */ }
    }

    /** BagManager.start() 末尾调用：注册引用并恢复背包/穿戴 */
    static registerBagManager(bm: any): void {
        this.bagManager = bm;
        if (this.pendingBagRestore) {
            const p = this.pendingBagRestore;
            this.pendingBagRestore = null;
            this.restoreBag(p.bag, p.equipped);
        }
    }

    /**
     * 是否存在任何存档数据（本地存档，或已恢复但还没交给背包的存档）。
     * BagManager 用它判断要不要发放"新手 6 件普通装备"——有存档的老玩家不会重复领。
     */
    static hasSaveData(): boolean {
        if (this.pendingBagRestore) return true;
        const local = this.loadLocal();
        return !!local && (!!local.bag || !!local.equipped
            || (local.gold ?? 0) > 0 || (local.clearedStages?.length ?? 0) > 0);
    }

    // ==================== 收集 / 恢复 ====================

    /** 生成完整存档快照 */
    static collect(): SaveJSON {
        const p = PlayerData.instance;
        const save: SaveJSON = {
            version: 1,
            gold: p.gold,
            diamond: p.diamond,
            clearedStages: p.clearedStageList,
            bag: [],
            equipped: [],
            savedAt: Date.now(),
        };
        const bm = this.bagManager;
        if (bm) {
            save.bag = bm.getSaveBag();
            save.equipped = bm.getSaveEquipped();
        }
        return save;
    }

    /** 把存档写回游戏运行时数据 */
    private static apply(save: SaveJSON): void {
        try {
            PlayerData.instance.restoreFromSave(save.gold, save.diamond, save.clearedStages || []);
        } catch (e) {
            console.warn('[SaveManager] 恢复玩家数据失败', e);
        }
        if (this.bagManager) {
            this.restoreBag(save.bag || [], save.equipped || []);
        } else {
            // 背包模块还没 start，先暂存，等 registerBagManager 时恢复
            this.pendingBagRestore = { bag: save.bag || [], equipped: save.equipped || [] };
        }
    }

    private static restoreBag(bag: (EquipSaveJSON | null)[], equipped: (EquipSaveJSON | null)[]): void {
        const bm: any = this.bagManager;
        if (bm && bm.restoreBag) {
            try {
                bm.restoreBag(bag, equipped);
            } catch (e) {
                console.warn('[SaveManager] 恢复背包失败', e);
            }
        }
    }

    // ==================== 保存触发 ====================

    /** 有变化才保存（本地 + 云端） */
    static flush(): void {
        try {
            const save = this.collect();
            // 对比时排除时间戳，只看内容有没有变
            const content = JSON.stringify({ ...save, savedAt: 0 });
            if (content === this.lastSnapshot) return;
            this.lastSnapshot = content;
            this.saveLocalWith(save);
            if (this.cloudReady) this.saveCloud(save);
        } catch (e) {
            console.warn('[SaveManager] 保存失败', e);
        }
    }

    // ==================== 本地存档 ====================

    private static saveLocalWith(save: SaveJSON): void {
        try {
            sys.localStorage.setItem(this.KEY, JSON.stringify(save));
        } catch (e) {
            console.warn('[SaveManager] 本地写入失败', e);
        }
    }

    private static loadLocal(): SaveJSON | null {
        try {
            const s = sys.localStorage.getItem(this.KEY);
            if (!s) return null;
            const d = JSON.parse(s);
            if (!d || d.version !== 1) return null;
            return d as SaveJSON;
        } catch (e) {
            return null;
        }
    }

    // ==================== 云存档（微信云开发） ====================

    /** 初始化云能力，失败不影响本地存档 */
    private static initCloud(): void {
        if (this.cloudReady) return;
        try {
            if (typeof wx === 'undefined' || !wx.cloud) return; // 非微信或基础库过低
            if (sys.platform !== sys.Platform.WECHAT_GAME) return;
            const opt: any = { traceUser: true };
            if (this.CLOUD_ENV) opt.env = this.CLOUD_ENV;
            wx.cloud.init(opt);
            this.cloudReady = true;
            console.log('[SaveManager] 微信云开发初始化成功');
        } catch (e) {
            console.warn('[SaveManager] 云开发初始化失败（本地存档不受影响）', e);
        }
    }

    /** 保存到云端（upsert：有记录就 update，没有就 add） */
    private static saveCloud(save: SaveJSON): void {
        if (!this.cloudReady) return;
        try {
            const db = wx.cloud.database();
            const col = db.collection(this.COLLECTION);

            const write = (docId: string) => {
                col.doc(docId).update({ data: { save, savedAt: save.savedAt } })
                    .catch((e: any) => console.warn('[SaveManager] 云端更新失败', e));
            };

            if (this.cloudDocId) {
                write(this.cloudDocId);
                return;
            }
            // 集合权限为「仅创建者可读写」时，get 只会返回自己的记录
            col.limit(1).get().then((res: any) => {
                if (res.data && res.data.length > 0) {
                    this.cloudDocId = res.data[0]._id;
                    write(this.cloudDocId);
                } else {
                    col.add({ data: { save, savedAt: save.savedAt } }).then((r: any) => {
                        this.cloudDocId = r._id;
                    }).catch((e: any) => console.warn('[SaveManager] 云端新增失败', e));
                }
            }).catch((e: any) => console.warn('[SaveManager] 云端查询失败', e));
        } catch (e) {
            console.warn('[SaveManager] 云端保存异常', e);
        }
    }

    /** 读取云端存档（回调式，避免 async 依赖） */
    private static loadCloud(onLoaded: (save: SaveJSON | null) => void): void {
        if (!this.cloudReady) { onLoaded(null); return; }
        try {
            const db = wx.cloud.database();
            db.collection(this.COLLECTION).limit(1).get().then((res: any) => {
                if (res.data && res.data.length > 0) {
                    const rec = res.data[0];
                    this.cloudDocId = rec._id;
                    onLoaded(rec.save || null);
                } else {
                    onLoaded(null);
                }
            }).catch((e: any) => {
                console.warn('[SaveManager] 云端读取失败', e);
                onLoaded(null);
            });
        } catch (e) {
            console.warn('[SaveManager] 云端读取异常', e);
            onLoaded(null);
        }
    }
}
