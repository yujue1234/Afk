# -*- coding: utf-8 -*-
"""v2 最终回归验证：用"写进代码里的真实数值"跑一遍，确认 4 件事"""
from sim import simulate

# ===== 玩家裸值（PlayerData.ts）=====
BASE_ATK, BASE_DFN, BASE_HP = 25, 0, 560

# ===== 装备部位基础值（EquipData.BASE_STATS）=====
BASE = {
    'weapon':   dict(atk=25, dfn=0,  hp=0,   cr=0.04, cd=0.00, luck=0),
    'helmet':   dict(atk=0,  dfn=10, hp=100, cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0,  dfn=16, hp=180, cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=8,  dfn=0,  hp=0,   cr=0.06, cd=0.30, luck=3),
    'boots':    dict(atk=0,  dfn=5,  hp=75,  cr=0,    cd=0,    luck=5),
    'shield':   dict(atk=0,  dfn=22, hp=145, cr=0,    cd=0,    luck=0),
}
# EquipData.QUALITY_MULTIPLIER
QM = {'common': 1.0, 'uncommon': 1.5, 'rare': 2.1, 'epic': 2.9, 'legendary': 4.0}
# EquipData.STRENGTHEN_BONUS
SB = 0.15
CRIT_CAP = 1.0

# ===== StageData.STAGES（写进代码的最终值）=====
STAGES = [
    dict(id=1, minionHp=125,  minionAtk=16,  bossHp=325,  bossAtk=29,  gold=400),
    dict(id=2, minionHp=315,  minionAtk=48,  bossHp=820,  bossAtk=86,  gold=700),
    dict(id=3, minionHp=430,  minionAtk=70,  bossHp=1120, bossAtk=126, gold=1100),
    dict(id=4, minionHp=580,  minionAtk=100, bossHp=1510, bossAtk=180, gold=2200),
    dict(id=5, minionHp=840,  minionAtk=150, bossHp=2185, bossAtk=270, gold=3000),
    dict(id=6, minionHp=1285, minionAtk=253, bossHp=3340, bossAtk=455, gold=4200),
    dict(id=7, minionHp=1800, minionAtk=382, bossHp=4680, bossAtk=688, gold=7500),
    dict(id=8, minionHp=2395, minionAtk=539, bossHp=6225, bossAtk=970, gold=10000),
]
DEFEAT_RATIO, DEFEAT_MIN = 0.25, 50


def tier_stats(q, strengthen=0):
    qm = QM[q]
    sm = 1 + strengthen * SB
    # 整数属性：普通四舍五入；暴击率/暴伤保留 3 位小数（对应 TS 里的 ×1000 再取整）
    eq = lambda k: sum(round(BASE[p][k] * qm) for p in BASE)
    eqf = lambda k: sum(round(BASE[p][k] * qm * 1000) / 1000 for p in BASE)
    atk = BASE_ATK + round(eq('atk') * sm)
    dfn = BASE_DFN + round(eq('dfn') * sm)
    hp = BASE_HP + round(eq('hp') * sm)
    cr = min(CRIT_CAP, round(eqf('cr') * sm * 1000) / 1000)
    cd = 1.5 + eqf('cd')
    return atk, dfn, hp, cr, cd


ORDER = ['naked', 'common', 'uncommon', 'rare', 'epic', 'epic+3', 'epic+6', 'epic+9',
         'legendary', 'legendary+9']
T = {
    'naked':       (BASE_ATK, BASE_DFN, BASE_HP, 0.0, 1.5),
    'common':      tier_stats('common', 0),
    'uncommon':    tier_stats('uncommon', 0),
    'rare':        tier_stats('rare', 0),
    'epic':        tier_stats('epic', 0),
    'epic+3':      tier_stats('epic', 3),
    'epic+6':      tier_stats('epic', 6),
    'epic+9':      tier_stats('epic', 9),
    'legendary':   tier_stats('legendary', 0),
    'legendary+9': tier_stats('legendary', 9),
}

print('=' * 100)
print('【验证 1】升级路线：每个档位能推到第几关（期望：第 N 档 → 第 N 关，上一档必败）')
print('=' * 100)
target = {'naked': 1, 'common': 2, 'uncommon': 3, 'rare': 4, 'epic': 5,
          'epic+3': 6, 'epic+6': 7, 'epic+9': 8}
ok1 = True
for name in ORDER:
    atk, dfn, hp, cr, cd = T[name]
    cleared, res, lefts = 0, [], []
    for st in STAGES:
        win, t, left = simulate(st, atk, dfn, hp, cr, cd)
        res.append('O' if win else 'X')
        if win:
            cleared = st['id']
            lefts.append(f"{left/hp*100:.0f}%")
        else:
            break
    tag = ''
    if name in target:
        good = cleared == target[name]
        ok1 &= good
        tag = '  OK' if good else f'  <-- 期望 {target[name]} 关！'
    print(f'{name:14s} atk={atk:5.0f} def={dfn:5.0f} hp={hp:6.0f} crit={cr*100:4.1f}%/{cd*100:.0f}%  '
          f'→ {cleared} 关  [{" ".join(res)}]  残血[{" ".join(lefts)}]{tag}')
print(f'\n结论：{"通过" if ok1 else "不通过"}')

print()
print('=' * 100)
print('【验证 2】"阶段性强"：第 N 关，第 N 档能过、第 N-1 档必败（=必须升一档才能推进）')
print('=' * 100)
ok2 = True
for s in range(1, 8):          # 第 2~8 关
    st = STAGES[s]
    cur = ORDER[s]             # 本关目标档位
    prev = ORDER[s - 1]        # 上一档
    ca, cd_, ch, ccr, ccd = T[cur]
    pa, pd_, ph, pcr, pcd = T[prev]
    cwin, ct, cleft = simulate(st, ca, cd_, ch, ccr, ccd)
    pwin, pt, pleft = simulate(st, pa, pd_, ph, pcr, pcd)
    good = cwin and not pwin
    ok2 &= good
    print(f'  第{s+1}关: {cur:10s} → {"胜" if cwin else "败"} 残血 {cleft/ch*100:4.0f}%   '
          f'| 上一档 {prev:10s} → {"胜" if pwin else "败"} 残血 {pleft/ph*100:4.0f}%   '
          f'{"OK" if good else "<-- 阶段感不足"}')
print(f'\n结论：{"通过（每关都必须升一档才能过）" if ok2 else "不通过"}')

print()
print('=' * 100)
print('【验证 3】经济节奏：每升一档要刷几把（期望 3~5 把）')
print('=' * 100)
PRICE_MULT = {'common': 1.0, 'uncommon': 1.4, 'rare': 2.0, 'epic': 3.0}


def set_price(q):
    tot = 0
    for p, b in BASE.items():
        e_atk, e_dfn, e_hp = b['atk'] * QM[q], b['dfn'] * QM[q], b['hp'] * QM[q]
        e_luck, e_cr, e_cd = b['luck'] * QM[q], b['cr'] * QM[q], b['cd'] * QM[q]
        power = e_atk * 20 + e_dfn * 12 + e_hp * 2 + e_luck * 10 + e_cr * 400 + e_cd * 200
        tot += max(1, int(power * PRICE_MULT[q]))
    return tot


prices = {q: set_price(q) for q in PRICE_MULT}
for q, prev, sid in [('uncommon', 'common', 2), ('rare', 'uncommon', 3), ('epic', 'rare', 4)]:
    gap = prices[q] - prices[prev]
    per = STAGES[sid - 1]['gold']
    print(f'  补 6 件{q:9s} 需 {gap:>7,} 金 ÷ 刷第{sid}关 {per:>6,}/把 = {gap/per:4.1f} 把')

# 强化节奏
RATES = [1.0, 0.95, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4]
cost = lambda lv: 150 * (lv + 1)
steps = [('+0→+3', range(0, 3), 5), ('+3→+6', range(3, 6), 6), ('+6→+9', range(6, 9), 7)]
for label, rng, sid in steps:
    one = sum(cost(lv) / RATES[lv] for lv in rng)
    six = one * 6
    per = STAGES[sid - 1]['gold']
    print(f'  史诗{label} 一身期望 {six:>8,.0f} 金 ÷ 刷第{sid}关 {per:>6,}/把 = {six/per:4.1f} 把')

print()
print('=' * 100)
print('【验证 4】防卡死：裸装刷第 1 关收益 + 失败保底')
print('=' * 100)
atk, dfn, hp, cr, cd = T['naked']
win, t, left = simulate(STAGES[0], atk, dfn, hp, cr, cd)
print(f'  裸装打第1关：{"胜" if win else "败"}，用时 {t}s，残血 {left}/{hp} ({left/hp*100:.0f}%)')
consol = max(DEFEAT_MIN, int(STAGES[0]['gold'] * DEFEAT_RATIO))
print(f'  第1关胜利 {STAGES[0]["gold"]} 金 / 失败保底 {consol} 金')
print(f'  开局金币 1500 + 白送 6 件普通 → 哪怕全打不过，也永远买得起下一件装备')

print()
print('=' * 100)
print('【验证 5】幸运收益（6 件普通 = 幸运 8，中期 6 稀有 = 幸运 16.8）')
print('=' * 100)
LUCK_GOLD, LUCK_DIA, LUCK_DIA_CAP = 0.01, 0.01, 0.30
for luck in (8, 17, 35):
    dchance = min(LUCK_DIA_CAP, luck * LUCK_DIA)
    print(f'  幸运 {luck:>2}：金币 +{luck*LUCK_GOLD*100:4.1f}%，掉落升档 {min(0.5, luck*0.01)*100:4.1f}%，'
          f'掉元宝 {dchance*100:4.1f}%（每把期望 {dchance:.3f} 元宝）')
