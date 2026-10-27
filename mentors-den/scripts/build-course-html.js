'use strict';
/**
 * build-course-html.js — 把 mentors-den/course/*.md 编译成静态 HTML 产物
 *
 * 阶段 P1（纯本地、零生产影响）：产物落在 docs/course/，提交进 git，push 即发布。
 * 运行时零 KV 参与。
 *
 * 零外部依赖：渲染用仓内 docs/vendor/marked.min.js（与浏览器同一份，同一输入同一渲染器
 * → 渲染结果必然一致）。不装任何 npm 包。
 */
const fs = require('fs');
const path = require('path');

// 仓库根 = 脚本所在 mentors-den/scripts/ 的上两级（脚本可从任意 cwd 跑）
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const marked = require(path.resolve(__dirname, '..', '..', 'docs', 'vendor', 'marked.min.js'));

/**
 * 渲染 markdown —— 与前端 `marked.parse(L.markdown)` 同一输入、同一渲染器、同一输出。
 * @param {string} md
 * @returns {string} marked.parse 的原样输出
 */
function renderMarkdown(md) {
  return marked.parse(String(md == null ? '' : md));
}

// ── 标题体检闸 ────────────────────────────────────────────────
// 从 mentors-den/scripts/learning-publish.js 原样移植（判据一字不改）：
// 线上曾出现某周标题 = "x"（学员在课程列表里只看到一个字母），成因是手搓 payload
// 直调 /learning/publish 绕过了脚本，而 Worker 端不校验 title。
// 闸加在构建脚本里就能拦下：空 / 短于 3 字 / 占位符词表 / 占位符前缀变体 / 裸周号。
const TITLE_PLACEHOLDERS = new Set(['x', 'tbd', 'test', 'todo', 'xxx', '待定', '占位']);
// 占位符**前缀变体**也要拦：「TBD计划」「待定：xxx」「TODO-选题」这类不是全等匹配，
// 但同样是占位符。全等匹配只挡得住字面量本身 → 词表改成「前缀也算」。
const TITLE_PLACEHOLDER_RE = /^(x+|tbd|test|todo|xxx|待定|占位|待补|未定)/i;
function titleLooksSane(title, weekId) {
  const t = String(title || '').trim();
  if (!t) return '标题为空';
  if (t.length < 3) return `标题过短（${t.length} 字）：${t}`;
  if (TITLE_PLACEHOLDERS.has(t.toLowerCase())) return `标题是占位符：${t}`;
  if (TITLE_PLACEHOLDER_RE.test(t)) return `标题是占位符（前缀变体）：${t}`;
  if (t.toUpperCase() === weekId.toUpperCase()) return `标题只是裸周号：${t}`;
  return null;
}

/**
 * 取周标题 —— 来源唯一：SYLLABUS 的 `### WXX · <标题>` 行。
 * 与 learning-publish.js 同款（`### ${WEEK} · (.+)`）。
 * @param {string} syllabusMd SYLLABUS.md 原文
 * @param {string} weekId      周号，如 W01
 * @returns {string|null} 标题（无该周 → null）
 */
function parseWeekTitle(syllabusMd, weekId) {
  const m = String(syllabusMd || '').match(new RegExp('### ' + escapeRegExp(weekId) + ' · (.+)'));
  return m ? m[1].trim() : null;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 取课时标题 —— 来源唯一：课时 md 的 `# ` 行，剥掉 `WXX-XXX · ` 前缀。
 * 通用形态 `^[^·]+·\s*` 与 learning-publish.js 同款（判据一字不改）；
 * 给了 weekId 时先按周号精确剥，剥不动就退回通用形态（两条路径结果等价）。
 * @param {string} md       课时 md 原文
 * @param {string} [weekId] 所属周号，如 W01
 * @returns {string|null} 标题（没有 `# ` 标题行 → null）
 */
function parseLessonTitle(md, weekId) {
  const m = String(md || '').match(/^# (.+)$/m);
  if (!m) return null;
  const raw = m[1].trim();
  const exact = weekId ? new RegExp('^' + escapeRegExp(weekId) + '[^\\s·]*\\s*·\\s*') : null;
  const stripped = exact && exact.test(raw)
    ? raw.replace(exact, '')
    : raw.replace(/^[^·]+·\s*/, '');
  const t = stripped.trim();
  return t || null;
}

// ── 页面模板 ───────────────────────────────────────────────────
// 静态字符串：不得含构建时间戳，否则两次构建字节不同（确定性要求）。
// 类名沿用 docs/index.html 的那套，P3 把内容根注入前端时样式不用改。
const PAGE_STYLE = [
  '<style>',
  ':root{--bg:#0f1420;--card:#171e2e;--card2:#1e2740;--border:#2a3550;--text:#e8ecf4;--text2:#8b96ad;--accent:#5b9dff;--ok:#3ecf8e}',
  '*{margin:0;padding:0;box-sizing:border-box}',
  'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);min-height:100vh}',
  '.wrap{max-width:900px;margin:0 auto;padding:28px 20px 60px}',
  'h1{font-size:1.5rem}',
  '.wk-meta{color:var(--text2);font-size:.85rem;margin:4px 0 20px}',
  '.lesson{border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px;background:var(--card2)}',
  '.lesson-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
  '.lesson-head .lt{font-weight:700;font-size:1rem;flex:1}',
  '.md{font-size:.92rem;line-height:1.8;color:var(--text);overflow-wrap:break-word}',
  '.md h1,.md h2,.md h3{margin:14px 0 8px;font-size:1.05rem}',
  '.md p{margin:8px 0}',
  '.md code{background:rgba(91,157,255,.12);border-radius:5px;padding:2px 6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85em;color:#a8c8ff}',
  '.md pre{background:#0b0f18;border:1px solid var(--border);border-radius:10px;padding:12px 14px;overflow-x:auto;margin:10px 0}',
  '.md pre code{background:none;padding:0;color:#c9d7f0}',
  '.md ul,.md ol{margin:8px 0 8px 22px}',
  '.md blockquote{border-left:3px solid var(--accent);padding:4px 12px;color:var(--text2);margin:10px 0}',
  '.md a{color:var(--accent)}',
  '.md table{border-collapse:collapse;margin:10px 0;font-size:.85rem}',
  '.md td,.md th{border:1px solid var(--border);padding:6px 10px}',
  '.md input[type=checkbox]{width:15px;height:15px;accent-color:var(--ok);cursor:pointer;margin-right:6px;vertical-align:-2px}',
  '</style>',
].join('\n');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 课时文件名 = WXX-*.md；周号从文件名头部取
const LESSON_FILE_RE = /^(W\d\d)-.+\.md$/;
// SYLLABUS 里的周标题行：### WXX · 标题
const WEEK_HEADING_RE = /^### (W\d\d) · (.+)$/;

function buildError(message, exitCode, problems) {
  const err = new Error(message);
  err.exitCode = exitCode;
  if (problems) err.problems = problems;
  return err;
}

/**
 * 一个课时 section —— 固定三段：lesson-head（标题）+ md（渲染结果）+ section 壳。
 * ⚠️ md 里的 HTML 必须是 marked.parse(完整 md 文件内容) 的**原样输出**：
 * 前端用的是 marked.parse(L.markdown)，同一输入同一渲染器 → 渲染 diff 必为 0。
 */
function renderLessonSection(lesson) {
  return '<section class="lesson" data-lid="' + lesson.lid + '">\n'
    + '<div class="lesson-head"><span class="lt">' + escapeHtml(lesson.title) + '</span></div>\n'
    + '<div class="md" data-lid="' + lesson.lid + '">' + renderMarkdown(lesson.md) + '</div>\n'
    + '</section>';
}

function renderPage({ pageTitle, heading, meta, bodyHtml }) {
  return '<!DOCTYPE html>\n'
    + '<html lang="zh-CN">\n'
    + '<head>\n'
    + '<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>' + escapeHtml(pageTitle) + '</title>\n'
    + PAGE_STYLE + '\n'
    + '</head>\n'
    + '<body>\n'
    + '<div class="wrap">\n'
    + '<header>\n'
    + '<h1 class="wk-title">' + escapeHtml(heading) + '</h1>\n'
    + '<div class="wk-meta">' + escapeHtml(meta) + '</div>\n'
    + '</header>\n'
    + bodyHtml + '\n'
    + '</div>\n'
    + '</body>\n'
    + '</html>\n';
}

function renderWeekPage(week, lessons) {
  const sections = lessons.map(renderLessonSection).join('\n');
  return renderPage({
    pageTitle: week.id + ' · ' + week.title,
    heading: week.title,
    meta: week.id + ' · ' + lessons.length + ' 课',
    bodyHtml: '<div class="week-body" data-week="' + week.id + '">\n' + sections + '\n</div>',
  });
}

function renderSyllabusPage(syllabusMd, weekCount) {
  return renderPage({
    pageTitle: '课程总大纲',
    heading: '课程总大纲',
    meta: weekCount + ' 周 · 总纲',
    bodyHtml: '<div class="week-body" data-week="SYLLABUS">\n'
      + '<div class="md">' + renderMarkdown(syllabusMd) + '</div>\n'
      + '</div>',
  });
}

/**
 * 构建全部静态产物。
 * 闸没过时**不写任何文件**，抛出的 Error 带 exitCode=2 与 problems 数组（逐条问题）。
 * 读不到源文件时抛 exitCode=1 的 Error。
 * @param {{courseDir: string, outDir: string}} opts
 * @returns {{weeks: Array<{id: string, title: string, current: boolean, lesson_count: number}>, files: string[]}}
 */
function buildCourse({ courseDir, outDir }) {
  const dir = path.resolve(courseDir);
  const out = path.resolve(outDir);

  let syllabus;
  try {
    syllabus = fs.readFileSync(path.join(dir, 'SYLLABUS.md'), 'utf8');
  } catch (err) {
    throw buildError('读不到 SYLLABUS.md：' + path.join(dir, 'SYLLABUS.md'), 1);
  }

  // 周清单 = SYLLABUS 的周标题行 ∪ 课时文件里出现过的周号（后者的标题缺失 = 坏源）
  const syllabusWeeks = new Set();
  // 每次构建现造一个带 g 的实例：模块级正则带 lastIndex，跨次构建会漏匹配
  const re = new RegExp(WEEK_HEADING_RE.source, 'gm');
  let m;
  while ((m = re.exec(syllabus)) !== null) syllabusWeeks.add(m[1]);

  // 课时文件：WXX-*.md，文件名排序序 = 页面里的课时顺序
  const lessonFiles = fs.readdirSync(dir).filter(f => LESSON_FILE_RE.test(f)).sort();

  // ── 标题体检闸 ────────────────────────────────────────────────
  // 覆盖 ① 每个周标题 ② 每个课时标题。任一不过 → 抛错，**一个文件都不写**。
  const problems = [];
  const lessonsByWeek = new Map();
  for (const f of lessonFiles) {
    const weekId = f.match(LESSON_FILE_RE)[1];
    const md = fs.readFileSync(path.join(dir, f), 'utf8');
    const title = parseLessonTitle(md, weekId);
    if (title === null) {
      problems.push(f + '：没有 `# ` 标题行');
    } else {
      const p = titleLooksSane(title, weekId);
      if (p) problems.push(f + '：' + p);
    }
    if (!lessonsByWeek.has(weekId)) lessonsByWeek.set(weekId, []);
    lessonsByWeek.get(weekId).push({ lid: path.basename(f, '.md'), title: title || '', md });
  }

  const weekIds = [...new Set([...syllabusWeeks, ...lessonsByWeek.keys()])].sort();
  for (const id of weekIds) {
    const title = parseWeekTitle(syllabus, id);
    if (title === null) {
      problems.push('SYLLABUS 里没有 `### ' + id + ' · ` 行');
      continue;
    }
    const p = titleLooksSane(title, id);
    if (p) problems.push('SYLLABUS ' + id + '：' + p);
  }
  if (problems.length) {
    throw buildError('标题体检未通过 —— 拒绝产出', 2, problems);
  }

  // ── 落盘 ─────────────────────────────────────────────────────
  const weeks = weekIds.map(id => ({
    id,
    title: parseWeekTitle(syllabus, id),
    current: id === 'W01',
    lesson_count: (lessonsByWeek.get(id) || []).length,
  }));

  fs.mkdirSync(out, { recursive: true });
  const expected = new Set();
  const files = [];
  for (const week of weeks) {
    const lessons = lessonsByWeek.get(week.id) || [];
    const file = path.join(out, week.id + '.html');
    fs.writeFileSync(file, renderWeekPage(week, lessons));
    expected.add(week.id + '.html');
    files.push(file);
  }
  const syllabusFile = path.join(out, 'syllabus.html');
  fs.writeFileSync(syllabusFile, renderSyllabusPage(syllabus, weeks.length));
  expected.add('syllabus.html');
  files.push(syllabusFile);

  const indexFile = path.join(out, 'index.json');
  fs.writeFileSync(indexFile, JSON.stringify({ weeks }, null, 2) + '\n');
  expected.add('index.json');
  files.push(indexFile);

  // 删掉本次不再构建的旧产物（只认自己那三类文件名，别人放的文件不动）——
  // 否则删掉一周课时后，孤儿 HTML 会留在仓里，把产物清单撑破。
  for (const name of fs.readdirSync(out)) {
    if (expected.has(name)) continue;
    if (!/^W\d\d\.html$/.test(name) && name !== 'syllabus.html' && name !== 'index.json') continue;
    fs.unlinkSync(path.join(out, name));
  }

  return { weeks, files };
}

// ── CLI ────────────────────────────────────────────────────────
const USAGE = '用法: node build-course-html.js [--course-dir DIR] [--out-dir DIR]';

function parseCliArgs(argv) {
  const opts = {
    // 默认值按仓库根解析 → 脚本从任意 cwd 跑结果都一样
    courseDir: path.join(REPO_ROOT, 'mentors-den', 'course'),
    outDir: path.join(REPO_ROOT, 'docs', 'course'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--course-dir' || a === '--out-dir') {
      const v = argv[++i];
      if (!v) throw buildError(USAGE + '\n' + a + ' 后面缺目录参数', 1);
      // 显式给的路径按当前工作目录解析（常规 CLI 语义）
      opts[a === '--course-dir' ? 'courseDir' : 'outDir'] = path.resolve(process.cwd(), v);
    } else {
      throw buildError(USAGE + '\n未知参数：' + a, 1);
    }
  }
  return opts;
}

// 输出目录在仓库里就显示相对路径，免得日志里带机器路径
function displayPath(p) {
  const rel = path.relative(REPO_ROOT, p);
  return rel && !rel.startsWith('..') ? rel : p;
}

function main(argv) {
  let opts;
  try {
    opts = parseCliArgs(argv);
  } catch (err) {
    console.error('❌ ' + err.message);
    return 1;
  }
  try {
    const result = buildCourse(opts);
    const lessonCount = result.weeks.reduce((n, w) => n + w.lesson_count, 0);
    console.log('✅ 构建完成：' + result.weeks.length + ' 周 · ' + lessonCount + ' 课 · syllabus 1 份');
    console.log('   输出目录：' + displayPath(opts.outDir) + '（' + result.files.length + ' 个文件）');
    return 0;
  } catch (err) {
    if (err.exitCode === 2) {
      console.error('❌ 标题体检未通过 —— 拒绝产出（一个文件都不写）');
      for (const p of err.problems || []) console.error('   - ' + p);
      console.error('   修法：把对应标题改成正式标题再构建（占位符标题会直接显示给学员）。');
      return 2;
    }
    console.error('❌ ' + err.message);
    return 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  renderMarkdown,
  titleLooksSane,
  parseWeekTitle,
  parseLessonTitle,
  buildCourse,
};
