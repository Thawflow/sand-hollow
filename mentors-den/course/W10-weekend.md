<!-- slug: function-adventure-refactor, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 36 颗：AI 也会"工程化"——实战重构（3 分钟）

> **第 36 颗**

AI 模型上线 = 完整工程化（train/eval/save/load 拆函数）。**实战重构**是 AI 工程师的核心能力。

**今日口诀**：AI 模型上线 = 完整工程化（train/eval/save/load 拆函数）。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. AI 训练要拆 train/eval 函数
> 2. 实战重构 = 工程化

<details><summary>答案</summary>

**1.** ✓ def train(); def eval(); def save()  
**2.** ✓ 重复代码变函数 = 重构

</details>

---

# W10-weekend · 用函数改造冒险游戏里的重复代码

> 用时：60-90 分钟 · 难度：⭐⭐⭐ · 前置：W08 三课

---

## 一、本周武功盘点（3 分钟）

- def 函数定义：写一次，处处调用
- 参数：挖凹槽 + 默认值 + 关键字调用
- return：函数交货，调用方能接力

今天把这些用上——把 W07 猫咪冒险岛里的「复制粘贴」抽成函数。

## 二、项目：函数化改造（40 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `cat_adventure_v4.py`（基于 W07 改）。

### 改造 1：抽 show_room 函数

每个房间的 print 重复结构，**抽成一个函数**：

```python
def show_room(name, description, choices):
    print(f"\n--- {name} ---")
    print(description)
    print(f"Choices: {choices}")
    return input("> ").strip().lower()
```

调用：

```python
if room == "shrine":
    choice = show_room(
        "Cat Shrine",
        "You stand at the old shrine. Paths lead north and east.",
        "(north/east)",
    )
```

跑两遍：相同 print 结构，输入不同的 choice。

### 改造 2：抽 print_status 函数

玩家状态经常要 print：

```python
def print_status(player):
    print(f"\n=== {player['name']} ===")
    print(f"HP: {player['hp']}/{player['max_hp']}")
    print(f"ATK: {player['attack']}")
    print(f"DEF: {player['defense']}")
    if player["inventory"]:
        print(f"Inventory: {', '.join(player['inventory'])}")
    else:
        print("Inventory: (empty)")
```

战斗前后各调一次。

### 改造 3：抽 use_item 函数（已 W07 写过）

复用 W07-L03 的版本，加 return True/False。

### 改造 4：抽 save_game / load_game（进阶）

```python
import json

def save_game(player, room):
    data = {"player": player, "room": room}
    with open("save.json", "w") as f:
        json.dump(data, f)
    print("Game saved!")

def load_game():
    with open("save.json") as f:
        data = json.load(f)
    print("Game loaded!")
    return data["player"], data["room"]
```

`json.dump` / `json.load` 是 Python 自带的「对象 ↔ 文件」转换。**重点不是 JSON 本身，是 use 函数 + 文件读写 + try-except 错误处理**。

主循环里：

```python
if choice == "save":
    save_game(player, room)
elif choice == "load":
    player, room = load_game()
```

## 三、实战：清点重复（20 分钟）

把 W07 的 v3 找一遍「重复出现 2 次以上」的代码段：

| 重复模式 | 抽函数 |
|---|---|
| `print(f"\n--- {name} ---")` 多次 | `show_room()` |
| `print(f"HP: {hp}/{max}")` 多次 | `print_status()` |
| 战斗后回血判断 | `clamp(value, max)`（封顶）|
| 玩家 + 敌人攻击伤害公式 | `calc_dmg(attacker_atk, defender_def)` |

把每处都抽出来，**改造前后跑通测试**，确认行为一致。

## 四、验收标准（自助验收）

- [ ] 至少抽 3 个函数（show_room / print_status / 至少一个战斗相关）
- [ ] 每个函数有 def + 文档（"""一句话说清做什么"""）
- [ ] 函数改造前后跑通测试，行为不变
- [ ] 调用方代码可读性明显提升（少 30%+ 行数）
- [ ] 进阶：save_game / load_game 跑通

## 五、W08 全周自查

- [ ] L01：def 写函数，调用加 ()
- [ ] L02：参数 / 关键字参数 / 默认值 分得清
- [ ] L03：return vs print 分得清，能写提前退出
- [ ] 周末：至少 3 个函数抽出来，代码更清爽
- [ ] 我能给家人解释「函数 = 写一次、处处调用、还能交货」

W08 毕业 🎓 → 进入 W09「turtle：编程画画」。**视觉化编程**登场——前面的代码都是数字 + 文字，turtle 让你看到自己写的代码画出一幅画。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
void train() { std::cout << "training..." << std::endl; }
void eval()  { std::cout << "eval..." << std::endl; }
void save()  { std::cout << "save..." << std::endl; }
int main() {
    train(); eval(); save();
    return 0;
}
```

三个认脸：

1. 3 个函数 = 工程化
2. main 里调用 3 个步骤
3. Python 一样：def train/eval/save()

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
