<!-- slug: random-rpg-final, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 54 颗：AI 也会"完整文字 RPG"——random + 战斗（3 分钟）

> **第 42 颗**

AI 训练 = 复盘上次错误再练。Python "再来一次"= **复盘** 练过的内容。

**今日口诀**：文字 RPG = 随机战斗 + 状态机。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. 文字 RPG 用 random 生成敌人
> 2. 文字 RPG 用 while True 循环

<details><summary>答案</summary>

**1.** ✓ random.choice 选敌人  
**2.** ✓ while state == "battle"

</details>

---

# W15-weekend · 文字 RPG 完整版 + 战斗系统

> 用时：60-90 分钟 · 难度：⭐⭐⭐⭐ · 前置：W09 三课

---

## 一、本周武功盘点（3 分钟）

- W15-S1：`random.choice` / `randint` / `random.shuffle` 三招
- W15-S2：石头剪刀布 v1 → 完整版（多局 + 计分 + beats 字典）
- W15-S3：文字 RPG 战斗骨架（while + 状态 + 扣血 + 判定）

今天把三课代码**打包**成一个完整的文字 RPG——**敌人随机 + 战斗循环 + 升级系统 + save/load**。

## 二、项目 A：文字 RPG 完整版（50 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `rpg_final.py`。

### 第 1 步 · 玩家和敌人数据（5 分钟）

```python
import random
import json

def new_player():
    return {"name": "勇者", "hp": 100, "atk": 15, "gold": 0}

def new_enemy(level):
    enemies = [
        {"name": "史莱姆", "hp": 30, "atk": 5, "gold": 5},
        {"name": "狼", "hp": 50, "atk": 10, "gold": 15},
        {"name": "哥布林", "hp": 80, "atk": 12, "gold": 25},
        {"name": "龙", "hp": 200, "atk": 25, "gold": 100},
    ]
    # 随机选 1 个，等级越高敌人越强
    e = random.choice(enemies)
    e["hp"] += level * 10
    e["atk"] += level * 2
    return e
```

### 第 2 步 · 战斗循环（15 分钟）

```python
def battle(player, enemy):
    """战斗循环：双方轮流扣血，返回赢家"""
    print(f"\n⚔️ {player['name']} VS {enemy['name']}!")
    while player["hp"] > 0 and enemy["hp"] > 0:
        # 玩家攻击
        dmg = random.randint(player["atk"] - 3, player["atk"] + 3)
        enemy["hp"] -= dmg
        print(f"  {player['name']} 攻击 → {enemy['name']} 扣 {dmg} HP (剩 {enemy['hp']})")
        if enemy["hp"] <= 0:
            break
        # 敌人攻击
        dmg = random.randint(enemy["atk"] - 2, enemy["atk"] + 2)
        player["hp"] -= dmg
        print(f"  {enemy['name']} 攻击 → {player['name']} 扣 {dmg} HP (剩 {player['hp']})")
    if player["hp"] > 0:
        print(f"  🎉 {player['name']} 胜利！获得 {enemy['gold']} gold")
        player["gold"] += enemy["gold"]
        return "win"
    else:
        print(f"  💀 {player['name']} 战败...")
        return "lose"
```

### 第 3 步 · 主循环 + 升级 + 商店（15 分钟）

```python
def shop(player):
    """升级系统：用 gold 买 HP / ATK"""
    print(f"\n🏪 商店 (你有 {player['gold']} gold)")
    print("  1. 补血 30HP → 10 gold")
    print("  2. 加攻击 +5 → 20 gold")
    choice = input("  选 [1/2/0=离开]: ")
    if choice == "1" and player["gold"] >= 10:
        player["hp"] += 30
        player["gold"] -= 10
        print("  ✓ HP+30")
    elif choice == "2" and player["gold"] >= 20:
        player["atk"] += 5
        player["gold"] -= 20
        print("  ✓ ATK+5")

def main():
    player = new_player()
    level = 1
    while player["hp"] > 0:
        print(f"\n=== 关卡 {level} ===")
        enemy = new_enemy(level)
        result = battle(player, enemy)
        if result == "lose":
            print("\n游戏结束！")
            break
        # 战后：补血 + 商店
        player["hp"] = min(100, player["hp"] + 20)
        shop(player)
        level += 1
    print(f"\n最终等级：{level - 1} | 总 gold：{player['gold']}")

if __name__ == "__main__":
    main()
```

### 第 4 步 · save/load（5 分钟）

```python
SAVE_FILE = "rpg_save.json"

def save(player, level):
    with open(SAVE_FILE, "w") as f:
        json.dump({"player": player, "level": level}, f)
    print("  💾 已存档")

def load():
    try:
        with open(SAVE_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return None
```

**要求**：
- 至少有 4 种敌人（史莱姆/狼/哥布林/龙）
- 每关敌人越来越强（HP 和 ATK 随 level 增加）
- 战斗日志打印清晰（双方各扣多少血）
- 战后可以补血 / 升级
- 通关条件：打到 5 关 = 战胜 level 5 敌人

## 三、验收标准

- 能跑通完整流程（新手 → 史莱姆 → 狼 → ... → 龙）
- 战斗日志清晰可读
- 输血 / 升级系统工作
- 至少能存一次档、读一次档

## 四、扩展挑战（选做）

- 加 BOSS 关卡（每 5 关一只龙）
- 加技能系统（暴击、回血）
- 加随机事件（捡到宝箱、遇到商人）

---

🎮 玩够 5 关 = 文字 RPG 毕业。下一课 W16 选毕业选题 → W17 做完整毕业项目！


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 里的文字 RPG 战斗：

```cpp
#include <iostream>
#include <cstdlib>
int main() {
    int player_hp = 100, enemy_hp = 50;
    while (player_hp > 0 && enemy_hp > 0) {
        int dmg = rand() % 20 + 5;  // 5-24 随机伤害
        enemy_hp -= dmg;
        std::cout << "player attack: " << dmg << std::endl;
        if (enemy_hp <= 0) break;
        int edmg = rand() % 10 + 3;
        player_hp -= edmg;
        std::cout << "enemy attack: " << edmg << std::endl;
    }
    return 0;
}
```

三个认脸：

1. `#include <cstdlib>` 领 `rand()` 工具箱（Python 的 `random`）
2. `rand() % 20 + 5` = 5-24 随机整数（Python `random.randint(5, 24)`）
3. C++ 战斗循环 `while (hp > 0)` 必须有终止条件（不然死循环）

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
