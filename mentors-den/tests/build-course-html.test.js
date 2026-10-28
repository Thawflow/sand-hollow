'use strict';
/**
 * build-course-html.js 的测试（沙坑课程静态化 · 阶段 P1）
 *
 * 跑法：node --test mentors-den/tests/
 *
 * 写法约定：
 * - 每个用例 = 一个垂直切片，先看它红，再写实现。
 * - 构建产物一律落在 os.tmpdir() 的临时目录里，测试不碰工作树。
 * - fixture 课程（fixtures/course/）是**合成数据**：标题与正文全部虚构。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'mentors-den', 'scripts', 'build-course-html.js');
const FIXTURE_COURSE = path.join(__dirname, 'fixtures', 'course');
const REAL_COURSE = path.join(REPO_ROOT, 'mentors-den', 'course');
const marked = require(path.join(REPO_ROOT, 'docs', 'vendor', 'marked.min.js'));

// 惰性 require：模块还不存在时，报错落在用例内部，RED 证据更清晰
function loadBuild() {
  return require(SCRIPT);
}

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sand-hollow-p1-' + tag + '-'));
}

// 把 fixture 课程整份拷到临时目录 —— 闸的用例各自改副本，不污染原 fixture
function copyFixtureCourse(tag) {
  const dir = path.join(tmpDir(tag), 'course');
  fs.cpSync(FIXTURE_COURSE, dir, { recursive: true });
  return dir;
}

// ── 切片 1：渲染出口与前端同款 ────────────────────────────────
test('切片 1：renderMarkdown 原样返回 marked.parse 的输出', () => {
  const build = loadBuild();
  const md = '## 二级标题\n\n正文一段。\n';
  assert.strictEqual(build.renderMarkdown(md), marked.parse(md));
});

// ── 切片 2：标题体检闸（判据从 learning-publish.js 原样移植） ──
test('闸：空标题拒', () => {
  const build = loadBuild();
  assert.strictEqual(build.titleLooksSane('', 'W01'), '标题为空');
  assert.strictEqual(build.titleLooksSane(null, 'W01'), '标题为空');
  assert.strictEqual(build.titleLooksSane('   ', 'W01'), '标题为空');
});

test('闸：过短标题拒', () => {
  const build = loadBuild();
  assert.strictEqual(build.titleLooksSane('ab', 'W01'), '标题过短（2 字）：ab');
});

test('闸：占位符词表全等拒', () => {
  const build = loadBuild();
  // 端口的判据顺序：先「过短」再「占位符」→ 1~2 字的占位符先被过短闸拦下（同样拒）
  assert.strictEqual(build.titleLooksSane('x', 'W01'), '标题过短（1 字）：x');
  assert.strictEqual(build.titleLooksSane('待定', 'W01'), '标题过短（2 字）：待定');
  assert.strictEqual(build.titleLooksSane('占位', 'W01'), '标题过短（2 字）：占位');
  for (const p of ['tbd', 'test', 'todo', 'xxx']) {
    assert.strictEqual(build.titleLooksSane(p, 'W01'), '标题是占位符：' + p);
  }
});

test('闸：占位符前缀变体拒', () => {
  const build = loadBuild();
  assert.strictEqual(build.titleLooksSane('待定：xxx', 'W01'), '标题是占位符（前缀变体）：待定：xxx');
  assert.strictEqual(build.titleLooksSane('TBD计划', 'W01'), '标题是占位符（前缀变体）：TBD计划');
  assert.strictEqual(build.titleLooksSane('TODO-选题', 'W01'), '标题是占位符（前缀变体）：TODO-选题');
});

test('闸：裸周号拒', () => {
  const build = loadBuild();
  assert.strictEqual(build.titleLooksSane('W01', 'W01'), '标题只是裸周号：W01');
  assert.strictEqual(build.titleLooksSane('w01', 'W01'), '标题只是裸周号：w01');
});

test('闸：正常标题放行', () => {
  const build = loadBuild();
  assert.strictEqual(build.titleLooksSane('合成第一周：把想法写在纸上', 'W01'), null);
});

// ── 切片 3：周标题来源 = SYLLABUS 的 `### WXX · ` 行 ──────────────
test('切片 3：parseWeekTitle 从 SYLLABUS 的 ### 行取标题', () => {
  const build = loadBuild();
  const md = fs.readFileSync(path.join(FIXTURE_COURSE, 'SYLLABUS.md'), 'utf8');
  assert.strictEqual(build.parseWeekTitle(md, 'W01'), '合成第一周：把想法写在纸上');
  assert.strictEqual(build.parseWeekTitle(md, 'W02'), '合成第二周：让纸片排起队');
  assert.strictEqual(build.parseWeekTitle(md, 'W99'), null);
});

// ── 切片 4：课时标题来源 = 各 md 的 `# ` 行 ───────────────────────
test('切片 4：parseLessonTitle 去掉 WXX-XXX · 前缀', () => {
  const build = loadBuild();
  const md = fs.readFileSync(path.join(FIXTURE_COURSE, 'W01-S1.md'), 'utf8');
  assert.strictEqual(build.parseLessonTitle(md, 'W01'), '合成课时：写第一行字');
});

test('切片 4b：标题里还有 · 时只剥第一个分隔符', () => {
  const build = loadBuild();
  const md = fs.readFileSync(path.join(FIXTURE_COURSE, 'W02-S1.md'), 'utf8');
  assert.strictEqual(build.parseLessonTitle(md, 'W02'), '合成课时：让纸片排起队');
});

test('切片 4c：没有 # 标题行时返回 null', () => {
  const build = loadBuild();
  assert.strictEqual(build.parseLessonTitle('只有正文，没有标题行。\n', 'W01'), null);
});

// 统计子串出现次数（断言「全页唯一」用）
function countOf(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ── 切片 5：周页结构（week-body 唯一 + 每课时一个 section） ───────
test('切片 5：buildCourse 产出周页，week-body 唯一 + 每课时一个 section', () => {
  const build = loadBuild();
  const outDir = path.join(tmpDir('slice5'), 'out');
  build.buildCourse({ courseDir: FIXTURE_COURSE, outDir });

  const html = fs.readFileSync(path.join(outDir, 'W01.html'), 'utf8');

  // 内容根全页唯一，且带周号
  assert.strictEqual(countOf(html, 'class="week-body"'), 1);
  assert.ok(html.includes('<div class="week-body" data-week="W01">'), '缺 week-body 根');

  // 课时数 = fixture 课时数；顺序 = 文件名排序序
  assert.strictEqual(countOf(html, '<section class="lesson"'), 3);
  assert.ok(html.indexOf('data-lid="W01-S1"') < html.indexOf('data-lid="W01-S2"'));
  assert.ok(html.indexOf('data-lid="W01-S2"') < html.indexOf('data-lid="W01-S3"'));

  // 每 section 内固定两段：lesson-head + md（md 的 data-lid 与 section 一致）
  assert.ok(html.includes('<div class="lesson-head"><span class="lt">合成课时：写第一行字</span></div>'));
  assert.ok(html.includes('<div class="md" data-lid="W01-S1">'));

  // 页面头部：title 与 h1 都是「周号 · 周标题」
  assert.ok(html.includes('<title>W01 · 合成第一周：把想法写在纸上</title>'));
  assert.ok(html.includes('<h1 class="wk-title">合成第一周：把想法写在纸上</h1>'));

  // 静态页不含「交作业」卡片（动态 UI 归 P3）
  assert.ok(!html.includes('hw-upload'));
});

// ── 切片 6：markdown 保真（h2 / 代码块 / details / 表格 / 清单） ───
test('切片 6：markdown 保真（h2 / 代码块 / details / 表格 / 清单）', () => {
  const build = loadBuild();
  const outDir = path.join(tmpDir('slice6'), 'out');
  build.buildCourse({ courseDir: FIXTURE_COURSE, outDir });
  const html = fs.readFileSync(path.join(outDir, 'W01.html'), 'utf8');

  // fixture 的 W01-S1.md 里塞了全部这些形态
  assert.ok(html.includes('<h2>二级标题：写下第一行</h2>'), '缺 h2');
  assert.ok(html.includes('<pre><code class="language-python">'), '缺 python 代码块');
  assert.ok(html.includes('<details>') && html.includes('<summary>展开看合成提示</summary>'), '缺 details/summary');
  assert.ok(html.includes('<table>'), '缺表格');
  assert.ok(html.includes('type="checkbox"'), '缺任务清单 checkbox');

  // 更强的一条：.md 里的内容 === marked.parse(完整 md 文件内容)，逐字节
  const md = fs.readFileSync(path.join(FIXTURE_COURSE, 'W01-S1.md'), 'utf8');
  assert.ok(
    html.includes('<div class="md" data-lid="W01-S1">' + marked.parse(md) + '</div>'),
    '.md 内容与 marked.parse 原样输出不一致'
  );
});

// ── 切片 7：index.json 形状 ────────────────────────────────────
test('切片 7：index.json 形状（升序 / title 去前缀 / current 仅 W01 / lesson_count / 无 published_at）', () => {
  const build = loadBuild();
  const outDir = path.join(tmpDir('slice7'), 'out');
  build.buildCourse({ courseDir: FIXTURE_COURSE, outDir });
  const raw = fs.readFileSync(path.join(outDir, 'index.json'), 'utf8');
  const index = JSON.parse(raw);

  assert.deepStrictEqual(Object.keys(index), ['weeks']);
  assert.deepStrictEqual(index.weeks.map(w => w.id), ['W01', 'W02']);
  // title = 去掉 `WXX · ` 前缀的周标题（与现网 KV index 同形）
  assert.strictEqual(index.weeks[0].title, '合成第一周：把想法写在纸上');
  assert.strictEqual(index.weeks[1].title, '合成第二周：让纸片排起队');
  // current 仅 W01 为 true
  assert.deepStrictEqual(index.weeks.map(w => w.current), [true, false]);
  // lesson_count = 该周课时数
  assert.deepStrictEqual(index.weeks.map(w => w.lesson_count), [3, 2]);
  // 键序固定，且不含 published_at（含时间戳会破坏「两次构建字节相同」）
  assert.deepStrictEqual(Object.keys(index.weeks[0]), ['id', 'title', 'current', 'lesson_count']);
  assert.ok(!('published_at' in index.weeks[0]));
  assert.ok(!raw.includes('published_at'));
});

// ── 切片 8：syllabus.html ─────────────────────────────────────
test('切片 8：syllabus.html 存在且含 marked.parse(SYLLABUS.md) 的输出', () => {
  const build = loadBuild();
  const outDir = path.join(tmpDir('slice8'), 'out');
  build.buildCourse({ courseDir: FIXTURE_COURSE, outDir });
  const html = fs.readFileSync(path.join(outDir, 'syllabus.html'), 'utf8');
  const md = fs.readFileSync(path.join(FIXTURE_COURSE, 'SYLLABUS.md'), 'utf8');

  assert.strictEqual(countOf(html, 'class="week-body"'), 1);
  assert.ok(html.includes('<div class="week-body" data-week="SYLLABUS">'), '缺 SYLLABUS 内容根');
  assert.ok(html.includes('<div class="md">' + marked.parse(md) + '</div>'), '总纲内容与 marked.parse 原样输出不一致');
});

// ── 切片 9~13：闸的拒绝路径（跑 CLI 子进程看退出码） ──────────────
function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT].concat(args), { encoding: 'utf8' });
}

// 断言：闸没过 → rc=2 且输出目录里一个文件都没有
function assertGateRejects(courseDir, outDir) {
  const r = runCli(['--course-dir', courseDir, '--out-dir', outDir]);
  assert.strictEqual(r.status, 2, '期望退出码 2，实际 ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
  const produced = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
  assert.deepStrictEqual(produced, [], '闸没过却产出了文件：' + produced.join(', '));
  return r;
}

test('闸·周标题：SYLLABUS 里周标题 = x → rc=2 且零产出', () => {
  const courseDir = copyFixtureCourse('gate-week');
  const syllabusPath = path.join(courseDir, 'SYLLABUS.md');
  fs.writeFileSync(
    syllabusPath,
    fs.readFileSync(syllabusPath, 'utf8').replace(
      '### W01 · 合成第一周：把想法写在纸上',
      '### W01 · x'
    )
  );
  const outDir = path.join(tmpDir('gate-week-out'), 'out');
  const r = assertGateRejects(courseDir, outDir);
  assert.ok(r.stderr.includes('标题体检未通过'), 'stderr 没说明是标题体检没过');
  assert.ok(r.stderr.includes('W01'), 'stderr 没点名是哪个周');
});

// 改某课时的 `# ` 标题行（闸的用例各自改副本，不污染原 fixture）
function setLessonTitle(courseDir, file, titleLine) {
  const p = path.join(courseDir, file);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^# .+$/m, titleLine));
}

test('闸·课时标题：# W02-S1 · TBD → rc=2 且零产出', () => {
  const courseDir = copyFixtureCourse('gate-tbd');
  setLessonTitle(courseDir, 'W02-S1.md', '# W02-S1 · TBD');
  const outDir = path.join(tmpDir('gate-tbd-out'), 'out');
  const r = assertGateRejects(courseDir, outDir);
  assert.ok(r.stderr.includes('W02-S1.md'), 'stderr 没点名是哪个课时文件');
});

test('闸·课时标题前缀变体：# W02-S1 · 待定：xxx → rc=2 且零产出', () => {
  const courseDir = copyFixtureCourse('gate-prefix');
  setLessonTitle(courseDir, 'W02-S1.md', '# W02-S1 · 待定：xxx');
  const outDir = path.join(tmpDir('gate-prefix-out'), 'out');
  assertGateRejects(courseDir, outDir);
});

test('闸·课时标题裸周号：# W01-S1 · W01 → rc=2 且零产出', () => {
  const courseDir = copyFixtureCourse('gate-bare');
  setLessonTitle(courseDir, 'W01-S1.md', '# W01-S1 · W01');
  const outDir = path.join(tmpDir('gate-bare-out'), 'out');
  assertGateRejects(courseDir, outDir);
});

test('闸·课时标题过短：# W02-S1 · ab → rc=2 且零产出', () => {
  const courseDir = copyFixtureCourse('gate-short');
  setLessonTitle(courseDir, 'W02-S1.md', '# W02-S1 · ab');
  const outDir = path.join(tmpDir('gate-short-out'), 'out');
  assertGateRejects(courseDir, outDir);
});

// ── 切片 14：确定性（两次构建字节完全相同） ─────────────────────
test('切片 14：同一 fixture 连构建两次，所有产物字节完全相同', () => {
  const build = loadBuild();
  const out1 = path.join(tmpDir('det1'), 'out');
  const out2 = path.join(tmpDir('det2'), 'out');
  build.buildCourse({ courseDir: FIXTURE_COURSE, outDir: out1 });
  build.buildCourse({ courseDir: FIXTURE_COURSE, outDir: out2 });

  const names1 = fs.readdirSync(out1).sort();
  assert.deepStrictEqual(names1, fs.readdirSync(out2).sort());
  assert.deepStrictEqual(names1, ['W01.html', 'W02.html', 'index.json', 'syllabus.html']);
  for (const name of names1) {
    assert.deepStrictEqual(
      fs.readFileSync(path.join(out1, name)),
      fs.readFileSync(path.join(out2, name)),
      name + ' 两次构建字节不同'
    );
  }
});

// ── 切片 15：全量集成（验收级） ─────────────────────────────────
test('切片 15：真实 course/ 构建出 17 页 + syllabus + index，逐课时渲染逐字节一致', () => {
  const build = loadBuild();
  const outDir = path.join(tmpDir('real'), 'out');
  build.buildCourse({ courseDir: REAL_COURSE, outDir });

  const weekFiles = [];
  for (let i = 1; i <= 17; i++) weekFiles.push('W' + String(i).padStart(2, '0') + '.html');
  const expectedNames = weekFiles.concat(['index.json', 'syllabus.html']).sort();
  assert.deepStrictEqual(fs.readdirSync(outDir).sort(), expectedNames);

  // 逐课时：产物的 .md 内容 === marked.parse(本地 md 文件内容)，逐字节相等
  const courseFiles = fs.readdirSync(REAL_COURSE).filter(f => /^W\d\d-.+\.md$/.test(f)).sort();
  assert.strictEqual(courseFiles.length, 97, '真实课程课时数应为 97');
  let checked = 0;
  for (const f of courseFiles) {
    const weekId = f.slice(0, 3);
    const lid = path.basename(f, '.md');
    const md = fs.readFileSync(path.join(REAL_COURSE, f), 'utf8');
    const html = fs.readFileSync(path.join(outDir, weekId + '.html'), 'utf8');
    assert.ok(
      html.includes('<div class="md" data-lid="' + lid + '">' + marked.parse(md) + '</div>'),
      f + ' 的产物渲染与本地 md 不一致'
    );
    checked++;
  }
  assert.strictEqual(checked, 97, '97/97 逐课时断言没跑完');

  // index.json：17 周、id 升序、lesson_count 合计 97
  const index = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8'));
  assert.strictEqual(index.weeks.length, 17);
  assert.deepStrictEqual(index.weeks.map(w => w.id), weekFiles.map(n => n.slice(0, 3)));
  assert.strictEqual(index.weeks.reduce((n, w) => n + w.lesson_count, 0), 97);
  assert.ok(index.weeks[0].current === true && index.weeks.slice(1).every(w => w.current === false));

  // 产物里不含构建时间戳（ISO 时刻）
  for (const name of expectedNames) {
    const content = fs.readFileSync(path.join(outDir, name), 'utf8');
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(content), name + ' 里出现 ISO 时间戳');
  }
});
