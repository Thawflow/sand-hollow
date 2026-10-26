<!-- slug: recursion-vs-iteration, type: addon -->
# W14-weekend · 递归 vs 迭代: 何时用哪个

> **一句话核心**: **写时用递归(清晰), 生产用迭代(快)**.AI 工程师"看菜吃饭"——树/图递归, 循环迭代.

> **每日节奏(v1.9): ** 周末项目 ≈60 分钟(纯动手, 没阅读)
> **写代码时间** —— 设计、写、调试
> 难度: ⭐⭐⭐ · 前置: W14-S1 + W14-S3

---

> **📂 课前准备 · 随堂练习文件**: 先在 Thonny `文件 → 新建`, 立刻 `文件 → 另存为...` 存为 `~/sand-hollow/<你的学员ID>/homework/W16-weekend-practice.py`.周末代码都写在这里.

## ⓪ 🤖 课前 AI 一分钟 · 第 39 颗: 递归 = 清晰, 迭代 = 性能(3 分钟)

今天的周末: 递归(清晰)和迭代(快)PK.

**AI 工程师的"看菜吃饭"**: 
- **递归**: 问题天然"分形"(树、图、分治)—— 清晰胜过性能
- **迭代**: 性能压倒一切(训练 AI 跑亿次)—— 速度胜过清晰

**今日口诀**: **写时用递归(清晰), 生产用迭代(快)**.

**⚔️ 判一判**: 

> 1. 递归比迭代总是慢
> 2. 递归对树/图问题特别合适

<details><summary>答案</summary>

**1.** ✗ 编译器优化(如尾递归)后差距小; **2.** ✓ 树/图天然分形.

</details>

---

## 一、项目: 递归 vs 迭代(60 分钟)

写 4 个函数(每个问题两个版本): 
1. `factorial_recursive(n)` / `factorial_iterative(n)`
2. `fib_recursive(n, memo)` / `fib_iterative(n)`
3. `sum_list_recursive(arr)` / `sum_list_iterative(arr)`
4. `reverse_string_recursive(s)` / `reverse_string_iterative(s)`

跑 5 组输入, 比较时间和正确性.

## 二、阶乘(5 分钟)

```python
def factorial_recursive(n):
    if n == 0: return 1
    return n * factorial_recursive(n - 1)

def factorial_iterative(n):
    result = 1
    for i in range(1, n + 1):
        result = result * i
    return result

print(factorial_recursive(10))   # 3628800
print(factorial_iterative(10))   # 3628800
```

## 三、斐波那契(10 分钟)

```python
def fib_recursive(n, memo={}):
    if n in memo: return memo[n]
    if n == 0 or n == 1: return n
    memo[n] = fib_recursive(n - 1, memo) + fib_recursive(n - 2, memo)
    return memo[n]

def fib_iterative(n):
    if n == 0 or n == 1: return n
    a, b = 0, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b

print(fib_recursive(20))   # 6765
print(fib_iterative(20))   # 6765
```

**关键**: 迭代版用两个变量滚动, O(N) 时间 O(1) 空间.

## 四、示例演算: factorial(5)(3 分钟)

| 步骤 | 递归 | 迭代 |
|---|---|---|
| 1 | factorial(5) → 5 × factorial(4) | result=1, i=1, result=1 |
| 2 | factorial(4) → 4 × factorial(3) | result=1, i=2, result=2 |
| 3 | factorial(3) → 3 × factorial(2) | result=2, i=3, result=6 |
| 4 | factorial(2) → 2 × factorial(1) | result=6, i=4, result=24 |
| 5 | factorial(1) → 1 × factorial(0) | result=24, i=5, result=120 |
| 6 | factorial(0) → 1 | — |
| **结果** | 120 | 120 |

两种都正确.迭代版**不展开调用栈**, 省内存.

## 五、深入了解: 尾递归优化(3 分钟)

**尾递归**: 递归调用是函数的**最后一个操作**.

```python
# Normal recursion (factorial(5) = 5 * factorial(4), last op is multiply)
def factorial(n):
    if n == 0: return 1
    return n * factorial(n - 1)

# Tail recursion (recursive call is the last op)
def factorial_tail(n, acc=1):
    if n == 0: return acc
    return factorial_tail(n - 1, n * acc)
```

**优势**: 编译器可以把尾递归**转成循环**(不爆栈).

**Python 不支持**: CPython 没做尾递归优化, 所以尾递归还是会爆栈.

**Scala/Haskell/Erlang** 等函数式语言都支持——这是为什么它们爱递归.

## 六、何时用: 选递归 vs 迭代(3 分钟)

| 场景 | 选 | 原因 |
|---|---|---|
| 树/图遍历 | 递归 | 代码清晰 3-5 倍 |
| 阶乘/斐波那契/求和 | 迭代 | 性能 + 不爆栈 |
| 大数据(10⁶+ 元素)| 迭代 | 递归爆栈 |
| 教学/作业 | 递归 | 体现算法思想 |
| 生产 AI 系统 | 迭代 + 缓存 | 性能压倒一切 |

**AI 工程师的金科玉律**: **树/图递归, 循环迭代.**

## 七、跑比赛(10 分钟)

```python
import time

def time_it(fn, *args):
    start = time.time()
    result = fn(*args)
    return time.time() - start, result

# Test cases
for n in [10, 50, 100, 500, 1000]:
    t1, r1 = time_it(fib_recursive, n)
    t2, r2 = time_it(fib_iterative, n)
    print(f'fib({n:4d}): rec={t1:.6f}s iter={t2:.6f}s')
```

跑一下.看差距.

## 八、读代码挑战(10 分钟)

找出下面代码里的 2 个 bug: 

```python
def fib_iterative_buggy(n):
    a, b = 0, 1
    for i in range(n):       # bug 1?
        a, b = b, a + b
    return a                  # bug 2?
```

<details><summary>提示</summary>

1. `range(n)` 多算一次——应该是 `range(n - 1)`(或者从 i=1 开始)
2. `return a`——应该是 `return b`(最后一次 b 才是 fib(n))

</details>

## 九、提交(5 分钟)

存到 `W16-weekend-practice.py`.跟 mentor 说"**修完了**".

## 十、反思(5 分钟)

- 递归: 清晰, 但慢(除非缓存)
- 迭代: 快, O(N) 时间 O(1) 空间
- AI 工程师: 树/图用递归, 循环用迭代

---

## ✅ 周末自查

- [ ] 写好 4 对函数(递归/迭代各 4)
- [ ] 跑过 5 组测试, 看到差距
- [ ] 找到并修了 2 个 bug
- [ ] 存到 `W16-weekend-practice.py`

四格全勾 → 周末完成.W14 加餐④ 收官!

---

## 👀 C++ 认脸时刻(1 分钟 · 只看不敲)

```cpp
int fib_iterative(int n) {
    if (n == 0 || n == 1) return n;
    int a = 0, b = 1;
    for (int i = 2; i <= n; i++) {
        int c = a + b;
        a = b;
        b = c;
    }
    return b;
}
```

三个认脸: 
- C++ 变量要 `int` 声明
- `int c = a + b; a = b; b = c;` 三个变量滚动(Python 用 `a, b = b, a + b` 一行)
- `for (int i = 2; i <= n; i++)` = `for i in range(2, n + 1)`
