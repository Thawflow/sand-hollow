#!/usr/bin/env python3
"""scan-week-refs.py — 全仓扫「作业文件名串号」（周号 ≠ 本课周）

病灶（2026-10-27 复盘）：10-19 加餐前插把 W12/W14 从 W16 位置切出，正文
`W16-weekend-practice.py` 连字形态被窄正则漏扫（46 处债残余 6 处才清零）。
本脚本判据 = 不变量「文件名引用的周号 = 本课自己的周」，与
learning-publish.js 的作业文件名串号闸同一套正则（闸挡单周发布，本脚本全仓扫）。

用法（沙坑仓根目录跑）：
  python3 mentors-den/scripts/scan-week-refs.py                    # 扫工作树
  python3 mentors-den/scripts/scan-week-refs.py --ref HEAD         # 扫某个 ref 快照（= 被推的那份）
  python3 mentors-den/scripts/scan-week-refs.py --dir <dir>        # 扫指定目录（相对仓根）

退出码：0 = 无串号；1 = 有串号；2 = 用法/环境错误/**读不到**（没验到 ≠ 没问题）

⚠️ 2026-10-31 续（冰爪红格：algopedia 双盲区）：本脚本再收紧两处
  ④ 覆盖：旧版只列目录**直接子项** ⇒ 嵌套讲义（course/algopedia/*.md）**完全没进扫描**
     ⇒ algopedia 里写错的作业文件名永远扫不到（漂移闸也不管它：build 非递归，不进产物）。
     现在：源侧与 ref 侧**都递归**（两模式口径一致，不再各扫各的）。
  ⑤ 悬空课时 ID：旧版只判「周号 ≠ 本课周」⇒ 引用一个**已改名 / 已不存在**的课时 ID
     （如 W13-L03：4f68436 已改成 W17-L03）不会被发现 —— 学员照着存作业会存进错名的文件。
     现在：作业文件名里的课时 ID 必须存在于**课时 ID 登记表**（课程目录顶层的课时文件 W*.md）
     ⇒ 悬空 ⇒ rc=1（fail-closed）。

⚠️ 2026-10-31（冰爪实测·洞 B + 洞 C）：本脚本历次被收紧三处
  ① 洞 B（读不到当没问题）：原实现 `git show` 失败 → 返空文本 → 读不到被当成「没问题」
     → 报绿（rc=0）。现在：读不到计入「读不到」清单 → rc=2。
  ② 洞 C（覆盖缺口）：原 glob 只认 `W*.md` / `W*.html`
     ⇒ 聚合文件全漏：**源侧 SYLLABUS.md**、**产物侧 syllabus.html + index.json**
     （docs/course/ 共 19 个文件，W*.html 只盖 17）。
     实测：往 syllabus.html 注入串号 → 真 push rc=0、远端实进 1 处。
     现在：源与产物两侧都扫全部课程文件；聚合文件（跨周目录）**按所在周次分节判定归属**。
  ③ 扫哪一份：新增 --ref 模式**从该 ref 的树里列文件**并逐个 `git show <ref>:<path>` 读，
     ⇒ 扫的是「被推的那份」，不是工作树当前状态（pre-push 闸判被推内容才准）。
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

# 作业文件名 token（如 W12-S1-homework.py / W12-weekend-practice.py）
WEEK_TOKEN_RE = re.compile(r"W\d\d-[A-Za-z0-9-]*\.py")
# 课时文件：W12-S1.md / W12.html（文件名头 3 位 = 本课周号）
PER_WEEK_NAME_RE = re.compile(r"^W\d\d")
# 课程相关文件后缀（.md 源 / .html 产物 / .json 索引）
COURSE_SUFFIXES = {".md", ".html", ".json"}
# 课时 ID（W12-S1 / W01-L01 / W12-weekend）—— 登记表比对用
LESSON_ID_RE = re.compile(r"W\d\d-(?:L|S)\d+|W\d\d-weekend")
# .md 首个**一级标题**里出现的课时 ID（W12-S1 · … / （对应课时 W06-S2）…）
# ⚠️ 不只匹配「# 后面紧跟 ID」：标题里任何位置的课时 ID 都要查（改名后残留即悬空）。
H1_LINE_RE = re.compile(r"(?m)^# .*$")
H1_LESSON_RE = re.compile(r"W\d\d-(?:L|S)\d+|W\d\d-weekend")
# 课时文件（W12-S1.md / W12-weekend.md）—— 课时 ID 登记表的来源（**只认顶层**：嵌套讲义不是课时）
LESSON_FILE_RE = re.compile(r"^W\d\d-.*\.md$")
# 元数据注释自报归属周（<!-- slug: big-o-spec, type: spec, own-week: W06-S2 -->）
# ⚠️ 2026-10-31 冰爪红格（15:33）：嵌套讲义（algopedia/）文件名没有周号 ⇒ 归属判据必须
#    **显式声明**（own-week），否则「从 H1 推」和「从文件名推」两条路同时落空 ⇒
#    整份文件被判成「无归属」⇒ 串号检查一起被跳过 ⇒ fail-open（她的变体 C 实测：真串号漏掉，rc=0）。
OWN_WEEK_FIELD_RE = re.compile(r"own-week\s*[:=]\s*(W\d\d)\b")
# H1 里的周号（# W06-S2 · … / # W06 · …）—— 嵌套讲义无元数据时的兜底
H1_WEEK_RE = re.compile(r"(?m)^#\s*(W\d\d)\b")

# 聚合文件（跨周目录/总纲）里的**周次锚点**：命中即进入该周分节
ANCHOR_RES = [
    re.compile(r"(?m)^#\s*W(\d\d)\b"),                        # md 一级标题：# W12 · …（嵌套讲义的归属课）
    re.compile(r"(?m)^#{2,6}\s*W(\d\d)\b"),                 # md 标题：### W12 · …
    re.compile(r"<h[1-6][^>]*>\s*W(\d\d)\b"),               # html 标题：<h3>W12 · …
    re.compile(r"\"(?:id|week)\"\s*:\s*\"W(\d\d)\""),        # json：{"id":"W12",…}
]


def course_dir_from_repo_root() -> Path:
    here = Path(__file__).resolve()
    return here.parent.parent / "course"


def is_course_file(path: Path) -> bool:
    return path.is_file() and path.suffix in COURSE_SUFFIXES


def lesson_ids_from_dir(d: Path):
    """目录**顶层**的课时文件（W12-S1.md / W12-weekend.md）→ 课时 ID 集合。
    ⚠️ 只认顶层：嵌套讲义（course/algopedia/）**不是课时**，不进登记表。"""
    if not d.is_dir():
        return set()
    return {p.stem for p in d.iterdir() if p.is_file() and LESSON_FILE_RE.match(p.name)}


def lesson_ids_from_ref(repo: Path, ref: str, rel_dir: str):
    """ref 快照里该目录**顶层**的课时文件 → 课时 ID 集合。
    ⚠️ 用 <ref>:<dir> 形式读快照（判「被推的那一份」）；读不到 ⇒ None（fail-closed）。"""
    # ⚠️ `git ls-tree --name-only <ref> -- <dir>` 只列出**目录项本身**、列不出内容
    #    ⇒ 必须用 tree-ish 形式 `<ref>:<dir>`（它列出该目录的**直接子项**）。
    treeish = ref + ":" + rel_dir if rel_dir else ref
    out = subprocess.run(
        ["git", "ls-tree", "--name-only", treeish],
        cwd=str(repo), capture_output=True, text=True,
    )
    if out.returncode != 0:
        return None
    ids = set()
    for line in out.stdout.splitlines():
        name = line.strip()
        if not name:
            continue
        p = Path(name)
        if not LESSON_FILE_RE.match(p.name):
            continue          # 只认课时文件（嵌套讲义不是课时）
        ids.add(p.stem)
    return ids


def meta_own_week(text: str):
    """从元数据注释读自报归属周（own-week: W06-S2 ⇒ "06"）。"""
    m = OWN_WEEK_FIELD_RE.search(text)
    return m.group(1)[1:3] if m else None


def h1_own_week(text: str):
    """从 H1 读周号（# W06-S2 · … ⇒ "06"）。"""
    m = H1_WEEK_RE.search(text)
    return m.group(1)[1:3] if m else None


def resolve_own_week(text: str, name: str, is_lesson_file: bool):
    """本课周号 = **三级来源**（元数据 own-week > 文件名 > H1）。

    ⚠️ 顺序有讲究：
      · **课时文件**（顶层 W*.md）以**文件名**为准 —— 文件名 = 学员真实看到的课时 ID；
        H1 可能滞后于改名（H1↔文件名不一致由「H1 与文件名不一致」那条致命项单独报）。
      · **嵌套讲义**（course/algopedia/）文件名没有周号 ⇒ 先看元数据 own-week，
        再看 H1；两者都没有 ⇒ **不是「豁免这个文件」**，而是没有归属判据
        （按分节判；分节也判不出来的引用**照报**，不许静默跳过）。

    返回 (week_or_None, source)。"""
    w = meta_own_week(text)
    if w:
        return w, "meta"
    if is_lesson_file:
        return name[1:3], "filename"
    w = h1_own_week(text)
    if w:
        return w, "h1"
    return None, None


def list_files(root: Path):
    """工作树模式：列出目录下**全部**课程文件（含 SYLLABUS.md / syllabus.html / index.json）。
    ⚠️ 只 glob W*.md 会漏掉聚合文件 → 覆盖缺口（洞 C）。
    ⚠️ 只 iterdir 会漏掉**嵌套目录**里的讲义（洞 D：course/algopedia/*.md）⇒
       两模式口径一致：ref 侧也递归（见 list_files_in_ref）。"""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in filenames:
            p = Path(dirpath) / fn
            if is_course_file(p):
                out.append(p)
    return sorted(out)


def list_files_in_ref(repo: Path, ref: str, rel_dir: str):
    """ref 模式：从该 ref 的树里列文件（不是工作树当前状态）。
    ⚠️ 用 `git ls-tree` 而不是工作树 glob ⇒ 扫的就是被推的那份内容。"""
    # ⚠️ 2026-10-31：改成**递归**（-r）—— 旧版只列直接子项 ⇒ 嵌套讲义（algopedia/）
    # 完全不进扫描范围（洞 D）。工作树模式已同步改成 os.walk 递归 ⇒ 两模式口径一致。
    # ⚠️ `git ls-tree --name-only <ref> -- <dir>` 只会列出**目录项本身**，列不出内容
    #    ⇒ 这里用 pathspec 形式 + -r（输出路径相对仓根，可直接 git show <ref>:<path>）。
    if rel_dir:
        args = ["git", "ls-tree", "-r", "--name-only", ref, "--", rel_dir]
    else:
        args = ["git", "ls-tree", "-r", "--name-only", ref]
    out = subprocess.run(
        args,
        cwd=str(repo), capture_output=True, text=True,
    )
    if out.returncode != 0:
        return None  # 读不到（ref 不存在 / 不可解析）⇒ 不能当「没问题」
    files = []
    for line in out.stdout.splitlines():
        name = line.strip()
        if not name:
            continue
        if Path(name).suffix in COURSE_SUFFIXES:
            files.append(name)
    return files


def read_from_ref(repo: Path, ref: str, rel: str):
    """读 ref 里的某个文件。返回 (text, ok)：ok=False = 读不到（不是「没问题」）。"""
    out = subprocess.run(
        ["git", "show", f"{ref}:{rel}"],
        cwd=str(repo), capture_output=True, text=True,
    )
    if out.returncode != 0:
        return "", False
    return out.stdout, True


def section_anchors(text: str):
    """聚合文件里的周次锚点：返回 [(位置, 周号)]，按位置升序。"""
    anchors = []
    for rx in ANCHOR_RES:
        for m in rx.finditer(text):
            anchors.append((m.start(), m.group(1)))
    anchors.sort()
    return anchors


def find_tokens(text: str):
    """返回 [(位置, token, 周号数字)]，按位置升序。
    ⚠️ 周号一律用**数字**（"12" 而非 "W12"）—— 分节锚点捕获的是数字，
    两边口径不一致会造出「同周被判跨周」的假阳性（2026-10-31 实测踩过）。"""
    out = []
    for m in WEEK_TOKEN_RE.finditer(text):
        tok = m.group(0)
        out.append((m.start(), tok, tok[1:3]))
    out.sort()
    return out


def lesson_id_of_token(tok: str):
    """从作业文件名 token 里取出课时 ID（W06-S2-practice.py → W06-S2）。"""
    m = re.match(r"(W\d\d-(?:L|S)\d+|W\d\d-weekend)", tok)
    return m.group(1) if m else None


def is_historical_ref(line: str, col: int, length: int):
    """该引用是不是**历史标记**（有意指向旧课时 ID）？
    判据：同一行里 ID **之前**有「原」，或 ID **之后**紧跟「（现 …）」。
    ⚠️ 没有这两个标记 ⇒ 当作**活引用**（学员会照着找课 ⇒ 必须是现在还存在的课时）。"""
    pre = line[:col]
    if "原" in pre:
        return True
    post = line[col + length: col + length + 20]
    return bool(re.match(r"\s*[（(]?\s*现", post))


def find_dangling_lesson_ids(text: str):
    """找「引用了不存在的课时 ID」：
    返回 (致命[], 报告[]) —— 致命 = 出现在 .py 文件名里（学员照着存作业 ⇒ 文件名会错）；
    报告 = 正文里的指针（要人定夺该指哪一课，不拦 push，只报清单）。"""
    fatal, report = [], []
    masked = WEEK_TOKEN_RE.sub(lambda m: " " * len(m.group(0)), text)
    for m in WEEK_TOKEN_RE.finditer(text):
        lid = lesson_id_of_token(m.group(0))
        if lid:
            fatal.append((m.start(), m.group(0), lid))
    for m in LESSON_ID_RE.finditer(masked):
        report.append((m.start(), m.group(0)))
    return fatal, report


def section_week_for(pos: int, anchors):
    """token 所在分节的周号；不在任何分节内 → None（不可归属）。"""
    week = None
    for apos, aw in anchors:
        if apos < pos:
            week = aw
        else:
            break
    return week


def main() -> int:
    ap = argparse.ArgumentParser(description="全仓扫作业文件名串号（周号 ≠ 本课周）")
    ap.add_argument("--ref", help="扫某个 git ref 的快照（如 HEAD = 被推的那份）而非工作树")
    ap.add_argument("--allow-week-refs", action="store_true",
                    help="逃生阀：确有合法跨周 .py 引用时显式开（须留痕），默认关")
    ap.add_argument("--dir", help="扫指定目录（相对仓根；默认 mentors-den/course）")
    ap.add_argument("--course-dir",
                    help="课时 ID 登记表所在目录（相对仓根；默认 mentors-den/course）"
                         "—— 判定「引用的课时 ID 是否还存在」的权威集合")
    args = ap.parse_args()

    # 仓根 = **当前工作目录所属仓**（git rev-parse --show-toplevel），
    # 退回脚本自身所在仓（脚本被拷到别处时仍可用）。
    # ⚠️ 不能只认脚本位置：脚本可能来自别处而要扫的是当前仓（隔离仓测试即此场景）。
    repo = None
    try:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True,
        )
        if top.returncode == 0 and top.stdout.strip():
            repo = Path(top.stdout.strip())
    except OSError:
        repo = None
    if repo is None:
        repo = Path(__file__).resolve().parent.parent.parent

    if args.dir:
        rel_dir = args.dir
    else:
        rel_dir = "mentors-den/course"
    course_dir = args.course_dir or "mentors-den/course"

    # ── 收集 (标签, 文本, 归属判据) ─────────────────────────────
    # 归属判据：
    #   课时文件（W12.html / W12-S1.md）→ 本课周号 = 文件名头 3 位
    #   聚合文件（SYLLABUS.md / syllabus.html / index.json）→ 本课周号 = 所在分节的周号
    items = []          # (label, text, own_week_or_None, is_aggregate, is_lesson_file)
    unreadable = []     # 读不到的文件（⇒ 没验到 ≠ 没问题）

    if args.ref:
        rel_dir_for_git = rel_dir
        p_arg = Path(rel_dir)
        if p_arg.is_absolute():
            try:
                rel_dir_for_git = str(p_arg.relative_to(repo))
            except ValueError:
                rel_dir_for_git = rel_dir
        # 归一成 git 内路径（不带 "./"、不带尾斜杠）；"." = 仓根
        rel_dir_for_git = rel_dir_for_git.strip("/")
        if rel_dir_for_git in (".", ""):
            rel_dir_for_git = ""
        base_rel = rel_dir_for_git or "."
        files = list_files_in_ref(repo, args.ref, rel_dir_for_git)
        if files is None:
            print(f"❌ 读不到 ref「{args.ref}」⇒ 没验到，不是「没问题」")
            print("   修法：确认 ref 存在且可解析（git rev-parse --verify <ref>^{commit}）")
            return 2
        for rel in files:
            text, ok = read_from_ref(repo, args.ref, rel)
            if not ok:
                unreadable.append(rel)
                continue
            name = Path(rel).name
            is_lesson = (bool(PER_WEEK_NAME_RE.match(name))
                         and Path(rel).parent.as_posix() == base_rel)
            own, _src = resolve_own_week(text, name, is_lesson)
            items.append((rel, text, own, own is None, is_lesson))
        scope = f"{args.ref}:{rel_dir_for_git or '.'}"
    else:
        root = Path(rel_dir)
        if not root.is_absolute():
            root = repo / rel_dir
        try:
            base_rel = Path(rel_dir).resolve().relative_to(repo).as_posix()
        except ValueError:
            base_rel = Path(rel_dir).as_posix()
        if not root.is_dir():
            print(f"❌ 目录不存在：{root}")
            return 2
        files = list_files(root)
        for p in files:
            try:
                rel = str(p.relative_to(repo))
            except ValueError:
                rel = p.name          # 目录不在仓内（如临时隔离仓）⇒ 只用文件名标签
            try:
                text = p.read_text(encoding="utf-8")
            except OSError:
                unreadable.append(rel)
                continue
            name = p.name
            is_lesson = (bool(PER_WEEK_NAME_RE.match(name))
                         and Path(rel).parent.as_posix() == base_rel)
            own, _src = resolve_own_week(text, name, is_lesson)
            items.append((rel, text, own, own is None, is_lesson))
        scope = str(root)

    if not items:
        print(f"❌ 目录里没有可扫的课程文件（扫 0 个文件 = 没验到，不是「没问题」）：{scope}")
        print("   提醒：脚本扫 .md / .html / .json；目录指错就是空扫。")
        return 2

    # ── 课时 ID 登记表（判「引用的课时还在不在」）────────────────
    # 登记表 = **顶层**课时文件（W12-S1.md / W12-weekend.md）——
    #   顶层课时 = 学员真正会上的课；嵌套讲义（algopedia/）不是课，不进登记表。
    # 取两处并集（两边口径对称，隔离仓也能跑）：
    #   ① 被扫目录自己的顶层课时（扫源侧时 = 97 个）
    #   ② --course-dir 的顶层课时（扫**产物侧** docs/course 时顶层没有 .md 课时 ⇒ 取源侧）
    if args.ref:
        base = rel_dir_for_git or "."
        reg_scanned = set()
        for rel in files:
            pth = Path(rel)
            if pth.parent.as_posix() != base:
                continue          # 只认顶层（嵌套讲义不是课时）
            if LESSON_FILE_RE.match(pth.name):
                reg_scanned.add(pth.stem)
        course_rel = course_dir
        p_arg = Path(course_dir)
        if p_arg.is_absolute():
            try:
                course_rel = str(p_arg.relative_to(repo))
            except ValueError:
                course_rel = course_dir
        course_rel = course_rel.strip("/")
        if course_rel in (".", ""):
            course_rel = ""
        reg_course = lesson_ids_from_ref(repo, args.ref, course_rel) or set()
        registry = reg_scanned | reg_course
    else:
        reg_scanned = {p.stem for p in root.iterdir()
                       if p.is_file() and LESSON_FILE_RE.match(p.name)}
        course_root = Path(course_dir)
        if not course_root.is_absolute():
            course_root = repo / course_root
        registry = reg_scanned | lesson_ids_from_dir(course_root)
    if not registry:
        print("❌ 课时 ID 登记表为空 ⇒ 没验到，不是「没问题」")
        print("   修法：确认 --course-dir 指向课程源目录（默认 mentors-den/course）。")
        return 2

    # ── 判定串号 ────────────────────────────────────────────────
    hits = []
    unassigned = []     # 无归属判据的引用（照报，不静默跳过）
    for label, text, own, aggregate, is_lesson in items:
        anchors = section_anchors(text) if aggregate else []
        for pos, tok, tok_week in find_tokens(text):
            if aggregate:
                sec = section_week_for(pos, anchors)
                if sec is None:
                    # ⚠️ 2026-10-31 冰爪红格（15:33）：**不许静默跳过**。
                    #   嵌套讲义既无 own-week 元数据、文件名无周号、H1 也无周号 ⇒ 无归属判据；
                    #   分节也判不出来 ⇒ 引用照报（否则变体 C 实测：真串号在 rc=0 下漏掉）。
                    unassigned.append((label, tok))
                    continue
                if tok_week != sec:
                    hits.append((label, tok, sec))
            else:
                if tok_week != own:
                    hits.append((label, tok, own))

    if unreadable:
        print(f"❌ 有 {len(unreadable)} 个文件读不到 ⇒ 没验到，不是「没问题」：")
        for rel in unreadable[:20]:
            print(f"   - {rel}")
        return 2

    # ── 判「引用了不存在的课时 ID」（改名盲区 · 2026-10-31 冰爪红格）────
    # 不变量 D1：作业文件名里的课时 ID 必须**现在还存在**
    #   （学员照着存 ⇒ 课时被改名后旧文件名会变成孤儿文件，mentor 找不到）
    # 不变量 D2：.md 一级标题声明的课时 ID 必须存在；课时文件的 H1 还要与文件名一致
    # 不变量 D3：正文里的课时指针若指向不存在的课时 ⇒ **只报不改**
    #   （该指哪一课要人定夺，不拦 push；但必须留清单，否则改名后无人察觉）
    dangle_fatal, dangle_report = [], []
    for label, text, own, aggregate, is_lesson in items:
        if label.endswith(".md"):
            h1 = H1_LINE_RE.search(text)
            if h1:
                h1_ids = H1_LESSON_RE.findall(h1.group(0))
                for hid in h1_ids:
                    if hid not in registry:
                        dangle_fatal.append((label, "H1 里的课时 ID 不存在", hid))
                if (len(h1_ids) == 1 and is_lesson
                        and Path(label).stem != h1_ids[0]):
                    dangle_fatal.append(
                        (label, "H1 与文件名不一致", f"{h1_ids[0]} ≠ {Path(label).stem}"))
        fatal_tokens, prose_refs = find_dangling_lesson_ids(text)
        for _pos, tok, lid in fatal_tokens:
            if lid not in registry:
                dangle_fatal.append((label, "作业文件名指向不存在的课时", f"{tok}（{lid}）"))
        for pos, lid in prose_refs:
            if lid in registry:
                continue
            line_start = text.rfind("\n", 0, pos) + 1
            line_end = text.find("\n", pos)
            line = text[line_start: line_end if line_end != -1 else len(text)]
            col = pos - line_start
            if is_historical_ref(line, col, len(lid)):
                continue          # 有意指向旧课时（「原 X」/「（现 …）」）⇒ 合法
            dangle_report.append((label, lid, line.strip()[:90]))

    def show_dangle_fatal():
        print(f"❌ 引用了不存在的课时 ID {len(dangle_fatal)} 处（范围：{scope}）：")
        for label, why, detail in dangle_fatal:
            print(f"   - {label}：{why}：{detail}")
        print("   修法：课时改名/搬家后，把引用它的文件一起改成**现在**的课时 ID"
              "（以 mentors-den/course 顶层的课时文件为准）。")

    def show_dangle_report():
        print(f"⚠️  正文指针指向不存在的课时 ID {len(dangle_report)} 处（范围：{scope}）—— 只报不改：")
        for label, lid, line in dangle_report:
            print(f"   - {label}：{lid}｜{line}")
        print("   修法：这些指针该指哪一课要人定夺（slug 是永久身份，ID 会随排课变）→ 逐条订正。")

    blocking = len(hits) + len(dangle_fatal)
    if blocking:
        if args.allow_week_refs:
            # 逃生阀同时覆盖两类判定（串号 + 悬空课时 ID）——须留痕
            print(f"⚠️  {blocking} 处判定命中（范围：{scope}）——已用 --allow-week-refs 放行（须留痕）：")
            for label, tok, own in hits:
                print(f"   - {label}：{tok}（本课周=W{own}）")
            for label, why, detail in dangle_fatal:
                print(f"   - {label}：{why}：{detail}")
            return 0
        if dangle_fatal:
            show_dangle_fatal()
        if hits:
            print(f"❌ 串号 {len(hits)} 处（范围：{scope}）：")
            for label, tok, own in hits:
                print(f"   - {label}：{tok}（本课周=W{own}）")
            print("   修法：把文件名改成对应课自己的周号；确有合法跨周引用 → --allow-week-refs 显式开（须留痕）。")
        if dangle_report:
            show_dangle_report()
        return 1

    if dangle_report:
        show_dangle_report()
    if unassigned:
        print(f"⚠️  无归属判据的引用 {len(unassigned)} 处（范围：{scope}）—— 照报，不静默跳过：")
        for label, tok in unassigned[:40]:
            print(f"   - {label}：{tok}")
        print("   修法：给该文件补元数据注释 own-week: WXX（显式声明归属），或把 H1 改成带周号的标题。")
    print(f"✅ 0 串号 + 0 致命悬空课时 ID（范围：{scope}，扫 {len(items)} 个文件，"
          f"课时登记表 {len(registry)} 个课时）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
