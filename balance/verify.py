# -*- coding: utf-8 -*-
"""最终数值回归验证：直接使用改完后代码里的数值"""
from sim import simulate

BASE_ATK, BASE_DFN, BASE_HP = 10, 0, 220

# ===== EquipData.ts 改后 =====
BASE = {
    'weapon':   dict(atk=10, dfn=0, hp=0,  cr=0.03, cd=0.00, luck=0),
    'helmet':   dict(atk=0,  dfn=4, hp=40, cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0,  dfn=6, hp=70, cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=3,  dfn=0, hp=0,  cr=0.05, cd=0.15, luck=1),
    'boots':    dict(atk=0,  dfn=2, hp=30, cr=0,    cd=0,    luck=2),
    'shield':   dict(atk=0,  dfn=8, hp=55, cr=0,    cd=0,    luck=0),
}
QM = {'common': 1.0, 'uncommon': 1.35, 'rare': 1.75, 'epic': 2.3, 'legendary': 3.0}

# ===== StageData.ts 改后 =====
STAGES = [
    dict(id=1, minionHp=50,  minionAtk=6,  bossHp=130,  bossAtk=10, gold=200,  dia=5),
    dict(id=2, minionHp=120, minionAtk=12, bossHp=312,  bossAtk=22, gold=320,  dia=8),
    dict(id=3, minionHp=150, minionAtk=15, bossHp=390,  bossAtk=27, gold=480,  dia=12),
    dict(id=4, minionHp=185, minionAtk=19, bossHp=481,  bossAtk=34, gold=700,  dia=16),
    dict(id=5, minionHp=230, minionAtk=24, bossHp=598,  bossAtk=43, gold=1000, dia=22),
    dict(id=6, minionHp=285, minionAtk=32, bossHp=741,  bossAtk=57, gold=1450, dia=28),
    dict(id=7, minionHp=335, minionAtk=43, bossHp=871,  bossAtk=77, gold=2100, dia=36),
    dict(id=8, minionHp=385, minionAtk=55, bossHp=1001, bossAtk=99, gold=3000, dia=50),
]

# ===== ShopManager.ts 改后价格 =====
PM = {'common': 1, 'uncommon': 1.4, 'rare': 2.0, 'epic': 3.0, 'legendary': 4.5}


def eq_price(part, q):
    b = BASE[part]
    pv = (b['atk'] * QM[q] * 20 + b['dfn'] * QM[q] * 12 + b['hp'] * QM[q] * 2 +
          b['luck'] * QM[q] * 10 + b['cr'] * QM[q] * 400 + b['cd'] * QM[q] * 200)
    return max(1, int(pv * PM[q]))


def set_stats(parts, q, strengthen=0):
    sm = 1 + strengthen * 0.10
    atk = BASE_ATK + round(sum(round(BASE[p]['atk'] * QM[q]) for p in parts) * sm)
    dfn = BASE_DFN + round(sum(round(BASE[p]['dfn'] * QM[q]) for p in parts) * sm)
    hp = BASE_HP + round(sum(round(BASE[p]['hp'] * QM[q]) for p in parts) * sm)
    cr = sum(round(BASE[p]['cr'] * QM[q] * 1000) / 1000 for p in parts)
    cd = 1.5 + sum(round(BASE[p]['cd'] * QM[q] * 1000) / 1000 for p in parts)
    return atk, dfn, hp, cr, cd


ALL = ['weapon', 'helmet', 'armor', 'necklace', 'boots', 'shield']


def clear_count(st):
    n = 0
    detail = []
    for s in STAGES:
        win, t, left = simulate(s, st[0], st[1], st[2], st[3], st[4])
        detail.append('O' if win else 'X')
        if win:
            n = s['id']
        else:
            break
    return n, detail


print('=' * 100)
print('【验证 1】升级路线：每个装备档位能打到第几关')
print('=' * 100)
tiers = [
    ('裸装', (BASE_ATK, BASE_DFN, BASE_HP, 0, 1.5)),
    ('6件普通', set_stats(ALL, 'common')),
    ('6件优秀', set_stats(ALL, 'uncommon')),
    ('6件稀有', set_stats(ALL, 'rare')),
    ('6件史诗', set_stats(ALL, 'epic')),
    ('6件史诗+3', set_stats(ALL, 'epic', 3)),
    ('6件史诗+6', set_stats(ALL, 'epic', 6)),
    ('6件史诗+9', set_stats(ALL, 'epic', 9)),
    ('6件传说', set_stats(ALL, 'legendary')),
    ('6件传说+9', set_stats(ALL, 'legendary', 9)),
]
for name, st in tiers:
    n, d = clear_count(st)
    print(f'{name:12s} atk={st[0]:4.0f} def={st[1]:4.0f} hp={st[2]:5.0f}  → 通过第 {n} 关  [{" ".join(d)}]')

print()
print('=' * 100)
print('【验证 2】"2 件紫装 vs 6 件绿装"（用户遇到的问题）')
print('=' * 100)
two_epic = ['weapon', 'armor']
c6 = set_stats(ALL, 'common')
e2 = set_stats(two_epic, 'epic')
e3 = set_stats(['weapon', 'armor', 'shield'], 'epic')
c6_price = sum(eq_price(p, 'common') for p in ALL)
e2_price = sum(eq_price(p, 'epic') for p in two_epic)
e3_price = sum(eq_price(p, 'epic') for p in ['weapon', 'armor', 'shield'])
for label, st, price in [('6件普通（绿装）', c6, c6_price),
                         ('2件史诗（紫装）', e2, e2_price),
                         ('3件史诗（紫装）', e3, e3_price)]:
    n, d = clear_count(st)
    print(f'{label:16s} 花费 {price:>5,} 金 | atk={st[0]:4.0f} def={st[1]:4.0f} hp={st[2]:5.0f} '
          f'→ 通过第 {n} 关  [{" ".join(d)}]')

print()
print('=' * 100)
print('【验证 3】经济节奏：升到下一档要刷几把')
print('=' * 100)
plan = [('common', None, 1), ('uncommon', 'common', 2), ('rare', 'uncommon', 3),
        ('epic', 'rare', 4), ('legendary', 'epic', 6)]
for q, prev, sid in plan:
    cur = sum(eq_price(p, q) for p in ALL)
    pv = sum(eq_price(p, prev) for p in ALL) if prev else 0
    gap = max(0, cur - pv)
    per = STAGES[sid - 1]['gold']
    print(f'买到 6 件{q:10s}：一套 {cur:>6,} 金，需补 {gap:>6,} 金 '
          f'→ 刷第{sid}关（{per}/把）约 {gap/per:>4.1f} 把')

print()
print('=' * 100)
print('【验证 4】防卡死')
print('=' * 100)
n, _ = clear_count((BASE_ATK, BASE_DFN, BASE_HP, 0, 1.5))
print(f'裸装（完全不买装备）通关数：{n} 关  →  {"可以，不会卡死 ✓" if n >= 1 else "不行 ✗"}')
consol = max(20, int(STAGES[0]["gold"] * 0.25))
print(f'打第 1 关失败也有安慰奖 {consol} 金/次 → 即使卡关也能慢慢攒钱 ✓')
