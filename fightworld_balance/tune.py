# -*- coding: utf-8 -*-
"""
FightWorld 数值调优器
目标：为每关找到"刚好让目标装备档位能打过（但不是无脑过）"的怪物数值。
"""
import math
from sim import simulate

# ==================== 玩家裸值 ====================
BASE_ATK = 10
BASE_DFN = 0
BASE_HP = 220          # 100 -> 220（关键改动：血量基数太小导致前期必死）

# ==================== 装备部位基础值（新） ====================
BASE = {
    'weapon':   dict(atk=10, dfn=0, hp=0,   cr=0.03, cd=0.00, luck=0),
    'helmet':   dict(atk=0,  dfn=4, hp=40,  cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0,  dfn=6, hp=70,  cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=3,  dfn=0, hp=0,   cr=0.05, cd=0.15, luck=1),
    'boots':    dict(atk=0,  dfn=2, hp=30,  cr=0,    cd=0,    luck=2),
    'shield':   dict(atk=0,  dfn=8, hp=55,  cr=0,    cd=0,    luck=0),
}
QM = {'common': 1.0, 'uncommon': 1.35, 'rare': 1.75, 'epic': 2.3, 'legendary': 3.0}
QORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary']


def tier_stats(quality, strengthen=0):
    qm = QM[quality]
    sm = 1 + strengthen * 0.10
    atk = BASE_ATK + sum(round(BASE[p]['atk'] * qm) for p in BASE)
    dfn = BASE_DFN + sum(round(BASE[p]['dfn'] * qm) for p in BASE)
    hp = BASE_HP + sum(round(BASE[p]['hp'] * qm) for p in BASE)
    cr = sum(round(BASE[p]['cr'] * qm * 1000) / 1000 for p in BASE)
    cd = 1.5 + sum(round(BASE[p]['cd'] * qm * 1000) / 1000 for p in BASE)
    # 强化只放大装备提供的部分
    atk = BASE_ATK + round((atk - BASE_ATK) * sm)
    dfn = BASE_DFN + round((dfn - BASE_DFN) * sm)
    hp = BASE_HP + round((hp - BASE_HP) * sm)
    return atk, dfn, hp, cr, cd


TIERS = {
    'naked':      tier_stats('common', -10),  # 占位，下面手动覆盖
    'common':     tier_stats('common', 0),
    'uncommon':   tier_stats('uncommon', 0),
    'rare':       tier_stats('rare', 0),
    'epic':       tier_stats('epic', 0),
    'epic+3':     tier_stats('epic', 3),
    'epic+6':     tier_stats('epic', 6),
    'epic+9':     tier_stats('epic', 9),
    'legendary':  tier_stats('legendary', 0),
    'legendary+9': tier_stats('legendary', 9),
}
TIERS['naked'] = (BASE_ATK, BASE_DFN, BASE_HP, 0.0, 1.5)

# 每关的目标装备档位
PLAN = [
    (1, 'naked'),
    (2, 'common'),
    (3, 'uncommon'),
    (4, 'rare'),
    (5, 'epic'),
    (6, 'epic+3'),
    (7, 'epic+6'),
    (8, 'epic+9'),
]

HITS_PER_MINION = 5.0     # 目标：小怪 5 下打死
BOSS_HP_RATIO = 2.6       # Boss 血量 = 小怪 × 2.6
BOSS_ATK_RATIO = 1.8      # Boss 攻击 = 小怪 × 1.8
TARGET_DMG_RATIO = 0.60   # 目标：打完一关掉 60% 血


def make_stage(sid, h, a):
    return dict(id=sid, minionHp=int(round(h)), minionAtk=int(round(a)),
                bossHp=int(round(h * BOSS_HP_RATIO)), bossAtk=int(round(a * BOSS_ATK_RATIO)))


def dmg_taken(stage, atk, dfn, hp, cr, cd):
    """按伤害承受反推：用模拟精确计算"""
    win, t, left = simulate(stage, atk, dfn, hp, cr, cd)
    return win, hp - left


def solve_stage(sid, tier_name, prev_tier_name, verbose=True, dmg_lo=0.50, dmg_hi=0.72):
    atk, dfn, hp, cr, cd = TIERS[tier_name]
    # 小怪血量按目标手数推
    dmg_per_hit = max(1, round(atk * (1 + cr * (0.5 + (cd - 1.5)))))
    base_h = HITS_PER_MINION * dmg_per_hit

    best = None
    for h_mult in [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.6, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 0.8, 0.6, 0.5, 0.4, 0.3]:
        h = base_h * h_mult
        for a in [x * 0.5 for x in range(2, 400)]:
            st = make_stage(sid, h, a)
            win, taken = dmg_taken(st, atk, dfn, hp, cr, cd)
            if not win:
                continue
            ratio = taken / hp
            # 目标：掉血区间
            if not (dmg_lo <= ratio <= dmg_hi):
                continue
            # 上一档必须打不过（若有）
            if prev_tier_name is not None:
                pa, pd, ph, pcr, pcd = TIERS[prev_tier_name]
                pwin, _, _ = simulate(st, pa, pd, ph, pcr, pcd)
                if pwin:
                    continue
            score = abs(ratio - TARGET_DMG_RATIO) + abs(h_mult - 1.0) * 0.15
            if best is None or score < best[0]:
                best = (score, st, ratio, h_mult)
        if best:
            break
    if verbose and best:
        _, st, ratio, hm = best
        print(f'关{st["id"]}: 小怪 {st["minionHp"]}血/{st["minionAtk"]}攻  '
              f'Boss {st["bossHp"]}血/{st["bossAtk"]}攻  '
              f'| 目标档[{tier_name}] 掉血 {ratio*100:.0f}%  (血量系数x{hm:.1f})')
    return best[1] if best else None


if __name__ == '__main__':
    print('=' * 90)
    print('各档位实际数值（新配置）')
    print('=' * 90)
    for k, v in TIERS.items():
        print(f'{k:14s} atk={v[0]:5.0f} def={v[1]:5.0f} hp={v[2]:6.0f} '
              f'crit={v[3]*100:4.1f}% / {v[4]*100:.0f}%')

    print()
    print('=' * 90)
    print('求解关卡数值')
    print('=' * 90)
    stages = []
    prev = 'naked'
    idx = {t: i for i, t in enumerate(list(TIERS.keys()))}
    order = ['naked', 'common', 'uncommon', 'rare', 'epic', 'epic+3', 'epic+6', 'epic+9', 'legendary', 'legendary+9']
    for sid, tname in PLAN:
        i = order.index(tname)
        prev_name = order[i - 1] if i > 0 else None
        st = solve_stage(sid, tname, prev_name)
        if st:
            stages.append(st)

    print()
    print('=' * 90)
    print('验证：每个档位能打到第几关')
    print('=' * 90)
    for name in order:
        atk, dfn, hp, cr, cd = TIERS[name]
        res = []
        cleared = 0
        for st in stages:
            win, t, left = simulate(st, atk, dfn, hp, cr, cd)
            res.append('O' if win else 'X')
            if win:
                cleared = st['id']
            else:
                break
        print(f'{name:14s} atk={atk:5.0f} def={dfn:5.0f} hp={hp:6.0f}  → 通过 {cleared} 关  [{" ".join(res)}]')

    print()
    print('STAGES 配置：')
    for st in stages:
        print(f"    {{ id: {st['id']}, name: '?', minionHp: {st['minionHp']}, minionAtk: {st['minionAtk']}, "
              f"bossHp: {st['bossHp']}, bossAtk: {st['bossAtk']} }},")
