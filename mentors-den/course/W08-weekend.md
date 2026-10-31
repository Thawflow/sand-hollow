<!-- slug: cat-adventure, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 30 颗：AI 也会"打磨"——多人测试（3 分钟）

> **第 30 颗**

AI 模型上线前 = 多人测试（找 bug/调优）。**多人测试** = 收集反馈 → 改进。

**今日口诀**：AI 模型上线前 = 多人测试（找 bug/调优）。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. AI 模型要测试
> 2. 多人测试找 bug

<details><summary>答案</summary>

**1.** ✓ A/B testing  
**2.** ✓ beta testing

</details>

---

# W08-weekend · 猫咪冒险岛 · 打磨 + 多人测试

> 用时：90-120 分钟 · 难度：⭐⭐⭐⭐ · 前置：W08 五节

---

## 一、本周武功盘点（3 分钟）

- S1 画地图：先想后写
- S2 最小骨架：三房间走通
- S3 玩家状态：HP 和道具栏
- S4 战斗逻辑：回合攻防
- S5 Boss 战 + 胜负判定：通关！

今天把游戏打磨到「**家人愿意完整玩一局**」的程度，然后请 3 个真人测一遍。

## 二、打磨清单（30 分钟）

按优先级做这几件——每件都是「从能玩到好玩」的关键：

### 打磨 1：清晰的提示文案

每个房间的 `print` 至少要说清：

- **你现在在哪**（房间名）
- **你看到什么**（环境 + 敌人 + 道具）
- **你能做什么**（可输入的选项）

❌ Bad：

```python
print("Forest")
choice = input("> ")
```

✅ Good：

```python
print("\n--- Whispering Forest ---")
print("Tall oaks block the sky. A gray wolf snarls at you.")
print("Choices: (fight/run)")
choice = input("> ")
```

### 打磨 2：输入容错

用户可能输入 `Fight`（大写）/ ` fight `（带空格）/ `gg`（瞎打）。

```python
choice = input("> ").strip().lower()
```

**两招搞定**：`strip()` 去前后空格，`lower()` 全小写。然后所有 if 都跟小写比。

### 打磨 3：回血 / 加攻击有反馈

不能默默改数据，必须 print：

```python
if item["effect"] == "heal":
    old = player["hp"]
    player["hp"] = min(player["max_hp"], player["hp"] + item["value"])
    gained = player["hp"] - old
    print(f"Used {item['name']}! +{gained} HP (now {player['hp']}/{player['max_hp']})")
```

**显示「变了多少」+ 「现在是多少」**——玩家一眼看到反馈。

### 打磨 4：保存最佳战绩

把分数（通关剩余 HP）写到文件：

```python
# After victory
score = player["hp"] * 10 + player["attack"]
with open("best_score.txt", "a") as f:
    f.write(f"{score}\n")

# Show top 3
with open("best_score.txt") as f:
    scores = sorted([int(line) for line in f], reverse=True)
print("\n=== Top Scores ===")
for i, s in enumerate(scores[:3]):
    print(f"{i+1}. {s}")
```

跟 W05-weekend 排行榜同款套路。

### 打磨 5：ASCII 标题

```python
print("""
 /\_/\  
( o.o ) 
 > ^ < 
=== Cat Adventure ===
""")
```

简单 ASCII 猫脸，让开场有仪式感。

## 三、邀请 3 个真人测（30 分钟）

**这是项目周最重要的一步**——自己测和自己玩是两回事。

### 测试流程

找 3 个不会编程的家人/朋友，让他们各自完整玩一局：

1. 你在旁边观察 + 记笔记（**不提示**）
2. 看他们卡在哪、问什么问题、笑/吐槽在哪
3. 玩完问三个问题：
   - 「你最喜欢哪个部分？」
   - 「哪个地方最让你卡住？」
   - 「你会想再玩一次吗？」

### 收集反馈

记下每个人的回答 + 卡点。下一步就是根据反馈改。

### 常见反馈模式

- **「我看不懂能做什么」** → print 文案不够清楚（打磨 1 没做到位）
- **「输了不知道发生了什么」** → game_over 太突然，加死亡描述
- **「打完 Boss 没什么成就感」** → 加胜利徽章 + 通关动画
- **「我想存个档下次玩」** → W10 字典学了可以加 save/load

## 四、根据反馈改一轮（30 分钟）

按反馈优先级（影响最大 → 最易改）排：

1. **卡死的地方**（如果有人走不出去 = 严重 bug，必修）
2. **看不懂的提示**（改成清楚的文案）
3. **想要的彩蛋**（如果简单就加）

**这一轮不要重写，只改细节。**项目周不是重写周。

## 五、验收标准（自助验收）

- [ ] 打磨清单 5 项至少做 3 项
- [ ] 至少 3 个真人测过，记下反馈
- [ ] 根据反馈改了至少 3 处
- [ ] 你能向家人 / 朋友完整演示一局，零崩溃
- [ ] 测的人里至少 1 个说「想再玩一次」或「想推荐给别人」

## 六、W08 全周自查

- [ ] S1：画地图：先想后写
- [ ] S2：最小骨架：三房间走通
- [ ] S3：玩家状态：HP 和道具栏
- [ ] S4：战斗逻辑：回合攻防
- [ ] S5：Boss 战 + 胜负判定：通关！
- [ ] 周末：打磨清单 5 项中至少 3 项 + 3 真人测试 + 反馈改一轮
- [ ] 我能给 mentor 演示一局完整通关

W08 毕业 🏆 → 进入 W09「加餐②：贪心算法」。有些问题不用把所有可能都试一遍——选对策略就够快，加餐②登场。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
#include <vector>
int main() {
    std::vector<int> feedback = {5, 4, 3, 5, 4};
    int sum = 0;
    for (int s : feedback) sum += s;
    std::cout << "avg = " << sum / feedback.size() << std::endl;
    return 0;
}
```

三个认脸：

1. 收集反馈评分
2. `sum / feedback.size()` 算平均
3. Python 一样：sum(feedback) / len(feedback)

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
