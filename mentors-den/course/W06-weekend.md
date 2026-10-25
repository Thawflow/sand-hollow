<!-- slug: treasure, type: addon -->
# W06-weekend · 词典寻宝赛 + 读代码挑战

> **一句话核心**：造一个寻宝游戏，让电脑二分 vs 顺序，看谁赢。理解边界 bug 怎么写错二分查找。

> **每日节奏（v1.9）：** 周末项目 ≈60 分钟（纯动手，没阅读）
> **写代码时间** —— 设计、写、调试
> 难度：⭐⭐⭐⭐ · 前置：W06 五节全过

---

> **📂 课前准备 · 随堂练习文件**：先在 Thonny `文件 → 新建`，立刻 `文件 → 另存为...` 存为 `~/sand-hollow/<你的学员ID>/homework/W06-weekend-practice.py`。周末代码都写在这里。

## ⓪ 🤖 课前 AI 一分钟 · 第 30 颗：AI = 搜索 + 优化（3 分钟）

今天的周末：建一个词典寻宝游戏，数你的代码跑几步，跟同学比一比。

**AI 大部分就是搜索 + 优化**：推荐系统 = 搜"和你像的人"；导航系统 = 搜"最短路径"；聊天机器人 = 搜"最合适的回答"。都建立在今天的二分 + Big O 上。

**今日口诀**：**最快的算法是不用跑的算法**。缓存、预计算、排序一次。AI 工程师 90% 的优化花在这。

**⚔️ 判一判**：

> 1. AI 大部分就是搜索算法
> 2. 排序数据是浪费（二分要排好序，但排序贵）

<details><summary>答案</summary>

**1.** ✓ 搜索 + 排序 + 检索 = AI 工作量的 90%；**2.** ✗ 排一次，查多次，永远更便宜。AI 工程师默认先排序。

</details>

---

## 一、项目：词典寻宝赛（60 分钟）

建一个 3 轮寻宝游戏：
1. 玩家在 10000 词词典里选一个秘密词
2. 电脑用二分查找找它，数猜了几次
3. 电脑用顺序查找，数猜了几次
4. 比一比：二分最多 14 步，顺序最多 10000 步——二分完胜！

## 二、分步走（10 分钟）

```python
import random

# Step 1: make a 10000-word dictionary (simplified)
dictionary = [f'word{i:05d}' for i in range(10000)]

# Step 2: player picks a secret word
print('Pick a secret word between word00000 and word09999')
print('(type any number 0-9999)')
secret_num = int(input('Your choice: '))
secret_word = dictionary[secret_num]
print(f'Secret set: {secret_word}')
input('Press Enter when ready...')

# Step 3: computer uses binary search
def binary_search_count(word_list, target):
    low = 0
    high = len(word_list) - 1
    count = 0
    while low <= high:
        mid = (low + high) // 2
        count = count + 1
        if word_list[mid] == target:
            return count
        elif word_list[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1

# Step 4: computer uses linear search
def linear_search_count(word_list, target):
    count = 0
    for i in range(len(word_list)):
        count = count + 1
        if word_list[i] == target:
            return count
    return -1

# Run both
binary_guesses = binary_search_count(dictionary, secret_word)
linear_guesses = linear_search_count(dictionary, secret_word)

print(f'\nResults:')
print(f'  Binary search: {binary_guesses} guesses')
print(f'  Linear search: {linear_guesses} guesses')
print(f'  Linear is {linear_guesses / binary_guesses:.0f}x slower than binary')
```

## 三、跑一下看差距（10 分钟）

跑代码。试几个秘密数字：
- 0（第一个词）
- 9999（最后一个词）
- 5000（中间）
- 随机

注意：二分**永远 ≤14 步**。顺序跟秘密数字**成正比**。

## 四、加分：读代码挑战（15 分钟）

不看运行结果，找出下面代码里的 3 个 bug：

```python
def binary_search_buggy(arr, target):
    low = 0
    high = len(arr)          # bug 1?
    while low < high:         # bug 2?
        mid = (low + high) / 2  # bug 3?
        if arr[mid] == target:
            return mid
        elif arr[mid] > target:
            high = mid
        else:
            low = mid + 1
    return -1
```

找出每个 bug。**然后修，再跑**。

<details><summary>提示</summary>

1. `high = len(arr)`——应该是 `len(arr) - 1`（少减一错误，跳过最后一个）
2. `while low < high`——应该是 `while low <= high`（漏掉 low == high 的情况）
3. `/ 2`——应该是 `// 2`（整除；Python 这里也能跑，但惯例用整除）

</details>

## 五、提交（5 分钟）

存到 `W06-weekend-practice.py`。跟 mentor 说"**修完了**"。

## 六、反思（5 分钟）

这周学了什么？
- 二分查找：每步砍一半，O(log n)
- Big O：数据翻倍时步数怎么涨
- 选算法：先量，别猜
- AI 就建立在这些基本功上

下周：W07 列表（list）——存一堆值，循环遍历它们。有了二分查找基础，你会明白为什么排好序的列表能二分。

---

## ✅ 周末自查

- [ ] 建好词典寻宝赛，跑过
- [ ] 试过 3+ 个秘密数字，看到二分永远 ≤14
- [ ] 找到并修了 3 个 bug
- [ ] 存到 `W06-weekend-practice.py`

四格全勾 → 周末完成。下周：W07。

---

## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

```cpp
#include <iostream>
#include <vector>
int main() {
    std::vector<int> arr = {0, 1, 2, 3, 4, 5};
    int target = 3;
    // C++23 has std::find (linear); binary_search returns bool
    bool found = std::binary_search(arr.begin(), arr.end(), target);
    auto it = std::lower_bound(arr.begin(), arr.end(), target);
    int index = it - arr.begin();   // 3
    std::cout << "found=" << found << " index=" << index << std::endl;
}
```

三个认脸：
- `std::lower_bound` 返回第一个 ≥ target 的迭代器
- `it - arr.begin()` = 下标（指针算术）
- 跟 Python 的 `bisect.bisect_left(arr, target)` 一个意思
