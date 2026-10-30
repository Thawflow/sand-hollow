# Sand Hollow · 依赖说明

> 沙坑（学习站）依赖什么、从哪来、坏了怎么办。
> 最后更新：2026-10-29

---

## 1. 两条链，一张图

```
┌── 静态链（课程内容）──────────────────────────────┐
│                                                    │
│  mentors-den/course/*.md   ← 唯一真值（17 周 97 课）│
│         │                                          │
│         │ node mentors-den/scripts/build-course-html.js --out-dir docs/course
│         ▼                                          │
│  docs/course/W01..W17.html + index.json            │
│         │                                          │
│         │ git push → GitHub Pages 自动发布          │
│         ▼                                          │
│  https://learning.thawflow.com/                     │
└────────────────────────────────────────────────────┘

┌── 动态链（登录 + 进度）────────────────────────────┐
│                                                    │
│  浏览器（docs/index.html）                          │
│         │ fetch POST /learning/progress/{save,load} │
│         │ fetch POST /verify                        │
│         ▼                                          │
│  CF Worker  tpg-hq.thawflow.com                     │
│  （真源：skyclan 私仓 projects/cf-worker/worker/index.js）│
│         │ env.POSTGREST_URL + env.KV_API_KEY         │
│         ▼                                          │
│  PostgREST → PostgreSQL  kv_store 表                │
└────────────────────────────────────────────────────┘
```

**关键：课程内容完全不走 Worker。** 静态化之后，Worker 只管**登录身份**和**进度同步**。

---

## 2. 静态链（课程）

| 项 | 值 |
|---|---|
| **真值** | `mentors-den/course/*.md` |
| **构建器** | `mentors-den/scripts/build-course-html.js` |
| **构建命令** | `node mentors-den/scripts/build-course-html.js --out-dir docs/course` |
| **产物** | `docs/course/W01.html` … `W17.html` + `docs/course/index.json` + `docs/syllabus.html` |
| **发布** | 产物**入 git** → `git push` → GH Pages 自动发布 |
| **覆盖** | 17 周 / 97 课，不重不漏 |
| **防漂移** | `.githooks/pre-push` —— md 改了没重新构建 → 拦截 push |

### 为什么产物要入 git

因为用的是 GitHub Pages（CF 自定义域名指向 Pages）。Pages 只认仓库里的静态文件，
构建在服务器侧做不了。所以**本地构建 → commit 产物 → push**。

### ⚠️ 构建必须先跑

```bash
cd ~/projects/sand-hollow
node mentors-den/scripts/build-course-html.js --out-dir docs/course
git status                      # 应看到 docs/course/ 变化
```

`.githooks/pre-push` 会拦（md 与 HTML 不一致 → rc=1）。若 hook 未生效，检查：

```bash
cd ~/projects/sand-hollow
git config core.hooksPath     # 应为 .githooks
```

---

## 3. 动态链（登录 + 进度）

| 端点 | 用途 | 存储键 |
|---|---|---|
| `POST /register` | 注册新学员号 | `player:<id>` |
| `POST /verify` | 校验已有号 | `player:<id>` |
| `POST /learning/progress/save` | 保存进度 | `learning:prog:<id>` |
| `POST /learning/progress/load` | 读取进度 | `learning:prog:<id>` |

**存储：** PostgREST → PostgreSQL `kv_store` 表。**不是 CF 原生 KV。**

**后端真源：** skyclan 私仓 `projects/cf-worker/worker/index.js`
（本地 checkout 路径见各机私有配置；路径不落公开仓）

**部署：**
```bash
cd <skyclan 私仓本地 checkout>/projects/cf-worker
npx wrangler deploy --name tpg-hq --compatibility-date 2024-12-01 \
  --keep-vars --outdir /tmp/deploy-out-cfworker worker/index.js
```
完整 SOP 见 `projects/cf-worker/docs/DEPLOY.md`。

**★ `--keep-vars` 必带** —— 不带会清空 `KV_API_KEY` / `SEED_SECRET` / `POSTGREST_URL` → 全站 500。

### 前端同步机制（`docs/index.html`）

| 层 | 作用 |
|---|---|
| **localStorage** | 保底。离线/接口挂了也能用 |
| **云端** | 跨设备同步。`learning:prog:<id>` 单键 last-write-wins |
| **合并** | **并集合并**——勾选只增不减；位置按 `ts` 取新 |
| **防抖** | 2s。避免每勾一下就写一次 |
| **时序** | 登录后拉云端；刷新后也拉云端（`initLoginGate` → `loadProgressFromCloud`） |

前端缓存键：`learning-d:weeks` `learning-d:wk:W##` `learning-d:syll` `learning-pos` `learning-checks`

---

## 4. 沙坑依赖的后端端点清单

改 Worker 端点前先看这张表——**动这几个会影响沙坑**：

| 端点 | 沙坑侧影响 |
|---|---|
| `/register` | 注册流程 |
| `/verify` | 登录门 |
| `/learning/progress/save` | 进度写入 |
| `/learning/progress/load` | 进度读取 |
| `/learning/weeks` `/learning/week/:id` `/learning/syllabus` | **静态链的回滚路径**，必须保持 200 |

> 后三个课程读路由虽已静态化，**必须保持可用**——静态站出问题时是回滚路径。
> `worker/tests/progress-endpoints.test.js` 里有对应断言。

---

## 5. 故障隔离表

| 症状 | 是哪条链坏了 | 处置 |
|---|---|---|
| 课程页打不开 / 白屏 | **静态链** | 查 GH Pages 构建；`docs/course/index.json` 是否入 git |
| 课程页少一半（无报错） | **静态链 + CDN 抖动** | 重试。CF 不缓存 HTML（`cf-cache-status: DYNAMIC`），每次都穿透 Pages |
| 登录转圈 | **动态链** | `curl https://tpg-hq.thawflow.com/learning/weeks` 看 Worker 是否活 |
| 进度不保存 | **动态链** | 看浏览器 console；查 Worker 是否 500（多半是 env 丢了） |
| 进度丢了 | 动态链 | 先查 localStorage（保底层），再查 `learning:prog:<id>` |
| 刚注册的号登录失败 | **不是故障** | PostgREST 主从复制延迟 3–5s，等一下再试。前端已自动重试 |

---

## 6. 沙坑自身的仓库

| | |
|---|---|
| **路径** | `~/projects/sand-hollow/` |
| **远端** | GitHub `Thawflow/Sand-Hollow`（**公开**） |
| **发布** | push 到 `main` → GH Pages → `learning.thawflow.com` |
| **唯一真值** | `mentors-den/course/*.md`（课程）+ `docs/`（静态前端产物） |

**公开仓里绝不能有：** 后端真源、PG 访问配置、凭证、私域数据。

---

## 7. 相关文档

| 文档 | 位置 |
|---|---|
| Worker 架构 + API 契约 | skyclan `projects/cf-worker/docs/ARCHITECTURE.md` |
| Worker 部署 SOP + 回滚 | skyclan `projects/cf-worker/docs/DEPLOY.md` |
| TPG 运营手册 | skyclan `projects/tpg-hq/docs/OPERATIONS.md` |
| 课程静态化架构 | `mentors-den/` 相关 skill + 本仓 README |
