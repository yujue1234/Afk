# -*- coding: utf-8 -*-
"""商店价格 / 金币经济模拟"""
from tune import BASE, QM, QORDER, BASE_ATK, BASE_DFN, BASE_HP

# 旧价格倍率 / 新价格倍率
PRICE_OLD = {'common': 1, 'uncommon': 2, 'rare': 4, 'epic': 8, 'legendary': 20}
PRICE_NEW = {'common': 1, 'uncommon': 1.4, 'rare': 2.0, 'epic': 3.0, 'legendary': 4.5}


def item_power(eq):
    """新权重：按真实战斗价值折算（旧权重把暴击/幸运估得过高，导致项链比武器还贵）"""
    return (eq['atk'] * 20 + eq['dfn'] * 12 + eq['hp'] * 2 +
            eq['luck'] * 10 + eq['cr'] * 400 + eq['cd'] * 200)


def build(q):
    qm = QM[q]
    return dict(atk=round(BASE['weapon']['atk'] * qm) if False else 0)


def each(q, price_mult):
    out = {}
    for p in BASE:
        b = BASE[p]
        e = dict(atk=b['atk'] * QM[q], dfn=b['dfn'] * QM[q], hp=b['hp'] * QM[q],
                 luck=b['luck'] * QM[q], cr=b['cr'] * QM[q] * 1000 / 1000,
                 cd=b['cd'] * QM[q] * 1000 / 1000)
        pv = item_power(e)
        out[p] = max(1, int(pv * price_mult[q]))
    return out


print('=' * 92)
print('单件装备价格（新公式：power × 品质倍率）')
print('=' * 92)
print(f'{"品质":<12}{"最低价(部位)":<20}{"最高价(部位)":<20}{"一套6件总价(旧)":<22}{"一套6件总价(新)":<18}')
for q in QORDER:
    new = each(q, PRICE_NEW)
    old = each(q, PRICE_OLD)
    lo = min(new, key=new.get); hi = max(new, key=new.get)
    print(f'{q:<12}{new[lo]} ({lo}){"":<8}{new[hi]} ({hi}){"":<8}'
          f'{sum(old.values()):<22}{sum(new.values()):<18}')

print()
print('=' * 92)
print('强化成本（每次强化消耗金币）')
print('=' * 92)
RATES = [1.0, 0.9, 0.8, 0.65, 0.5, 0.35, 0.25, 0.15, 0.1]
RATES_SOFT = [1.0, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]


def total_strengthen_cost(cost_fn, rates):
    tot = 0
    for lv in range(9):
        tot += cost_fn(lv) / rates[lv]
    return tot


flat = lambda lv: 1000
lin = lambda lv: 100 * (lv + 1)

print(f'当前：固定 1000/次，原成功率    → 单件 +0→+9 期望花费 {total_strengthen_cost(flat, RATES):>8,.0f} 金币 / 6 件 {total_strengthen_cost(flat, RATES)*6:>10,.0f}')
print(f'建议：100*(等级+1)，放宽成功率  → 单件 +0→+9 期望花费 {total_strengthen_cost(lin, RATES_SOFT):>8,.0f} 金币 / 6 件 {total_strengthen_cost(lin, RATES_SOFT)*6:>10,.0f}')

print()
print('=' * 92)
print('建议金币奖励曲线（验证：打几把能买下一档）')
print('=' * 92)
GOLD = [200, 320, 480, 700, 1000, 1450, 2100, 3000]
rows = [
    ('common',   None,        1),
    ('uncommon', 'common',    2),
    ('rare',     'uncommon',  3),
    ('epic',     'rare',      4),
]
print(f'{"目标档位":<12}{"一套新价":<12}{"从上一档补差价":<18}{"刷哪关":<8}{"每把金币":<10}{"需要把数":<10}')
for q, prev_q, sid in rows:
    cur = sum(each(q, PRICE_NEW).values())
    prev = sum(each(prev_q, PRICE_NEW).values()) if prev_q else 0
    gap = max(0, cur - prev)
    per = GOLD[sid - 1]
    print(f'{q:<12}{cur:<12,}{gap:<18,}{sid:<8}{per:<10,}{gap/per:>8.1f}')

print()
print('假设玩家每关只刷当前能打的最高关，累积金币的节奏：')
print('  裸装   → 刷1关(200/把)  → 买齐 6 件普通需', f"{sum(each('common', PRICE_NEW).values()):,}", '金 ≈',
      f"{sum(each('common', PRICE_NEW).values())/200:.1f}", '把')
print('  6普通  → 刷2关(320/把)  → 升到 6 优秀需', f"{max(0,sum(each('uncommon', PRICE_NEW).values())-sum(each('common', PRICE_NEW).values())):,}", '金 ≈',
      f"{max(0,sum(each('uncommon', PRICE_NEW).values())-sum(each('common', PRICE_NEW).values()))/320:.1f}", '把')
