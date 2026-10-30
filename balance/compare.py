# -*- coding: utf-8 -*-
"""改前 / 改后 装备数值对照（用于报告）"""

OLD_BASE_ATK, OLD_BASE_HP = 10, 220
OLD_BASE = {
    'weapon':   dict(atk=10, dfn=0, hp=0,  cr=0.03, cd=0.00, luck=0),
    'helmet':   dict(atk=0, dfn=4, hp=40,  cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0, dfn=6, hp=70,  cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=3, dfn=0, hp=0,   cr=0.05, cd=0.15, luck=1),
    'boots':    dict(atk=0, dfn=2, hp=30,  cr=0,    cd=0,    luck=2),
    'shield':   dict(atk=0, dfn=8, hp=55,  cr=0,    cd=0,    luck=0),
}
OLD_QM = {'common': 1.0, 'uncommon': 1.35, 'rare': 1.75, 'epic': 2.3, 'legendary': 3.0}
OLD_SB = 0.10

NEW_BASE_ATK, NEW_BASE_HP = 25, 560
NEW_BASE = {
    'weapon':   dict(atk=25, dfn=0, hp=0,   cr=0.04, cd=0.00, luck=0),
    'helmet':   dict(atk=0, dfn=10, hp=100, cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0, dfn=16, hp=180, cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=8, dfn=0, hp=0,   cr=0.06, cd=0.30, luck=3),
    'boots':    dict(atk=0, dfn=5, hp=75,  cr=0,    cd=0,    luck=5),
    'shield':   dict(atk=0, dfn=22, hp=145, cr=0,    cd=0,    luck=0),
}
NEW_QM = {'common': 1.0, 'uncommon': 1.5, 'rare': 2.1, 'epic': 2.9, 'legendary': 4.0}
NEW_SB = 0.15


def stats(base, base_atk, base_hp, qm, sb, q, strengthen):
    b = base
    sm = 1 + strengthen * sb
    eq = lambda k: sum(round(b[p][k] * QM[q]) for p in b)
    eqf = lambda k: sum(round(b[p][k] * QM[q] * 1000) / 1000 for p in b)
    atk = base_atk + round(eq('atk') * sm)
    dfn = round(eq('dfn') * sm)
    hp = base_hp + round(eq('hp') * sm)
    cr = min(1.0, round(eqf('cr') * sm * 1000) / 1000)
    cd = 1.5 + eqf('cd')
    return atk, dfn, hp, cr, cd


QM = OLD_QM
ROWS = [
    ('裸装',          None, None, 0),
    ('6 件普通',      'common', None, 0),
    ('6 件优秀',      'uncommon', None, 0),
    ('6 件稀有',      'rare', None, 0),
    ('6 件史诗',      'epic', None, 0),
    ('6 件史诗 +9',   'epic', 9, 0),
    ('6 件传说 +9',   'legendary', 9, 0),
]

print(f'{"档位":<14}{"改前 攻/防/血/暴击":<34}{"改后 攻/防/血/暴击":<34}{"倍数"}')
print('-' * 100)
out = []
for name, q, st, _ in ROWS:
    if q is None:
        o = (OLD_BASE_ATK, 0, OLD_BASE_HP, 0.0, 1.5)
        n = (NEW_BASE_ATK, 0, NEW_BASE_HP, 0.0, 1.5)
    else:
        o = stats(OLD_BASE, OLD_BASE_ATK, OLD_BASE_HP, OLD_QM, OLD_SB, q, st or 0)
        n = stats(NEW_BASE, NEW_BASE_ATK, NEW_BASE_HP, NEW_QM, NEW_SB, q, st or 0)
    ratio = n[2] / o[2] if o[2] else 0
    os_ = f'{o[0]}/{o[1]}/{o[2]}/{o[3]*100:.0f}%'
    ns_ = f'{n[0]}/{n[1]}/{n[2]}/{n[3]*100:.0f}%'
    print(f'{name:<14}{os_:<34}{ns_:<34}血x{ratio:.2f}')
    out.append((name, o, n))

print()
print('=' * 100)
print('暴击率成长对比（这是这次"暴击拉大"的核心）')
print('=' * 100)
for name, q, st, _ in ROWS[1:]:
    o = stats(OLD_BASE, OLD_BASE_ATK, OLD_BASE_HP, OLD_QM, OLD_SB, q, st or 0)
    n = stats(NEW_BASE, NEW_BASE_ATK, NEW_BASE_HP, NEW_QM, NEW_SB, q, st or 0)
    print(f'  {name:<14} 改前 暴击 {o[3]*100:5.1f}% / 暴伤 {o[4]*100:.0f}%   →   改后 暴击 {n[3]*100:5.1f}% / 暴伤 {n[4]*100:.0f}%')

print()
print('=' * 100)
print('关卡难度对比（玩家打完剩下的血量比例，越低越难）')
print('=' * 100)
old_stages = [(80, 10, 240, 20), (111, 17, 334, 33), (143, 24, 429, 47), (174, 30, 523, 60),
              (206, 37, 617, 73), (237, 44, 712, 86), (269, 51, 806, 100), (300, 57, 900, 113)]
new_stages = [(125, 16, 325, 29), (315, 48, 820, 86), (430, 70, 1120, 126), (580, 100, 1510, 180),
              (840, 150, 2185, 270), (1285, 253, 3340, 455), (1800, 382, 4680, 688), (2395, 539, 6225, 970)]
print(f'  第1关 小怪 {old_stages[0][0]}血/{old_stages[0][1]}攻 → {new_stages[0][0]}血/{new_stages[0][1]}攻')
print(f'  第8关 小怪 {old_stages[7][0]}血/{old_stages[7][1]}攻 → {new_stages[7][0]}血/{new_stages[7][1]}攻')
print(f'  第8关 Boss {old_stages[7][2]}血/{old_stages[7][3]}攻 → {new_stages[7][2]}血/{new_stages[7][3]}攻')
