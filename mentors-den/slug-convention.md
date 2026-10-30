# Slug 命名约定 v1.2（猴哥 2026-10-19 指示"slugs 命名都与每节课对应"）

> 沉淀位置：~/projects/sand-hollow/mentors-den/slug-convention.md
> 维护人：小马 沙坑帮手
> 配套：家庭约定 `family/课程完整性检查.md`（完整性检查规则）
> **v1.2 升级（2026-10-19）**：32 个 slug 按真实标题重命名 + 解 1 个 weekend slug 冲突（详见 §"完整 slug 表"）

---

## 🎯 设计目标（猴哥 2026-10-19）

> "要自己能够分辨哪些是基础课，哪些是算法加餐课，可以考虑用 slug 来标识"

**两层识别**：
1. **slug 字符串**——通过命名约定（基础用通用词 / 加餐用算法专属词）
2. **frontmatter type 字段**——`type: addon`（加餐）/ `type: base`（基础 5 节制）/ `type: project`（weekend 综合项目）

---

## 📐 命名规则

### 格式

```
<!-- slug: <slug>, type: <type> -->
```

- `slug`：kebab-case，全小写，**不带 W## 前缀**（slug 永久稳定，可重排）
- `type`：`addon` / `base` / `project` 三选一

### 命名约定

| 类型 | slug 命名 | 示例 |
|---|---|---|
| **加餐 5 节制** | 算法/数据结构专属词 | `binary-search`, `big-o`, `greedy-coin`, `selection-sort`, `recursion-mirror` |
| **基础 5 节制** | 主题 + 子主题 | `list-intro`, `list-ops`, `if-elif`, `function-def`, `turtle-basics` |
| **基础 weekend** | 主题 + 形式 | `name-lab`, `pattern`, `guess-game`, `treasure`（项目）|
| **项目周** | 通用前缀 | `cat-adv-*`（画地图）/ `grad-*`（毕业）|

### 不允许的命名

- ❌ 数字前缀：`w06-s1`（不能反映内容，文件移动就失效）
- ❌ 包含 "week"：`week1-list`（与 W## 重复）
- ❌ 大写：`ListIntro`（违反 kebab-case）
- ❌ 用文件名作 slug：`w02-s1`（与文件名耦合，永久稳定失效）

---

## 📋 完整 slug 表（17 周 97 节）

### W01 起步（3 节制 + 1 weekend，豁免 AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W01-L01.md | `thonny-hello` | base |
| W01-L02.md | `variable` | base |
| W01-L03.md | `input` | base |

### W02 数字与文字（5 节制 + 1 weekend，豁免 AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W02-S1.md | `number-type` | base |
| W02-S2.md | `operator` | base |
| W02-S3.md | `string` | base |
| W02-S4.md | `string-index` | base |
| W02-S5.md | `f-string` | base |
| W02-weekend.md | `name-lab` | project |

### W03 条件（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W03-S1.md | `if-intro` | base |
| W03-S2.md | `if-compare` | base |
| W03-S3.md | `if-pitfalls` | base |
| W03-S4.md | `if-elif` | base |
| W03-S5.md | `if-and-or` | base |
| W03-weekend.md | `guess-size` | project |

### W04 循环（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W04-S1.md | `for-intro` | base |
| W04-S2.md | `for-range` | base |
| W04-S3.md | `for-sum` | base |
| W04-S4.md | `for-max` | base |
| W04-S5.md | `for-nested` | base |
| W04-weekend.md | `pattern` | project |

### W05 while（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W05-S1.md | `while-intro` | base |
| W05-S2.md | `while-condition-update` | base |
| W05-S3.md | `break-art` | base |
| W05-S4.md | `guess-number-assemble` | base |
| W05-S5.md | `guess-number-polish` | base |
| W05-weekend.md | `guess-game` | project |

### W06 ★ 加餐① 二分（5 节制 + 1 weekend，**豁免** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W06-S1.md | `binary-search` | addon |
| W06-S2.md | `big-o` | addon |
| W06-S3.md | `binary-search-code` | addon |
| W06-S4.md | `binary-search-practice` | addon |
| W06-S5.md | `algorithm-compare` | addon |
| W06-weekend.md | `treasure` | addon |

### W07 列表（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W07-S1.md | `list-intro` | base |
| W07-S2.md | `list-ops` | base |
| W07-S3.md | `list-iterate` | base |
| W07-S4.md | `list-slice` | base |
| W07-S5.md | `list-summary` | base |
| W07-weekend.md | `list-shopping-cart` | project |

### W08 画地图（项目周 5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W08-S1.md | `cat-adv-map` | base |
| W08-S2.md | `cat-adv-design` | base |
| W08-S3.md | `cat-adv-skeleton` | base |
| W08-S4.md | `cat-adv-block` | base |
| W08-S5.md | `cat-adv-save` | base |
| W08-weekend.md | `cat-adventure` | project |

### W09 ★ 加餐② 贪心（5 节制 + 1 weekend，**豁免** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W09-S1.md | `greedy-coin` | addon |
| W09-S2.md | `greedy-coin-practice` | addon |
| W09-S3.md | `greedy-coin-fail` | addon |
| W09-S4.md | `greedy-activity` | addon |
| W09-S5.md | `greedy-patrol-game` | addon |
| W09-weekend.md | `greedy-coin-game` | addon |

### W10 函数 def（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W10-S1.md | `function-def` | base |
| W10-S2.md | `function-params` | base |
| W10-S3.md | `function-default` | base |
| W10-S4.md | `function-return` | base |
| W10-S5.md | `function-refactor` | base |
| W10-weekend.md | `function-adventure-refactor` | project |

### W11 turtle（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W11-S1.md | `turtle-basics` | base |
| W11-S2.md | `turtle-square` | base |
| W11-S3.md | `turtle-color` | base |
| W11-S4.md | `turtle-polygon` | base |
| W11-S5.md | `turtle-snowflake` | base |
| W11-weekend.md | `treasure-review` | project |

### W12 ★ 加餐③ 数组 vs 链表（5 节制 + 1 weekend，**豁免** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W12-S1.md | `array-vs-list` | addon |
| W12-S2.md | `list-internals` | addon |
| W12-S3.md | `selection-sort` | addon |
| W12-S4.md | `array-vs-list-benchmark` | addon |
| W12-S5.md | `data-structure-picker` | addon |
| W12-weekend.md | `sort-race` | addon |

### W13 字典（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W13-S1.md | `dict-intro` | base |
| W13-S2.md | `dict-crud` | base |
| W13-S3.md | `dict-iterate` | base |
| W13-S4.md | `dict-nested` | base |
| W13-S5.md | `dict-codex` | base |
| W13-weekend.md | `turtle-gallery` | project |

### W14 ★ 加餐④ 递归（5 节制 + 1 weekend，**豁免** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W14-S1.md | `recursion-mirror` | addon |
| W14-S2.md | `recursion-visualize` | addon |
| W14-S3.md | `recursion-tree` | addon |
| W14-S4.md | `recursion-lru-cache` | addon |
| W14-S5.md | `recursion-maze` | addon |
| W14-weekend.md | `recursion-vs-iteration` | addon |

### W15 random（5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W15-S1.md | `random-basic` | base |
| W15-S2.md | `rps-logic` | base |
| W15-S3.md | `rps-score` | base |
| W15-S4.md | `rps-beats` | base |
| W15-S5.md | `rpg-skeleton` | base |
| W15-weekend.md | `dict-codex-final` | project |

### W16 毕业选题（项目周 5 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W16-S1.md | `grad-topic` | base |
| W16-S2.md | `grad-design` | base |
| W16-S3.md | `grad-skeleton` | base |
| W16-S4.md | `grad-block` | base |
| W16-S5.md | `grad-save` | base |
| W16-weekend.md | `grad-final` | project |

### W17 毕业项目（3 节制 + 1 weekend，**必加** AI 胶囊 + C++ 认脸）

| 文件 | slug | type |
|---|---|---|
| W17-L01.md | `grad-topic-final` | base |
| W17-L02.md | `grad-implement` | base |
| W17-L03.md | `grad-demo` | base |
| W17-weekend.md | `grad-showcase` | project |

---

**汇总**：97 个独立 slug（61 base + 12 project + 24 addon）= **完全唯一，无重复**（v1.2 修复 32 个错位 slug + 解 1 个冲突）。