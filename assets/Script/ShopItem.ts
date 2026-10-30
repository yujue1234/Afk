import { EquipData } from './EquipData';

/** 商品结算货币 */
export enum ShopCurrency {
    /** 金币（普通~史诗） */
    GOLD = 'gold',
    /** 元宝（传说装备专用） */
    DIAMOND = 'diamond',
}

/**
 * 商店里的单个商品数据
 * 包装 EquipData，并记录价格、结算货币、是否已售
 *
 * 定价规则：
 *  - 普通 / 优秀 / 稀有 / 史诗 → 金币，价格 = 战力估值 × 品质倍率
 *  - 传说 → 固定 50 元宝（传说装备只能靠商店刷新获取）
 */
export class ShopItem {
    /** 装备本体 */
    equip: EquipData;

    /** 价格（数值） */
    price: number = 0;

    /** 结算货币 */
    currency: ShopCurrency = ShopCurrency.GOLD;

    /** 是否已售出（每个商品限购 1 次） */
    sold: boolean = false;

    constructor(equip: EquipData, price: number, currency: ShopCurrency = ShopCurrency.GOLD) {
        this.equip = equip;
        this.price = price;
        this.currency = currency;
    }

    /** 价格显示文本，如 "1234金" / "50元宝" */
    get priceText(): string {
        return this.currency === ShopCurrency.DIAMOND ? `${this.price}元宝` : `${this.price}金`;
    }
}
