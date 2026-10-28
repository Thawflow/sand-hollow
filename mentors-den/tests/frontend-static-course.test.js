// P3 · 前端切静态 —— 静态课程 DOM 提取器 + 前端接线断言
// 运行：node --test mentors-den/tests/frontend-static-course.test.js
//
// 设计约束（勿改）：
//   · 仓里无 node_modules，且 Node 26.10 无内置 DOMParser → 提取器必须是**纯函数**（正则/字符串），
//     不能依赖 DOM。全文件无外部依赖。
//   · 提取器放 docs/course-dom.js，UMD 双可用：node require + 浏览器 window.CourseDom。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const DOCS = path.join(REPO, 'docs');
const COURSE = path.join(REPO, 'mentors-den', 'course');

const dom = require(path.join(DOCS, 'course-dom.js'));

const readIndex = () => JSON.parse(fs.readFileSync(path.join(DOCS, 'course', 'index.json'), 'utf8'));
const index = readIndex();
const indexHtml = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');

// ─────────────────────────────────────────────────────────────
// 1. 提取器基本契约
// ─────────────────────────────────────────────────────────────
test('extractLessons: 真实周页提取出的课时数 == index.json 的 lesson_count', () => {
  for (const w of index.weeks) {
    const html = fs.readFileSync(path.join(DOCS, 'course', `${w.id}.html`), 'utf8');
    const lessons = dom.extractLessons(html);
    assert.strictEqual(
      lessons.length,
      w.lesson_count,
      `${w.id} 提取课时数 ${lessons.length} != index.json ${w.lesson_count}`
    );
  }
});

test('extractLessons: 提取出的 data-lid 与源 md 文件名一一对应', () => {
  for (const w of index.weeks) {
    const html = fs.readFileSync(path.join(DOCS, 'course', `${w.id}.html`), 'utf8');
    const lessons = dom.extractLessons(html);
    for (const L of lessons) {
      assert.ok(L.lid, `${w.id} 有一课缺 data-lid`);
      const md = path.join(COURSE, `${L.lid}.md`);
      assert.ok(fs.existsSync(md), `${L.lid}.md 在 mentors-den/course/ 里不存在`);
    }
  }
});

test('extractLessons: 全部 97 课覆盖，且不重不漏', () => {
  const seen = [];
  for (const w of index.weeks) {
    const html = fs.readFileSync(path.join(DOCS, 'course', `${w.id}.html`), 'utf8');
    seen.push(...dom.extractLessons(html).map((L) => L.lid));
  }
  assert.strictEqual(seen.length, 97, `总课时数 ${seen.length} != 97`);
  assert.strictEqual(new Set(seen).size, 97, '存在重复 lid');
  // 课时文件名有三种形态：-L01（字母课）、-S01（数字课）、-weekend（周末课）
  const mdFiles = fs.readdirSync(COURSE).filter((f) => /^W\d\d-(L\d+|S\d+|weekend)\.md$/.test(f)).map((f) => f.replace(/\.md$/, ''));
  assert.strictEqual(mdFiles.length, 97, `源 md 课时数 ${mdFiles.length} != 97`);
  assert.deepStrictEqual(seen.slice().sort(), mdFiles.slice().sort());
});

// ─────────────────────────────────────────────────────────────
// 2. 内容保真：静态产物没丢课文
// ─────────────────────────────────────────────────────────────
test('extractLessons: .md innerHTML 含源 md 渲染后的关键片段（内容没丢）', () => {
  const marked = require(path.join(DOCS, 'vendor', 'marked.min.js'));
  const html = fs.readFileSync(path.join(DOCS, 'course', 'W01.html'), 'utf8');
  const lessons = dom.extractLessons(html);
  assert.ok(lessons.length > 0);
  for (const L of lessons) {
    const md = fs.readFileSync(path.join(COURSE, `${L.lid}.md`), 'utf8');
    const rendered = marked.parse(md);
    // 取渲染结果的实质文本片段（去标签）作为不变量
    const plain = rendered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const head = plain.slice(0, 60);
    const inHtml = L.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(
      inHtml.includes(head),
      `${L.lid} 静态产物丢了课文开头片段: ${JSON.stringify(head)}`
    );
  }
});

test('extractLessons: 每课都有标题（lesson-head .lt 非空）', () => {
  for (const w of index.weeks) {
    const html = fs.readFileSync(path.join(DOCS, 'course', `${w.id}.html`), 'utf8');
    for (const L of dom.extractLessons(html)) {
      assert.ok(L.title && L.title.trim(), `${L.lid} 缺课时标题`);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 3. 坏输入兜底（前端不能白屏）
// ─────────────────────────────────────────────────────────────
test('extractLessons: 坏输入返回空数组，不抛异常', () => {
  for (const bad of ['', '   ', '<html></html>', 'not html at all', null, undefined]) {
    assert.deepStrictEqual(dom.extractLessons(bad), [], `坏输入 ${JSON.stringify(bad)} 未兜底`);
  }
});

test('extractSyllabus: 坏输入返回空字符串，不抛异常', () => {
  for (const bad of ['', '<html></html>', null, undefined]) {
    assert.strictEqual(dom.extractSyllabus(bad), '', `坏输入 ${JSON.stringify(bad)} 未兜底`);
  }
});

test('extractSyllabus: 真实 syllabus.html 能提取出正文且非空', () => {
  const html = fs.readFileSync(path.join(DOCS, 'course', 'syllabus.html'), 'utf8');
  const out = dom.extractSyllabus(html);
  assert.ok(out.length > 100, `syllabus 正文过短 (${out.length})`);
  assert.ok(out.includes('<'), 'syllabus 正文应含 HTML 标记');
});

// ─────────────────────────────────────────────────────────────
// 4. 确定性
// ─────────────────────────────────────────────────────────────
test('提取器是确定性的：同输入两次结果完全相同', () => {
  const html = fs.readFileSync(path.join(DOCS, 'course', 'W09.html'), 'utf8');
  assert.deepStrictEqual(dom.extractLessons(html), dom.extractLessons(html));
  const syl = fs.readFileSync(path.join(DOCS, 'course', 'syllabus.html'), 'utf8');
  assert.strictEqual(dom.extractSyllabus(syl), dom.extractSyllabus(syl));
});

// ─────────────────────────────────────────────────────────────
// 5. 前端接线断言（防回归）
// ─────────────────────────────────────────────────────────────
test('前端：index.html 不再引用 marked.min.js', () => {
  assert.ok(!/marked\.min\.js/.test(indexHtml), 'index.html 仍引用 marked.min.js');
});

test('前端：index.html 不再调用三个课程 GET 路由', () => {
  assert.ok(!/raceJSON\(\s*['"]\/learning\/weeks/.test(indexHtml), '仍调 /learning/weeks');
  assert.ok(!/raceJSON\(\s*['"]\/learning\/syllabus/.test(indexHtml), '仍调 /learning/syllabus');
  assert.ok(!/raceJSON\(\s*['"]\/learning\/week\//.test(indexHtml), '仍调 /learning/week/:id');
});

test('前端：index.html 引用同源静态课程路径', () => {
  assert.ok(/course\/index\.json/.test(indexHtml), '未引用 course/index.json');
  assert.ok(/course-dom\.js/.test(indexHtml), '未引用 course-dom.js');
});

test('前端：localStorage 缓存键已升版 learning-c: → learning-d:', () => {
  // 只扫**代码**，忽略注释（注释里提旧键名是正常的历史说明）
  const code = indexHtml
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  assert.ok(!/learning-c:/.test(code), 'index.html 代码里仍用 learning-c: 前缀');
  assert.ok(/learning-d:/.test(code), 'index.html 代码里未用 learning-d: 前缀');
});

test('前端：learning-pos 值带版本号，旧值作废', () => {
  assert.ok(/v\s*[:=]\s*2/.test(indexHtml), 'learning-pos 未见 v:2 版本标记');
});

test('sw.js：CACHE 版本已 bump 且 SHELL 移除 marked', () => {
  // ⚠️ 勿硬编码具体版本号（v4/v5…）：每次改 index.html 都要升 SW 版本，
  //    硬编码会让「升版」这个正确动作变成测试失败。判据改为「版本号存在且 ≥ v2」。
  const m = swJs.match(/sandy-hollow-v(\d+)/);
  assert.ok(m, 'sw.js 未找到 CACHE 版本号（sandy-hollow-vN）');
  assert.ok(Number(m[1]) >= 2, `CACHE 版本应 ≥ v2，实际 v${m[1]}`);
  assert.ok(!/marked\.min\.js/.test(swJs), 'sw.js SHELL 仍含 marked.min.js');
  assert.ok(/course\/index\.json/.test(swJs), 'sw.js SHELL 未含 course/index.json');
});

test('sw.js：SHELL 里每个文件都真实存在（否则 install 时 addAll 全 reject）', () => {
  const m = swJs.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js 未找到 SHELL 数组');
  const files = m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  for (const f of files) {
    const p = path.join(DOCS, f.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(p), `sw.js SHELL 里的 ${f} 在 docs/ 下不存在 → addAll 会 reject，install 失败`);
  }
});

// ─────────────────────────────────────────────────────────────
// 6. 产物结构断言
// ─────────────────────────────────────────────────────────────
test('产物：每个周页都含 week-body + section.lesson[data-lid] + .md[data-lid]', () => {
  for (const w of index.weeks) {
    const html = fs.readFileSync(path.join(DOCS, 'course', `${w.id}.html`), 'utf8');
    assert.ok(/class="week-body"/.test(html), `${w.id}.html 缺 .week-body`);
    assert.ok(/<section class="lesson" data-lid="/.test(html), `${w.id}.html 缺 section.lesson[data-lid]`);
    assert.ok(/<div class="md" data-lid="/.test(html), `${w.id}.html 缺 .md[data-lid]`);
  }
});

test('产物：周页标题与 index.json 的 title 一致', () => {
  for (const w of index.weeks) {
    const html = fs.readFileSync(path.join(DOCS, 'course', `${w.id}.html`), 'utf8');
    const t = dom.extractTitle(html);
    assert.strictEqual(t, w.title, `${w.id} 标题不一致`);
  }
});

// ─────────────────────────────────────────────────────────────
// 7. 学员端加载可靠性（2026-10-29）
//    背景：本机实测 learning.thawflow.com 的完整下载 total 长尾到 120s+，
//    而 STATIC_TIMEOUT_MS 只有 15s ⇒ 学员看到「课程加载失败（静态资源不可达）」，
//    那个「网络不通」是**误报**（文件就在那儿，是自己的超时太短）。
// ─────────────────────────────────────────────────────────────
test('fetchStaticCourse：超时预算 ≥45s（15s 会被长尾传输误杀）', () => {
  const m = indexHtml.match(/STATIC_TIMEOUT_MS\s*=\s*(\d+)/);
  assert.ok(m, 'index.html 未找到 STATIC_TIMEOUT_MS');
  const ms = Number(m[1]);
  assert.ok(ms >= 45000, `STATIC_TIMEOUT_MS 应 ≥45000（实测长尾 >120s），实际 ${ms}`);
});

test('fetchStaticCourse：读路径有重试（读无副作用，重试免费）', () => {
  assert.ok(/STATIC_RETRY\s*=\s*[1-9]/.test(indexHtml), 'index.html 未设置 STATIC_RETRY ≥1');
  assert.ok(/for\s*\(\s*let attempt\s*=/.test(indexHtml), 'fetchStaticCourse 未实现重试循环');
});

test('fetchStaticCourse：空体校验存在（HTTP 200 + 空 body 不算成功）', () => {
  assert.ok(/if\s*\(\s*!\s*txt\s*\|\|\s*!\s*txt\.trim\(\)\s*\)/.test(indexHtml),
    'index.html 缺少空体校验（!txt || !txt.trim()）');
});

test('fetchStaticCourse：HTTP 错误不重试（重试也不会变好，只拖慢首屏）', () => {
  assert.ok(/httpStatus/.test(indexHtml), 'index.html 未区分 HTTP 类失败');
  assert.ok(/if\s*\(\s*e\.httpStatus\s*\)\s*throw\s+e/.test(indexHtml),
    'HTTP 类失败未直接抛出（不应重试）');
});

test('静态资源路径：syllabus 走 course/ 前缀（线上实测路径 = /course/syllabus.html）', () => {
  assert.ok(/COURSE_BASE\s*=\s*['"]course\/['"]/.test(indexHtml),
    "COURSE_BASE 应为 'course/'");
  assert.ok(/fetchStaticCourse\(\s*['"]syllabus\.html['"]\s*\)/.test(indexHtml),
    '未发现 syllabus.html 的静态取用点');
});

// ─────────────────────────────────────────────────────────────
// 8. 网页交作业模块已移除（2026-10-29 · 家族立「沙坑不再考虑没有 AI agent 的用户」）
//    背景：10-18 家族已立该约定，10-13 提议的「学员网页直交作业」
//    （POST /learning/homework/submit）当时只做了归档，**前端卡片与 Worker 端点残留至今**。
//    现役流程：作业写进 ~/sand-hollow/<学员ID>/homework/ → 跟智能体说「修完了」
//    → AI agent 批改 → 评语写进 <学员ID>/reviews/。
//    本组断言的作用是**防止模块被加回来**（删除是不可逆意图，必须有回归防护）。
// ─────────────────────────────────────────────────────────────
test('网页交作业：前端不得有上传入口（卡片 / 选择文件 / 提交按钮 / CSS）', () => {
  for (const bad of [
    ['hw-upload', '交作业卡片容器 class'],
    ['hw-file-btn', '选 .py 文件按钮'],
    ['hw-send-btn', '提交作业按钮'],
    ['hw-code', '代码粘贴 textarea'],
    ['hw-file', '文件选择 input'],
    ['ok-msg', '提交结果提示'],
  ]) {
    assert.ok(!indexHtml.includes(bad[0]),
      `index.html 仍含 ${bad[1]}（${bad[0]}）—— 网页交作业模块应已移除`);
  }
});

test('网页交作业：不得再调用 /learning/homework/submit', () => {
  assert.ok(!/cfPost\(\s*['"]\/learning\/homework\/submit/.test(indexHtml),
    'index.html 仍在调用 /learning/homework/submit');
  assert.ok(!/learning\/homework\/submit['"]\s*,/.test(indexHtml),
    'index.html 仍有 homework/submit 端点字面量（可能是漏删的调用）');
});

test('网页交作业：幂等白名单不得含 /learning/homework/submit（它是真写接口）', () => {
  const m = indexHtml.match(/IDEMPOTENT_POSTS\s*=\s*new Set\(\s*\[([^\]]*)\]/);
  assert.ok(m, 'index.html 未找到 IDEMPOTENT_POSTS 定义');
  assert.ok(!/learning\/homework\/submit/.test(m[1]),
    'IDEMPOTENT_POSTS 含 /learning/homework/submit —— 它是**真写**接口，回落备域会双写');
});

test('作业提交流程：站点必须指向本地目录 + 跟智能体说一声', () => {
  assert.ok(/homework/.test(indexHtml), 'index.html 未提到 homework 目录');
  assert.ok(/修完了|交完了|作业完成/.test(indexHtml),
    'index.html 未提示学员「写完跟智能体说一声」');
  assert.ok(/reviews/.test(indexHtml), 'index.html 未提到 reviews/ 评语目录');
});

test('课程真值：作业保存规则指向本地 <学员ID>/homework/ 目录（非网页上传）', () => {
  const mdDir = path.join(COURSE);
  const files = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'));
  let checked = 0;
  for (const f of files) {
    const md = fs.readFileSync(path.join(mdDir, f), 'utf8');
    if (!/作业保存规则/.test(md)) continue;
    checked++;
    assert.ok(/homework\//.test(md), `${f} 的作业保存规则未指向 homework/ 目录`);
    assert.ok(!/homework\/submit|网页提交|上传作业/.test(md),
      `${f} 的作业保存规则仍指向网页上传`);
  }
  assert.ok(checked > 0, '未找到任何含「作业保存规则」的课程 md');
});
