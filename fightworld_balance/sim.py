# -*- coding: utf-8 -*-
"""
FightWorld 数值模拟器
完整复现 BattleManager 的自动回合战斗逻辑，用于评估"什么装备能打过第几关"。
"""
import math

PLAYER_INTERVAL = 1.0     # 玩家攻击间隔
MONSTER_INTERVAL = 1.5    # 怪物攻击间隔
DT = 0.005
MAX_T = 600.0


def simulate(stage, atk, dfn, hp, crit_rate=0.0, crit_damage=1.5):
    """返回 (是否胜利, 用时秒, 剩余血量)"""
    crit_bonus = crit_damage - 1.5
    dmg = max(1, round(atk * (1 + crit_rate * (0.5 + crit_bonus))))

    waves = [(stage['minionHp'], stage['minionAtk'])] * 3 + \
            [(stage['bossHp'], stage['bossAtk'])]

    cur_hp = hp
    t = 0.0
    next_p = 0.1
    next_m = 0.5
    wi = 0
    mon_hp = waves[0][0]

    while t < MAX_T:
        t += DT
        if t >= next_p:
            next_p += PLAYER_INTERVAL
            mon_hp -= dmg
            if mon_hp <= 0:
                wi += 1
                if wi >= 4:
                    return True, round(t, 1), round(cur_hp, 1)
                mon_hp = waves[wi][0]
        if t >= next_m:
            next_m += MONSTER_INTERVAL
            m_atk = waves[wi][1]
            cur_hp -= m_atk * 100.0 / (100.0 + dfn)
            if cur_hp <= 0:
                return False, round(t, 1), 0.0
    return False, round(t, 1), round(cur_hp, 1)


# ==================== 装备数值模型 ====================
# 部位基础值（当前配置）
BASE = {
    'weapon':   dict(atk=10, dfn=0,  hp=0,   cr=0.02, cd=0.00, luck=0),
    'helmet':   dict(atk=0,  dfn=4,  hp=30,  cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0,  dfn=6,  hp=50,  cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=2,  dfn=0,  hp=0,   cr=0.03, cd=0.10, luck=1),
    'boots':    dict(atk=0,  dfn=2,  hp=20,  cr=0,    cd=0,    luck=2),
    'shield':   dict(atk=0,  dfn=8,  hp=40,  cr=0,    cd=0,    luck=0),
}
QUALITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary']
# 当前品质倍率
QM_OLD = dict(zip(QUALITY_NAMES, [1, 1.3, 1.7, 2.2, 3.0]))


def set_stats(quality_mult, base_atk=10, base_hp=100, base_dfn=0, strengthen=0.0):
    """返回穿上 6 件同品质装备后的 (atk, def, hp, critRate, critDamage)"""
    m = quality_mult * (1 + strengthen * 0.10)
    atk = base_atk + sum(round(BASE[p]['atk'] * quality_mult) for p in BASE)
    dfn = base_dfn + sum(round(BASE[p]['dfn'] * quality_mult) for p in BASE)
    hp = base_hp + sum(round(BASE[p]['hp'] * quality_mult) for p in BASE)
    cr = sum(round(BASE[p]['cr'] * quality_mult * 1000) / 1000 for p in BASE)
    cd = 1.5 + sum(round(BASE[p]['cd'] * quality_mult * 1000) / 1000 for p in BASE)
    # 强化倍率作用在装备部分
    eq_atk = atk - base_atk
    eq_dfn = dfn - base_dfn
    eq_hp = hp - base_hp
    sm = 1 + strengthen * 0.10
    return (base_atk + round(eq_atk * sm), base_dfn + round(eq_dfn * sm),
            base_hp + round(eq_hp * sm), cr, cd)


# 当前关卡表
STAGES_OLD = [
    dict(id=1, minionHp=80,  minionAtk=10, bossHp=240, bossAtk=20),
    dict(id=2, minionHp=111, minionAtk=17, bossHp=334, bossAtk=33),
    dict(id=3, minionHp=143, minionAtk=24, bossHp=429, bossAtk=47),
    dict(id=4, minionHp=174, minionAtk=30, bossHp=523, bossAtk=60),
    dict(id=5, minionHp=206, minionAtk=37, bossHp=617, bossAtk=73),
    dict(id=6, minionHp=237, minionAtk=44, bossHp=712, bossAtk=86),
    dict(id=7, minionHp=269, minionAtk=51, bossHp=806, bossAtk=100),
    dict(id=8, minionHp=300, minionAtk=57, bossHp=900, bossAtk=113),
]

if __name__ == '__main__':
    print('=' * 78)
    print('【当前版本】各装备档位 → 能通关的最高关卡')
    print('=' * 78)
    tiers = []
    for q in QUALITY_NAMES:
        tiers.append((f'6件{q}', set_stats(QM_OLD[q]), 0))
    tiers.append(('6件史诗+9', set_stats(QM_OLD['epic'], strengthen=9), 9))
    tiers.append(('6件传说+9', set_stats(QM_OLD['legendary'], strengthen=9), 9))
    tiers.append(('裸装', (10, 0, 100, 0, 1.5), 0))

    for name, st, _ in tiers:
        atk, dfn, hp, cr, cd = st
        cleared = 0
        detail = []
        for s in STAGES_OLD:
            win, t, left = simulate(s, atk, dfn, hp, cr, cd)
            detail.append('O' if win else 'X')
            if win:
                cleared = s['id']
            else:
                break
        print(f'{name:14s} atk={atk:5.1f} def={dfn:4.1f} hp={hp:5.1f} '
              f'crit={cr*100:4.1f}%/{cd*100:.0f}%  → 通过 {cleared} 关   '
              f'[{" ".join(detail)}]')
