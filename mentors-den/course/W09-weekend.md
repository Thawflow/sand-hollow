<!-- slug: greedy-coin-game, type: addon -->
# W09-weekend · 找零比赛：贪心 vs 暴力

> **一句话核心**：**最好的工程师不是用最复杂的算法，是用最合适的算法**。先贪心，失败再升级。

> **每日节奏（v1.9）：** 周末项目 ≈60 分钟（纯动手，没阅读）
> **写代码时间** —— 设计、写、调试
> 难度：⭐⭐⭐ · 前置：W09-S1 + W09-S3

---

> **📂 课前准备 · 随堂练习文件**：先在 Thonny `文件 → 新建`，立刻 `文件 → 另存为...` 存为 `~/sand-hollow/<你的学员ID>/homework/W09-weekend-practice.py`。周末代码都写在这里。

## ⓪ 🤖 课前 AI 一分钟 · 第 33 颗：AI 工程师 = 选对算法（3 分钟）

今天的周末：建一个找零比赛场。贪心算法 vs 暴力算法，赛跑找最优解。

**AI 工程师每天做的事**：选对算法。**先试最简单（贪心），不行就升级（动态规划、搜索）**。这是 AI 工程师的肌肉记忆。

**今日口诀**：**最好的工程师不是用最复杂的算法，是用最合适的算法**。今天你练这招。

**⚔️ 判一判**：

> 1. 暴力算法永远没价值
> 2. AI 工程师选算法时考虑性能和正确性

<details><summary>答案</summary>

**1.** ✗ 暴力是黄金标准（用来测试贪心对错）；**2.** ✓ 永远 2 选 1：快但可能错（贪心），还是慢但保证对（暴力）？

</details>

---

## 一、项目：找零比赛（60 分钟）

写两个找零函数：
1. `greedy_change(amount, coins)` —— 永远挑最大
2. `brute_change(amount, coins)` —— 试所有组合找最少

跑 5 组输入，比较：
- 贪心选了 N 枚
- 暴力选了 M 枚
- 谁赢？

## 二、贪心函数（10 分钟）

```python
def greedy_change(amount, coins):
    '''Return a list of coins that sums to amount using greedy.'''
    result = []
    for coin in coins:
        while amount >= coin:
            result.append(coin)
            amount = amount - coin
    return result
```

## 三、暴力函数（15 分钟）

```python
def brute_change(amount, coins):
    '''
    Try every combination, return the shortest.
    Exponential: only works for small amount and small coin set.
    '''
    best = None
    def try_combinations(remaining, coins, current):
        nonlocal best
        if remaining == 0:
            if best is None or len(current) < len(best):
                best = list(current)   # copy
            return
        if remaining < 0:
            return
        if best is not None and len(current) >= len(best):
            return   # prune: cannot beat current best
        for i, coin in enumerate(coins):
            current.append(coin)
            try_combinations(remaining - coin, coins[i:], current)
            current.pop()

    try_combinations(amount, coins, [])
    return best if best is not None else []
```

**技巧**：先 sort coins（最大到最小），同时 `coins[i:]` 让后面递归只看当前和更小的硬币，避免重复。

## 四、跑比赛（10 分钟）

```python
tests = [
    (87, [100, 50, 10]),       # 8.7 yuan
    (60, [40, 30, 10]),        # 6 jiao (greedy fails)
    (99, [50, 30, 10, 1]),     # 9.9 yuan
    (200, [100, 50, 20, 10, 5]),  # 20 yuan
    (1000, [500, 200, 100, 50, 20, 10, 5, 1]),  # 100 yuan
]

for amount, coins in tests:
    sorted_coins = sorted(coins, reverse=True)
    g = greedy_change(amount, sorted_coins)
    b = brute_change(amount, sorted_coins)
    winner = 'greedy win' if len(g) == len(b) else f'brute {len(b)} coins vs greedy {len(g)} coins'
    print(f'amount={amount:4d}  greedy={len(g):2d}  brute={len(b):2d}  winner={winner}')
```

跑一下。看哪些 case 贪心赢，哪些 case 暴力赢。

## 五、示例演算：amount=60, coins=[40, 30, 10]（3 分钟）

**贪心**：
- 40 + 10 + 10 = 60 (3 枚)

**暴力**（试所有组合）：
- 30 + 30 = 60 (2 枚) ✓ 最优
- 40 + 10 + 10 = 60 (3 枚)
- 10 + 10 + 10 + 10 + 10 + 10 = 60 (6 枚)

**暴力赢**——贪心用了 3 枚，最优 2 枚。

## 六、深入了解：暴力为什么仍有用（3 分钟）

**暴力算法 = 黄金标准**——慢但保证对。3 个用途：

1. **测试贪心对错**：暴力找最优，贪心 vs 暴力 = 反例检测
2. **小数据 baseline**：n < 20 时暴力足够，不必优化
3. **教学**：暴力最直观，先写暴力再优化

**真实案例**：
- **单元测试**：永远拿"已知答案"测试代码（参考实现是暴力）
- **算法竞赛**：小数据暴力得部分分，大数据再优化
- **AI debug**：用暴力结果对比 ML 输出，看偏差

**没学暴力的 AI 工程师 = 不会"找反例"的工程师**。

## 七、何时用：算法选择的决策树（3 分钟）

```
data small (< 20)?
  yes -> brute force
  no -> greedy
       if counter-example?
         yes -> dynamic programming
         no -> greedy OK
```

**永远先试最简单的**——别上来就动归/搜索。

## 八、读代码挑战（10 分钟）

找出下面代码里的 2 个 bug：

```python
def greedy_change_buggy(amount, coins):
    result = []
    for coin in coins:           # bug 1?
        if amount < coin:        # bug 2?
            continue
        while amount >= coin:
            result.append(coin)
            amount = amount - coin
    return result
```

<details><summary>提示</summary>

1. `for coin in coins`——如果 `coins` 没排好序（不是从大到小），贪心就失败。应该 `sorted(coins, reverse=True)`
2. `if amount < coin: continue`——可以工作，但当 amount > 0 但所有 coin 都 > amount 时，函数返回 `[]`，应该至少报错"无法找零"

</details>

## 九、提交（5 分钟）

存到 `W09-weekend-practice.py`。跟 mentor 说"**修完了**"。

## 十、反思（5 分钟）

- 贪心：快，O(n)，但不一定对
- 暴力：慢，O(2^n)，但保证对
- AI 工程师的"肌肉记忆"：先试贪心，失败再升级

下周：W10（还是 Python 基础，函数与模块）。

---

## ✅ 周末自查

- [ ] 写好两个找零函数
- [ ] 跑过 5 组测试，看到贪心赢和暴力赢的 case
- [ ] 找到并修了 2 个 bug
- [ ] 存到 `W09-weekend-practice.py`

四格全勾 → 周末完成。下周：W10。

---

## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
int main() {
    std::vector<int> coins = {1, 5, 10, 25};
    int amount = 41;
    std::sort(coins.rbegin(), coins.rend());   // sort descending
    // coins is now {25, 10, 5, 1}
    std::cout << "sorted descending" << std::endl;
    return 0;
}
```

三个认脸：
- `std::sort(begin, end)` 排序
- `rbegin()` / `rend()` 反向迭代器（Python 的 `reversed`）
- 跟 Python 的 `sorted(coins, reverse=True)` 等价
