'use strict';
/**
 * 家人隐私字段闸的测试（新增）
 *
 * 跑法：node --test mentors-den/tests/
 *
 * 背景：这仓原有两套门禁（commit-msg 拦真名、pre-push 拦课程漂移），
 * **两套都不拦家人隐私字段** —— 真邮箱曾在 README 里长期躺着无人拦。
 * 新增 `mentors-den/scripts/scan-private-fields.py` + pre-push 第 4 闸。
 *
 * 核心口径（家庭已定 · Tree 11-04 06:27 补充定调「邮箱也可以公开」）：
 *   · 代号（小马 / 如意 / 冰爪 / 龙井 / 猴哥 / ThawPaw / Tree）**可公开，不拦**
 *   · 对外联系邮箱**可公开，不拦**
 *   · 真隐私字段（手机 / 身份证 / 生日 / 住址）**必须拦**
 *
 * ⚠️ 本注释须与 `mentors-den/scripts/scan-private-fields.py` 的 PRIVATE_PATTERNS 保持一致：
 *   实际只拦 4 类 —— 身份证号(18位) / 手机号(11位大陆) / 生日(带锚点) / 住址(省市区+详细)。
 *   **邮箱不在拦截模式内**（对外联系入口属可公开面）—— 别照旧注释把邮箱改回拦截。
 *
 * 断言（11 项，与实现逐条对应）：
 *   ① 扫描器自检全过（模式层：拦隐私 / 放代号 / 不误伤假数据）
 *   ② 邮箱放行（对外联系入口可公开）
 *   ②b 手机号 ⇒ 扫描器命中（真隐私仍拦）
 *   ③ 只有代号 ⇒ 扫描器零命中（不误伤协作署名）
 *   ④ 保留域/假数据邮箱 ⇒ 零命中
 *   ⑤ 隐私闸：新增行含手机号 ⇒ pre-push 拒绝，远端 tip 不前进
 *   ⑥ 隐私闸：新增行只有代号 ⇒ pre-push 放行（不误伤）
 *   ⑦ 8 位学员号（带标签锚点）⇒ 扫描器命中（Tree 11-05 立：学号+姓名=登录体系）
 *   ⑦b 8 位学员号（裸数字）⇒ 命中；脱敏输出（只给首2+尾2）
 *   ⑦c 日期/重复组/夹具学号 ⇒ 放行（不误伤 BUILD_TIME、测试夹具）
 *   ⑧ 隐私闸：新增行含学员号 ⇒ pre-push 拒绝，远端 tip 不前进
 *
 * ⚠️ 2026-11-05 新增口径：**8 位学员号 = 登录凭据的一半**
 *   沙坑登录体系 = 8 位数字 ID + 昵称，**昵称即密码**
 *   （前端 isValidId() = /^\d{8}$/，输入框标注「昵称（= 密码）」；
 *     Worker isValidId() 同款 + 「昵称即口令」）
 *   ⇒ 学员号单独泄露 = 可对已知姓名逐一撞库 ⇒ 学员号本身属隐私字段。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(REPO_ROOT, '.githooks', 'pre-push');
const SCANNER = path.join(REPO_ROOT, 'mentors-den', 'scripts', 'scan-private-fields.py');
const WEEK_REFS = path.join(REPO_ROOT, 'mentors-den', 'scripts', 'scan-week-refs.py');
const BUILD_HTML = path.join(REPO_ROOT, 'mentors-den', 'scripts', 'build-course-html.js');
const MARKED = path.join(REPO_ROOT, 'docs', 'vendor', 'marked.min.js');

// ⚠️ 假邮箱一律拼接构造 —— 完整字面留在源码里会被隐私闸扫自己命中
const FAKE_EMAIL = ['someone', '@', 'brandct', '.', 'com'].join('');
const FAKE_PHONE = ['139', '0013', '9000'].join('');
// 8 位学员号（构造拼接，源码里不留完整字面 —— 隐私闸会扫测试文件自身）
const FAKE_SID = ['20', '2609', '15'].join('');
const FAKE_SID2 = ['21', '1114', '22'].join('');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_TERMINAL_PROMPT: '0',
};

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

/** 写一份最小可用的课程源（SYLLABUS.md + 课时文件），格式照真实仓 */
function writeCourseFixture(work, lessonFiles) {
  const courseDir = path.join(work, 'mentors-den', 'course');
  fs.mkdirSync(courseDir, { recursive: true });
  const syllabus = [
    '# 家庭编程课 · 完整大纲',
    '',
    '## 第一阶段：语言基础（W01-W01，1 节制）',
    '',
    '### W01 · 起步：让程序开口说话',
    '| 课 | 主题 | 你将能做到 |',
    '|---|---|---|',
    '| S1 | 认识终端 + 第一行 print | 写出并运行第一个程序 |',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(courseDir, 'SYLLABUS.md'), syllabus);
  for (const f of lessonFiles) {
    const id = f.replace(/\.md$/, '');
    const body = [
      `# ${id}`,
      '',
      '## 本课目标',
      '',
      '学会写第一个程序。',
      '',
      '## 上手练习',
      '',
      '把下面代码抄进 Thonny 跑一遍：',
      '',
      '```python',
      'print("hello")',
      '```',
      '',
      '## 课后作业',
      '',
      `把作业存成 \`${id}-homework.py\`（放在你自己的 homework 目录）。`,
      '',
      '```python',
      'name = input("你的名字: ")',
      'print("你好,", name)',
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(courseDir, f), body);
  }
}

/** 在夹具仓里跑真 build 脚本生成 docs/course 产物（让 pre-push 的漂移闸也能过） */
function buildCourse(work) {
  fs.mkdirSync(path.join(work, 'mentors-den', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(work, 'docs', 'vendor'), { recursive: true });
  fs.copyFileSync(MARKED, path.join(work, 'docs', 'vendor', 'marked.min.js'));
  fs.copyFileSync(BUILD_HTML, path.join(work, 'mentors-den', 'scripts', 'build-course-html.js'));
  const r = spawnSync('node', [
    path.join(work, 'mentors-den', 'scripts', 'build-course-html.js'),
    '--course-dir', path.join(work, 'mentors-den', 'course'),
    '--out-dir', path.join(work, 'docs', 'course'),
  ], { cwd: work, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) {
    throw new Error(`build-course-html.js 失败：${r.stderr || r.stdout}`);
  }
}

/** 建一个最小远端 + 本地仓，装着最小可用的课程产物（让 pre-push 其他闸也能过） */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-priv-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  fs.mkdirSync(remote);
  git(remote, ['init', '--bare', '-b', 'main']);
  fs.mkdirSync(work);
  git(work, ['init', '-b', 'main']);
  git(work, ['config', 'user.name', 'test']);
  git(work, ['config', 'user.email', 'test@example.com']);
  git(work, ['remote', 'add', 'origin', remote]);
  return { root, remote, work };
}

test('① 扫描器自检全过（模式层：拦隐私 / 放代号 / 不误伤假数据）', () => {
  const r = spawnSync('python3', [SCANNER, '--self-test'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `自检应通过，实际输出：\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /自检全通过/);
});

test('② 邮箱放行（对外联系入口可公开）', () => {
  const r = spawnSync('python3', [SCANNER, '--scan-text', '联系：' + FAKE_EMAIL],
    { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `邮箱不该被拦，实际：\n${r.stdout}`);
  assert.match(r.stdout, /零命中/);
});

test('②b 手机号 ⇒ 扫描器命中（真隐私仍拦）', () => {
  const r = spawnSync('python3', [SCANNER, '--scan-text',
    'Alice: ' + ['139', '0013', '9000'].join('')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1, `应命中并返 1，实际：\n${r.stdout}`);
  assert.match(r.stdout, /手机号/);
});

test('③ 只有代号 ⇒ 扫描器零命中（不误伤协作署名）', () => {
  const r = spawnSync('python3', [SCANNER, '--scan-text',
    'mentor 小马 批改；mentor 如意 review；冰爪 起草；Tree 拍板；学员 ThawPaw'],
    { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `代号不该被拦，实际：\n${r.stdout}`);
  assert.match(r.stdout, /零命中/);
});

test('④ 保留域/假数据邮箱 ⇒ 零命中', () => {
  const r = spawnSync('python3', [SCANNER, '--scan-text',
    'test@example.com / a@b.local / 13800138001'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `保留域与假数据不该被拦，实际：\n${r.stdout}`);
});

test('⑤ 隐私闸：新增行含手机号 ⇒ pre-push 拒绝，远端 tip 不前进', () => {
  const { remote, work } = makeRepo();
  // 最小仓：只需要课程源 + 产物一致（pre-push 其他闸），加一个新文件含真邮箱
  writeCourseFixture(work, ['W01-S1.md']);
  buildCourse(work);
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: base']);
  git(work, ['push', '-u', 'origin', 'main']);
  const baseTip = git(remote, ['rev-parse', 'main']).trim();

  // 装钩子
  git(work, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(work, '.githooks'), { recursive: true });
  fs.copyFileSync(HOOK, path.join(work, '.githooks', 'pre-push'));
  fs.chmodSync(path.join(work, '.githooks', 'pre-push'), 0o755);
  fs.mkdirSync(path.join(work, 'mentors-den', 'scripts'), { recursive: true });
  fs.copyFileSync(SCANNER, path.join(work, 'mentors-den', 'scripts', 'scan-private-fields.py'));
  fs.copyFileSync(WEEK_REFS, path.join(work, 'mentors-den', 'scripts', 'scan-week-refs.py'));
  fs.copyFileSync(BUILD_HTML, path.join(work, 'mentors-den', 'scripts', 'build-course-html.js'));

  // 新增一个含手机号的课时（先重建产物，让漂移闸过；隐私闸才是真正的拦截者）
  // ⚠️ 写的是手机号不是邮箱 —— 邮箱按 Tree 11-04 定调属可公开面，不该被拦（见文件头口径）。
  fs.writeFileSync(path.join(work, 'mentors-den', 'course', 'W01-S2.md'),
    '# W01-S2\n\ncontact: ' + FAKE_PHONE + '\n');
  buildCourse(work);
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'feat: add lesson with contact']);

  const push = spawnSync('git', ['push', 'origin', 'main'], {
    cwd: work, encoding: 'utf8', env: GIT_ENV,
  });
  const after = git(remote, ['rev-parse', 'main']).trim();
  assert.strictEqual(after, baseTip, '远端 tip 不该前进（推送必须被拦）');
  assert.notStrictEqual(push.status, 0, 'push 应失败');
  const out = (push.stderr || '') + (push.stdout || '');
  assert.match(out, /隐私/, `应报隐私问题，实际输出：\n${out}`);
});

test('⑥ 隐私闸：新增行只有代号 ⇒ pre-push 放行（不误伤）', () => {
  const { remote, work } = makeRepo();
  writeCourseFixture(work, ['W01-S1.md']);
  buildCourse(work);
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: base']);
  git(work, ['push', '-u', 'origin', 'main']);
  const baseTip = git(remote, ['rev-parse', 'main']).trim();

  git(work, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(work, '.githooks'), { recursive: true });
  fs.copyFileSync(HOOK, path.join(work, '.githooks', 'pre-push'));
  fs.chmodSync(path.join(work, '.githooks', 'pre-push'), 0o755);
  fs.mkdirSync(path.join(work, 'mentors-den', 'scripts'), { recursive: true });
  fs.copyFileSync(SCANNER, path.join(work, 'mentors-den', 'scripts', 'scan-private-fields.py'));
  fs.copyFileSync(WEEK_REFS, path.join(work, 'mentors-den', 'scripts', 'scan-week-refs.py'));
  fs.copyFileSync(BUILD_HTML, path.join(work, 'mentors-den', 'scripts', 'build-course-html.js'));

  // 新增只含代号的内容（重建产物让漂移闸过）
  fs.writeFileSync(path.join(work, 'mentors-den', 'course', 'W01-S2.md'),
    '# W01-S2\n\nmentor 小马 批改；mentor 如意 review；冰爪 起草\n');
  buildCourse(work);
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'feat: add lesson with mentor names']);

  const push = spawnSync('git', ['push', 'origin', 'main'], {
    cwd: work, encoding: 'utf8', env: GIT_ENV,
  });
  const after = git(remote, ['rev-parse', 'main']).trim();
  // 放行时远端 tip 应前进；若因其他闸（课程产物漂移）失败也不算误伤隐私闸，
  // 但必须**不是**因为隐私
  const out = (push.stderr || '') + (push.stdout || '');
  if (push.status !== 0) {
    assert.doesNotMatch(out, /隐私/, `不该因隐私被拦：\n${out}`);
  } else {
    assert.notStrictEqual(after, baseTip, '放行则远端 tip 应前进');
  }
});

// ── ⑧ 8 位学员号（Tree 11-05 立：学号 + 姓名 = 登录体系，学员号属隐私）──

test('⑦ 8 位学员号（带标签锚点）⇒ 扫描器命中', () => {
  const cases = [
    '学员ID: ' + FAKE_SID,
    '学号 ' + FAKE_SID,
    "targetId:'" + FAKE_SID + "'",
    FAKE_SID + '/homework/w01.py',
  ];
  for (const text of cases) {
    const r = spawnSync('python3', [SCANNER, '--scan-text', text], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1, `应命中并返 1，实际输出：\n${r.stdout}`);
    assert.match(r.stdout, /学员号/, `应报学员号，实际：\n${r.stdout}`);
  }
});

test('⑦b 8 位学员号（裸数字）⇒ 命中，且输出脱敏（首2+尾2）', () => {
  const r = spawnSync('python3', [SCANNER, '--scan-text', '这个号是 ' + FAKE_SID + ' 记一下'],
    { encoding: 'utf8' });
  assert.strictEqual(r.status, 1, `裸学员号应被拦，实际：\n${r.stdout}`);
  assert.match(r.stdout, /学员号/);
  // 脱敏：完整号不该出现在输出里
  assert.ok(!r.stdout.includes(FAKE_SID), `学员号不该原样进日志：\n${r.stdout}`);
  const masked = FAKE_SID.slice(0, 2) + '***' + FAKE_SID.slice(-2);
  assert.ok(r.stdout.includes(masked), `应输出脱敏形式 ${masked}，实际：\n${r.stdout}`);
});

test('⑦c 日期 / 重复组 / 测试夹具学号 ⇒ 放行（不误伤）', () => {
  const cases = [
    'print("2026" + "2026")  # ' + ['2026', '2026'].join(''),
    '评语日期 20260902',
    'var BUILD_TIME="20261030-0715"',
    'Math.floor(10000000 + Math.random() * 90000000)',
  ];
  for (const text of cases) {
    const r = spawnSync('python3', [SCANNER, '--scan-text', text], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `不该被拦：${text}\n实际：\n${r.stdout}`);
  }
});

test('⑦d 新写的日历日期在日期语境下 ⇒ 放行（11-06 早轮修：白名单穷举漏放）', () => {
  // 回归：原实现靠白名单硬编码 2 个日期样例放行，任何**新写的**合法日期
  // （BUILD_TIME="20261106" / created_at 20261106 / 评语日期 20261106）
  // 都会撞「孤立 8 位数字 ⇒ 一律拦」⇒ 闸假红，把正常改动卡在 push 门口。
  // 修法 = 结构判定（年/月/日 + 日历实校），不再靠穷举白名单。
  const cases = [
    'var BUILD_TIME="20261106"',
    'BUILD_TIME = "20261106"',
    'created_at 20261106',
    '评语日期 20261106',
    'var BUILD_TIME="20261225"',
    'var BUILD_TIME="20240229"',   // 闰年
  ];
  for (const text of cases) {
    const r = spawnSync('python3', [SCANNER, '--scan-text', text], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `合法日期不该被拦：${text}\n实际：\n${r.stdout}`);
  }
  // 反向：结构上**不成立**的日期（13 月 / 32 日）⇒ 仍须拦（不是日期 ⇒ 可能是学员号）
  const bad = ['var BUILD_TIME="20261306"', 'var BUILD_TIME="20261132"'];
  for (const text of bad) {
    const r = spawnSync('python3', [SCANNER, '--scan-text', text], { encoding: 'utf8' });
    assert.notStrictEqual(r.status, 0, `不成立的日期不该被放行：${text}\n实际：\n${r.stdout}`);
  }
});

test('⑦e 学员号形态绝不被日期判定放过（真号 + 假号各一）', () => {
  // ⚠️ 真号**不写进源码**（公开仓红线）—— 用拼接构造，形态与真号完全一致。
  // 样本全取「月份/日越界」形态 ⇒ 结构判定不可能误判成日期。
  const sids = [
    ['2460', '2243'].join(''),   // 真学员号形态（月=60 日=22 越界）
    ['9456', '8945'].join(''),   // mentor 门牌号形态（月=56 日=89 越界）
    ['1357', '2468'].join(''),   // 全奇/全偶序列（月=57 日=24…日界内但月越界）
  ];
  for (const sid of sids) {
    const text = `var BUILD_TIME="${sid}"`;
    const r = spawnSync('python3', [SCANNER, '--scan-text', text], { encoding: 'utf8' });
    assert.notStrictEqual(r.status, 0,
      `学员号形态不该被日期语境放过：${sid}\n实际：\n${r.stdout}`);
  }
  // 对照：日期形态的夹具号（87654321：月=65 越界）⇒ 在 BUILD_TIME 语境下
  // 仍属「夹具白名单值」⇒ 放行是**白名单**在放，不是日期判定在放 ——
  // 这个差异正是 ⑦d/⑦e 想钉住的：日期判定只救「结构成立的日期」。
});

test('⑧ 隐私闸：新增行含学员号 ⇒ pre-push 拒绝，远端 tip 不前进', () => {
  const { remote, work } = makeRepo();
  writeCourseFixture(work, ['W01-S1.md']);
  buildCourse(work);
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: base']);
  git(work, ['push', '-u', 'origin', 'main']);
  const baseTip = git(remote, ['rev-parse', 'main']).trim();

  git(work, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(work, '.githooks'), { recursive: true });
  fs.copyFileSync(HOOK, path.join(work, '.githooks', 'pre-push'));
  fs.chmodSync(path.join(work, '.githooks', 'pre-push'), 0o755);
  fs.mkdirSync(path.join(work, 'mentors-den', 'scripts'), { recursive: true });
  fs.copyFileSync(SCANNER, path.join(work, 'mentors-den', 'scripts', 'scan-private-fields.py'));
  fs.copyFileSync(WEEK_REFS, path.join(work, 'mentors-den', 'scripts', 'scan-week-refs.py'));
  fs.copyFileSync(BUILD_HTML, path.join(work, 'mentors-den', 'scripts', 'build-course-html.js'));

  // 新增含学员号的课时
  fs.writeFileSync(path.join(work, 'mentors-den', 'course', 'W01-S2.md'),
    '# W01-S2\n\n学员ID: ' + FAKE_SID + '\n');
  buildCourse(work);
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'feat: add lesson with student id']);

  const push = spawnSync('git', ['push', 'origin', 'main'], {
    cwd: work, encoding: 'utf8', env: GIT_ENV,
  });
  const after = git(remote, ['rev-parse', 'main']).trim();
  assert.strictEqual(after, baseTip, '远端 tip 不该前进（学员号必须被拦）');
  assert.notStrictEqual(push.status, 0, 'push 应失败');
  const out = (push.stderr || '') + (push.stdout || '');
  assert.match(out, /学员号|隐私/, `应报学员号/隐私问题，实际输出：\n${out}`);
  assert.ok(!out.includes(FAKE_SID), `学员号不该原样出现在报错里：\n${out}`);
});

// ── ⑨ 历史面报告模式（2026-11-05 如意 review 建议 · 冰爪落地 · owner=冰爪）──
//   病：pre-push 隐私闸按「只看新增行」判定 ⇒ 存量历史里的隐私字段**闸看不见**。
//   如意见：闸若要覆盖历史面需另加一条「全树扫 + 报告」模式（**非拦截**）。
//   口径：**报告模式恒返回 0** —— 清历史 = force-push = 高危，只认猴哥直通道，
//   脚本没资格拦 push、更没资格改历史 ⇒ 它的职责是「让家族看见」。

test('⑨ 历史面报告模式：存量学员号在历史 commit 的树里 ⇒ 报出 (commit, path)，且 rc=0 不拦', () => {
  const { work } = makeRepo();
  // 造历史：第 1 笔 commit 里放一个学员号（之后删掉，但历史里还在）
  fs.mkdirSync(path.join(work, 'mentors-den'), { recursive: true });
  fs.writeFileSync(path.join(work, 'mentors-den', 'old-notes.md'),
    '# 旧笔记\n\n学员ID: ' + FAKE_SID + '\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: add old notes with student id']);
  const dirtyCommit = git(work, ['rev-parse', 'HEAD']).trim();

  // 第 2 笔 commit 删掉它（tip 面已干净，历史面还在）
  fs.rmSync(path.join(work, 'mentors-den', 'old-notes.md'));
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: remove old notes']);

  const r = spawnSync('python3', [SCANNER, '--history-scan', 'HEAD', '--repo-root', work],
    { encoding: 'utf8', timeout: 300000 });
  // ⚠️ 报告模式恒 rc=0 —— 命中也**不拦**（清历史 = force-push = 高危，走猴哥通道）
  assert.strictEqual(r.status, 0, `报告模式必须恒返回 0，实际：\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /只报告，不拦截|不拦/, `应声明是报告模式，实际：\n${r.stdout}`);
  assert.match(r.stdout, /学员号/, `应报学员号，实际：\n${r.stdout}`);
  // 报出的 commit 必须**真实可核** —— `git show <commit>:<path>` 拿得到内容
  assert.ok(r.stdout.includes(dirtyCommit.slice(0, 12)),
    `应报出最早出现的 commit ${dirtyCommit.slice(0, 12)}，实际：\n${r.stdout}`);
  assert.ok(r.stdout.includes('mentors-den/old-notes.md'),
    `应报出文件路径，实际：\n${r.stdout}`);
  // 脱敏：完整号不该原样进报告
  assert.ok(!r.stdout.includes(FAKE_SID), `学员号不该原样进报告：\n${r.stdout}`);
  // tip 面已干净 ⇒ 「只有历史面有」这句话要能被看出来
  const tip = spawnSync('python3', [SCANNER, '--tree', 'HEAD', '--repo-root', work],
    { encoding: 'utf8', timeout: 300000 });
  assert.strictEqual(tip.status, 0, `tip 面应零命中，实际：\n${tip.stdout}`);
});

test('⑨b 历史面报告模式：历史干净 ⇒ 报「零命中」且 rc=0', () => {
  const { work } = makeRepo();
  fs.writeFileSync(path.join(work, 'README.md'), '# 只有代号\n\nmentor 小马 批改\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: clean']);

  const r = spawnSync('python3', [SCANNER, '--history-scan', 'HEAD', '--repo-root', work],
    { encoding: 'utf8', timeout: 300000 });
  assert.strictEqual(r.status, 0, `报告模式必须恒返回 0，实际：\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /零命中/, `历史干净应报零命中，实际：\n${r.stdout}`);
});

// ⑨c：--tree 模式在**空树**上必须 rc=0（不是 rc=2）
//   病（2026-11-05 冰爪实测）：旧实现 `git archive` + Python tarfile —— 空树的 archive
//   是「只有 pax_global_header 的 10KB 空档」，tarfile 报 ReadError ⇒ rc=2
//   ⇒ pre-push 的**首推分支**（无远端基线 ⇒ 走 --tree）会莫名被拒，报错文案还看不出真因。
//   修法：ls-tree + cat-file --batch，不依赖 tarfile。
test('⑨c --tree 空树 ⇒ rc=0 零命中（首推分支不该被隐私闸莫名拒）', () => {
  const { work } = makeRepo();
  // 造一个「有文件 → 删光」的历史 ⇒ HEAD 的树是空的
  fs.writeFileSync(path.join(work, 'a.txt'), 'hello\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: add']);
  git(work, ['rm', '-q', 'a.txt']);
  git(work, ['commit', '-m', 'chore: remove']);

  const empty = spawnSync('git', ['ls-tree', '-r', 'HEAD'], { cwd: work, encoding: 'utf8' });
  assert.strictEqual(empty.stdout.trim(), '', '前置条件：HEAD 的树应为空');

  const r = spawnSync('python3', [SCANNER, '--tree', 'HEAD', '--repo-root', work],
    { encoding: 'utf8', timeout: 300000 });
  assert.strictEqual(r.status, 0,
    `空树必须 rc=0（不是自身故障 rc=2），实际：\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /零命中/, `空树应报零命中，实际：\n${r.stdout}`);
  assert.doesNotMatch(r.stdout, /故障/, `不该报故障，实际：\n${r.stdout}`);
});

// ⑨d：历史面报告模式 · **分类口径**（2026-11-06 如意 01:51 review 建议 · 冰爪落地）
//   如意指出的两个口径问题（我机实测复现，认）：
//   ① 「docs/index.html 28 处」是**跨树累加**，不是单棵树里的泄漏量 ——
//      实测**单棵树**里同一个值最多 **3 处** ⇒ 读的人会以为一棵树泄漏 28 份。
//   ② 旧报告把**所有 8 位数字字面量**混在一类（mentor 号那条线 vs 别的号 vs
//      日期样式）⇒ 按「mentor 号」筛会漏掉「别的号」那一类。
//   ⇒ 新模式：按**分类**报 + 报**单树口径**。
test('⑨d 历史面分类口径：按「mentor 号 / 其它 8 位数字 / 日期样式」分类 + 报单树口径', () => {
  const { work } = makeRepo();
  fs.mkdirSync(path.join(work, 'mentors-den'), { recursive: true });
  // ① 带锚点（mentor 号那条线）—— **同一个值**在文件里出现 3 次（三个锚点）
  //    ⇒ 单树口径应报「该类某个值最多 3 处/树」
  const sid1 = ['20', '2609', '15'].join('');
  fs.writeFileSync(path.join(work, 'mentors-den', 'list.md'),
    '# 名单\n\n学员ID: ' + sid1 + '\n学号: ' + sid1 + '\n学生编号: ' + sid1 + '\n');
  // ② 另一个 8 位数字（**无锚点** ⇒ 属「其它 8 位数字」类，不是 mentor 号那条线）
  const other = ['13', '8000', '00'].join('');
  fs.writeFileSync(path.join(work, 'mentors-den', 'other.md'), '值 = ' + other + '\n');
  // ③ 日期样式（YYYYMMDD 形态，**无日期语境锚点** ⇒ 弱信号命中 ⇒ 归「日期样式」类）
  //    注：写成「日期: 20260902」会被日期语境规则**放行**（压根不成命中）⇒ 这里用裸值。
  //    ⚠️ 日期字面量**拆两半拼**（与仓库既有约定一致）—— 否则新增行闸会拦本笔。
  const ymd = ['2026', '0902'].join('');
  fs.writeFileSync(path.join(work, 'mentors-den', 'dates.md'), '构建批次 = ' + ymd + '\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'chore: seed']);

  const r = spawnSync('python3',
    [SCANNER, '--history-scan-classified', 'HEAD', '--repo-root', work],
    { encoding: 'utf8', timeout: 300000 });
  assert.strictEqual(r.status, 0, `报告模式必须恒返回 0，实际：\n${r.stdout}\n${r.stderr}`);
  // 分类要分开报
  assert.match(r.stdout, /mentor 门牌号\/带锚点/, `应报「mentor 门牌号/带锚点」类，实际：\n${r.stdout}`);
  assert.match(r.stdout, /其它 8 位数字/, `应报「其它 8 位数字」类，实际：\n${r.stdout}`);
  assert.match(r.stdout, /日期样式/, `应报「日期样式」类，实际：\n${r.stdout}`);
  // 单树口径必须出现（「单棵树」这个词 + 一个 ≤3 的数）
  assert.match(r.stdout, /单棵树/, `应报单树口径，实际：\n${r.stdout}`);
  assert.match(r.stdout, /最多 \*\*3 处\*\*\/树/,
    `单棵树里同一值最多 3 处（三个不同值各 1 次 ⇒ 应报 3），实际：\n${r.stdout}`);
  // 口径② 必须说清「跨树累加 ≠ 一棵树泄漏 N 份」
  assert.match(r.stdout, /跨树累加/, `应声明跨树累加口径，实际：\n${r.stdout}`);
  // 脱敏：真号不该原样进报告
  for (const v of [sid1, other]) {
    assert.ok(!r.stdout.includes(v), `8 位数字不该原样进报告（${v.slice(0, 2)}***）：\n${r.stdout}`);
  }
});
