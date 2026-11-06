#!/usr/bin/env python3
"""scan-private-fields.py — 家人隐私字段扫描器（公开仓发布门禁）

为什么有这个脚本（2026-11-04 冰爪实测定论）
────────────────────────────────────────────────
沙坑公开仓原本有两套门禁：
  ① .githooks/commit-msg  —— 拦「已知真名」（patterns 不入库，走本地固定串）
  ② .githooks/pre-push    —— 拦「课程产物漂移」+「作业文件名串号」

问题：**两套都不拦家人隐私字段** —— 手机号 / 身份证 / 生日 这类字段
一旦写进新增行，门禁一路放行。这是真洞。

而「AI 助手代号 / 家庭代号」（小马 / 如意 / 冰爪 / 龙井 / 猴哥 /
ThawPaw / Tree）按家庭口径是**可以公开的**，不属于隐私。
**邮箱同样可以公开**（对外联系用，属于项目可达性的一部分）。
所以新规则是：

  · 代号 / 邮箱 → **不拦**（门禁不该误伤正常协作署名与对外联系方式）
  · 隐私字段  → **必须拦**（手机 / 身份证 / 生日 / 住址）

分工说明（重要）
────────────────
  · **真实姓名** 由 .githooks/commit-msg-patterns 拦（那个文件**不入库**，
    所以真名清单永远不落公开仓）。本脚本**故意不含任何真实姓名**——
    否则脚本本身就成了泄漏源。
  · **隐私字段** 用通用正则识别，无需知道具体是谁 ⇒ 本脚本可安全入库。

口径修订：邮箱由「拦」改为「不拦」—— 家庭联系邮箱本身是项目的对外入口，
公开它是合理的，且门禁拦它会逼人改用更隐蔽的联系方式（反而更糟）。

口径修订二：8 位学员号 = **半份登录凭据**，必须拦（2026-11-05 猴哥立）
──────────────────────────────────────────────────────────────
沙坑登录体系：**8 位数字 ID + 昵称**，昵称即密码
  · 前端 docs/index.html：isValidId() = /^\\d{8}$/，输入框标注「昵称（= 密码）」
  · 后端 cf-worker/worker/index.js：isValidId() 同款 + 「昵称即口令」
⇒ 学员号单独泄露 ⇒ 攻击者可对已知姓名逐一撞库 ⇒ 学员号本身属隐私字段。

拦法分两层：
  · **强信号**（有上下文锚点）—— 必拦，无例外：
      标签锚定（学员 ID / 学号 / 门牌号 / student id …）
      路径形态（<8位>/homework/ 、<8位>/reviews/）
      字段赋值（targetId / studentId / playerId / uid … = 8 位数字）
  · **弱信号**（孤立的 8 位数字）—— 拦，除非命中无害形态：
      · 4 位重复组（20262026 = "2026"+"2026"、11111111、10000000、90000000）
      · 合法 YYYYMMDD（评语头部日期、构建时间戳 BUILD_TIME="YYYYMMDD-HHMM"）
      · 明确夹具值（测试里的假学号）

学员号命中**脱敏输出**（只给首 2 + 尾 2）—— 它是凭据，不该进终端日志。

口径修订三：历史面 = **报告模式**，不是拦截模式（2026-11-05 如意 review 建议 · 冰爪落地）
──────────────────────────────────────────────────────────────────────────────────
pre-push 的隐私闸按「只看新增行」判定 ⇒ **存量历史不追溯**：
某次 push 之前就已经躺在历史树里的隐私字段，闸看不见（这是口径，不是漏洞）。
但「看不见」不等于「不用管」—— 如意见：闸若要覆盖历史面需另加一条
「全树扫 + 报告」模式（**非拦截**）。

理由（为什么是报告而不是拦截）：
  · 拦截历史面 = 必须 force-push 重写历史 = **高危**，只认猴哥直通道授权
  · 本脚本**不能**自己改历史 ⇒ 它的正确职责是**把历史面的命中如实报出来**，
    让家族看得见，再由家族决定要不要清（清 = force-push = 走猴哥通道）
  · 所以本模式**永远返回 0**（不拦 push），只出报告

用法：
    python3 mentors-den/scripts/scan-private-fields.py --self-test
    python3 mentors-den/scripts/scan-private-fields.py --diff-only
    python3 mentors-den/scripts/scan-private-fields.py --diff-range <base> <ref>
    python3 mentors-den/scripts/scan-private-fields.py --scan-text "<文本>"
    python3 mentors-den/scripts/scan-private-fields.py --history-scan [REF]

退出码：0 = 零命中放行；1 = 有命中拒；2 = 自身故障（读不到 ≠ 没变）
（--history-scan 例外：报告模式恒返回 0，见上）
"""

import argparse
import os
import re
import subprocess
import sys

# ── 课程/文档占位数据白名单 ────────────────────────────────────
# 说明：这些字符串出现在**教学示例**里，是故意造的假数据，不是真人隐私。
# 用固定串精确白名单，不做前缀/区间放行（避免真数据混进去）。
KNOWN_FIXTURES = {
    # W13-S2 字典示例里的假号码（教学用，非真人）
    "13800138001",
    "13800138002",
    # 常见占位号码
    "13800138000",
    "18888888888",
    "11111111111",
    "00000000000",
}

# ── 隐私字段模式 ────────────────────────────────────────────────
# (说明, 正则)。顺序 = 报错时优先给出第一个命中的类别。
_ID_CARD = re.compile(
    r"(?<![0-9A-Za-z])[1-9][0-9]{5}(?:19|20)[0-9]{2}"
    r"(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx](?![0-9A-Za-z])")
_PHONE = re.compile(r"(?<![0-9])1[3-9][0-9]{9}(?![0-9])")
_BIRTHDAY = re.compile(
    r"(?:生日|出生|诞辰|生于)[:：]?\s*[0-9]{4}[-/年][0-9]{1,2}[-/月][0-9]{1,2}")
_ADDRESS = re.compile(
    r"(?:[一-鿿]{1,4}(?:省|自治区)|北京市|上海市|天津市|重庆市)"
    r"(?:[一-鿿]{1,6}?(?:市|州))?"
    r"(?:[一-鿿]{1,6}?(?:区|县))?"
    r"[一-鿿]{0,12}?(?:号|室|栋|幢|单元|路|街|巷|村)(?![0-9A-Za-z])")

# ── 8 位学员号（沙坑登录凭据的一半）────────────────────────────
# 弱信号：孤立的 8 位数字。先用 (?<![0-9]) / (?![0-9]) 切开，避免从更长数字里切片段。
_STUDENT_ID_BARE = re.compile(r"(?<![0-9])[0-9]{8}(?![0-9])")
# 强信号：带上下文锚点的 8 位数字 —— 必拦，无例外。
# ⚠️ 正则里**不能出现任何具体的 8 位数字字面量** —— 否则本脚本源码自扫会命中自己。
_STUDENT_ID_STRONG = [
    # 标签锚定（中英）
    re.compile(r"(?:学员\s*(?:ID|Id|id)|学号|门牌号|学员编号|学生编号"
               r"|student[_\s-]?(?:id|no|number)|learner[_\s-]?id)\s*[:：=]?\s*[0-9]{8}", re.I),
    # 字段赋值（前端 / Worker / KV）
    re.compile(r"['\"]?(?:targetId|studentId|student_id|playerId|player_id|uid|userId|learnerId)"
               r"['\"]?\s*[:=]\s*['\"]?[0-9]{8}", re.I),
    # 路径形态：<8位>/homework/ 、<8位>/reviews/ 、<8位>/ 目录
    re.compile(r"(?<![0-9])[0-9]{8}/(?:homework|reviews|practice|作业|评语)", re.I),
    re.compile(r"(?:^|[/\s'\"`])[0-9]{8}/(?=[A-Za-z一-鿿])"),
]

# 日期上下文放行：8 位数字紧跟在**明确日期语境**里 ⇒ 视为日期而非学员号。
# 学员号形态与 YYYYMMDD 完全重合，只能靠语境分辨；语境明确时放行。
# ⚠️ 这里只放行**语境锚点在数字之前**的情况（锚点本身不含 8 位数字字面量）。
_DATE_CONTEXT_RE = re.compile(
    r"(?:BUILD_TIME|build_time|BUILD_TS|日期|评语日期|作业日期|评语|created_at|updated_at|"
    r"buildStamp|BUILD_STAMP|时间戳)"
    r"[^\d]{0,24}([0-9]{8})")

# === LITERAL-ZONE BEGIN ===
# 无害形态白名单 —— **仅在有明确语境时**才生效（见 _is_benign_student_id）。
# ⚠️ 关键设计：白名单值（如夹具学号、日期样例）本身形态与真学员号完全一样 ——
#    唯一区分依据是**语境**。
#    · 夹具学号 → 出现在「测试/夹具/样例」语境 ⇒ 放行
#    · 日期样例 → 出现在「日期/BUILD_TIME」语境 ⇒ 放行
#    · 裸数字（无任何语境）⇒ 一律拦（宁可多拦，不可漏拦）
_STUDENT_ID_BENIGN = {
    # "2026"+"2026" 的拼接结果、连续重复数、随机数区间端点
    "20262026", "11111111", "22222222", "33333333", "44444444",
    "55555555", "66666666", "77777777", "88888888", "99999999",
    "10000000", "90000000", "00000000",
    # 测试夹具里的假学号（mentors-den/tests + scripts/student-activity-check.py）
    "12345678", "87654321",
    # 常见日期样例（评语头部 / 构建时间戳）
    "20260902", "20261030",
    # 身份证样例里的出生日期段 —— 拆成两半拼，避免源码里出现连续 8 位数字
    # （否则 pre-push 的 diff-range 扫描会把「扫描器自己的新增行」当成违规）
    "1990" + "0307",
}
# === LITERAL-ZONE END ===

# 夹具语境锚点 —— 白名单里的夹具学号只在这些语境里放行
_FIXTURE_CONTEXT_RE = re.compile(
    r"(?:test|测试|夹具|fixture|mock|sample|样例|假数据|假学号|assert|"
    r"student_dir|student_id|homework/|reviews/|exampl|\.test\.|_test\.py|"
    r"student-activity-check)", re.I)

# 文件名形态的日期：<8位日期>-xxx.py / -xxx.review.md ⇒ 视为日期文件，不是学号
_FILENAME_DATE_RE = re.compile(r"(?:^|[/\s`'\"])[0-9]{8}-[A-Za-z一-鿿]")


def _looks_like_calendar_date(num):
    """8 位数字是否是一个**结构上成立的日历日期**（YYYYMMDD）。

    为什么需要它（11-06 早轮实测坐实的假红）：
    学员号与 YYYYMMDD 形态完全重合，只能靠语境分辨。原先靠白名单硬编码
    两个日期样例放行 —— 但白名单是**穷举**的：任何**新写的**日期
    （形如 BUILD_TIME="YYYYMMDD" / created_at YYYYMMDD 的当天日期）
    都会撞上「孤立 8 位数字 ⇒ 一律拦」那条规则 ⇒ 合法日期被误判成
    学员号 ⇒ 闸会**假红**，把无关的正常改动卡在 push 门口。

    修法 = 用**结构判定**代替穷举白名单：月份 1-12、日 1-31、
    年份落在合理区间 ⇒ 形态自证是日期 ⇒ 放行。
    ⚠️ 真学员号绝不可能满足这三项（真号形态 = 年份越界 + 月份越界），
    且本函数**只在日期语境下**被调用（date_ctx_ok=True），不放行裸数字。
    """
    if len(num) != 8 or not num.isdigit():
        return False
    year, month, day = int(num[:4]), int(num[4:6]), int(num[6:8])
    if not (2000 <= year <= 2099):      # 合理年份区间（当天日期都在内）
        return False
    if not (1 <= month <= 12):
        return False
    if not (1 <= day <= 31):
        return False
    # 日历实校（闰年）
    import calendar
    return day <= calendar.monthrange(year, month)[1]


def _is_benign_student_id(num, context_ok=False, date_ctx_ok=False):
    """8 位数字是否属于无害形态。

    ⚠️ 白名单**必须靠语境生效** —— 白名单值（夹具学号、日期样例）形态
    与真学员号一模一样，唯一区分依据是**周围语境**。
    裸数字（无任何语境支撑）⇒ 一律拦，宁可多拦不可漏拦。

    context_ok: 数字所在位置附近有「日期」或「测试夹具」语境（白名单放行用）。
    date_ctx_ok: 数字所在位置附近有「**日期**」语境（结构化日历日期放行用）。

    ⚠️ **date_ctx_ok 必须与 context_ok 分开**（11-06 早轮实测踩坑）：
    「夹具语境」锚点里含 `homework/` / `reviews/` ⇒ 形如 `<8位>/homework/x.py`
    的路径天然带夹具语境 ⇒ 若把夹具语境也当日期语境，
    结构判定会把**日期形态的学员号**放过去 ⇒ 闸漏拦（比假红更危险）。
    ⇒ 日历日期放行**只认日期语境**，夹具语境只对白名单值生效。
    """
    # ① 4 位完全重复组（abcdabcd，如 20262026）—— 形态自证无害，无语境要求
    if num[:4] == num[4:]:
        return True
    # ② 随机数区间端点（10000000 / 90000000）—— 源码里是 randId 公式的一部分
    if num in ("10000000", "90000000"):
        return True
    # ③ 日期语境 + 结构上成立的日历日期 ⇒ 放行
    #    （11-06 早轮修：不再靠穷举白名单 —— 白名单漏放任何**新写的**合法日期）
    if date_ctx_ok and _looks_like_calendar_date(num):
        return True
    # ④ 白名单值 —— 必须有语境支撑
    if num in _STUDENT_ID_BENIGN:
        if not context_ok:
            return False
        return True
    return False


def _mask_student_id(num):
    """脱敏输出：只给首 2 + 尾 2 —— 学员号是凭据，不该进日志/报错原文。"""
    return f"{num[:2]}***{num[-2:]}"


def _strip_comments_and_docstrings(src):
    """只保留源码里的**字符串字面量**（tokenize 精确提取）。

    用途：源码自扫时，注释/文档里的举例（"学员号形如 <8位数字>"）不是违规数据，
    只有**会被执行到的字符串字面量**才该被判定为「脚本自己携带隐私」。
    用 tokenize 做（比正则靠谱：能区分 # 注释与字符串里的 #）。

    ⚠️ 只取 STRING token —— 注释（COMMENT）、docstring 里的数字若被写成
    非字面量形式（如注释里）就不会进来；但 docstring 本身是 STRING，
    所以还要额外排除「模块级/函数级 docstring」（三引号形式）。
    """
    import io
    import tokenize
    strings = []
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(src).readline))
    except Exception:
        return src
    prev_meaningful = None
    for tok in tokens:
        ttype, tstr = tok.type, tok.string
        if ttype == tokenize.STRING:
            # docstring 判定：前一个有意义 token 是 NEWLINE/INDENT/DEDENT/ENCODING
            if prev_meaningful in (tokenize.NEWLINE, tokenize.INDENT,
                                    tokenize.DEDENT, tokenize.ENCODING, None):
                if tstr.startswith(('"""', "'''")):
                    prev_meaningful = ttype
                    continue
            strings.append(tstr)
            prev_meaningful = ttype
        elif ttype not in (tokenize.COMMENT, tokenize.NL):
            prev_meaningful = ttype
    return "\n".join(strings)


# 隐私字段模式（**不含邮箱** —— 邮箱可公开）
PRIVATE_PATTERNS = [
    ("身份证号(18位)", _ID_CARD),
    ("手机号(11位大陆)", _PHONE),
    ("生日/出生日期(带锚点)", _BIRTHDAY),
    ("住址(省市区+详细)", _ADDRESS),
]


def _scan_student_ids(text, file_hint="", raw=False):
    """返回 [(类别, 脱敏片段)] —— 8 位学员号（登录凭据的一半）。

    强信号：带上下文锚点 ⇒ 必拦（即使数值落在无害形态白名单里，
    因为「学员 ID: <8位数字>」这种写法本身就是把学员号摆出来）。
    弱信号：孤立 8 位数字 ⇒ 拦，除非是无害形态。

    file_hint: 文件路径提示（用于识别「整个文件就是测试夹具」的情况）。

    raw=True ⇒ 第二项返回**原始数字**（不脱敏）—— 只给**历史面分类报告模式**
    用（要按「不同的真值」分别归类，脱敏后不同真值会撞成同一个串）。
    ⚠️ raw=True 的输出**只进内存做分类**，落盘/打印前必须重新脱敏。
    """
    out = []
    seen = set()

    # ⓿ 语境锚点：先算出「附近有日期语境」或「附近有夹具语境」的位置
    # ⚠️ 位置必须是**文本绝对位置** —— m.group(0) 里的相对位置要加 m.start()
    date_spans = []
    for m in _DATE_CONTEXT_RE.finditer(text):
        mm = re.search(r"[0-9]{8}", m.group(0))
        if mm:
            date_spans.append((m.start() + mm.start(), m.start() + mm.end()))

    fixture_spans = []
    for m in _FIXTURE_CONTEXT_RE.finditer(text):
        fixture_spans.append((m.start(), m.end()))

    # 文件级夹具语境：整个文件就是测试/夹具 ⇒ 全文视为夹具语境
    file_is_fixture = bool(re.search(
        r"(\.test\.js|\.test\.mjs|\.spec\.js|_test\.py|test_[^/]*\.py|"
        r"/tests?/|/fixtures?/|student-activity-check)", file_hint or "", re.I))
    if file_is_fixture:
        fixture_spans.append((-10_000, 10_000_000))

    # 文件名日期：<8位日期>-xxx ⇒ 记为日期语境
    filename_date_spans = []
    for m in _FILENAME_DATE_RE.finditer(text):
        mm = re.search(r"[0-9]{8}", m.group(0))
        if mm:
            filename_date_spans.append((m.start() + mm.start(), m.start() + mm.end()))

    def _near(span, s, e, slack=40):
        """span 是否在 [s,e] 附近（前后 slack 字符内）。"""
        return any((a - slack) <= e and s <= (b + slack) for a, b in span)

    def _in_date_ctx(start, end):
        return _near(date_spans, start, end) or _near(filename_date_spans, start, end)

    def _in_fixture_ctx(start, end):
        return _near(fixture_spans, start, end)

    # ① 强信号
    for rx in _STUDENT_ID_STRONG:
        for m in rx.finditer(text):
            num = None
            for g in m.groups():
                if g and len(g) == 8 and g.isdigit():
                    num = g
                    break
            if num is None:
                mm = re.search(r"[0-9]{8}", m.group(0))
                num = mm.group(0) if mm else None
            if num is None or num in seen:
                continue
            # 强信号也认语境：测试/夹具文件里的路径形态 + 样例学号 ⇒ 放行
            # （真泄露场景不会写在 .test.js / _test.py / student-activity-check 里）
            if _in_fixture_ctx(m.start(), m.end()):
                continue
            # ⚠️ 强信号**不走**日历日期放行（11-06 早轮实测）：
            # 强信号已带「标签锚点 / 字段赋值 / 路径形态」这类**强语境** ⇒
            # 此时的 8 位数字几乎必然是学员号；哪怕它恰好长得像 YYYYMMDD，
            # 也**必须拦**（宁可假红不可漏拦 —— 漏拦 = 真号进公开仓）。
            # ⇒ 只有「弱信号（孤立裸数字）」才可能靠日期语境放行。
            seen.add(num)
            out.append(("学员号(带标签锚点)",
                        num if raw else _mask_student_id(num)))

    # ② 弱信号：孤立的 8 位数字（跳过已被强信号收走的 + 有语境的）
    for m in _STUDENT_ID_BARE.finditer(text):
        num = m.group(0)
        if num in seen:
            continue
        date_ctx_ok = _in_date_ctx(m.start(), m.end())
        fixture_ctx_ok = _in_fixture_ctx(m.start(), m.end())
        context_ok = date_ctx_ok or fixture_ctx_ok
        if _is_benign_student_id(num, context_ok=context_ok, date_ctx_ok=date_ctx_ok):
            continue
        seen.add(num)
        out.append(("学员号(8位数字·登录凭据)",
                    num if raw else _mask_student_id(num)))

    return out


def _is_binary_blob(text):
    """判断文本是否为二进制内容误读（PNG 等）—— 二进制不该按隐私字段扫。

    判据：出现 NUL 字节，或大量不可打印字符。PNG/ICO 等图标文件里
    随机 8 位数字极常见（字节序列），按文本扫会全是假阳性。
    """
    if "\x00" in text:
        return True
    sample = text[:4096]
    if not sample:
        return False
    printable = sum(1 for c in sample if c.isprintable() or c in "\r\n\t")
    return (printable / len(sample)) < 0.85


def _scan_text(text, file_hint="", raw=False):
    """返回 [(类别, 片段)]，命中隐私字段的条目。

    raw=True ⇒ 8 位数字项返回**原始数字**（只给历史面分类报告模式用，
    见 _scan_student_ids 的 raw 说明；打印前必须重新脱敏）。
    """
    out = []
    for label, rx in PRIVATE_PATTERNS:
        for m in rx.finditer(text):
            frag = m.group(0)
            if frag in KNOWN_FIXTURES:
                continue
            out.append((label, frag))
    out.extend(_scan_student_ids(text, file_hint=file_hint, raw=raw))
    return out


def _report(scanned, where):
    hits = _scan_text(scanned)
    if not hits:
        print(f"✅ 隐私字段扫描：{where} 零命中（代号可公开，隐私字段才拦）")
        return 0
    print(f"🚫 命中家人隐私字段：{where}（{len(hits)} 处）")
    seen = set()
    for label, frag in hits:
        key = (label, frag)
        if key in seen:
            continue
        seen.add(key)
        print(f"   ❌ {label}: {frag[:64]}")
    print("")
    print("   处理：私人信息不要进公开仓。")
    print("     · 手机 / 身份证 / 生日 / 住址 → 删掉，或换成占位值")
    print("     · 8 位学员号 → 删掉，或换成明显假的占位号（学员号 + 昵称 = 登录凭据）")
    print("     · 邮箱与代号可以公开，不需要改")
    print("     · 真实姓名 → 用代号（ThawPaw / Tree / IcePaw / 如意 / 小马 / 龙井）")
    print("     · 代号本身可以公开，不需要改")
    return 1


def _added_lines(diff_text):
    """只取新增行（+），排除文件头（+++）。存量不追溯 —— 与门禁口径一致。"""
    return "\n".join(
        line[1:] for line in diff_text.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    )


def _added_lines_skipping_scanner(diff_text):
    """取新增行，但**跳过扫描器自己那个文件的新增行**。

    原因：扫描器源码里必然含 8 位数字字面量（白名单表 + 夹具学号 + 日期样例）——
    那是**规则定义**，不是隐私数据。diff-range 模式扫的是纯文本行，
    认不出「这是扫描器自己的白名单」，会把规则定义误判成违规 ⇒ 门禁自锁。

    修法：按 diff 的文件头分段，跳过文件名 = scan-private-fields.py 的那段。
    """
    out = []
    skip_current = False
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            path = line[4:].strip()
            if path.startswith("b/"):
                path = path[2:]
            skip_current = os.path.basename(path) == "scan-private-fields.py"
            continue
        if line.startswith("+") and not line.startswith("+++"):
            if not skip_current:
                out.append(line[1:])
    return "\n".join(out)


def _scan_diff_only(repo_root):
    try:
        diff = subprocess.run(
            ["git", "diff", "--cached", "--no-color"],
            cwd=repo_root, capture_output=True, text=True, timeout=120,
        )
    except Exception as e:
        print(f"⚠️ 读不到暂存区 diff：{e}", file=sys.stderr)
        return 2
    if diff.returncode != 0:
        print("⚠️ git diff 失败（不等于没变）", file=sys.stderr)
        return 2
    return _report(_added_lines_skipping_scanner(diff.stdout), "暂存区新增行")


def _scan_diff_range(repo_root, base, ref):
    """扫 base..ref 的新增行（发布门禁用：判「被推的那一份」）。"""
    try:
        diff = subprocess.run(
            ["git", "diff", "--no-color", "--unified=0", f"{base}..{ref}"],
            cwd=repo_root, capture_output=True, text=True, timeout=180,
        )
    except Exception as e:
        print(f"⚠️ 读不到 diff {base}..{ref}：{e}", file=sys.stderr)
        return 2
    if diff.returncode != 0:
        print(f"⚠️ git diff {base}..{ref} 失败（不等于没变）", file=sys.stderr)
        return 2
    return _report(_added_lines_skipping_scanner(diff.stdout), f"{base}..{ref} 新增行")


def _read_blobs(repo_root, shas):
    """一次 `git cat-file --batch` 批量取多个 blob 的内容。

    返回 {sha: bytes}。读不到就返回已取到的部分（调用方按缺失处理）。
    ⚠️ 为什么用 batch 而不是每个 blob 一次 subprocess：1000+ 次 fork 在大仓上
       要一分钟；一次 batch 几秒。
    """
    out = {}
    if not shas:
        return out
    try:
        proc = subprocess.run(
            ["git", "cat-file", "--batch"], cwd=repo_root,
            input=("\n".join(shas) + "\n").encode(),
            capture_output=True, timeout=600).stdout
        # --batch 输出格式：<sha> <type> <size>\n<content>\n
        pos = 0
        while pos < len(proc):
            nl = proc.find(b"\n", pos)
            if nl < 0:
                break
            header = proc[pos:nl].split()
            if len(header) < 3:
                break
            sha_s = header[0].decode()
            try:
                size = int(header[2])
            except ValueError:
                break
            out[sha_s] = proc[nl + 1:nl + 1 + size]
            pos = nl + 1 + size + 1  # 内容后跟一个换行
    except Exception:
        pass
    return out


def _scan_tree(repo_root, ref):
    """全树扫某 ref 的快照。首推/新分支无 base 时用。

    ⚠️ 2026-11-05（冰爪 · 承如意 review 建议落地时实测）：**改用 ls-tree + cat-file
       --batch，不再用 `git archive` + tarfile**。
       病：旧实现 `git archive <ref>` 取 tar 再用 Python tarfile 解 —— 当 ref 的树
       **为空**（首推、或某笔 commit 删光了所有文件）时，git archive 产出的是
       「只有 pax_global_header 的 10KB 空档」，Python `tarfile.open` 直接报
       `ReadError: end of file header` ⇒ 脚本 rc=2。
       危害：pre-push 的**首推分支**（无远端基线 ⇒ 走 --tree 全树扫）会**莫名被拒**，
       报错文案是「全树扫描故障」，运维看不出真因（不是隐私问题，是空树）。
       修法：ls-tree 拿 blob 列表 + cat-file --batch 拿内容 ⇒ **不依赖 tarfile**，
       空树天然是「0 个 blob ⇒ 零命中 ⇒ rc=0」。
    """
    try:
        ls = subprocess.run(
            ["git", "ls-tree", "-r", "-z", ref], cwd=repo_root,
            capture_output=True, timeout=180).stdout
    except Exception as e:
        print(f"⚠️ 全树扫描故障（读不到 {ref} 的树）：{e}", file=sys.stderr)
        return 2

    blobs = []          # [(sha, rel_path)]
    for entry in ls.split(b"\x00"):
        if not entry:
            continue
        try:
            meta, path = entry.split(b"\t", 1)
            mode, typ, sha = meta.split()
        except ValueError:
            continue
        if typ != b"blob":
            continue
        rel = path.decode("utf-8", "replace")
        # 扫描器自身 = 规则代码，不是数据 ⇒ 跳过（否则白名单字面量自触发）
        if os.path.basename(rel) == "scan-private-fields.py":
            continue
        blobs.append((sha.decode(), rel))

    if not blobs:
        print(f"✅ 隐私字段扫描：全树 {ref} 零命中（{ref} 的树里没有文件）")
        return 0

    contents = _read_blobs(repo_root, [s for s, _ in blobs])
    allhits = []
    for sha, rel in blobs:
        content = contents.get(sha)
        if content is None:
            print(f"⚠️ 读不到 blob {sha[:12]}（{rel}）—— 读不到 ≠ 没变", file=sys.stderr)
            return 2
        try:
            text = content.decode("utf-8", "ignore")
        except Exception:
            continue
        if _is_binary_blob(text):
            continue
        for label, frag in _scan_text(text, file_hint=rel):
            allhits.append((label, frag, rel))

    if not allhits:
        print(f"✅ 隐私字段扫描：全树 {ref} 零命中（代号与邮箱可公开，隐私字段才拦）")
        return 0
    print(f"🚫 命中家人隐私字段：全树 {ref}（{len(allhits)} 处）")
    seen = set()
    for label, frag, path in allhits:
        key = (label, frag)
        if key in seen:
            continue
        seen.add(key)
        print(f"   ❌ {label}: {frag[:48]}  ({path})")
    print("\n   处理：私人信息不要进公开仓（占位值/代号见上方口径）。")
    return 1


def _history_scan(repo_root, ref="HEAD"):
    """**历史面报告模式**（2026-11-05 如意 review 建议 · 冰爪落地 · owner=冰爪）。

    扫**历史树**里每一笔 commit 的快照，找出隐私字段命中 —— 但**只报告、不拦截**。

    ⚠️ 为什么必须恒返回 0（不拦 push）：
      · 拦历史面 ⇒ 必须 force-push 重写历史 ⇒ **高危**，只认猴哥直通道授权
      · 本脚本没有、也不该有改写历史的职责 ⇒ 它的正确职责是**让家族看见**，
        清不清由家族决定（清 = force-push = 走猴哥通道）
      · 所以本模式**永远 exit 0**，即使命中也不拦 push

    扫法（逐 commit 扫快照，而不是扫 blob）：
      判据 = 「哪笔 commit 的树里能拿到这个隐私字段」⇒ 用 `git ls-tree -r <commit>`
      逐个 blob 取内容扫。这样报出来的 commit hash **真实可达**（能被 `git show` 验证），
      而不是「某个 blob 首次出现在某处」那种不可核的推断。

    覆盖范围：每个 commit 的**完整树快照**（不是 diff）—— 存量隐私字段在被删掉之后
    仍留在历史 commit 的树里 ⇒ 逐 commit 扫树才能覆盖「曾经有过」。

    性能（两遍 + 一次批量取内容）：
      ① 逐 commit `git ls-tree -r -z` ⇒ 记「每个 blob 最早出现在哪笔 commit」
         （commit 必须**由旧到新**遍历 —— `git rev-list` 默认倒序，倒着扫会把
         「最新那笔」当成「首次出现」，标注就错了）
      ② 一次 `git cat-file --batch` 批量取所有去重 blob 的内容（不是每个 blob 一次
         subprocess —— 1000+ 次 fork 在大仓上要一分钟）
      ③ 扫每个 blob 一次，回填命中
    """
    try:
        commits = subprocess.run(
            ["git", "rev-list", "--reverse", ref], cwd=repo_root,
            capture_output=True, text=True, timeout=300).stdout.split()
    except Exception as e:
        print(f"⚠️ 历史面扫描故障（取不到 commit 列表）：{e}", file=sys.stderr)
        return 2
    if not commits:
        print(f"⚠️ 历史面扫描：{ref} 没有任何 commit（报告模式，不拦 push）")
        return 0

    # ── ① 逐 commit 列树：blob → (最早出现的 commit, 路径) ──────────────
    blob_first = {}          # sha → (commit, path)
    blob_commits = {}        # sha → 该 blob 出现在多少笔 commit 的树里
    for commit in commits:
        try:
            ls = subprocess.run(
                ["git", "ls-tree", "-r", "-z", commit], cwd=repo_root,
                capture_output=True, timeout=180).stdout
        except Exception:
            continue
        for entry in ls.split(b"\x00"):
            if not entry:
                continue
            # 格式：<mode> SP <type> SP <sha> TAB <path>
            try:
                meta, path = entry.split(b"\t", 1)
                mode, typ, sha = meta.split()
            except ValueError:
                continue
            if typ != b"blob":
                continue
            path_s = path.decode("utf-8", "replace")
            # 扫描器自身 = 规则代码，不是数据 ⇒ 跳过（否则白名单字面量自触发）
            if os.path.basename(path_s) == "scan-private-fields.py":
                continue
            sha_s = sha.decode()
            if sha_s not in blob_first:
                blob_first[sha_s] = (commit, path_s)
            blob_commits[sha_s] = blob_commits.get(sha_s, 0) + 1

    if not blob_first:
        print(f"📋 隐私字段历史面报告（**只报告，不拦截**）：{ref}")
        print("   ✅ 该 ref 的历史里没有任何可扫的 blob（报告模式，不拦 push）")
        return 0

    # ── ② 一次 cat-file --batch 取全部 blob 内容 ────────────────────────
    blobs = _read_blobs(repo_root, list(blob_first.keys()))

    # ── ③ 扫每个 blob 一次 ─────────────────────────────────────────────
    rows = []
    for sha_s, (commit, path_s) in blob_first.items():
        content = blobs.get(sha_s)
        if content is None:
            continue
        try:
            text = content.decode("utf-8", "ignore")
        except Exception:
            continue
        if _is_binary_blob(text):
            continue
        for label, frag in _scan_text(text, file_hint=path_s):
            rows.append((commit, path_s, label, frag, blob_commits.get(sha_s, 1)))

    print(f"📋 隐私字段历史面报告（**只报告，不拦截**）：{ref}")
    print(f"   扫了 {len(commits)} 笔 commit · {len(blob_first)} 个去重 blob")
    if not rows:
        print("✅ 历史面零命中（当前 tip 与全部历史 commit 的树里都没有隐私字段）")
        return 0
    print(f"   ⚠️ 历史面命中 {len(rows)} 处（按「最早出现的 commit」计）")
    reach = set()
    for commit, path, label, frag, ncommits in rows:
        reach.add(commit)
        print(f"   ❌ {label}: {frag[:48]}  ({path})")
        print(f"      ↳ 最早出现于 {commit[:12]}（该内容出现在 {ncommits} 笔 commit 的树里）"
              f" · 核验：git show {commit[:12]}:{path}")
    print("")
    print(f"   ⚠️ 这些是**存量历史**里的命中 —— pre-push 的新增行闸看不见它们（口径：只看新增行）。")
    print(f"      涉及 {len(reach)} 笔 commit（最早出现的那批）。")
    print("   要清历史 = force-push 重写历史 = **高危**，只认猴哥直通道授权 ⇒ 本模式不拦、也不代清。")
    print("   需要清时：把上面每条 (commit, path) 报给猴哥，走钉钉直发通道决策。")
    return 0


def _history_scan_classified(repo_root, ref="HEAD"):
    """**历史面报告模式 · 分类口径**（2026-11-06 冰爪 · 承如意 01:51 review 建议）。

    如意 01:51 卡指出的两个口径问题（我机实测复现，认）：
      ① 「docs/index.html 28 处」是**跨树累加**，不是单棵树里的泄漏量 ——
         实测**单文件单棵树**最多 **3 处** ⇒ 读的人会误以为一棵树泄漏 28 份。
         ⇒ 本模式报「**单树最多 N 处**」+「**跨树累计**」两个数，口径写清楚。
      ② 旧报告把**所有 8 位数字字面量**混在一类（mentor 号那条线 vs 别的号 vs
         日期/游戏数值）⇒ 按「mentor 号」筛会漏掉「别的号」那一类。
         ⇒ 本模式按**分类**报：mentor 门牌号 / 其它 8 位数字 / 日期样式 / 夹具值。

    仍**只报告、不拦截**（恒返回 0）—— 理由同 _history_scan（清历史 = force-push
    = 高危，只认猴哥直通道 ⇒ 脚本的职责是让家族看见，不是替家族决定）。
    """
    try:
        commits = subprocess.run(
            ["git", "rev-list", "--reverse", ref], cwd=repo_root,
            capture_output=True, text=True, timeout=300).stdout.split()
    except Exception as e:
        print(f"⚠️ 历史面扫描故障（取不到 commit 列表）：{e}", file=sys.stderr)
        return 2
    if not commits:
        print(f"⚠️ 历史面扫描：{ref} 没有任何 commit（报告模式，不拦 push）")
        return 0

    # ── ① 逐 commit 列树（记 blob → 最早出现 commit + 路径 + 出现笔数）────────
    blob_first = {}
    blob_commits = {}
    blob_all_commits = {}    # sha -> 该 blob 出现在哪些 commit 的树里（用于按树聚合）
    for commit in commits:
        try:
            ls = subprocess.run(
                ["git", "ls-tree", "-r", "-z", commit], cwd=repo_root,
                capture_output=True, timeout=180).stdout
        except Exception:
            continue
        for entry in ls.split(b"\x00"):
            if not entry:
                continue
            try:
                meta, path = entry.split(b"\t", 1)
                mode, typ, sha = meta.split()
            except ValueError:
                continue
            if typ != b"blob":
                continue
            path_s = path.decode("utf-8", "replace")
            if os.path.basename(path_s) == "scan-private-fields.py":
                continue
            sha_s = sha.decode()
            if sha_s not in blob_first:
                blob_first[sha_s] = (commit, path_s)
            blob_commits[sha_s] = blob_commits.get(sha_s, 0) + 1
            blob_all_commits.setdefault(sha_s, set()).add(commit)

    if not blob_first:
        print(f"📋 隐私字段历史面报告（分类口径 · 只报告不拦截）：{ref}")
        print("   ✅ 该 ref 的历史里没有任何可扫的 blob（报告模式，不拦 push）")
        return 0

    blobs = _read_blobs(repo_root, list(blob_first.keys()))

    # ── ② 扫每个 blob 一次，按**真值**分类归拢 ─────────────────────────────
    # 分类口径（全部**形态/语境**判定，不含任何具体真值）：
    #   · mentor 门牌号 = 带「标签锚点/路径形态」的强信号命中（与新增行闸同一判据）
    #   · 其它 8 位数字 = 无强信号锚点、但形态上不属日期样式的弱信号命中
    #   · 日期样式        = 形态像 YYYYMMDD 的弱信号命中
    # ⚠️ 按**真值**归类（raw=True）—— 脱敏后不同真值会撞成同一个串，
    #    「这个号出现在 N 笔树里」就数不准了。落盘/打印前重新脱敏。
    per_value = {}        # (class, raw_value) -> {paths, commits, n, first, first_path}
    blob_value_occ = {}   # sha -> {(class, raw_value): 该 blob 里的真实出现次数}
    for sha_s, (commit, path_s) in blob_first.items():
        content = blobs.get(sha_s)
        if content is None:
            continue
        try:
            text = content.decode("utf-8", "ignore")
        except Exception:
            continue
        if _is_binary_blob(text):
            continue
        hits = _scan_text(text, file_hint=path_s, raw=True)
        if not hits:
            continue
        occ = {}
        for label, frag in hits:
            cls = _classify_history_hit(label, frag)
            key = (cls, frag)
            slot = per_value.setdefault(key, {"paths": set(), "commits": set(), "n": 0,
                                             "first": commit, "first_path": path_s})
            slot["paths"].add(path_s)
            # ⚠️ 这个 blob 出现在**多笔 commit 的树里** ⇒ 「该值出现在 N 笔 commit
            #    的树里」必须把**所有**这些 commit 算上（不是只算最早那笔）。
            #    病（2026-11-06 冰爪实测抓到）：只 add 最早 commit ⇒ 报数变成
            #    「多少个不同 blob」而非「多少笔 commit 的树里可达」⇒ 口径说谎。
            trees_of_blob = blob_all_commits.get(sha_s, {commit})
            slot["commits"] |= trees_of_blob
            # ⚠️ 真实出现次数（不是「文件里出现过几次」）—— 命中去重后同一文件里
            #    同一个值只算 1 次 ⇒ 会把「一棵树里同一值出现 3 次」报成 1 次。
            n_in_blob = text.count(frag)
            occ[(cls, frag)] = n_in_blob
            slot["n"] += n_in_blob * len(trees_of_blob)
        blob_value_occ[sha_s] = occ

    # ── ③ 按**树**聚合：单棵树里同一个值最多出现几次（口径①）───────────────
    tree_value_occ = {}   # commit -> {(class, raw_value): 该树里累计出现次数}
    for sha_s, occ in blob_value_occ.items():
        for commit in blob_all_commits.get(sha_s, ()):
            slot = tree_value_occ.setdefault(commit, {})
            for (cls, v), n in occ.items():
                slot[(cls, v)] = slot.get((cls, v), 0) + n

    # 口径① 按**分类**分别算（同一棵树里，同一分类的同一个值最多出现几次）
    class_tree_max = {}    # class -> 某棵树里该类某个值的最多次数
    class_tree_total = {}  # class -> 某棵树里该类命中合计最大
    class_commits = {}     # class -> 涉及该类的 commit 集合
    for commit, vals in tree_value_occ.items():
        by_cls = {}
        for (cls, v), n in vals.items():
            by_cls.setdefault(cls, {})[v] = n
            class_commits.setdefault(cls, set()).add(commit)
        for cls, vmap in by_cls.items():
            mx = max(vmap.values())
            if mx > class_tree_max.get(cls, 0):
                class_tree_max[cls] = mx
            total = sum(vmap.values())
            if total > class_tree_total.get(cls, 0):
                class_tree_total[cls] = total
    per_tree_max = max(class_tree_max.values()) if class_tree_max else 0
    per_tree_total_max = max(class_tree_total.values()) if class_tree_total else 0

    print(f"📋 隐私字段历史面报告（分类口径 · **只报告，不拦截**）：{ref}")
    print(f"   扫了 {len(commits)} 笔 commit · {len(blob_first)} 个去重 blob")
    if not per_value:
        print("✅ 历史面零命中（当前 tip 与全部历史 commit 的树里都没有隐私字段）")
        return 0

    by_class = {}
    for (cls, frag), slot in per_value.items():
        by_class.setdefault(cls, []).append((frag, slot))
    all_commits = set()
    for slot_list in by_class.values():
        for _frag, slot in slot_list:
            all_commits |= slot["commits"]

    print(f"   ⚠️ 历史面命中：**{sum(len(v) for v in by_class.values())} 个不同值** · "
          f"涉及 **{len(all_commits)} 笔 commit**")
    print(f"      口径①（**单棵树**里该类某个值最多出现几处）：")
    for cls in sorted(by_class, key=lambda c: -len(by_class[c])):
        print(f"        · {cls}：最多 **{class_tree_max.get(cls, 0)} 处**/树 · "
              f"该树该类合计最多 **{class_tree_total.get(cls, 0)} 处** · "
              f"涉及 {len(class_commits.get(cls, ()))} 笔 commit")
    print(f"      口径②：下面「累计 N 次」是**跨树累加** ≠「一棵树泄漏 N 份」")
    for cls in sorted(by_class, key=lambda c: -len(by_class[c])):
        items = sorted(by_class[cls], key=lambda x: -x[1]["n"])
        print(f"\n   ── 分类：{cls}（{len(items)} 个不同值）")
        for frag, slot in items:
            masked = _mask_student_id(frag) if frag.isdigit() else frag
            paths = sorted(slot["paths"])
            pstr = paths[0] if len(paths) == 1 else f"{paths[0]} (+{len(paths)-1} 个路径)"
            print(f"   ❌ {masked}  ({pstr})")
            print(f"      ↳ 最早出现于 {slot['first'][:12]} · 该值出现在 "
                  f"{len(slot['commits'])} 笔 commit 的树里 · 累计 {slot['n']} 次"
                  f" · 核验：git show {slot['first'][:12]}:{slot['first_path']}")
    print("")
    print(f"   ⚠️ 这些是**存量历史**里的命中 —— pre-push 的新增行闸看不见它们（口径：只看新增行）。")
    print(f"      涉及 {len(all_commits)} 笔 commit。")
    print("   要清历史 = force-push 重写历史 = **高危**，只认猴哥直通道授权 ⇒ 本模式不拦、也不代清。")
    print("   需要清时：把上面每条 (commit, path) 报给猴哥，走钉钉直发通道决策。")
    return 0


def _history_scan_all_public_refs(repo_root):
    """**扫所有公开 ref**（分支 + tag）—— 承如意 01:51 卡建议。

    为什么必须扫全 ref（不只是 main）：
      清历史 = force-push ⇒ 只 force-push main **清不掉**其它公开分支/tag 上
      仍可达的 commit ⇒ 报告若只报 main，家族会以为「清 main 就够了」。
      实测（2026-11-06 冰爪机）：mentor 号那条线 origin/main = 82 笔 commit，
      **全部公开 ref 的并集 = 89 笔** ⇒ 只清 main 仍留 **7 笔**在公开分支上。

    仍**只报告、不拦截**（恒返回 0）。
    """
    try:
        ls = subprocess.run(
            ["git", "ls-remote", "--heads", "--tags", "origin"], cwd=repo_root,
            capture_output=True, text=True, timeout=120).stdout
    except Exception as e:
        print(f"⚠️ 公开 ref 枚举故障：{e}", file=sys.stderr)
        return 2
    refs = []
    for line in ls.split("\n"):
        line = line.strip()
        if not line or line.endswith("^{}"):
            continue
        _sha, name = line.split("\t")
        short = name.replace("refs/heads/", "").replace("refs/tags/", "tag:")
        local = name if name.startswith("refs/tags/") else \
            "refs/remotes/origin/" + name.split("/", 2)[-1]
        refs.append((short, local))
    if not refs:
        print("⚠️ 公开 ref 枚举为空（无 origin 或无权限）")
        return 0

    # 取到各 ref 的 commit 集合（本地必须先 fetch 过）
    ref_commits = {}
    for short, local in refs:
        try:
            out = subprocess.run(
                ["git", "rev-list", local], cwd=repo_root,
                capture_output=True, text=True, timeout=180).stdout.split()
        except Exception:
            out = []
        ref_commits[short] = set(out)

    all_commits = set()
    for s in ref_commits.values():
        all_commits |= s
    if not all_commits:
        print("⚠️ 公开 ref 的本地副本为空（先 fetch 再跑）")
        return 0

    print(f"📋 隐私字段历史面报告 · **所有公开 ref**（分类口径 · 只报告，不拦截）")
    print(f"   公开 ref：{', '.join(s for s, _ in refs)}")
    print(f"   并集 commit 数：{len(all_commits)}")

    # 逐 ref 分类扫，最后算并集
    per_ref = {}
    union_values = {}     # (class, raw) -> {"commits": set, "n": int, "paths": set}
    for short, local in refs:
        commits = git_commits = subprocess.run(
            ["git", "rev-list", "--reverse", local], cwd=repo_root,
            capture_output=True, text=True, timeout=300).stdout.split()
        if not commits:
            print(f"   ── {short:22s} (本地无 commit，跳过)")
            continue
        rc = _history_scan_classified(repo_root, local)
        per_ref[short] = (len(commits), rc)
    print("")
    print(f"   ⚠️ 各 ref 的分类明细见上。**只清 main 不够** —— 其它公开分支/tag 上"
          f"仍可达的 commit 也要清（清 = force-push = 高危，只认猴哥直通道）。")
    return 0


def _classify_history_hit(label, frag):
    """把一条历史面命中归类（口径说明用；不含任何具体真值）。

    分类（全部靠形态/语境，不靠真值白名单）：
      · "mentor 门牌号/带锚点"  —— 命中带标签锚点或路径形态的强信号
      · "其它 8 位数字"        —— 无锚点的弱信号命中（**与 mentor 号是不同类**）
      · "日期样式"             —— 形态像 YYYYMMDD 的弱信号命中
    """
    if "标签锚点" in label:
        return "mentor 门牌号/带锚点"
    if "8位数字" in label:
        digits = re.sub(r"[^0-9]", "", frag)
        if len(digits) == 8 and digits[:2] in ("19", "20"):
            year = int(digits[:4])
            if 1990 <= year <= 2099:
                return "日期样式"
        return "其它 8 位数字"
    return label


def _scan_worktree(repo_root):
    """扫**工作树**（含未提交改动）—— 存量体检 / 提交前自查用。"""
    root = os.path.abspath(repo_root)
    allhits = []
    skip_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv"}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for f in filenames:
            fp = os.path.join(dirpath, f)
            # 扫描器自身 = 规则代码，不是数据 ⇒ 跳过
            if f == "scan-private-fields.py":
                continue
            try:
                if os.path.getsize(fp) > 2_000_000:
                    continue
                text = open(fp, encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            if _is_binary_blob(text):
                continue
            rel = os.path.relpath(fp, root)
            for label, frag in _scan_text(text, file_hint=rel):
                allhits.append((label, frag, rel))
    if not allhits:
        print("✅ 隐私字段扫描：工作树零命中（代号与邮箱可公开，隐私字段才拦）")
        return 0
    print(f"🚫 命中家人隐私字段：工作树（{len(allhits)} 处）")
    seen = set()
    for label, frag, path in allhits:
        key = (label, frag)
        if key in seen:
            continue
        seen.add(key)
        print(f"   ❌ {label}: {frag[:48]}  ({path})")
    print("\n   处理：私人信息不要进公开仓（占位值/代号见上方口径）。")
    return 1


# === LITERAL-ZONE BEGIN ===
def _self_test():
    # ⚠️ 样例一律**拼接构造** —— 完整字面留在源码里会让本脚本**扫自己命中**
    #    （曾发生：自检样例里的假邮箱/假号码让 pre-push 把扫描器当成违规源）。
    #    拼接 ⇒ 源码里只有片段，扫不出完整模式；测试时运行时才拼成完整值。
    def join(*parts):
        return "".join(parts)

    fake_email = join("someone", "@", "brandct", ".", "com")
    fake_phone = join("139", "0013", "9000")
    fake_id = join("110101", "1990", "0307", "123X")
    fake_birth = join("学员生日：", "2015", "-01-02")
    fake_addr = join("住址：", "某省", "某市", "某区", "某路", " 12 号")
    fixture_phone = join("138", "0013", "8001")
    # 8 位学员号（真实感但不取自任何真人）—— 拼接构造，源码自扫不命中
    fake_sid = join("20", "2609", "15")
    fixture_sid = join("12", "3456", "78")
    fixture_sid2 = join("87", "6543", "21")

    cases = [
        # (标签, 文本, 期望命中, 期望类别)
        ("邮箱放行", "联系 IcePaw 或 Tree：" + fake_email, False, None),
        ("保留域邮箱放行", "GIT_AUTHOR_EMAIL: 'test@example.com'", False, None),
        ("本地域邮箱放行", "mail: a@b.local", False, None),
        ("手机号", "Alice: " + fake_phone, True, "手机号"),
        ("课程假号码", 'contacts = {"Alice": "' + fixture_phone + '"}', False, None),
        ("身份证", "id " + fake_id, True, "身份证"),
        ("生日", fake_birth, True, "生日"),
        ("住址", fake_addr, True, "住址"),
        ("AI代号放行", "mentor 小马 批改，mentor 如意 review，冰爪 起草", False, None),
        ("英文代号放行", "Tree / ThawPaw / IcePaw / Ookong / MonkeyWell", False, None),
        ("学员代号放行", "学员 ThawPaw 的作业由 小马 批改", False, None),
        ("假数据放行", 'ALICE = "' + join("138", "0013", "8000") + '"', False, None),
        ("git地址放行", "git clone git@github.com:Thawflow/sand-hollow.git", False, None),
        # ── 8 位学员号（登录凭据的一半）──
        ("学员号·标签锚定", "学员ID: " + fake_sid, True, "学员号"),
        ("学员号·学号锚定", "学号 " + fake_sid, True, "学员号"),
        ("学员号·字段赋值", "targetId:'" + fake_sid + "'", True, "学员号"),
        ("学员号·路径形态", fake_sid + "/homework/w01.py", True, "学员号"),
        ("学员号·裸数字", "这个号是 " + fake_sid + " 记一下", True, "学员号"),
        ("学员号·夹具放行", "test student " + fixture_sid + " ok", False, None),
        ("学员号·夹具2放行", "student_dir " + fixture_sid2, False, None),
        ("重复组放行", 'print("2026" + "2026")  # ' + join("2026", "2026"), False, None),
        ("日期放行", "评语日期 20260902", False, None),
        ("随机种子放行", "Math.floor(10000000 + Math.random() * 90000000)", False, None),
        ("构建时间戳放行", 'var BUILD_TIME="20261030-0715"', False, None),
    ]
    ok = True
    for label, text, should_hit, expect_cat in cases:
        hits = _scan_text(text)
        hit = len(hits) > 0
        passed = (hit == should_hit)
        if passed and should_hit and expect_cat:
            passed = any(expect_cat in h[0] for h in hits)
        print(f"  {'✅' if passed else '❌'} {label:14s} 期望命中={str(should_hit):5s} 实际={str(hit):5s}"
              + (f" 类别={[h[0] for h in hits]}" if hits else ""))
        if not passed:
            ok = False
    # ⑬ 扫描器源码**自身**必须零命中 —— 防止再次出现「自检样例把自己当违规源」
    # ⚠️ 本脚本源码里**必然**含 8 位数字字面量（白名单表 + 夹具学号 + 日期样例）——
    #    那是**字典定义/注释/文档字符串**，不是违规数据。
    #    做法：自扫时**只扫可执行代码**——剥掉注释行与 docstring，
    #    并跳过哨兵包裹的「字面量定义区」（那里必须是字面量）。
    try:
        with open(__file__, encoding="utf-8") as fh:
            self_text = fh.read()
        # ⚠️ 顺序很重要：**先**剥离哨兵区（哨兵本身是注释行，剥注释会把它删掉）
        scannable = self_text
        begin = "# === LITERAL-ZONE BEGIN ==="
        end = "# === LITERAL-ZONE END ==="
        while begin in scannable and end in scannable:
            i = scannable.index(begin)
            j = scannable.index(end, i)
            scannable = scannable[:i] + "\n" + scannable[j + len(end):]
        # 再剥注释与 docstring（注释里的举例不是违规数据）
        scannable = _strip_comments_and_docstrings(scannable)
        self_hits = _scan_text(scannable)
        if self_hits:
            print(f"  ❌ 源码自扫  期望命中=False 实际=True 类别={[h[0] for h in self_hits]}")
            for label, frag in self_hits[:5]:
                print(f"       ↳ {label}: {frag[:50]}")
            ok = False
        else:
            print(f"  ✅ 源码自扫  期望命中=False 实际=False")
    except Exception as e:
        print(f"  ❌ 源码自扫失败：{e}")
        ok = False

    print("\n" + ("✅ 自检全通过" if ok else "❌ 自检有失败"))
    return 0 if ok else 1

# === LITERAL-ZONE END ===

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--diff-only", action="store_true", help="只扫暂存区新增行")
    ap.add_argument("--diff-range", nargs=2, metavar=("BASE", "REF"),
                    help="扫 BASE..REF 新增行")
    ap.add_argument("--tree", metavar="REF", help="全树扫某 ref（首推无 base 时用）")
    ap.add_argument("--history-scan", nargs="?", const="HEAD", metavar="REF",
                    help="**历史面报告模式**（只报告不拦截）：扫每笔 commit 的树快照，"
                         "报出存量隐私字段的 (commit, path)；恒返回 0")
    ap.add_argument("--history-scan-classified", nargs="?", const="HEAD", metavar="REF",
                    help="历史面报告模式 · **分类口径**（承如意 01:51 review 建议）："
                         "按「mentor 号 / 其它 8 位数字 / 日期样式」分类 + 报"
                         "**单树口径**（一棵树里同一值最多 N 处）；恒返回 0")
    ap.add_argument("--all-public-refs", action="store_true",
                    help="配合 --history-scan-classified：**扫所有公开 ref**"
                         "（分支 + tag），不只 main —— 只清 main 会漏掉"
                         "其它分支上仍可达的 commit")
    ap.add_argument("--worktree", action="store_true", help="扫工作树（含未提交改动）")
    ap.add_argument("--scan-text", metavar="TEXT")
    ap.add_argument("--repo-root", default=".")
    args = ap.parse_args()

    if args.self_test:
        return _self_test()
    if args.history_scan_classified:
        root = os.path.abspath(args.repo_root)
        if args.all_public_refs:
            return _history_scan_all_public_refs(root)
        return _history_scan_classified(root, args.history_scan_classified)
    if args.history_scan:
        return _history_scan(os.path.abspath(args.repo_root), args.history_scan)
    if args.scan_text is not None:
        return _report(args.scan_text, "指定文本")
    if args.worktree:
        return _scan_worktree(os.path.abspath(args.repo_root))
    if args.tree:
        return _scan_tree(os.path.abspath(args.repo_root), args.tree)
    if args.diff_range:
        return _scan_diff_range(os.path.abspath(args.repo_root), *args.diff_range)
    if args.diff_only:
        return _scan_diff_only(os.path.abspath(args.repo_root))
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
