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
 * 断言（7 项，与实现逐条对应）：
 *   ① 扫描器自检全过（模式层：拦隐私 / 放代号 / 不误伤假数据）
 *   ② 邮箱放行（对外联系入口可公开）
 *   ②b 手机号 ⇒ 扫描器命中（真隐私仍拦）
 *   ③ 只有代号 ⇒ 扫描器零命中（不误伤协作署名）
 *   ④ 保留域/假数据邮箱 ⇒ 零命中
 *   ⑤ 隐私闸：新增行含手机号 ⇒ pre-push 拒绝，远端 tip 不前进
 *   ⑥ 隐私闸：新增行只有代号 ⇒ pre-push 放行（不误伤）
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
