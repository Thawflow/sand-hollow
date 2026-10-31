<!-- slug: grad-final, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 60 颗：AI 也会"打磨"——家人对战（3 分钟）

> **第 60 颗**

AI 上线前 = 收集用户反馈打磨。Python 毕业 = **家人对战赛** 收集体验。

**今日口诀**：AI 上线前 = 收集用户反馈打磨。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. 家人对战 = 收集反馈
> 2. AI 模型要用户测试

<details><summary>答案</summary>

**1.** ✓ play with family, collect feedback  
**2.** ✓ beta testing

</details>

---

# W16-weekend · 打磨 + 家人对战赛

> 用时：60-90 分钟 · 难度：⭐⭐⭐ · 前置：W15 五节

---

## 一、本周武功盘点（3 分钟）

- W15-S1：random 模块（randint / choice / shuffle / sample）
- W15-S2：石头剪刀布 v1：判定逻辑
- W15-S3：多局 + 计分：打满五局
- W15-S4：beats 字典重构 + emoji
- W15-S5：文字 RPG：战斗骨架

今天：打磨 + 邀请家人对战。

## 二、打磨清单（30 分钟）

### 打磨 1：菜单清晰

```python
def main():
    print("=== Game Menu ===")
    print("1. Single battle")
    print("2. Tournament (5 battles)")
    print("3. Quit")

    choice = input("> ").strip()
    if choice == "1":
        play_round()
    elif choice == "2":
        play_tournament()
    elif choice == "3":
        print("Bye!")
```

### 打磨 2：清晰反馈

每一步都要 print 让玩家知道发生了什么：

```python
# Before:
enemy["hp"] -= dmg

# After:
old_hp = enemy["hp"]
enemy["hp"] -= dmg
print(f"You hit {enemy['name']} for {dmg}! ({old_hp} -> {enemy['hp']})")
```

### 打磨 3：保存战绩

```python
import json
import os

STATS_FILE = "rpg_stats.json"

def save_stats(stats):
    with open(STATS_FILE, "w") as f:
        json.dump(stats, f)

def load_stats():
    if os.path.exists(STATS_FILE):
        with open(STATS_FILE) as f:
            return json.load(f)
    return {"wins": 0, "losses": 0, "highest_level": 1}
```

### 打磨 4：随机事件

战斗间隙可触发随机事件：

```python
def random_event(player):
    roll = random.random()
    if roll < 0.3:
        print("You found a herb! +30 HP")
        player["hp"] = min(player["max_hp"], player["hp"] + 30)
    elif roll < 0.4:
        print("You tripped! -10 HP")
        player["hp"] = max(1, player["hp"] - 10)
    # 60% chance of nothing
```

## 三、家人对战赛（30 分钟）

### 流程

1. 给家人演示你的 RPG 战斗，让他们玩 1-2 局
2. 听他们反馈：哪里卡？哪里好？
3. 改一轮（同样只改细节，不重写）

### 常见反馈

- 「我看不懂能选什么」 → 加选项提示
- 「战斗太短不过瘾」 → 加更多敌人 / 加 boss
- 「死了想重来」 → 加重玩机制
- 「想升级但不知道规则」 → 加 help 命令

## 四、验收标准（自助验收）

- [ ] 打磨清单至少做 2 项
- [ ] 至少 2 个真人玩过
- [ ] 反馈改一轮（至少 3 处）
- [ ] 玩家能完整通关 + 升级

## 五、W15 全周自查

- [ ] S1：random 模块四件套
- [ ] S2：石头剪刀布 v1：判定逻辑
- [ ] S3：多局 + 计分
- [ ] S4：beats 字典重构 + emoji
- [ ] S5：文字 RPG 战斗骨架
- [ ] 周末：打磨 + 2 真人测试 + 改一轮
- [ ] 我能给家人完整玩一局 RPG

W16 毕业 🎮 → 进入 W17「🏆 毕业项目 🎓」。自选主题，从设计图到作品，100+ 行代码，向家人展示。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
#include <vector>
int main() {
    std::vector<int> feedback = {5, 4, 5, 3, 5};
    int sum = 0;
    for (int s : feedback) sum += s;
    std::cout << "avg = " << sum / feedback.size() << std::endl;
    return 0;
}
```

三个认脸：

1. 收集反馈评分
2. 算平均
3. Python 一样：sum(feedback) / len(feedback)

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
