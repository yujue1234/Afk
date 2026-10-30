# -*- coding: utf-8 -*-
"""
FightWorld 数值调优器 v2 —— 数值整体"拉长"版

需求（2026-09-11 第二轮）：
  1. 装备数值整体拉大（约 2.5x）
  2. 暴击数值适当拉大
  3. 难度加大一点（打完剩血更少）
  4. 让"阶段性变强"更明显（上一档必须打不过下一关）

设计：
  - 玩家裸值 / 装备基础值 / 品质倍率 / 强化倍率 一起拉长
  - 品质倍率 1 / 1.5 / 2.1 / 2.9 / 4.0（原来 1/1.35/1.75/2.3/3.0）
  - 强化每级 +15%（原来 +10%）
  - 目标：对应档位打完剩 22%~38% 血（原来 40%），且上一档必败
"""
import math
from sim import simulate

# ==================== 玩家裸值（拉长 2.5x） ====================
BASE_ATK = 25
BASE_DFN = 0
BASE_HP = 560

# ==================== 装备部位基础值（拉长 ~2.5x，暴击单独加强） ====================
BASE = {
    'weapon':   dict(atk=25, dfn=0,  hp=0,   cr=0.04, cd=0.00, luck=0),
    'helmet':   dict(atk=0,  dfn=10, hp=100, cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0,  dfn=16, hp=180, cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=8,  dfn=0,  hp=0,   cr=0.06, cd=0.30, luck=3),
    'boots':    dict(atk=0,  dfn=5,  hp=75,  cr=0,    cd=0,    luck=5),
    'shield':   dict(atk=0,  dfn=22, hp=145, cr=0,    cd=0,    luck=0),
}
QM = {'common': 1.0, 'uncommon': 1.5, 'rare': 2.1, 'epic': 2.9, 'legendary': 4.0}
QORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary']
STRENGTHEN_BONUS = 0.15

# 暴击率上限：防止"品质倍率 × 强化倍率"两层乘算后超过 100%（溢出部分无意义）
CRIT_RATE_CAP = 1.0


def tier_stats(quality, strengthen=0):
    qm = QM[quality]
    sm = 1 + strengthen * STRENGTHEN_BONUS
    atk = BASE_ATK + sum(round(BASE[p]['atk'] * qm) for p in BASE)
    dfn = BASE_DFN + sum(round(BASE[p]['dfn'] * qm) for p in BASE)
    hp = BASE_HP + sum(round(BASE[p]['hp'] * qm) for p in BASE)
    cr = sum(round(BASE[p]['cr'] * qm * 1000) / 1000 for p in BASE)
    cd = 1.5 + sum(round(BASE[p]['cd'] * qm * 1000) / 1000 for p in BASE)
    atk = BASE_ATK + round((atk - BASE_ATK) * sm)
    dfn = BASE_DFN + round((dfn - BASE_DFN) * sm)
    hp = BASE_HP + round((hp - BASE_HP) * sm)
    cr = min(CRIT_RATE_CAP, round(cr * sm * 1000) / 1000)
    return atk, dfn, hp, cr, cd


ORDER = ['naked', 'common', 'uncommon', 'rare', 'epic', 'epic+3', 'epic+6', 'epic+9',
         'legendary', 'legendary+3', 'legendary+6', 'legendary+9']

TIERS = {
    'naked':        (BASE_ATK, BASE_DFN, BASE_HP, 0.0, 1.5),
    'common':       tier_stats('common', 0),
    'uncommon':     tier_stats('uncommon', 0),
    'rare':         tier_stats('rare', 0),
    'epic':         tier_stats('epic', 0),
    'epic+3':       tier_stats('epic', 3),
    'epic+6':       tier_stats('epic', 6),
    'epic+9':       tier_stats('epic', 9),
    'legendary':    tier_stats('legendary', 0),
    'legendary+3':  tier_stats('legendary', 3),
    'legendary+6':  tier_stats('legendary', 6),
    'legendary+9':  tier_stats('legendary', 9),
}

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
TARGET_DMG_RATIO = 0.72   # 目标：打完一关掉 72% 血（比上一版 60% 更难）
DMG_LO = 0.64
DMG_HI = 0.80


def make_stage(sid, h, a):
    return dict(id=sid, minionHp=int(round(h)), minionAtk=int(round(a)),
                bossHp=int(round(h * BOSS_HP_RATIO)), bossAtk=int(round(a * BOSS_ATK_RATIO)))


def solve_stage(sid, tier_name, prev_tier_name, verbose=True, dmg_lo=DMG_LO, dmg_hi=DMG_HI):
    atk, dfn, hp, cr, cd = TIERS[tier_name]
    dmg_per_hit = max(1, round(atk * (1 + cr * (0.5 + (cd - 1.5)))))
    base_h = HITS_PER_MINION * dmg_per_hit

    best = None
    for h_mult in [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2,
                   3.6, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]:
        h = base_h * h_mult
        for a in [x * 1.0 for x in range(2, 600)]:
            st = make_stage(sid, h, a)
            win, t, left = simulate(st, atk, dfn, hp, cr, cd)
            if not win:
                continue
            ratio = (hp - left) / hp
            if not (dmg_lo <= ratio <= dmg_hi):
                continue
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
        print(f'关{st["id"]}: 小怪 {st["minionHp"]:>5}血/{st["minionAtk"]:>3}攻  '
              f'Boss {st["bossHp"]:>5}血/{st["bossAtk"]:>3}攻  '
              f'| [{tier_name}] 掉血 {ratio*100:.0f}%  (血量系数x{hm:.2f})')
    return best[1] if best else None


if __name__ == '__main__':
    print('=' * 96)
    print('各档位实际数值（v2 拉长配置）')
    print('=' * 96)
    for k in ORDER:
        v = TIERS[k]
        print(f'{k:14s} atk={v[0]:6.0f} def={v[1]:6.0f} hp={v[2]:7.0f} '
              f'crit={v[3]*100:5.1f}% / {v[4]*100:.0f}%')

    print()
    print('=' * 96)
    print('求解关卡数值')
    print('=' * 96)
    stages = []
    for sid, tname in PLAN:
        i = ORDER.index(tname)
        prev_name = ORDER[i - 1] if i > 0 else None
        st = solve_stage(sid, tname, prev_name)
        if st:
            stages.append(st)

    print()
    print('=' * 96)
    print('验证：每个档位能打到第几关')
    print('=' * 96)
    for name in ORDER:
        atk, dfn, hp, cr, cd = TIERS[name]
        res, cleared = [], 0
        for st in stages:
            win, t, left = simulate(st, atk, dfn, hp, cr, cd)
            res.append('O' if win else 'X')
            if win:
                cleared = st['id']
            else:
                break
        print(f'{name:14s} atk={atk:6.0f} def={dfn:6.0f} hp={hp:7.0f}  → 通过 {cleared} 关  '
              f'[{" ".join(res)}]')

    print()
    print('=' * 96)
    print('STAGES 配置（直接抄进 StageData.ts）')
    print('=' * 96)
    for st in stages:
        print(f"    {{ id: {st['id']}, minionHp: {st['minionHp']}, minionAtk: {st['minionAtk']}, "
              f"bossHp: {st['bossHp']}, bossAtk: {st['bossAtk']} }},")
