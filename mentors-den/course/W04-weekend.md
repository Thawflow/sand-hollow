<!-- slug: pattern, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 12 颗：AI 也会"画图案"（3 分钟）

> **第 12 颗**

AI 画图 = 几何变换（旋转/缩放/平移）。Python 画图案 = 嵌套循环 + 角度计算——**跟 AI 画图同源**。

**今日口诀**：AI 画图 = 几何变换（旋转/缩放/平移）。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. 画图案 = 嵌套循环 + 角度
> 2. AI 画图底层也是几何变换

<details><summary>答案</summary>

**1.** ✓ turtle.forward + left(60) 画六边形  
**2.** ✓ Diffusion 模型的几何变换

</details>

---

# W04-weekend · 图案集：楼梯 + 金字塔 + 九九乘法表

> 用时：45-60 分钟 · 难度：⭐⭐⭐ · 前置：W04 三课

---

## 一、本周武功盘点（3 分钟）

- for 循环 + range 三种姿势：`range(N)` / `range(a, b)` / `range(a, b, step)`
- 累加器四件套：建箱子 → 循环 → 往里扔 → 出箱子
- 嵌套循环：外层管行，内层管每行的内容
- `end=""` 控制 print 不换行

今天把它们全部组装成**三个酷炫的图案**——能分享给家人朋友那种。

## 二、项目 A：倒圣诞树（10 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `upside_down_tree.py`。

需求：打一个倒过来的圣诞树（顶宽底尖），高度 5：

```
* * * * * 
* * * * 
* * * 
* * 
* 
```

参考实现：

```python
height = 5
for row in range(height, 0, -1):
    for col in range(row):
        print("*", end=" ")
    print()
```

### 关键点

- 外层 `range(height, 0, -1)`：**倒着走**——从 5 到 1（注意「含头不含尾」末尾 0 不取）
- 内层 `range(row)`：每行打 row 个星
- 这是 W04-L03 倒楼梯的 5 倍升级版

### 升级挑战

1. 把 `*` 换成 `🎄`（emoji 表情）——注意 emoji 在终端的宽度处理
2. 改成「正三角 + 树干」组合版（提示：先打上半部分，再单独打树干 `|`）

## 三、项目 B：镂空菱形（15 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `hollow_diamond.py`。

需求：打一个空心的菱形（中间是空的），边长 5：

```
    *
   * *
  *   *
 *     *
*       *
 *     *
  *   *
   * *
    *
```

参考实现：

```python
size = 5
# Top half (including middle row)
for row in range(1, size + 1):
    # Leading spaces
    for s in range(size - row):
        print(" ", end="")
    # Left star
    print("*", end="")
    # Inside (hollow part)
    if row > 1:
        for inner in range(2 * row - 3):
            print(" ", end="")
        # Right star
        print("*", end="")
    print()
# Bottom half
for row in range(size - 1, 0, -1):
    for s in range(size - row):
        print(" ", end="")
    print("*", end="")
    if row > 1:
        for inner in range(2 * row - 3):
            print(" ", end="")
        print("*", end="")
    print()
```

### 拆解

- 上半部分行数：`range(1, size + 1)` 从 1 到 size
- 下半部分行数：`range(size - 1, 0, -1)` 从 size-1 到 1（不含中线）
- 每行结构：左空格 → 左星 → 中间空格（行号 > 1 才有）→ 右星 → 换行
- `2 * row - 3`：中间空格的规律（W04-L03 练过，奇数序列 - 2）

### 升级挑战

1. 改成「实心菱形」（中间不空，每行打满）
2. 改成「猫头」形状——上半菱形 + 下半 V 字耳朵

## 四、项目 C：九九乘法表（20 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `multiplication_table.py`。

需求：打一个完整的九九乘法表（1×1 到 9×9）：

```
1 x 1 = 1	
1 x 2 = 2	2 x 2 = 4	
1 x 3 = 3	2 x 3 = 6	3 x 3 = 9	
...
```

参考实现：

```python
print("=== Multiplication Table ===")
for i in range(1, 10):
    for j in range(1, i + 1):
        print(f"{j} x {i} = {i*j}", end="\t")
    print()
```

### 关键观察

- 外层 `i` 从 1 到 9：行号
- 内层 `j` 从 1 到 `i+1`：每行的列数（**第 i 行有 i 个算式**）
- `end="\t"`：Tab 制表符，对齐列
- **不写「9×9 完整方阵」**：因为 i 和 j 是 1-9 的话，会打出 81 个算式——传统九九表是「下三角」，所以 j ≤ i

### 升级挑战

1. 打印**完整方阵**（包括 i > j 的部分）：用 `print(f"{j} x {i} = {i*j}", end="\t")` 即可，**不用 j ≤ i 限制**
2. 加**边框**：每行前面打 `i |`，让每行更易识别

## 五、验收标准（自助验收）

- [ ] 三个项目代码都亲手敲过、跑通
- [ ] 倒圣诞树高度可调（改 height 数字生效）
- [ ] 镂空菱形 size 改 7 也能跑（看尺寸变化）
- [ ] 九九乘法表能跑出 9 行、对齐整齐
- [ ] 至少做过一个升级挑战

## 六、皮肤题：选一个做（10 分钟）

按喜好选一个，自由发挥：

- **A. 棋盘格**：打一个 8×8 的 `#` `.` 交错棋盘（提示：`(row + col) % 2` 决定打哪个）
- **B. ASCII 艺术**：用 `print` 拼一个 emoji 或小猫脸（`/\_/\` `> <` 等组合）
- **C. 闪电形状**：上下尖、中间宽的锯齿状

完成后**必须运行测试**：换不同的输入（如 height=3 / size=10），看看代码是不是真的能适应。

## 七、W04 全周自查

- [ ] L01：for + range 三种姿势张口就来，知道「含头不含尾」
- [ ] L02：累加器四件套会建会扔，求和 / 计数 / 找最大三招都会
- [ ] L03：嵌套循环能画方阵 / 楼梯 / 金字塔，知道 `end=""` 控制不换行
- [ ] 周末：三个项目（倒树 / 镂空菱形 / 九九表）都跑通，至少做过一个升级 + 一个皮肤
- [ ] 我能给家人解释「外层管行，内层管每行内容」

W04 毕业 🎓 → 进入 W05「直到……才停」。while 循环登场——程序不只是「数到 N 自动停」，还能「满足某个条件才停」，更灵活、更强大、也更容易踩死循环的坑。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
int main() {
    for (int i = 0; i < 6; i++) {
        std::cout << "forward 100" << std::endl;
        std::cout << "left 60" << std::endl;
    }
    return 0;
}
```

三个认脸：

1. 6 次循环画六边形
2. 每次：前进 + 转 60 度
3. Python turtle 一样：for i in range(6): t.forward(100); t.left(60)

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
