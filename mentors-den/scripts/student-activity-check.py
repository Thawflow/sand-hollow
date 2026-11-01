#!/usr/bin/env python3
"""学员零活跃双判据检查器（2026-10-30 晨会 ⑥ 工具化 · 如意起头）。

背景（mentors-log 10-17 → 10-30 连续复现的手工判据，固化成脚本）：
  判据 A = git 维度：该学员目录末次被 commit 触碰的日期（git log -1 -- <dir>）
  判据 B = 文件维度：<dir>/homework/** 与 <dir>/reviews/** 里最新文件的 mtime
  零活跃判定 = A、B 两维都超过阈值天数（默认 7 天）⇒ 双判据同时为零才算，
  单维为零只提示（避免「交了作业没 commit」或「commit 了文档没交作业」误报）。

用法：
  python3 student-activity-check.py [--threshold 7] [--git-only] [--json]

输出（人类可读，逐学员一行）：
  <dir>  A=git:<date|never>(N天)  B=file:<date|never>(N天)  => 零活跃/活跃/单维零
退出码：0 = 无零活跃；1 = 有学员双判据零活跃（供 cron 判别）；2 = 参数错误。

⚠️ 口径边界（2026-10-30 实测踩到 · 2026-11-01 修订）：
  - 判据 A（git commit 日期）跨机器客观，任何 clone 上跑结果一致；
  - 判据 B（文件 mtime）是【本机】维度，且**只采信未被 git 跟踪的文件**：
    被跟踪的作业/评语（例：`tree/`，33 个 tracked 文件）它的 mtime = 本机
    checkout/pull 时刻 ⇒ clone 会把它重写成「今天」⇒ 假活跃。
    实测（11-01）：本机 `tree` B=2026-10-07(25天)=零活跃；
    全新 clone 同一脚本 B=2026-11-01(0天)=**活跃（假绿）**。
  - ⇒ **被跟踪的作业/评语一律走判据 A**（git 末次 commit 日，跨机一致）；
    **未跟踪的文件**才走判据 B（学员本地交作业的真实落盘证据）。
  - mtime ≈ checkout 时刻 ⇒ 标「不可判」（既不报绿也不报红）。
  - 权威判定请在作业落盘的机器上跑，或加 --git-only 只看 A。

⚠️ 学员目录发现范围（仓外克隆根也要扫）：
  旧版 REPO 取脚本所在仓根、发现只 `os.listdir(REPO)` ⇒ **只扫仓内根**。
  但 README L72 / mentors-rules L113 教学员把仓克隆到 `~/sand-hollow/` 再建
  `<学员ID>/homework/` ⇒ 那是**仓外克隆根** ⇒ 落在仓外的学员目录完全看不见。
  现口径 = **仓内根 + 仓外克隆根都扫**：
    · 仓外克隆根默认 `~/sand-hollow/`，可用环境变量 `SAND_HOLLOW_CLONE_ROOTS`
      （冒号分隔绝对路径）覆盖；
    · 仓外根不是 git 仓时判据 A **不适用**（不是「零」）⇒ 只按判据 B 判，
      `--git-only` 下标「跳过(非git仓)」而不是误报零活跃；
    · 根不存在 = 静默跳过（不是错）。

设计约束：
  - 不硬编码任何学员目录名：动态发现「根目录下含 homework/ 或 reviews/ 子目录」的目录
  - 不联网、不改任何文件；红线安全：输出只有目录名与日期，无真名
  - mtime 用本地文件系统，且**只采信未被 git 跟踪的文件**——被跟踪的作业/评语
    它的 mtime = checkout 时刻 ⇒ clone 会重写成「今天」⇒ 假活跃（11-01 实测）
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP_DIRS = {".git", ".githooks", "docs", "mentors-den", "mentors-log", "algopedia"}
WATCH_SUBDIRS = ("homework", "reviews")
TZ = timezone(timedelta(hours=8))

# 被跟踪文件路径缓存（每个 git 根一份）—— 避免逐学员多次 `git ls-files`。
_TRACKED_CACHE = {}

# 「mtime ≈ checkout 时刻」的容差窗口（秒）。checkout 物化出来的文件，其 mtime
# 与 `.git/index` 的 mtime 几乎同时（同一秒级操作）⇒ 判为可疑证据，标「不可判」。
CHECKOUT_SUSPECT_WINDOW = 300

# 2026-10-31 修（冰爪）：**探针/测试产物不是学员** ⇒ 零活跃检查器也必须排除。
#   病：仓外克隆根 `~/sand-hollow/probe-tmp/homework/probe.py`（我自己的诊断探针）
#   ⇒ discover_students() 把它当成一个「学员目录」（判据 B = 今天 0 天活跃）
#   ⇒ 学员名单里凭空多一个人 + 零活跃计数被污染。
#   实测（修前）：造 `~/sand-hollow/probe-tmp/homework/probe.py` ⇒ students 里有 'probe-tmp'，
#   flagged_raw 多 1 条。修后同场景 = 该目录整棵不采。
#   三层排除（与 tracker.js 同款口径，防「真学员目录名长得像测试 ID」）：
#     ① 目录名命中探针正则 ⇒ 整棵不采
#     ② 目录内含探针标记文件 ⇒ 整棵不采（真学员目录名 = 8 位数字，靠名字分不出来）
#     ③ 文件名命中探针正则 ⇒ 该文件不计入判据 B 的 mtime
PROBE_DIR_RE = re.compile(r"^(probe|tmp|temp|scratch)([-_.].*)?$", re.IGNORECASE)
PROBE_FILE_RE = re.compile(r"^probe([-_.].*)?$", re.IGNORECASE)
PROBE_MARKERS = (".probe", "PROBE.md", ".probe-marker")
# 2026-11-01 修（冰爪）：标记文件**放在 homework/ 或 reviews/ 里面**时旧判据漏判。
#   病：旧判据只看「学员目录根的 entries」⇒ 标记在子目录里时：① 标记文件本身被算进判据 B
#   的 mtime（假活跃）② 整棵探针树没被排除 ⇒ 同目录里任何**非 probe*.py** 的探针文件
#   （check.py / sanity.py …）照样算学员练习。
#   实测复现（隔离根）：`66666666/homework/.probe` ⇒ 该目录被判「活跃」（file_last=今天）。
#   ⇒ 标记在哪一层都算标记（根 or 被监听的子目录），且标记文件本身永不计入判据 B。
def is_probe_marker(name):
    return name in PROBE_MARKERS


def probe_reason(dir_name, root_entries, sub_entries):
    """这个学员目录是不是探针？返回原因串或 None（纯函数，供 --selftest）。"""
    if PROBE_DIR_RE.match(dir_name):
        return "dirname"
    if any(m in root_entries for m in PROBE_MARKERS):
        return "marker-root"
    if any(is_probe_marker(e) for e in sub_entries):
        return "marker-sub"
    return None

# 学员目录发现要覆盖「仓外克隆根」：仓外根不是 git 仓时判据 A 不适用，
# 判据 B（文件 mtime）仍可判，与「仓内无记录」同义处理。
# 覆盖：环境变量 SAND_HOLLOW_CLONE_ROOTS（冒号分隔的绝对路径）。
DEFAULT_CLONE_ROOTS = ("~/sand-hollow",)


def clone_roots():
    """仓外克隆根列表：存在且不是仓自身才计入（不存在 = 静默跳过）。"""
    raw = os.environ.get("SAND_HOLLOW_CLONE_ROOTS")
    # ⚠️ 必须用 `is None` 判空：旧判据 `if raw else 默认` 把**空串**当「未设置」
    #   ⇒ 静默回落 DEFAULT_CLONE_ROOTS ⇒ 想隔离却扫到了本机旧 clone ⇒ 验证结论假一致。
    paths = (list(DEFAULT_CLONE_ROOTS) if raw is None
             else [p for p in raw.split(":") if p.strip()])
    out = []
    for p in paths:
        p = os.path.expanduser(p.strip())
        if not os.path.isdir(p):
            continue
        # ⚠️ 大小写不敏感 FS（macOS APFS 默认）：`~/sand-hollow` 与 `~/Sand-Hollow`
        #   是**同一个物理目录**（samefile=True）但 abspath 字符串不等 ⇒ 旧判据排除失败
        #   ⇒ 仓自身被当成「仓外克隆根」再扫一遍 ⇒ 同一学员被算两次。
        #   ⇒ 必须用 samefile 比，不能用 abspath 字符串比。
        try:
            if os.path.samefile(p, REPO):
                continue
        except OSError:
            if os.path.abspath(p) == os.path.abspath(REPO):
                continue
        out.append(p)
    return out


def candidate_roots():
    """[(label, root_path)]：label = 'repo'（仓内根）/ 'clone'（仓外克隆根）。"""
    roots = [("repo", REPO)]
    for p in clone_roots():
        roots.append(("clone", p))
    return roots


def is_git_root(root):
    """该根是不是 git 仓工作区（判据 A 是否适用）。仓外克隆根常常不是。"""
    return os.path.isdir(os.path.join(root, ".git"))


def git_last_commit_date(root, rel_dir):
    """目录末次 commit 日期（本地时间 YYYY-MM-DD），无记录返回 None。

    ⚠️ 2026-10-31 起**只作占位入库日参考**（不再是活跃度）—— 见
    `git_last_content_commit_date` 的说明。
    """
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", rel_dir],
            cwd=root, capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return out or None
    except (subprocess.TimeoutExpired, OSError):
        return None


def git_tracked_content(root, rel_dir):
    """该学员目录里【被 git 跟踪】的作业/评语文件（git ls-files，空 = 列表）。

    仓根 .gitignore 默认挡掉 `**/homework/` 与 `**/reviews/`（只放行 `!tree/homework/`）
    ⇒ 除 tree 外的学员目录里没有任何 tracked 作业 ⇒ 「目录末次 commit」只是
    【占位入库日】，不是活跃度。
    """
    return sorted(git_tracked_paths(root, rel_dir))


def git_tracked_paths(root, rel_dir, tracked_global=None):
    """该学员目录下被跟踪的作业/评语（**仓根相对路径**集合，空 = set）。

    ⚠️ 11-01 修订：判据 B 只采信【未跟踪】的文件 —— 被跟踪文件的 mtime =
    checkout 时刻 ⇒ clone 会重写成「今天」⇒ 假活跃（实测：tree/ 33 个 tracked
    文件 ⇒ 全新 clone 上 B 从 25 天变 0 天，零活跃变「活跃」）。
    ⇒ 这套路径集合同时用于「A 适用性」和「B 排除」两处，必须按仓根相对路径算
    （同相对路径在仓外克隆根里也是被跟踪的同一份文件）。
    """
    tracked = tracked_global if tracked_global is not None else git_tracked_paths_all(root)
    prefixes = (f"{rel_dir}/homework/", f"{rel_dir}/reviews/")
    return {p for p in tracked if p.startswith(prefixes)}


def git_tracked_paths_all(root):
    """该 git 仓所有被跟踪的文件（仓根相对路径）—— 缓存，避免逐学员多次 git 调用。"""
    key = os.path.abspath(root)
    if key not in _TRACKED_CACHE:
        try:
            out = subprocess.run(
                ["git", "ls-files", "-z"],
                cwd=root, capture_output=True, text=True, timeout=60,
            ).stdout
            _TRACKED_CACHE[key] = {p for p in out.split("\0") if p}
        except (subprocess.TimeoutExpired, OSError):
            _TRACKED_CACHE[key] = set()
    return _TRACKED_CACHE[key]


def git_last_content_commit_date(root, rel_dir):
    """判据 A（2026-10-31 修订）：**只统计被跟踪的作业/评语**的末次 commit 日期。

    返回 (date, note)：
      date = "YYYY-MM-DD" 或 None；note = "仅占位入库" 表示该目录没有任何
      tracked 作业/评语 ⇒ 判据 A 不适用（不是「零」）⇒ 对外报天数一律用判据 B。

    ⚠️ 旧口径（目录末次 commit）会把「占位入库日」当成活跃度 ⇒ 报出
    「61 天没动」这类架构性错标签（与学员真实活跃无关）。
    """
    if not git_tracked_content(root, rel_dir):
        return None, "仅占位入库"
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--",
             f"{rel_dir}/homework", f"{rel_dir}/reviews"],
            cwd=root, capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return (out or None), None
    except (subprocess.TimeoutExpired, OSError):
        return None, None


def student_dir_mtime_ts(root, rel_dir):
    """学员「出现年龄」的本地证据（秒）：学员目录与其 homework/reviews 子目录里最新的 mtime。

    ⚠️ 只作 **占位入库日缺失时**的兜底年龄信号，**不是活跃度**：
      - git 仓根里 tracked 目录的 mtime = 本地 checkout 时间（每次 clone/pull 都变）
        ⇒ 绝不能当活跃度；
      - 只在【该目录从未被 commit 触碰】（git log 无记录）或【仓外克隆根（非 git 仓）】
        时才用 —— 此时 mtime ≈ 目录在本机的创建时间 = 学员出现的年龄。
    """
    latest = None
    for rel in (rel_dir,) + tuple(os.path.join(rel_dir, s) for s in WATCH_SUBDIRS):
        path = os.path.join(root, rel)
        try:
            m = os.path.getmtime(path)
        except OSError:
            continue
        if latest is None or m > latest:
            latest = m
    return latest


def checkout_cohort_ts(root, rel_dir, tracked=None):
    """「checkout 物化时刻」的参考锚点（秒）。

    ⚠️ 用途：识别「mtime ≈ checkout 时刻」的**可疑证据** —— 这类文件不是学员
    亲手写的（是 checkout 物化出来的），不能拿来判活跃，否则跨机假绿。

    锚点取法（优先级）：
      ① 该学员目录下**被跟踪文件**的最新 mtime —— 全新 clone 上这些文件全被
         重写成 checkout 时刻 ⇒ 锚点 ≈ checkout 时刻；
      ② 该学员目录没有任何被跟踪文件 ⇒ 退回 `.git/index` 的 mtime（最近一次
         git 操作时刻）。

    ⚠️ 不用「index mtime」当唯一锚点：任何 git 写操作（commit/add）都会刷新
    index mtime ⇒ 会把「刚 commit 完就写的作业」误判成 checkout 物化。
    """
    tracked = tracked if tracked is not None else git_tracked_paths(root, rel_dir)
    latest = None
    for rel in tracked:
        try:
            m = os.path.getmtime(os.path.join(root, rel))
        except OSError:
            continue
        if latest is None or m > latest:
            latest = m
    if latest is not None:
        return latest
    try:
        return os.path.getmtime(os.path.join(root, ".git", "index"))
    except OSError:
        return None


def newest_file_mtime_ts(root, rel_dir, tracked_global=None):
    """判据 B 的原始值：homework/ + reviews/ 下最新【可信】文件 mtime（时间戳）。

    返回 (ts, suspect_ts)：
      ts        = 可信证据的最新 mtime（无可信文件 ⇒ None）
      suspect_ts = 被判为「checkout 物化」的可疑 mtime（无可疑文件 ⇒ None）

    ⚠️ 探针文件（文件名命中 PROBE_FILE_RE）不计入 —— 它不是学员练习。
    ⚠️ 探针标记文件（.probe / PROBE.md / .probe-marker）也不计入（11-01 修）：
      标记文件放在 homework/ 里时，它自己的 mtime = 标记创建时刻 ⇒ 会把
      「今天建了标记的探针目录」报成「学员今天有活动」（假活跃）。
    ⚠️ **被 git 跟踪的文件也不计入**（11-01 修 · review 报出的洞）：
      被跟踪文件的 mtime = checkout/pull 时刻 ⇒ 全新 clone 上被重写成「今天」
      ⇒ 零活跃学员在 clone 上被误报成「活跃」（假绿）。
      实测（11-01，`tree/` 33 个 tracked 文件）：本机 B=2026-10-07(25天)=零活跃；
      全新 clone 同一脚本 B=2026-11-01(0天)=活跃 ⇒ 假绿。
      ⇒ 被跟踪的作业/评语一律走判据 A（git 末次 commit 日，跨机一致）。
    ⚠️ **mtime ≈ checkout 时刻的文件也不算**（11-01 修 · review 建议③）：
      这类文件是 checkout 物化出来的，不是学员写的 ⇒ 标「不可判」，不报绿。
    """
    latest = None
    suspect = None
    tracked = tracked_global
    if tracked is None:
        tracked = git_tracked_paths(root, rel_dir) if is_git_root(root) else set()
    ref = checkout_cohort_ts(root, rel_dir, tracked)
    for sub in WATCH_SUBDIRS:
        base = os.path.join(root, rel_dir, sub)
        if not os.path.isdir(base):
            continue
        for root_dir, _dirs, files in os.walk(base):
            for name in files:
                if PROBE_FILE_RE.match(name):
                    continue
                if is_probe_marker(name):
                    continue
                path = os.path.join(root_dir, name)
                try:
                    m = os.path.getmtime(path)
                except OSError:
                    continue
                # 被跟踪的文件 ⇒ mtime 不可信（= checkout 时刻）⇒ 不计入判据 B
                try:
                    rel_path = os.path.relpath(path, root)
                except ValueError:
                    rel_path = name
                if rel_path in tracked:
                    continue
                # mtime ≈ checkout 物化时刻 ⇒ 疑似 checkout 物化 ⇒ 标不可判，不采信
                if ref is not None and abs(m - ref) <= CHECKOUT_SUSPECT_WINDOW:
                    if suspect is None or m > suspect:
                        suspect = m
                    continue
                if latest is None or m > latest:
                    latest = m
    return latest, suspect


def newest_file_mtime(root, rel_dir):
    """判据 B：homework/ + reviews/ 下最新【可信】文件 mtime → 本地日期，无文件返回 None。"""
    ts, _suspect = newest_file_mtime_ts(root, rel_dir)
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d")


def days_since(date_str):
    if not date_str:
        return None
    d = datetime.strptime(date_str, "%Y-%m-%d").date()
    return (datetime.now(TZ).date() - d).days


def discover_students():
    """返回 {student_dir: {label, root, git_root, mtime, suspect, tracked}}：按学员目录名**合并**多根。

    同一个学员目录名可能同时出现在仓内根和仓外克隆根（如学员把整仓克隆到
    ~/sand-hollow/ 后又在其中建自己的 <ID>/homework/）⇒ 按名字合并成**一条**，
    否则同一个学员会被计两次且两次判定可能相反（仓内 git 判据 vs 仓外文件判据）。
    合并口径：判据 A 取「是 git 仓的那个根」，判据 B 取各根里**最新**的可信 mtime。

    ⚠️ 11-01：mtime 字段拆成两个 ——
      mtime   = 可信证据（未被跟踪、且 mtime 不 ≈ checkout 时刻）的最新 mtime
      suspect = 被判为「checkout 物化」的可疑 mtime（有值 ⇒ 判据 B 不可判）
    """
    merged = {}
    for label, root in candidate_roots():
        try:
            names = sorted(os.listdir(root))
        except OSError:
            continue
        git_root = is_git_root(root)
        tracked_all = git_tracked_paths_all(root) if git_root else set()
        for name in names:
            if name.startswith(".") or name in SKIP_DIRS or not os.path.isdir(os.path.join(root, name)):
                continue
            # 探针目录整棵不采（否则探针文件 mtime = 假学员 + 假活跃）
            if PROBE_DIR_RE.match(name):
                continue
            # 带探针标记文件 ⇒ 整棵不采（真学员目录名 = 8 位数字，跟测试 ID 长得一样，靠名字分不出）
            # ⚠️ 标记文件可能放在 homework/ 或 reviews/ **里面** ⇒ 根 + 子目录都查（11-01 修）
            try:
                entries = set(os.listdir(os.path.join(root, name)))
            except OSError:
                entries = set()
            sub_entries = set()
            for s in WATCH_SUBDIRS:
                try:
                    sub_entries.update(os.listdir(os.path.join(root, name, s)))
                except OSError:
                    pass
            if probe_reason(name, entries, sub_entries):
                continue
            if not any(os.path.isdir(os.path.join(root, name, s)) for s in WATCH_SUBDIRS):
                continue
            tracked = git_tracked_paths(root, name, tracked_all)
            mtime, suspect = newest_file_mtime_ts(root, name, tracked)
            prev = merged.get(name)
            if prev is None:
                merged[name] = {"label": label, "root": root, "git_root": git_root,
                                "mtime": mtime, "suspect": suspect, "tracked": tracked}
                continue
            # 已有同名学员：判据 A 优先取 git 仓的根；判据 B 取更新的 mtime。
            if git_root and not prev["git_root"]:
                prev["git_root"] = True
                prev["root"] = root
                prev["label"] = label
                prev["tracked"] = tracked
            if prev["mtime"] is None or (mtime is not None and mtime > prev["mtime"]):
                prev["mtime"] = mtime
            if prev["suspect"] is None or (suspect is not None and suspect > prev["suspect"]):
                prev["suspect"] = suspect
    return merged


def main():
    ap = argparse.ArgumentParser(description="学员零活跃双判据检查器")
    ap.add_argument("--threshold", type=int, default=7, help="零活跃阈值天数（默认 7）")
    ap.add_argument("--git-only", action="store_true", help="只用判据 A（git），适合非落盘机运行")
    ap.add_argument("--json", action="store_true", help="输出 JSON（供 cron 消费）")
    ap.add_argument("--selftest", action="store_true", help="跑探针判据单测（无网络无副作用）")
    args = ap.parse_args()

    if args.selftest:
        cases = [
            # (dir_name, root_entries, sub_entries, expect)
            ("probe-tmp", {"homework"}, set(), "dirname"),
            ("tmp-x", {"homework"}, set(), "dirname"),
            ("12345678", {"homework", ".probe"}, set(), "marker-root"),
            ("12345678", {"homework", "PROBE.md"}, set(), "marker-root"),
            ("12345678", {"homework"}, {".probe"}, "marker-sub"),
            ("12345678", {"homework"}, {"PROBE.md"}, "marker-sub"),
            ("12345678", {"homework"}, {".probe-marker"}, "marker-sub"),
            ("12345678", {"homework"}, {"real.py"}, None),
            ("12345678", {"homework", "reviews"}, {"w02-s5.py"}, None),
        ]
        fails = []
        for d, root, sub, want in cases:
            got = probe_reason(d, root, sub)
            if got != want:
                fails.append((d, root, sub, want, got))
        for d, root, sub, want, got in fails:
            print("FAIL dir=%s root=%s sub=%s expect=%s got=%s" % (d, root, sub, want, got))
        print("SELFTEST PASS" if not fails else "SELFTEST FAIL (%d)" % len(fails))
        sys.exit(0 if not fails else 1)

    if args.threshold < 1:
        print("ERROR: --threshold 必须 >= 1", file=sys.stderr)
        sys.exit(2)

    students = discover_students()
    if not students:
        print("未发现任何学员目录（根目录下含 homework/ 或 reviews/）——检查目录结构")
        sys.exit(0)

    if not args.git_only and not args.json:
        print("⚠️ 判据 B=本机文件 mtime；homework/reviews 不入 git，跨机请用 --git-only 或在落盘机上跑\n")

    results, flagged, flagged_raw = [], 0, 0
    for name in sorted(students):
        info = students[name]
        label, root, git_root = info["label"], info["root"], info["git_root"]
        a_date, a_note, dir_last = None, None, None
        a_applicable = False
        if git_root:
            a_date, a_note = git_last_content_commit_date(root, name)
            a_applicable = a_note is None          # 有 tracked 作业/评语 ⇒ A 可用
            dir_last = git_last_commit_date(root, name)   # 目录末次 commit（仅参考）
        b_ts = None if args.git_only else info["mtime"]
        b_suspect = None if args.git_only else info.get("suspect")
        b_date = (datetime.fromtimestamp(b_ts, TZ).strftime("%Y-%m-%d") if b_ts is not None else None)
        # ★ 11-01（review 报出的洞）：有可疑证据（mtime ≈ checkout 时刻）但没有可信证据
        #   ⇒ 判据 B **不可判**（既不报绿也不报红）——「checkout 物化出来的文件」
        #   不是学员写的，不能拿来判活跃。
        b_undetermined = (b_ts is None and b_suspect is not None)
        a_days, b_days = days_since(a_date), days_since(b_date)
        # 占位入库日 = 该学员目录被 commit 触碰的日期（**不是**活跃度，见 git_last_commit_date）。
        #   目录从未被 commit 触碰（未跟踪目录 / 仓外克隆根）⇒ 退回本机目录 mtime
        #   （≈ 学员在本机「出现」的年龄）⇒ 只作宽限期年龄信号。
        placeholder_days = days_since(dir_last) if dir_last else None
        if placeholder_days is None:
            ts = student_dir_mtime_ts(root, name)
            placeholder_days = (int((datetime.now(TZ).timestamp() - ts) // 86400)
                                if ts is not None else None)
        grace = False
        grace_reason = None
        if not git_root:
            # 仓外克隆根不是 git 仓 ⇒ 判据 A 不适用（不是「零」）⇒ 只看判据 B。
            if args.git_only:
                verdict = "跳过(非git仓)"
            elif b_undetermined:
                # ★ 11-01：mtime ≈ checkout 时刻 ⇒ 不可判（不报绿也不报红）
                verdict = "不可判(B证据≈checkout时刻)"
            elif b_days is None:
                verdict = "零活跃(全新)"  # 无文件 = 目录刚建或从未活动
            elif b_days >= args.threshold:
                verdict = f"零活跃>={args.threshold}天"
            else:
                verdict = "活跃"
            # 新学员宽限期：仓外根的学员目录就是他自己建的
            #   ⇒ 目录 mtime ≈ 他出现的年龄 ⇒ 出现未满阈值天且还没交作业 ⇒ 不告警。
            if (b_days is None and placeholder_days is not None
                    and placeholder_days < args.threshold):
                grace, grace_reason = True, "新学员宽限期(占位入库未满阈值·B=never)"
        elif not a_applicable:
            # ★ 2026-10-31（洞一修复）：该学员目录没有任何 tracked 的作业/评语
            #   （仓根 .gitignore 挡 `**/homework/` `**/reviews/`，只放行 `!tree/homework/`）
            #   ⇒ 判据 A **不适用**（不是「零」）⇒ 对外报天数一律用判据 B。
            if args.git_only:
                verdict = "跳过(A无tracked作业·仅占位入库)"
            elif b_undetermined:
                # ★ 11-01：B 证据全是 checkout 物化 ⇒ 不可判
                verdict = "不可判(B证据≈checkout时刻)·A仅占位入库"
            elif b_days is None:
                verdict = "零活跃(全新)·A仅占位入库"
            elif b_days >= args.threshold:
                verdict = f"零活跃>={args.threshold}天·A仅占位入库"
            else:
                verdict = "活跃·A仅占位入库"
            # 兜底口径 ①：A 日期 = 目录入库日（占位）且 B 距今 < 阈值×2 ⇒ 不重复告警
            #   （学员刚被告知「那把尺子的读数错了」，别隔一天又拿同一把尺子的读数敲她）
            if b_days is not None and b_days < args.threshold * 2:
                grace, grace_reason = True, "A仅占位入库且B<阈值×2"
            # 兜底口径 ②（新学员宽限期 · 洞一同一类病的另一头）：B=never（还没交过任何作业）
            #   且占位入库未满阈值天 ⇒ 「今天刚建目录、还没交作业」的新学员**当天就该被点名**
            #   是同一类病（工具看不见 ≠ 学员没动）⇒ 宽限期内不告警。
            if (b_days is None and placeholder_days is not None
                    and placeholder_days < args.threshold):
                grace, grace_reason = True, "新学员宽限期(占位入库未满阈值·B=never)"
        elif b_undetermined:
            # ★ 11-01：A 可用（tracked 作业）但 B 证据 ≈ checkout 时刻 ⇒
            #   判据 B 不可判 ⇒ 一律以判据 A（跨机一致）为准。
            if a_days is None:
                verdict = "零活跃(全新)·B不可判"
            elif a_days >= args.threshold:
                verdict = f"零活跃>={args.threshold}天·B不可判"
            else:
                verdict = "活跃·B不可判"
        elif a_days is None and (args.git_only or b_days is None):
            verdict = "零活跃(全新)"  # 两维都无记录：目录刚建或从未活动
        elif (a_days is None or a_days >= args.threshold) and (args.git_only or b_days is None or b_days >= args.threshold):
            verdict = f"零活跃>={args.threshold}天" + ("(仅git判据)" if args.git_only else "")
        elif a_days is None or b_days is None:
            verdict = "单维零(仅提示)"
        else:
            verdict = "活跃"
        if verdict.startswith("零活跃"):
            flagged_raw += 1
            if not grace:
                flagged += 1
        results.append({
            "student_dir": name,
            "root": label,
            "a_applicable": a_applicable,
            "a_note": a_note,
            "placeholder_import": dir_last,
            "git_last": a_date, "git_idle_days": a_days,
            "file_last": b_date, "file_idle_days": b_days,
            "file_undetermined": b_undetermined,
            "file_suspect_ts": b_suspect,
            "tracked_count": len(info.get("tracked") or ()),
            "days_reported": b_days if (not a_applicable and b_days is not None) else a_days,
            "grace": grace,
            "grace_reason": grace_reason,
            "placeholder_age_days": placeholder_days,
            "verdict": verdict,
        })
        if not args.json:
            def fmt(d, n):
                return f"{d}({n}天)" if d is not None else "never"
            a_txt = fmt(a_date, a_days) if a_applicable else "—(仅占位入库)"
            flag = (" [兜底降级不告警:%s]" % grace_reason) if grace else ""
            b_txt = fmt(b_date, b_days)
            if b_undetermined:
                b_txt = "不可判(≈checkout时刻)"
            print(f"{name:<12} A=git:{a_txt:<22} B=file:{b_txt:<24} => {verdict}{flag}  [{label}]")

    if args.json:
        print(json.dumps({"threshold_days": args.threshold, "git_only": args.git_only,
                          "flagged": flagged, "flagged_raw": flagged_raw,
                          "students": results},
                         ensure_ascii=False, indent=2))
    else:
        total = len(results)
        mode = ("仅判据A(git·只算tracked作业/评语)" if args.git_only else
                "双判据(A=tracked作业/评语的末次commit·无tracked则记「仅占位入库」并用B报天数; B=homework/reviews最新文件mtime)")
        print(f"\n共 {total} 个学员目录：零活跃 {flagged}（原始命中 {flagged_raw}，兜底降级 {flagged_raw - flagged}），"
              f"阈值 {args.threshold} 天（{mode}）")
    sys.exit(1 if flagged else 0)


if __name__ == "__main__":
    main()
