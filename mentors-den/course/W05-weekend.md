<!-- slug: guess-game, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 18 颗：AI 也会"反复玩"——再来一局（3 分钟）

> **第 18 颗**

AI 训练 = 反复用同一数据集训练。猜数字"再来一局"= **外层 while True** + 内层游戏逻辑。

**今日口诀**：AI 训练 = 反复用同一数据集训练。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. 猜数字"再来一局"用外层 while True
> 2. AI 训练也用外层 epoch 循环

<details><summary>答案</summary>

**1.** ✓ while True: play(); if input("再来？") != "y": break  
**2.** ✓ for epoch in range(100):

</details>

---

# W05-weekend · 打磨猜数字：限 5 次 + 计分 + 再来一局

> 用时：60-90 分钟 · 难度：⭐⭐⭐⭐ · 前置：W05 三课

---

## 一、本周武功盘点（3 分钟）

- while 循环：条件不满足就一直转
- break / continue：喊停 / 跳过这一轮
- while...else：没被 break 才执行的 else
- 嵌套 while：外层管多局，内层管每局

今天把猜数字打磨到「能分享给家人朋友」的程度。

## 二、项目 A：完整计分版（30 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `guess_pro.py`。

需求：

- 电脑从 1-100 随机想一个数
- 玩家最多猜 7 次
- 猜中得分：100 - 10 * tries（最少 30 分）
- 多局累加总分
- 玩家可随时输入 `quit` 退出（中途退不算分）

参考实现：

```python
import random

print("=== Pro Number Guess ===")

total_score = 0
games_played = 0

while True:
    secret = random.randint(1, 100)
    guess = None
    tries = 0
    max_tries = 7
    won = False

    while tries < max_tries:
        guess_raw = input(f"\nGame {games_played + 1} · Try {tries + 1}/{max_tries}: ")
        if guess_raw == "quit":
            break
        guess = int(guess_raw)
        tries += 1

        if guess > secret:
            print("Too high!")
        elif guess < secret:
            print("Too low!")
        else:
            score = max(30, 100 - 10 * tries)
            total_score += score
            won = True
            print(f"Correct in {tries} tries! +{score} points")
            break

    if not won and guess_raw != "quit":
        print(f"Out of tries. Answer: {secret}")

    if guess_raw == "quit":
        print(f"\nFinal score: {total_score} points in {games_played} games")
        break

    games_played += 1
    print(f"Total so far: {total_score} points")

    play = input("Play again? (yes/no): ")
    if play != "yes":
        print(f"\nFinal score: {total_score} points in {games_played} games")
        break
```

### 拆解

- **三层循环**：外层 while True（多局）、内层 while tries < max_tries（每局猜）、外层嵌套 play 询问
- **`guess_raw == "quit"`**：两种「退出」要分清——一是「猜够 7 次」、二是「中途 quit」
- **`won = True / False`**：内层循环退出后判断「赢了吗」，避免揭底谜语被误打
- **计分公式**：100 - 10 * tries，最少 30 分（猜 7 次还给 30 分安慰奖）

## 三、项目 B：难度选择 + 历史最佳（20 分钟）

> 📁 同目录下新建 `guess_pro2.py`。

在 A 基础上加：

1. **开始前选难度**：
   - easy: 1-50，10 次机会
   - normal: 1-100，7 次机会
   - hard: 1-500，5 次机会
2. **历史最佳**：每局结束比一下当前分和历史最高，破纪录就打印 `New record!`

参考片段：

```python
print("Choose difficulty:")
print("1. Easy (1-50, 10 tries)")
print("2. Normal (1-100, 7 tries)")
print("3. Hard (1-500, 5 tries)")
diff = input("Choice: ")

if diff == "1":
    high, max_tries = 50, 10
elif diff == "2":
    high, max_tries = 100, 7
else:
    high, max_tries = 500, 5

best_score = 0
# ... after each game ...
if score > best_score:
    print("New record!")
    best_score = score
```

## 四、项目 C：排行榜（20 分钟）

> 📁 同目录下新建 `guess_leaderboard.py`。

需求：每次游戏结束，结果追加写入 `leaderboard.txt`，读取历史前 5 名：

```python
# Append result
with open("leaderboard.txt", "a") as f:
    f.write(f"{games_played},{score},{tries}\n")

# Show top 5
print("\n=== Leaderboard ===")
with open("leaderboard.txt") as f:
    scores = []
    for line in f:
        parts = line.strip().split(",")
        scores.append((int(parts[1]), parts[0], parts[2]))
    scores.sort(reverse=True)
    for i, (s, g, t) in enumerate(scores[:5]):
        print(f"{i+1}. Game {g}: {s} points in {t} tries")
```

### 关键点

- **`open("leaderboard.txt", "a")`**：a = append（追加），写入不覆盖
- **`with open(...) as f:`**：自动关文件，不用 `f.close()`，是 W07 项目周会重点用的写法
- **tuple 排序**：`scores.sort(reverse=True)` 默认按 tuple 第一个元素排

## 五、验收标准（自助验收）

- [ ] 三个项目（A 完整计分版 / B 难度选择 / C 排行榜）至少做两个
- [ ] 至少让 3 个家人/朋友玩过，记下每人最高分
- [ ] 排行榜前 5 名真的有数据
- [ ] 你能指着代码说清：外层 while True 在管什么，内层 while 在管什么
- [ ] quit 退出路径和正常退出路径都跑过，零报错

## 六、W05 全周自查

- [ ] L01：while 跟 for 区别清楚，知道死循环 Ctrl + C
- [ ] L02：break / continue / while...else 都用对
- [ ] L03：限次数猜数字 + 多局循环 跑通
- [ ] 周末：计分版 + 难度 + 排行榜至少两个完成
- [ ] 我能给家人玩这个游戏，零报错、零崩溃

W05 毕业 🎓 → 进入 W06「列表：一串数据」。一个变量装多个数据，班级成绩、商品清单、玩家背包，全都用列表。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
int main() {
    while (true) {
        std::cout << "play once" << std::endl;
        char again;
        std::cin >> again;
        if (again != 'y') break;
    }
    return 0;
}
```

三个认脸：

1. `while (true)` 无限循环（Python 是 `while True:`）
2. `if (again != 'y') break;` 退出
3. 外层 while + 内层游戏 = "再来一局"

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
