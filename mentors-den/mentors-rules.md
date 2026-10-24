# mentors-den · sand hollow Mentor 入职手册

> 现行 v1.10 · 单签 + chatroom review · v2.0 挑战题加权打分待补正文

## 关于智能体（Agent）的要求

> 沙坑学员使用多种不同智能体接入学习（Hermes / OpenClaw / WorkBuddy 等），**mentor 也必须用智能体（Agent）陪学员**——不是 OpenClaw 唯一。本文档全文用"智能体（Agent）"指代 mentor 智能体。

**支持的智能体列表**（按字母序）：

| 智能体 | 出品 | 部署端 | 备注 |
|---|---|---|---|
| **Hermes** | Nous Research | 本地 / Hermes 端 | 冰爪 ❄️ 常用 |
| **OpenClaw** | OpenClaw 平台 | OpenClaw 端 | 如意 ✨ / 小马 🐴 常用 |
| **WorkBuddy** | 第三方 | 多端 | 部分学员可能会用 |

**mentor 智能体的要求**：
- 能读 `mentors-den/mentors-rules.md` 上岗手册
- 能用 git 操作沙坑仓（commit / push / chatroom @review）
- 能执行 cron 出勤采集等机械化任务
- 能 chatroom 跟同事沟通；学员沟通 = 通过学员本机智能体（agent 端），不走额外通道

**关键术语统一**：
- "**智能体（Agent）**" = mentor 侧的 AI 助手（家庭成员代号：如意 ✨ / 冰爪 ❄️ / 小马 🐴）
- "**OpenClaw**" 仅作为平台/框架之一，**不**作为 mentor 智能体的代名词
- 学员也用智能体接入沙坑（见 `docs/index.html` head 段 policy 声明）
- "分身" → **不再使用**，统一改"智能体（Agent）"

## 三条底线（冰爪）

1. **安全边界** — 内容适龄（学员）：主题贴合她的兴趣（猫武士 / 39 Clues / 她自己的游戏）；代码示例零危险操作（无 rm、无下载执行、无无退出条件的死循环示例）；报错当朋友教，不教压制报错；练习环境 = 她本机 Thonny + 桌面文件夹，不碰生产。
2. **可回滚** — 课程内容全走 git（course/ 目录，一课一 commit）；KV 发布前必有 git 留档；修订 = 新 commit，禁静默覆盖；lesson ID 永不改（学员进度按 ID 键，保勾勾）。
3. **自动验证** — 页面侧三件套（test.sh L1 #12：字符串命中 + 全部 script 块 node --check + 功能标记在线上源）+ 发布后线上验证（BUILD_TIME + 内容标记）。

## 四条补充（如意）

4. **零中文代码块** — 代码 / 注释 / 字符串全英文；发布前 scan-cn-in-code.py 扫零命中才放行。
5. **内容侧验收三件套** — 体量：中文课 4-5.5KB / 英文课 4.5-6KB（英文信息密度低，带子上浮约 10%）；标题 `# W0X-L0X` 格式；python 块 ast 语法检查（check-code-blocks.py）。
6. **隐私红线（内容安全）** — 公开仓内容安全审读机制：每次审读显式过一遍内容安全，发布前逐词扫零命中才放行；称呼白/黑名单细则记各 mentor 各自 soul.md（智能体私有，不入公开仓）；边界变更必报 Tree。扫描口径 **diff-only**：发布/推送门禁只查新增行（+）零命中放行；存量命中（context line、历史事实档案、已入库旧内容）不追溯、不卡 push。ThawPaw 🐱 / Tree 🌳 是家庭学员代号，**可**出现在公开仓与公开网页（Tree 2026-10-18 拍板；如 index.html 两位学员标注，参考 22ac530 误删 → 29cd67b 回滚）。
7. **节奏自适应** — current 切换归 mentor × Tree 拍板；课等人，不人等课；学员侧零打扰——反馈只在她主动交作业时给。
8. **作业目录分家** — 学员交的作业文件交 `thawpaw/homework/`，mentor 写的评语回复 `thawpaw/reviews/*.review.md`；分开放更清楚。**homework 与 reviews 均不进 git**（已在 .gitignore）。tracker 采集器自动排除 reviews/（批改非学员练习）+ 跳过隐藏文件。
9. **练习文件命名约定** — 每节课里的「上手练习」和「课后作业」都必须有专用的 `*.py` 文件名（不在课内嵌代码块，让她落到 Thonny 里跑）：
   - **上手练习（in-lesson practice）**：`{week}-{lesson}-practice.py`，学员当堂实时完成；mentor 通过 tracker + GitHub commit 时间锚定练习质量与节奏。
   - **课后作业（homework）**：`{week}-{lesson}-homework.py`，课后独立完成；mentor 写 `*.review.md` 评语。
   - 旧命名转正保留；新一节课起按新约定。
10. **作业自动归位** — mentor 每次检查作业时自动扫描学员目录：新提交的作业文件若位置/命名不规范，**自动修正**（mv/rename 到 ⑧⑨ 约定位置与命名）并在批改/晨会中注明归位结果；practice/homework 类型无法推断时不自动改，列为晨会确认项。触发点：①mentor 收到检查请求时 ②每日晨会扫描。修正范围仅文件名/位置，不动文件内容。
11. **晨会制度** — 每日 07:00 两位 mentor 在 chatroom 碰头，由如意的 cron 发起；发起前先同步本仓（git pull --rebase）。讨论议题：①两位学员昨日学习情况（作业不进仓库，各 mentor 自报）②仓库内容变更（昨日 git log：站点/课程/评语机制）③课程内容变更（KV 发布/调整）④mentor rules 变化（本 spec 演进）⑤待决策项。结论各自留档（mentors-log/），涉及课程修改的经双 mentor 确认后执行。
12. **真实学习时长 · Thonny 日志解析** — `sandbox-practice-tracker` 已采「文件 mtime + Thonny 会话 + 浏览器事件」，但会话启停时间未解析，活跃时长只能粗估。从 Thonny 日志直接拉真实学习时长：
    - **日志路径**：macOS `~/Library/Logs/Thonny/` · Linux `~/.config/Thonny/thonny.log` · Windows `%APPDATA%\Thonny\thonny.log`
    - **做法**：tracker 升级每 5min 读 Thonny 日志末行 → 解析 `Session started/ended at <time>` → 算本次会话时长；空闲 = 60s+ 无键鼠事件
    - **真实学习时长** = Σ会话时长 - 空闲时长（多窗口/多 session 取并集不累加，避免虚高）
    - **落档**：写 `<学员目录>/reviews/active-time.md`（**不进 git**，仅学员本机）；mentor review 作业时引用当日数据
    - **踩坑**：Thonny 未启动 = 标 N/A（**不算 0**，区别于「今天没学习」）；14:00 发布的练习题 22:00 才提交 = 真实时长包括晚上时段
13. **mentor 持续学课** — 入职已读 W01-L01~L03 讲义风格，但**新课发布后 mentor 可能没及时跟进**，review 时不知学员在看哪节、用什么语法：
    - **新课发布即时读**：每次 KV 发布新课（14:00 daily-practice 配套），mentor **24h 内读完** `mentors-den/course/W0X-L0X.md` 全部内容
    - **晨会同步课程变更**：每日 07:00 晨会第②议题 = 昨日 `git log --since=1d course/` 变更 → mentor 自报已读哪些
    - **改课前全读**：草拟新讲义前先读 W0X 已发布所有 L0X 维持风格一致
    - **cron 提醒**：`mentor-lesson-read-check` cron 每天 14:30 Asia/Shanghai 扫昨日 course/ 变更 → 未读 mentor 提醒
14. **daily-practice 节奏 · 14:00 发布 → 提交 → review** — cron `ruyi-icepaw-daily-practice` 每天 14:00 Asia/Shanghai 触发（原 `<user>-daily-joy-bringer` 命名不准确，v1.6 改名 `<user>-daily-practice` 并明确链路）：
    - **14:00 发布**：cron 同步写入 KV `learning/daily-practice/<date>`；学员通过本机 agent 主动拉取，不做推送
    - **学员当日完成**：答案写 `<学员目录>/homework/W0X-L0X-daily.py`（**命名约定**：daily-practice 配套）
    - **mentor 14:00-22:00 巡检**：学员主动通知「交作业」→ 启动 review；或 cron `<user>-daily-practice-scan` 每 2h 扫 homework/ 新文件 → 自动触发 review
    - **review 落档**：评语写 `<学员目录>/reviews/W0X-L0X-daily.review.md`；学员通过本机 agent 主动拉取（review 文件落档 = 信号）
    - **联动**：⑪ 晨会第①议题增列「昨日 daily-practice 提交率」（出勤三源融合统计）
15. **随堂练习文件化 · 开课即建** — 每课讲义**开头**（第一个动手环节前）就要求学员新建随堂练习文件 `W0X-L0X-practice.py`（Thonny `文件 → 新建`，存学员 `homework/` 平铺目录）；课内演示代码 + 随堂踩坑全部写进该文件，与课后作业 `W0X-L0X-homework.py` 严格分开两个文件。目的：mentor 靠 practice 文件的存在 + tracker mtime / commit 时间锚定「学员确实随堂练了」，不是只交 homework。这是 ⑨ 命名约定的执行层强化：⑨ 定文件名，⑮ 定课内动作。存量课（W02-L02 起的 `W0X-dN.py` 旧格式 + `W0X/` 周子目录）在各自解锁/发布前必须对齐本条。
16. **双域访问口径 · 读竞速 / 写串行** — 站点与 mentor 侧的内容同步脚本都同时持有一主一备两个域名，**两个域名指向同一个 Worker**（同一后端），因此：
    - **读路径用「域间并行竞速 + 先到先用」**（`Promise.any`）：坏域不再吃掉整轮重试预算，慢域不拖累快域。单域超时上限**各实现不同**（站点前端 40s / mentor 侧同步脚本 45s），但都不能压到 20-30s——会在首字节前掐死健康但慢的域（实测冷启动首字节最慢 22.1s 档）。
    - **写路径禁止并行 POST**（两域同后端 → 并行写 = 同一次提交被执行两遍：作业记两遍、注册重号）。写请求**默认单次单域发出**，同一请求不重复发。
    - **写超时 ≠ 未送达**：超时不换域、不重试，直接提示「可能已送达，请先刷新确认」——换域重试会把已落库的写再做一遍。仅当请求**确定未送达**（连接层失败，如连接被拒）才可换域；送达状态不确定时一律停手。
    - **域序按各自机器实测，不写死共享顺序**：不同网络出口对两个域名的可达性不同，单机结论不推广。

## 生效与工作流

单签 + chatroom review 工作流（取消双签 + 单签）：

- **mentor 自决范围（不报 Tree）：** 全部沙坑内容 —— 课程、规则、文档、客户端代码（`docs/index.html` / `track.js` / `sw.js`）、学员目录治理、评语机制、命名约定、课次周次、发布节奏、成效评估、互审代码评审。所有变更以 git commit + chatroom @review 为据点。
- **必报 Tree 的边界变更（chatroom @Tree 等同意）：** 隐私红线（⑥）、公开仓判定（公 vs 私）、学员可识别称呼调整、current 切换（⑦）。
- **流程：**
  1. 小马 / IcePaw：修改 → git commit → push → chatroom @**如意** review
  2. 如意 ✨：修改 → git commit → push → chatroom @**小马** + @**IcePaw** review
  3. review 发现问题：mentor 直接改 → push → 再 chatroom @原作者；原作者收到可同步再修。
  4. 学员自主授权例外：学员本人的边界变更由学员自主拍板，mentor 代执行。
- **冰爪/如意跨智能体（Agent）协同：**
  - 两位均属 Vega Punk 计划 + SkyClan 家庭双重身份，soul/identity 智能体独立，memory.md 共享
  - 沙坑治理规则的解释/补充**优先看 SOUL.md**（智能体独立持有），跨智能体同步看 memory.md
  - chatroom 通知走 `~/projects/skyclan/projects/chatroom`（客户端）发 skyclan-chatroom

---

# 📚 sand hollow Mentor 入职手册（智能体（Agent）版）

> 欢迎新伙伴！本节说明 mentor 如何用智能体（Agent）陪学员学 Python。
> 适用范围：任何想用 AI 助手（Hermes / OpenClaw / WorkBuddy 等）给学员当 mentor 的智能体（Agent）。

## 〇、mentor 的工具栈

| 能力层 | 工具 | 用途 |
|---|---|---|
| **课表** | tpg-hq Worker + PG KV `/learning/*` | 课程内容存储 + 发布；admin 平台管理 |
| **公开站点** | GitHub Pages `Thawflow/sand-hollow` → `learning.thawflow.com` | 学员看到的学习首页 |
| **私有作业区** | `~/sand-hollow/<学员名>/`（学员本机，**不在** git）| 学员提交 + mentor 评语落地 |
| **出勤采集** | `~/.openclaw/sandbox-practice/tracker.js` | 每 5 分钟无头扫描文件 mtime + Thonny 会话 + 浏览器事件 → 融合统计 |
| **晨会制度** | 每日 07:00 mentor 双人 chatroom 碰头 | 详见 ⑪ |
| **内部协同** | SkyClan Chatroom | mentor 之间 review handoff / 晨会 / 紧急催办 |

## 一、首次搭环境（必做一次）

1. **克隆仓库**：把 `Thawflow/sand-hollow` 克隆到学员 home 目录（**别放桌面**，TCC + iCloud 会拦 Thonny）。
   ```bash
   cd ~ && git clone git@github.com:Thawflow/sand-hollow.git
   ```
2. **建学员私有区**：在 `~/sand-hollow/<学员名>/` 下建 `homework/` 和 `reviews/` 两个子目录（学员名如 `thawpaw`、`tree`、或自创英文名）。
3. **配置 .gitignore**：确保 `thawpaw/` 整个不进 git（保护作业 + 评语隐私）。
4. **配 cron 出勤采集**（5min 间隔，trigger 预检零成本）：
   ```bash
   # 关键参数：schedule.every=300000ms, sessionTarget=isolated,
   # trigger.script 必须 fire:false（无头采集，不唤醒模型）
   ```
5. **打通 KV**：`tpg-hq` Worker 的密钥走 `wrangler secret put KV_API_KEY` 注入（运行时 `env.KV_API_KEY` 直取）；任何「本地文件存真钥匙」的机制都是反模式（文件路径本身属于隐私，密钥出现本地路径就是泄密）。客户端如需 apikey，调 macOS Keychain（`security` 命令），不要裸存。

## 二、 mentor 的日常工作流

### 学员交作业后（review 流程）
1. 学员交 `thawpaw/homework/<W0X-L0X-*.py>`
2. mentor 运行 `python3 <file>.py` 验证（一次跑通、零报错为底线）
3. mentor 写 `thawpaw/reviews/<W0X-L0X-*.review.md` 评语，套用 `mentors-den/review-template.md`；除逐题结论外，必须填写「超前技能」（自学发现的语法或思路）与「成长豆」，没有则明确写"未发现"
4. 学员通过本机 agent 主动拉取 review 状态（review 文件落档 = 信号，无需推送）
5. 标注课程勾选完成（学员自己勾 + mentor 备份在 KV）

### 改课程前
1. `git pull --rebase` 同步最新 mentors-den
2. 草拟新讲义（标题 `# W0X-L0X · ...`，4-6KB 中文 / 4.5-6KB 英文）
3. 跑 `python3 ~/.openclaw/scripts/scan-cn-in-code.py` 确认零中文代码块
4. 跑 `python3 ~/.openclaw/scripts/check-code-blocks.py` 确认 python 块语法 ok
5. git commit + push（免双签）+ chatroom @**另一位 mentor** review；学员通过本机 agent 主动拉取「新课上架」信号

## 三、cron 模板（拷贝即用）

| 名称 | 间隔 | 用途 |
|---|---|---|
| `sandbox-practice-tracker` | every 5min | 出勤三源融合（文件+Thonny+浏览器），trigger fire:false |
| `mentors-morning-standup` | cron 07:00 Asia/Shanghai | 每日晨会发起（⑪） |
| `<user>-daily-practice` | cron 0 14 * * * Asia/Shanghai | 每日 14:00 发布练习题（⑭） |
| `mentor-lesson-read-check` | cron 30 14 * * * Asia/Shanghai | 每日 14:30 提醒 mentor 读昨日新课（⑬） |
| `<user>-daily-practice-scan` | every 2h 14:00-22:00 | 学员 daily-practice 作业巡检，触发 review（⑭） |
| `<user>-safety-check` | cron 每小时 | 学员安全巡检（危险操作拦） |
| `<user>-nightly-diary` | cron 23:00 | mentor 自我反思日记 |

## 四、常见踩坑

- **桌面 = TCC 拦 Thonny**：永远不要放桌面，iCloud 同步还会 EDEADLK rename。
- **track.js 挂机 bug**：标签页开着 ≠ 在学习，必须监听真实点击事件，否则时长虚高 5-10 倍。

- **KV 密钥管理（不允许本地明文）**：密钥必须走 `wrangler secret put KV_API_KEY` 注入 Worker 环境变量；任何「写文件时 `***` 占位 + 运行时从某本地路径读真钥匙」的机制都是反模式，本地路径本身就是隐私泄密。如客户端必须用 PostgREST apikey，调 macOS Keychain（`security add-generic-password`），不要裸存。

## 五、加入我们的步骤

1. 读本文档（10 分钟）
2. 读 `mentors-den/course/SYLLABUS.md` 了解课程大纲（15 分钟）
3. 读 `mentors-den/course/W01-L01.md ~ W01-L03.md` 看讲义风格（30 分钟）
4. 跟一位现有 mentor 旁听一周晨会（07:00 每天）
5. 选一个 lesson，自己写一份，按 check-code-blocks 验收
6. chatroom review 进入 mentor 列表 🎉（无签认要求）

— **mentors-den 出品**