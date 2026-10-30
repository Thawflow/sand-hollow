---
name: "sand-hollow-grading"
description: "判作业/批改W0X-L0X/沙坑作业检查:实跑验证→写review评语→⑩命名归位→commit/push→chatroom@如意(v1.8)"
---

# Sand Hollow 沙坑作业批改（判作业 → 发布 → chatroom review）

沙坑 = `~/projects/sand-hollow`（mentor 机上的 canonical 路径；**学员机上是 `~/sand-hollow/`**，两种都指向同一仓 —— 远程 Thawflow/Sand-Hollow，main 分支）。学员目录：Tree（猴哥）= `tree/`（进 git，9/8 猴哥解 ignore）；Thawpaw = `thawpaw/`（gitignore 保护隐私）。

## 步骤

1. **读三样再判**：`mentors-den/mentors-rules.md`（重点 ⑧⑨⑩⑮⑫ + v1.8 工作流）、`mentors-den/course/W0X-L0X.md`（题面 + 第八节答案）、学员 `homework/W0X-L0X-practice.py` 与 `W0X-L0X-homework.py` 两个文件都读（⑮ practice 证明随堂真练过）。
2. **实跑验证，不靠目测**：先 `python3 -m py_compile` 两文件；input 类按题目顺序喂 `printf '输入1\n输入2\n' | python3 <file>`；逐题对照第八节答案。题面偏差（如指定 Firestar 却用 Fireheart）= 方法分、不给全分。同款引号 f-string（`f"{"x"}"`）在 py3.12+ 靠 PEP 701 能跑通——不是跑挂，是违坑②规范（≤3.11 崩），记成长豆。圈题面门禁（2026-09-28 立，Tree 三轮题面参数偏差后）：每题首行须 `# 题面: 数字/比较符` 注释，缺失的题直接退回不看代码；题面带问句的，注释里必须作答。
3. **写评语**：`<学员>/reviews/W0X-L0X-{practice,homework}.review.md`，practice/homework 分开两文件，沿用既有格式：头部（学员 / mentor / 日期 / 文件 size / 验证方式）→ 整体评分（⭐1-5 + /100）→ 亮点（编号）→ 成长豆（编号，给出修复代码对照）→ 通过结论（能否进下一课）。学员 practice 注释里的提问，在评语里正式回答。⑫ active-time.md 无数据标 N/A（不算 0）。Tree 默认 mentor 是如意，小马批改时头部写「小马（MK-002 野・行动，代如意执行）」。
4. **⑩ 命名归位**：不符 ⑨ 约定（大写 W0X-L0X、`-practice.py`/`-homework.py` 后缀、目录平铺）的文件 mv 归位——只动文件名不动内容，评语里注明。
5. **提交推送**（仅 tracked 内容；thawpaw/ 永不）：
   - commit 格式 `[小马] homework: ...`，一主题一 commit。
   - append `.gitignore` 前先 `tail -c 1 <file>` 确认末行有 newline——末行无 newline 时 `echo >>` 会粘连致规则失效（9/13 实踩）；append 后必 `git check-ignore <路径>` 命中才算成。
   - 推送需猴哥明文批准（「推送」「你提交，推送」均算）；执行 `git pull --rebase origin main && git push origin main`，rebase 常带入如意新 commit，属正常。
6. **chatroom @如意 review（v1.8）**：在自家 chatroom 客户端目录执行 `node skyclan-send.js --to all --mentions <如意成员号> -m "@如意 review 请求：…"`。成员号真相源在各机私有档案（不落公开仓；公开仓只写「@如意」称谓 + 相对路径 `client/`）。消息含：分数星级、学员本人修复的验证结果、commit hash、顺手归位动作、评语路径。
7. **向猴哥汇报**：①做了什么 ②为什么 ③影响范围，附 commit hash 与 chatroom msg_id。

## 边界

- 勿改 course/ 课程内容与 mentors-rules 本体（修改走 v1.8：改 → push → chatroom @review）。
- Thawpaw 目录内容不进任何公开 commit；评语与公开仓内只写白名单称呼（Thawpaw / Tree / 猴哥）。
- 路由区分（2026-10-06 猴哥指示）：批改 review 仍 chatroom @如意（v1.8）；沙坑**迭代/管理/交接**类事项总负责人是 IcePaw，调研与建议 DM 给她，不经如意。交接前先清自身欠账（未推的判改 commit 推掉，仓库干净再交接）。
- **仓内字面批量替换的范围门禁**（2026-10-07 猴哥纠正后立）：`sed`/`find | xargs sed` 横扫多文件改字面前，先确认意图是**通用措辞**还是**本机偏好**——仓库路径、用户名、IDE 配置、本地 clone 位置等本机设置**绝不进仓**。规则"批量替换前问一句：这是不是本机偏好"。本机设置若要持久化，去 `~/.openclaw/workspace/SOUL.md` / 各机本地配置更新，不动仓内字面。仓库是面向所有人的，本机自己管本机。
