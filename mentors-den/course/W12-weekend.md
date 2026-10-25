<!-- slug: sort-race, type: addon -->
# W12-weekend · 排序比赛：选择 vs Python 内置

> **一句话核心**：**学算法是理解原理；生产用标准库**。Python `sort()` 用 Timsort，N=5000 时比选择排序快 1000 倍。

> **每日节奏（v1.9）：** 周末项目 ≈60 分钟
> **写代码时间**
> 难度：⭐⭐⭐ · W16 加餐③ 周末

---

> **📂 课前准备**：存为 `~/sand-hollow/<你的学员ID>/homework/W16-weekend-practice.py`。

## ⓪ 🤖 课前 AI 一分钟 · 第 36 颗：自己造轮子 vs 用标准库（3 分钟）

**AI 工程师的金科玉律**：**永远先试标准库**。

**今日口诀**：**学算法 = 理解原理；生产 = 用标准库**。

**⚔️ 判一判**：

> 1. 自己写算法永远比标准库快
> 2. Python list.sort() 用 C 实现

<details><summary>答案</summary>

**1.** ✗ 标准库经过千锤百炼；**2.** ✓ Python 调用 C 实现的 Timsort。

</details>

---

## 一、项目：排序比赛（60 分钟）

写两个排序函数：
1. `selection_sort(arr)` —— 上节学的
2. `builtin_sort(arr)` —— 用 `arr.sort()` 或 `sorted(arr)`

跑 5 组输入，比较哪个快多少倍。

## 二、选择排序（10 分钟）

```python
def selection_sort(arr):
    '''In-place selection sort.'''
    arr = list(arr)   # don't modify original
    n = len(arr)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j
        if min_idx != i:
            arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr
```

## 三、内置排序（5 分钟）

```python
def builtin_sort(arr):
    '''Use Python built-in sort (Timsort).'''
    return sorted(arr)
```

## 四、跑比赛（15 分钟）

```python
import time
import random

def time_sort(fn, arr):
    start = time.time()
    fn(arr)
    return time.time() - start

print(f'{"N":>6s} {"selection":>12s} {"builtin":>12s} {"ratio":>8s}')
for n in [100, 500, 1000, 2000, 5000]:
    data = [random.randint(0, 1000000) for _ in range(n)]
    s = time_sort(selection_sort, data)
    b = time_sort(builtin_sort, data)
    print(f'{n:6d} {s:12.4f}s {b:12.4f}s {s/b:8.0f}x')
```

## 五、深入了解：Timsort 为什么快（3 分钟）

**Timsort = 归并排序 + 插入排序混合**（2002 年 Tim Peters 为 Python 发明）。

**优势**：
1. **自适应**：检测"已排好序"段（run）
2. **稳定**：相等元素保持原顺序
3. **C 实现 + 高度优化**
4. **最坏 O(N log N)**

## 六、何时用（3 分钟）

| 场景 | 用什么 |
|---|---|
| 生产代码 | 标准库 |
| 学习算法 | 自己写 |
| 性能关键 + 标准库不够 | 自己写 |
| 嵌入式 / 硬件 | 自己写 |

**默认答案**：**用标准库**。90% 情况标准库足够。

## 七、读代码挑战（10 分钟）

找出 2 个 bug：

```python
def selection_sort_buggy(arr):
    n = len(arr)
    for i in range(n):           # bug 1?
        min_idx = 0
        for j in range(1, n):    # bug 2?
            if arr[j] < arr[min_idx]:
                min_idx = j
        arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr
```

<details><summary>提示</summary>

1. `for i in range(n)`——应该是 `range(n - 1)`
2. `for j in range(1, n)`——应该是 `range(i + 1, n)`

</details>

## 八、提交（5 分钟）

存到 `W16-weekend-practice.py`。跟 mentor 说"**修完了**"。

## 九、反思（5 分钟）

- 选择排序：O(N²)，简单，自己写
- Python sort：O(N log N)，Timsort，标准库
- 差距：N=5000 时约 1000 倍

---

## ✅ 周末自查

- [ ] 写好两个排序函数
- [ ] 跑过 5 组测试
- [ ] 找到并修了 2 个 bug
- [ ] 存到 `W16-weekend-practice.py`

---

## 👀 C++ 认脸时刻

```cpp
#include <algorithm>
#include <vector>
int main() {
    std::vector<int> arr = {3, 1, 4, 1, 5, 9, 2, 6};
    std::sort(arr.begin(), arr.end());   // O(N log N)
    return 0;
}
```

三个认脸：
- `std::sort(begin, end)` 排序
- `arr.begin() / .end()` = 迭代器
- Python `arr.sort()` 等价
