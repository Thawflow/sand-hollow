<!-- slug: list-shopping-cart, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 24 颗：AI 也会"购物清单"——增删改查综合（3 分钟）

> **第 24 颗**

AI 推荐系统 = 增删改查用户偏好。购物清单项目 = **完整 CRUD 项目**。

**今日口诀**：AI 推荐系统 = 增删改查用户偏好。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. 购物清单 = list 增删改查
> 2. AI 推荐系统本质也是增删改查

<details><summary>答案</summary>

**1.** ✓ items = []; items.append(x); items.remove(x); ...  
**2.** ✓ user_preferences.append(item)

</details>

---

# W07-weekend · 电子购物清单

> 用时：60-90 分钟 · 难度：⭐⭐⭐ · 前置：W06 三课

---

## 一、本周武功盘点（3 分钟）

- 列表：一个变量装一批数据
- 增删改查：append / insert / remove / pop / clear / 索引赋值 / in / index / count
- 统计：sum / max / min / len + 累加器套路
- 过滤：循环 + if + count / 新列表

今天把它们组装成「**电子购物清单**」——从游戏里的商店数据到现实的购物需求，都能用列表管起来。

## 二、项目 A：基础购物清单（25 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `shopping_list.py`。

需求：

- 空列表起步
- 菜单循环：add / list / remove / quit
- add：input 物品名，append 到列表
- list：打印所有物品（带编号）
- remove：input 物品名，remove 第一个匹配
- quit：退出

参考实现：

```python
print("=== Shopping List ===")

items = []

while True:
    action = input("\n(add/list/remove/quit): ").strip()

    if action == "add":
        name = input("Item name: ").strip()
        items.append(name)
        print(f"Added '{name}'")
    elif action == "list":
        if not items:
            print("List is empty")
        else:
            for i, item in enumerate(items):
                print(f"{i+1}. {item}")
    elif action == "remove":
        name = input("Item to remove: ").strip()
        if name in items:
            items.remove(name)
            print(f"Removed '{name}'")
        else:
            print(f"'{name}' not in list")
    elif action == "quit":
        print(f"\nFinal list ({len(items)} items):")
        for i, item in enumerate(items):
            print(f"{i+1}. {item}")
        break
    else:
        print("Unknown action, try again")
```

### 拆解

- **`.strip()`**：去掉输入前后的空格（防止 "add " 输入被误判）
- **`enumerate(items)`**：自动编号（i 从 0 开始，加 1 变 1-N）
- **三层 if / elif / else**：动作分发
- **`if not items:`**：空列表判定（空 = falsy）

## 三、项目 B：价格 + 总价（25 分钟）

> 📁 同目录新建 `shopping_with_prices.py`。

需求：在 A 基础上，每个物品有「名字 + 价格」，最后打印总价。

参考实现：

```python
print("=== Shopping List with Prices ===")

items = []  # Each item: [name, price]

while True:
    action = input("\n(add/list/remove/total/quit): ").strip()

    if action == "add":
        name = input("Item name: ").strip()
        price = float(input("Price: "))
        items.append([name, price])
        print(f"Added '{name}' at {price}")
    elif action == "list":
        if not items:
            print("List is empty")
        else:
            for i, (name, price) in enumerate(items):
                print(f"{i+1}. {name} - ${price:.2f}")
    elif action == "remove":
        idx = int(input("Item number to remove: ")) - 1
        if 0 <= idx < len(items):
            removed = items.pop(idx)
            print(f"Removed '{removed[0]}'")
        else:
            print("Invalid number")
    elif action == "total":
        total = sum(price for name, price in items)
        print(f"Total: ${total:.2f}")
    elif action == "quit":
        break
    else:
        print("Unknown action")
```

### 关键技巧

- **嵌套列表** `[[name, price], ...]`：每个 item 是两元素列表
- **`for i, (name, price) in enumerate(items):`**：元组拆包，直接拿到名字和价格
- **`sum(price for name, price in items)`**：生成器 + sum，按价格累加
- **`float(input("Price: "))`**：输入转浮点数（W02-L01 学的）

## 四、项目 C：分类清单（25 分钟）

> 📁 同目录新建 `shopping_categorized.py`。

需求：物品分「食品 / 日用品 / 其他」三类，分类统计。

参考实现：

```python
print("=== Categorized Shopping List ===")

food = []
daily = []
other = []

while True:
    action = input("\n(add/list/total/quit): ").strip()

    if action == "add":
        name = input("Item name: ").strip()
        category = input("Category (food/daily/other): ").strip()
        if category == "food":
            food.append(name)
        elif category == "daily":
            daily.append(name)
        else:
            other.append(name)
        print(f"Added '{name}' to {category}")
    elif action == "list":
        print("\n--- Food ---")
        for i, item in enumerate(food):
            print(f"{i+1}. {item}")
        print("--- Daily ---")
        for i, item in enumerate(daily):
            print(f"{i+1}. {item}")
        print("--- Other ---")
        for i, item in enumerate(other):
            print(f"{i+1}. {item}")
    elif action == "total":
        print(f"Food: {len(food)}, Daily: {len(daily)}, Other: {len(other)}")
        print(f"Grand total items: {len(food) + len(daily) + len(other)}")
    elif action == "quit":
        break
```

### 拆解

- **三个列表**：一个分类一个列表，简单直观
- **`len(列表)`**：分类计数
- **未来升级**：用字典 `{food: [], daily: [], other: []}` 更优雅（W10 学）

## 五、验收标准（自助验收）

- [ ] 三个项目（A 基础 / B 价格 / C 分类）至少做两个
- [ ] add / list / remove / quit 都跑通
- [ ] add 一个，输入错误动作（比如 `xxx`），看到「Unknown action」分支
- [ ] 删一个不存在的物品，看到正确报错（不崩）
- [ ] 给家人用过这个清单，至少加 5 个真实物品

## 六、W06 全周自查

- [ ] L01：列表创建 + 索引（从 0 开始）+ for 遍历
- [ ] L02：增删改查四件套：append / remove / pop / 索引赋值 / in / count
- [ ] L03：sum / max / min / len + filter 模式 + list comprehension 能读懂
- [ ] 周末：购物清单 A + B 至少完成，能给家人用
- [ ] 我能给家人解释「一个列表管一批数据，循环一遍处理完」

W06 毕业 🎓 → 进入 W07「🏆 项目周：文字冒险游戏」。三天搭骨架 + 周末打磨，把 W01-W06 全部功夫串成一个完整的可玩游戏。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
#include <vector>
int main() {
    std::vector<std::string> cart = {"apple", "milk"};
    cart.push_back("bread");
    for (auto& x : cart) std::cout << x << " ";
    return 0;
}
```

三个认脸：

1. `std::vector<std::string>` 字符串列表
2. `cart.push_back("bread")` 加
3. for 循环遍历

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
