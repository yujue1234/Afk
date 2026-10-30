# -*- coding: utf-8 -*-
"""v2 经济模型：商店价格 / 强化期望 / 金币奖励曲线 / 新手节奏"""
from tune2 import BASE, QM, QORDER

# 品质价格倍率（拉长版，和上一轮一致）
PRICE_MULT = {'common': 1.0, 'uncommon': 1.4, 'rare': 2.0, 'epic': 3.0, 'legendary': 4.5}


def item_power(e):
    return (e['atk'] * 20 + e['dfn'] * 12 + e['hp'] * 2 +
            e['luck'] * 10 + e['cr'] * 400 + e['cd'] * 200)


def each(q):
    """6 个部位在该品质下的单件价格"""
    out = {}
    for p, b in BASE.items():
        e = dict(atk=b['atk'] * QM[q], dfn=b['dfn'] * QM[q], hp=b['hp'] * QM[q],
                 luck=b['luck'] * QM[q], cr=b['cr'] * QM[q], cd=b['cd'] * QM[q])
        out[p] = max(1, int(item_power(e) * PRICE_MULT[q]))
    return out


print('=' * 92)
print('单件装备价格（新数值）')
print('=' * 92)
print(f'{"品质":<12}{"一套6件总价":<16}{"最贵部位":<18}{"最便宜部位":<18}')
sets = {}
for q in QORDER:
    prices = each(q)
    sets[q] = sum(prices.values())
    hi = max(prices, key=prices.get)
    lo = min(prices, key=prices.get)
    print(f'{q:<12}{sets[q]:<16,}{prices[hi]:>6,} ({hi}){"":<6}{prices[lo]:>6,} ({lo}){"":<4}')

# 传说改为元宝购买（50 元宝/件），不参与金币经济
print()
print('传说装备：仅商店刷新获得，价格固定 50 元宝/件（不进金币价表）')

print()
print('=' * 92)
print('强化期望花费（v2：每级 +15%，基础费 250×(等级+1)，成功率放宽）')
print('=' * 92)
RATES = [1.0, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]


def tot(cost_fn, rates):
    return sum(cost_fn(lv) / rates[lv] for lv in range(9))


for base_cost in (150, 200, 250, 300):
    fn = lambda lv, bc=base_cost: bc * (lv + 1)
    t = tot(fn, RATES)
    print(f'  基础费 {base_cost:>4}/次 → 单件 +0→+9 期望 {t:>10,.0f} 金 / 一身 6 件 {t*6:>12,.0f} 金')

print()
print('=' * 92)
print('金币奖励曲线（目标：每升一档刷 3~5 把）')
print('=' * 92)
GOLD = [500, 800, 1200, 1750, 2500, 3600, 5200, 7500]
rows = [
    ('uncommon', 'common',   2),
    ('rare',     'uncommon', 3),
    ('epic',     'rare',     4),
]
print(f'{"目标档位":<12}{"一套总价":<14}{"补差价":<14}{"刷哪关":<8}{"每把":<10}{"需要把数":<10}')
for q, pq, sid in rows:
    gap = max(0, sets[q] - sets[pq])
    per = GOLD[sid - 1]
    print(f'{q:<12}{sets[q]:<14,}{gap:<14,}{sid:<8}{per:<10,}{gap/per:>8.1f}')

print()
print('开局节奏（已白送 6 件普通）：')
print(f'  初始金币建议 1500 → 可买 {1500/ (sets["uncommon"]/6):.1f} 件优秀装')
print(f'  6普通 刷第2关 ({GOLD[1]:,}/把) → 补齐 6 优秀需 {max(0, sets["uncommon"]-sets["common"]):,} 金 ≈ '
      f'{max(0, sets["uncommon"]-sets["common"])/GOLD[1]:.1f} 把')
print(f'  6优秀 刷第3关 ({GOLD[2]:,}/把) → 补齐 6 稀有需 {max(0, sets["rare"]-sets["uncommon"]):,} 金 ≈ '
      f'{max(0, sets["rare"]-sets["uncommon"])/GOLD[2]:.1f} 把')
print(f'  6稀有 刷第4关 ({GOLD[3]:,}/把) → 补齐 6 史诗需 {max(0, sets["epic"]-sets["rare"]):,} 金 ≈ '
      f'{max(0, sets["epic"]-sets["rare"])/GOLD[3]:.1f} 把')
print()
print(f'  6史诗 刷第5关 ({GOLD[4]:,}/把) → 一身史诗+9 期望 {tot(lambda lv: 250*(lv+1), RATES)*6:,.0f} 金 ≈ '
      f'{tot(lambda lv: 250*(lv+1), RATES)*6/GOLD[4]:.1f} 把（可分批强化）')
