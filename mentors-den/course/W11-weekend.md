<!-- slug: turtle-gallery, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 48 颗：AI 也会"画图鉴"——turtle 画（3 分钟）

> **第 48 颗**

AI 画图鉴 = turtle 画（每个宠物画头像）。Python turtle + 字典 = **可视化项目**。

**今日口诀**：AI 画图鉴 = turtle 画（每个宠物画头像）。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. 宠物图鉴可以画
> 2. turtle 画头像 = 几何图形

<details><summary>答案</summary>

**1.** ✓ t.circle(50) 画圆当头  
**2.** ✓ turtle 画图 = 几何变换

</details>

---

# W11-weekend · 用 turtle 画一幅完整的画（签名！）

> 用时：60-90 分钟 · 难度：⭐⭐⭐ · 前置：W09 三课

---

## 一、本周武功盘点（3 分钟）

- W09-L01：forward / left / right + 正多边形
- W09-L02：pencolor / fillcolor / pensize + 填充
- W09-L03：循环画图（多边形族 / 雪花 / 螺旋）

今天画一幅**完整的画**——能签上名字、给家人看那种。

## 二、项目：自由创作（60 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `my_art.py`。

任选一题（也可自己设计）：

### 选项 A：彩色曼陀罗

```python
import turtle
import random

t = turtle.Turtle()
t.speed(0)
t.pensize(2)

colors = ["red", "orange", "yellow", "green", "blue", "purple", "pink"]

# Draw 12 petals
for petal in range(12):
    t.pencolor(random.choice(colors))
    t.fillcolor(random.choice(colors))
    t.begin_fill()
    for i in range(3):
        t.forward(80)
        t.left(120)
    t.end_fill()
    t.left(30)

turtle.done()
```

### 选项 B：星空

```python
import turtle
import random

t = turtle.Turtle()
t.speed(0)
t.penup()

# 100 random stars
for star in range(100):
    x = random.randint(-200, 200)
    y = random.randint(-200, 200)
    size = random.randint(2, 8)
    color = random.choice(["white", "yellow", "lightyellow", "lightblue"])

    t.goto(x, y)
    t.pendown()
    t.pencolor(color)
    t.dot(size)  # small filled circle
    t.penup()

# Moon
t.goto(150, 150)
t.pendown()
t.fillcolor("lightyellow")
t.begin_fill()
t.circle(40)
t.end_fill()

turtle.done()
```

### 选项 C：自定义（推荐）

画你想画的东西：

- 一只卡通动物（猫/狗/鱼）
- 一棵树（树干 + 树叶圆圈）
- 一辆汽车（矩形 + 圆形轮子）
- 一栋房子 + 花园 + 太阳
- 你名字的首字母装饰版

## 三、签名（5 分钟）

画完给作品签上名字：

```python
import turtle
# ... your drawing ...

# Signature
t.penup()
t.goto(-200, -250)
t.pendown()
t.pencolor("black")
t.write("By [your name], Sep 2026", font=("Arial", 12, "normal"))

turtle.done()
```

`t.write()` 是 turtle 的「写字」功能，可以写 ASCII 文字（中文需要换字体）。

## 四、验收标准（自助验收）

- [ ] 画作能完整跑通，无报错
- [ ] 至少用了 3 种颜色（线条或填充）
- [ ] 用到循环画图（不只是画静态形状）
- [ ] 签名落档
- [ ] 给家人 / 朋友看过，至少 1 人说「好看」

## 五、W09 全周自查

- [ ] L01：forward / left / right + 正方形
- [ ] L02：pencolor / fillcolor + 填充
- [ ] L03：循环画图（多边形 / 雪花 / 螺旋）
- [ ] 周末：画了一幅完整画作 + 签名
- [ ] 我能给家人解释「turtle = 程序画画的小海龟」

W09 毕业 🎨 → 进入 W10「字典：名字 → 东西的魔法地图」。W06 学的列表用索引 `[0]`、`[1]`，字典用「名字」找东西——像查电话簿。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
// 画图：模拟 turtle
void circle(int r) { std::cout << "circle " << r << std::endl; }
int main() {
    circle(50);  // 画脸
    return 0;
}
```

三个认脸：

1. `circle(50)` 画圆
2. C++ 没 turtle，要用 graphics lib
3. Python `t.circle(50)` 一行

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
