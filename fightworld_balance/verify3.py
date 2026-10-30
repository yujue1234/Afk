# -*- coding: utf-8 -*-
"""
verify3.py —— 第三轮改动（新手装直接穿戴 + 关卡解锁）的回归验证

验证三件事：
  1. 开局自动穿 6 件普通后，玩家实际战力如何（能不能轻松过第 1 关、第 2 关紧不紧张）
  2. 原有的"每档装备 → 每关"映射有没有被破坏（这是数值平衡的地基）
  3. 关卡解锁链条：通关第 N 关后，恰好只解锁第 N+1 关
"""
import io
import sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from sim import simulate

# ==================== 从 TS 抄过来的最终数值（必须与代码逐字一致） ====================
BASE = {
    'weapon':   dict(atk=25, dfn=0,  hp=0,   cr=0.04, cd=0.00, luck=0),
    'helmet':   dict(atk=0,  dfn=10, hp=100, cr=0,    cd=0,    luck=0),
    'armor':    dict(atk=0,  dfn=16, hp=180, cr=0,    cd=0,    luck=0),
    'necklace': dict(atk=8,  dfn=0,  hp=0,   cr=0.06, cd=0.30, luck=3),
    'boots':    dict(atk=0,  dfn=5,  hp=75,  cr=0,    cd=0,    luck=5),
    'shield':   dict(atk=0,  dfn=22, hp=145, cr=0,    cd=0,    luck=0),
}
QM = {'common': 1.0, 'uncommon': 1.5, 'rare': 2.1, 'epic': 2.9, 'legendary': 4.0}
STRENGTHEN_BONUS = 0.15
CRIT_RATE_CAP = 1.0

PLAYER_BASE_ATK = 25
PLAYER_BASE_DFN = 0
PLAYER_BASE_HP = 560

STAGES = [
    dict(id=1, name='矿洞入口', minionHp=125,  minionAtk=16,  bossHp=325,  bossAtk=29),
    dict(id=2, name='迷雾沼泽', minionHp=315,  minionAtk=48,  bossHp=820,  bossAtk=86),
    dict(id=3, name='骸骨荒原', minionHp=430,  minionAtk=70,  bossHp=1120, bossAtk=126),
    dict(id=4, name='熔岩裂谷', minionHp=580,  minionAtk=100, bossHp=1510, bossAtk=180),
    dict(id=5, name='幽暗森林', minionHp=840,  minionAtk=150, bossHp=2185, bossAtk=270),
    dict(id=6, name='霜冻废墟', minionHp=1285, minionAtk=253, bossHp=3340, bossAtk=455),
    dict(id=7, name='天空遗迹', minionHp=1800, minionAtk=382, bossHp=4680, bossAtk=688),
    dict(id=8, name='深渊魔域', minionHp=2395, minionAtk=539, bossHp=6225, bossAtk=970),
]

r3 = lambda x: round(x * 1000) / 1000


def equip_stats(quality, lv=0):
    """6 件同品质装备、同一强化等级，逐件 round 后累加（与 BagManager.recomputeStats 一致）"""
    qm = QM[quality]
    sm = 1 + lv * STRENGTHEN_BONUS
    t = dict(atk=0, dfn=0, hp=0, cr=0.0, cd=0.0, luck=0)
    for b in BASE.values():
        t['atk'] += round(round(b['atk'] * qm) * sm)
        t['dfn'] += round(round(b['dfn'] * qm) * sm)
        t['hp'] += round(round(b['hp'] * qm) * sm)
        t['cr'] += r3(r3(b['cr'] * qm) * sm)
        t['cd'] += r3(r3(b['cd'] * qm) * sm)
        t['luck'] += round(round(b['luck'] * qm) * sm)
    return t


def player_stats(quality, lv=0):
    e = equip_stats(quality, lv)
    return (
        PLAYER_BASE_ATK + e['atk'],
        PLAYER_BASE_DFN + e['dfn'],
        PLAYER_BASE_HP + e['hp'],
        min(CRIT_RATE_CAP, e['cr']),
        1.5 + e['cd'],
        e['luck'],
    )


def win_rate_scan(stats, label):
    """从第 1 关开始一路打，返回(能通关的最高关, 每关结果字符串)"""
    atk, dfn, hp, cr, cd, _ = stats
    best, marks, detail = 0, [], []
    for s in STAGES:
        win, t, left = simulate(s, atk, dfn, hp, cr, cd)
        marks.append('O' if win else 'X')
        if win:
            best = s['id']
            detail.append(f"{s['id']}关 {t}s 残血{left / hp * 100:.0f}%")
        else:
            detail.append(f"{s['id']}关 败")
            break
    print(f"  {label:16s} 攻{atk:4d} 防{dfn:4d} 血{hp:5d} 暴击{cr * 100:4.1f}%/暴伤{cd * 100:.0f}%"
          f"  → 最高通过 {best} 关  [{' '.join(marks)}]")
    return best, detail


print('=' * 92)
print('【验证 1】开局白送 6 件普通并直接穿戴后，玩家的真实战力')
print('=' * 92)
starter = player_stats('common', 0)
print(f"  开局属性：攻 {starter[0]}  防 {starter[1]}  血 {starter[2]}  "
      f"暴击 {starter[3] * 100:.1f}%  暴伤 {starter[4] * 100:.0f}%  幸运 {starter[5]}")
print()
win_rate_scan(starter, '开局(6普通)')
win_rate_scan((PLAYER_BASE_ATK, PLAYER_BASE_DFN, PLAYER_BASE_HP, 0, 1.5, 0), '假设裸装')
print()

print('=' * 92)
print('【验证 2】各装备档位 → 关卡映射（回归，确认数值地基没被破坏）')
print('=' * 92)
order = [
    ('6件普通', 'common', 0), ('6件优秀', 'uncommon', 0), ('6件稀有', 'rare', 0),
    ('6件史诗', 'epic', 0), ('6件史诗+3', 'epic', 3), ('6件史诗+6', 'epic', 6),
    ('6件史诗+9', 'epic', 9), ('6件传说+9', 'legendary', 9),
]
expect = {0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 8}
all_ok = True
for i, (name, q, lv) in enumerate(order):
    best, _ = win_rate_scan(player_stats(q, lv), name)
    if best != expect[i]:
        all_ok = False
        print(f"    !! 期望通过 {expect[i]} 关，实际 {best} 关")
print()
print(f"  档位映射结论：{'全部符合预期' if all_ok else '存在偏差，需要检查'}")
print()

print('=' * 92)
print('【验证 3】关卡解锁链条 —— 通关第 N 关后，恰好只解锁第 N+1 关')
print('=' * 92)


def unlocked(idx, cleared):
    """与 PlayerData.isStageUnlocked 同构：idx<=0 恒开；否则要求上一关 id 已在 cleared 里"""
    if idx <= 0:
        return True
    prev = STAGES[idx - 1] if idx - 1 < len(STAGES) else None
    if prev is None:
        return True
    return prev['id'] in cleared


def state_str(cleared):
    return ' '.join(f"{s['name']}{'开' if unlocked(i, cleared) else '锁'}"
                    for i, s in enumerate(STAGES))


cleared = set()
print(f"  新号初始      ：{state_str(cleared)}")
ok = True
if not unlocked(0, cleared):
    ok = False
    print('    !! 第 1 关必须默认解锁')
for i in range(8):
    # 打第 i 关前，它必须是解锁的
    if not unlocked(i, cleared):
        ok = False
        print(f"    !! 第 {i + 1} 关本应已解锁，实际是锁的")
    # 打第 i 关时，第 i+1 关必须还是锁的
    if i + 1 < 8 and unlocked(i + 1, cleared):
        ok = False
        print(f"    !! 还没通关第 {i + 1} 关，第 {i + 2} 关就解锁了")
    cleared.add(STAGES[i]['id'])
    print(f"  通关第 {i + 1} 关后：{state_str(cleared)}")
print()
print(f"  解锁链条结论：{'完全正确（严格逐关解锁）' if ok else '有问题，需要检查'}")
