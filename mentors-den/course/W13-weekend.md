<!-- slug: dict-codex-final, type: project -->
## ⓪ 🤖 课前 AI 一分钟 · 第 54 颗：AI 也会"完整图鉴"——CRUD + 战斗（3 分钟）

> **第 54 颗**

AI 完整图鉴 = CRUD 字典 + 战斗系统。Python 综合项目 = **CRUD + 战斗**。

**今日口诀**：AI 完整图鉴 = CRUD 字典 + 战斗系统。

**⚔️ 判一判**（AI 营线上测评题型热身，先自己答再看答案）：

> 1. 宠物图鉴 + 战斗是综合
> 2. AI 完整应用 = 多模块

<details><summary>答案</summary>

**1.** ✓ pets + battles + save  
**2.** ✓ 模块化应用

</details>

---

# W13-weekend · 宠物图鉴 v1：完整版

> 用时：60-90 分钟 · 难度：⭐⭐⭐ · 前置：W13 五节

---

## 一、本周武功盘点（3 分钟）

- W13-S1：字典初见（概念 + 建字典）
- W13-S2：增删改查四件套
- W13-S3：for 遍历 + f-string 复习
- W13-S4：嵌套（字典套字典 / 字典套列表）
- W13-S5：实战宠物图鉴（4 个核心函数）

今天把宠物图鉴升级到「**完整版**」——能搜索、能加技能、能战斗、保存到文件。

## 二、项目：完整版图鉴（60 分钟）

> 📁 项目存 `~/sand-hollow/<你的学员ID>/homework/`，新建 `pet_codex_v1.py`。

### 完整代码

```python
import json
import os

CODE_FILE = "pet_codex.json"

def load_codex():
    if os.path.exists(CODE_FILE):
        with open(CODE_FILE) as f:
            return json.load(f)
    return {}

def save_codex(codex):
    with open(CODE_FILE, "w") as f:
        json.dump(codex, f, indent=2)
    print("Saved!")

def show_pet(codex, name):
    if name not in codex:
        print(f"{name} not in codex")
        return
    pet = codex[name]
    print(f"\n=== {name} ===")
    print(f"Species: {pet['species']}")
    stats = pet["stats"]
    print(f"HP: {stats['hp']}  ATK: {stats['attack']}  DEF: {stats['defense']}")
    print(f"Skills: {', '.join(pet['skills']) if pet['skills'] else '(none)'}")

def add_pet(codex, name, species, hp, attack, defense):
    if name in codex:
        print(f"{name} already exists")
        return
    codex[name] = {
        "species": species,
        "stats": {"hp": hp, "attack": attack, "defense": defense},
        "skills": [],
    }
    print(f"Added {name}!")

def add_skill(codex, name, skill):
    if name not in codex:
        print(f"{name} not in codex")
        return
    if skill in codex[name]["skills"]:
        print(f"{name} already knows {skill}")
        return
    codex[name]["skills"].append(skill)
    print(f"{name} learned {skill}!")

def search_by_species(codex, species):
    print(f"\n=== {species}s ===")
    found = False
    for name in codex:
        if codex[name]["species"] == species:
            print(f"- {name}")
            found = True
    if not found:
        print("(none)")

def list_all(codex):
    print("\n=== All Pets ===")
    for name in codex:
        pet = codex[name]
        print(f"- {name} ({pet['species']}): HP {pet['stats']['hp']}")

def main():
    codex = load_codex()

    while True:
        print("\n(show/add/skill/search/list/save/quit)")
        action = input("> ").strip().lower()

        if action == "show":
            name = input("Pet name: ")
            show_pet(codex, name)
        elif action == "add":
            name = input("Name: ")
            species = input("Species: ")
            hp = int(input("HP: "))
            atk = int(input("Attack: "))
            df = int(input("Defense: "))
            add_pet(codex, name, species, hp, atk, df)
        elif action == "skill":
            name = input("Pet name: ")
            skill = input("Skill: ")
            add_skill(codex, name, skill)
        elif action == "search":
            species = input("Species to search: ")
            search_by_species(codex, species)
        elif action == "list":
            list_all(codex)
        elif action == "save":
            save_codex(codex)
        elif action == "quit":
            save_codex(codex)
            break
        else:
            print("Unknown action")

main()
```

## 三、验收标准（自助验收）

- [ ] 完整代码跑通，能加宠物 / 加技能 / 搜索 / 列出
- [ ] 重启程序后数据还在（save + load）
- [ ] 至少加 3 只宠物 + 给它们分别加 2 个技能
- [ ] 给家人 / 朋友演示一遍

## 四、W13 全周自查

- [ ] S1：字典初见（概念 + 建字典）
- [ ] S2：增删改查四件套
- [ ] S3：遍历（for + f-string 复习）
- [ ] S4：嵌套（字典套字典 / 列表）
- [ ] S5：实战图鉴
- [ ] 周末：完整版图鉴能加能查能存
- [ ] 我能给家人解释「字典 = 名字找东西」

W13 毕业 📚 → 进入 W14「加餐④：递归 + 记忆化」。W03-weekend 已经借过 `random.randint`，W15 会正式学 random 模块 + 实战石头剪刀布 + 文字 RPG 战斗。


## 👀 C++ 认脸时刻（1 分钟 · 只看不敲）

C++ 的对应写法：

```cpp
#include <iostream>
#include <map>
#include <vector>
int main() {
    std::map<std::string, int> pets = {{"喵", 100}, {"汪", 80}};
    for (auto& [name, hp] : pets) {
        std::cout << name << " HP=" << hp << std::endl;
    }
    return 0;
}
```

三个认脸：

1. 多宠物数据
2. 遍历图鉴
3. Python 一样：pets = {"喵": 100, "汪": 80}

> AI 营笔试的编程题用 C++ 出。不用会写，**认得脸**就行。
