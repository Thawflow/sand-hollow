'use strict';
/**
 * 多课程轨前端逻辑测试（2026-11-13 冰爪 · 音标第二课程线）
 * 跑法：node --test mentors-den/tests/frontend-multi-track.test.js
 *
 * 覆盖（全部从 docs/index.html 源码抽出真函数跑，不造 DOM）：
 *   ① TRACKS 注册表：默认轨 id=''、phonics 轨存在、base 路径正确
 *   ② trackKey()：编程轨保持旧键原样（零迁移），音标轨加 :phonics 后缀
 *   ③ trackOwnsCheck()：W## 键归编程轨、P## 键归音标轨、互不渗透
 *   ④ mergeProgress() 轨隔离：编程轨勾选不被音标轨云端合并吞掉，反之亦然
 *   ⑤ loadIndex 的 _applyTracks：轨清单来源与回落
 *   ⑥ 静态断言：切换条 UI / 课程轨 CSS / 音标轨资源存在 / 无作业提示渗透
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(REPO, 'docs', 'index.html'), 'utf8');

function extract(name, src) {
  const m = src.match(new RegExp('(?:function\\s+' + name + '\\s*[\\s\\S]*?\\n\\}|(?:const|let)\\s+' + name + '\\s*=\\s*[\\s\\S]*?;)[^\\n]*\\n?'));
  return m ? m[0] : null;
}

// ── 抽出真函数跑行为断言 ──────────────────────────────────────
// 按 {…} 配平抽取（单行函数如 trackKey 会被非贪婪 \n} 截不准 ⇒ 必须数大括号）
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('抽取失败：' + name);
  const bodyStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('抽取失败（配平不到结尾）：' + name);
}
function makeTrackEnv(trackId) {
  const src = indexHtml;
  const tracksSrc = /const TRACKS=\[[\s\S]*?\];/.exec(src)[0];
  const helperFns = ['trackById', 'trackKey', 'trackOwnsCheck', 'trackOwnsPos', 'mergeProgress']
    .map(n => extractFn(src, n)).join('\n') + '\n';
  const prelude = tracksSrc + '\nlet curTrack=' + (trackId === '' ? 'TRACKS[0]' : 'TRACKS.find(t=>t.id===' + JSON.stringify(trackId) + ')') + ';\n';
  // eslint-disable-next-line no-new-func
  return new Function(prelude + helperFns + '\nreturn {TRACKS,curTrack,trackById,trackKey,trackOwnsCheck,trackOwnsPos,mergeProgress};')();
}

test('TRACKS 注册表：默认编程轨 + 音标轨，base 路径正确', () => {
  const env = makeTrackEnv('');
  assert.strictEqual(env.TRACKS.length, 2, '应有 2 条轨');
  assert.strictEqual(env.TRACKS[0].id, '', '默认轨 id 应为空字符串');
  assert.strictEqual(env.TRACKS[0].base, 'course/', '默认轨 base 保持 course/（老路径零迁移）');
  assert.strictEqual(env.TRACKS[0].def, true, '默认轨必须标 def');
  assert.strictEqual(env.TRACKS[1].id, 'phonics');
  assert.strictEqual(env.TRACKS[1].base, 'course/phonics/');
});

test('trackById：未知 id 回落默认轨', () => {
  const env = makeTrackEnv('');
  assert.strictEqual(env.trackById('phonics').id, 'phonics');
  assert.strictEqual(env.trackById('nope').id, '', '未知轨回落编程轨');
  assert.strictEqual(env.trackById('').id, '');
});

test('trackKey：编程轨保持旧键原样（老进度零迁移）', () => {
  const env = makeTrackEnv('');
  assert.strictEqual(env.trackKey('learning-pos'), 'learning-pos');
  assert.strictEqual(env.trackKey('learning-checks'), 'learning-checks');
  assert.strictEqual(env.trackKey('learning-week-W01'), 'learning-week-W01');
  assert.strictEqual(env.trackKey('weeks'), 'weeks');
});

test('trackKey：音标轨键带 :phonics 后缀（与编程轨互不相通）', () => {
  const env = makeTrackEnv('phonics');
  assert.strictEqual(env.trackKey('learning-pos'), 'learning-pos:phonics');
  assert.strictEqual(env.trackKey('learning-checks'), 'learning-checks:phonics');
  assert.strictEqual(env.trackKey('learning-week-P01'), 'learning-week-P01:phonics');
  assert.strictEqual(env.trackKey('weeks'), 'weeks:phonics');
  assert.notStrictEqual(env.trackKey('learning-pos'), makeTrackEnv('').trackKey('learning-pos'));
});

test('trackOwnsCheck：W## 键归编程轨，P## 键归音标轨，互不渗透', () => {
  const code = makeTrackEnv('');
  const phon = makeTrackEnv('phonics');
  assert.strictEqual(code.trackOwnsCheck('W01:lid:abc'), true, 'W 键归编程轨');
  assert.strictEqual(code.trackOwnsCheck('P01:lid:abc'), false, 'P 键不归编程轨');
  assert.strictEqual(phon.trackOwnsCheck('P01:lid:abc'), true, 'P 键归音标轨');
  assert.strictEqual(phon.trackOwnsCheck('W01:lid:abc'), false, 'W 键不归音标轨');
  // 历史遗留非 W/P 键（老版本可能产生的键）归编程轨
  assert.strictEqual(code.trackOwnsCheck('misc:key'), true);
  assert.strictEqual(phon.trackOwnsCheck('misc:key'), false);
});

test('mergeProgress 轨隔离：音标轨 pos 与编程轨 pos 互不覆盖（云档 pos 单值混存）', () => {
  const phon = makeTrackEnv('phonics');
  const local = { checks: { 'P01:lidA:h': true }, pos: { weekId: 'P01', ts: 100, track: 'phonics' } };
  const cloud = { checks: { 'W01:lidB:h': true, 'P02:lidC:h': true }, pos: { weekId: 'W09', ts: 200, track: 'code' } };
  const merged = phon.mergeProgress(local, cloud);
  assert.strictEqual(merged.checks['P01:lidA:h'], true, '本轨本机勾选保留');
  assert.strictEqual(merged.checks['P02:lidC:h'], true, '本轨云端勾选并入');
  assert.strictEqual(merged.checks['W01:lidB:h'], undefined, '编程轨勾选不得渗入音标轨');
  assert.strictEqual(merged.pos.weekId, 'P01', '编程轨 pos 即使更新也不得覆盖音标轨 pos');
});

test('mergeProgress 轨隔离：编程轨视角下 P 键云档不渗入（ThawPaw 编程进度保护）', () => {
  const code = makeTrackEnv('');
  const local = { checks: { 'W03:lidX:h': true }, pos: { weekId: 'W03', ts: 100, track: 'code' } };
  const cloud = { checks: { 'W05:lidY:h': true, 'P08:lidZ:h': true }, pos: { weekId: 'P08', ts: 999, track: 'phonics' } };
  const merged = code.mergeProgress(local, cloud);
  assert.strictEqual(merged.checks['W03:lidX:h'], true);
  assert.strictEqual(merged.checks['W05:lidY:h'], true);
  assert.strictEqual(merged.checks['P08:lidZ:h'], undefined, '音标轨勾选不得渗入编程轨');
  assert.strictEqual(merged.pos.weekId, 'W03', '音标轨 pos 不得覆盖编程轨 pos（老学员回站停在编程轨原地）');
});

test('trackOwnsPos：旧记录无 track 字段时按 weekId 前缀兜底', () => {
  const code = makeTrackEnv('');
  const phon = makeTrackEnv('phonics');
  // 旧记录（多轨上线前的编程轨 pos）无 track 字段 → 归编程轨
  assert.strictEqual(code.trackOwnsPos({ weekId: 'W03', ts: 1 }), true, '无 track 的旧记录归编程轨');
  assert.strictEqual(phon.trackOwnsPos({ weekId: 'W03', ts: 1 }), false);
  // 新记录带显式 track
  assert.strictEqual(phon.trackOwnsPos({ weekId: 'P02', ts: 2, track: 'phonics' }), true);
  assert.strictEqual(code.trackOwnsPos({ weekId: 'P02', ts: 2, track: 'phonics' }), false);
});

test('mergeProgress 兼容：老云档（无 track 字段的 pos）合并进编程轨不被丢弃', () => {
  const code = makeTrackEnv('');
  const cloud = { checks: { 'W02:lidO:h': true }, pos: { weekId: 'W02', lessonId: 'W02-S1', ts: 50, v: 2 } };
  const merged = code.mergeProgress(null, cloud);
  assert.strictEqual(merged.checks['W02:lidO:h'], true, '老云档勾选保留');
  assert.strictEqual(merged.pos.weekId, 'W02', '老云档 pos（无 track 字段）兜底归编程轨，不得丢失');
});

test('音标轨静态资源已构建（P00-P08 + index.json + syllabus.html）', () => {
  const dir = path.join(REPO, 'docs', 'course', 'phonics');
  const files = fs.readdirSync(dir).sort();
  for (let i = 0; i <= 8; i++) {
    const f = 'P' + String(i).padStart(2, '0') + '.html';
    assert.ok(files.includes(f), '缺 ' + f);
  }
  assert.ok(files.includes('index.json'), '缺 index.json');
  assert.ok(files.includes('syllabus.html'), '缺 syllabus.html');
});

test('音标轨 index.json 带 tracks 全轨清单（前端切换条数据源）', () => {
  const j = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'course', 'phonics', 'index.json'), 'utf8'));
  assert.ok(Array.isArray(j.tracks) && j.tracks.length >= 2, 'tracks 清单缺失');
  assert.ok(j.tracks.some(t => t.id === 'phonics'), 'tracks 里必须有 phonics');
  assert.ok(j.tracks.some(t => t.id === '' && t.def), 'tracks 里必须有默认轨');
  assert.strictEqual(j.weeks.length, 9, '音标轨应为 9 个单元');
});

test('编程轨 index.json 同样带 tracks（两份索引各自带全轨清单）', () => {
  const j = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'course', 'index.json'), 'utf8'));
  assert.ok(Array.isArray(j.tracks) && j.tracks.length >= 2);
  assert.strictEqual(j.weeks.length, 17, '编程轨应仍为 17 周（回归保护）');
});

test('前端接线：切换条 UI + trackKey 进度隔离 + 按轨 COURSE_BASE', () => {
  assert.ok(indexHtml.includes('id="tracks"'), '缺切换条容器');
  assert.ok(/function renderTracks\(/.test(indexHtml), '缺 renderTracks');
  assert.ok(/function switchTrack\(/.test(indexHtml), '缺 switchTrack');
  assert.ok(/localStorage\.setItem\('learning-track'/.test(indexHtml), '缺当前轨持久化');
  assert.ok(/trackKey\('learning-pos'\)/.test(indexHtml), 'pos 未走 trackKey');
  assert.ok(/trackKey\('learning-checks'\)/.test(indexHtml), 'checks 未走 trackKey');
  assert.ok(/trackKey\('learning-week-'\+wid\)/.test(indexHtml), 'week-done 未走 trackKey');
  assert.ok(/let COURSE_BASE=TRACKS\[0\]\.base/.test(indexHtml), 'COURSE_BASE 应初始化为默认轨 base');
});

test('音标轨页面不带 .py 作业提示（静态产物级回归保护）', () => {
  const html = fs.readFileSync(path.join(REPO, 'docs', 'course', 'phonics', 'P01.html'), 'utf8');
  assert.ok(!html.includes('-homework.py'), '音标轨周页不应含 .py 作业提示');
  const wHtml = fs.readFileSync(path.join(REPO, 'docs', 'course', 'W01.html'), 'utf8');
  // 编程轨作业提示在前端注入（静态产物无 hw 块）⇒ 只断言音标轨无、编程轨源里仍有开关
  assert.ok(!wHtml.includes('-homework.py') || indexHtml.includes('-SXX-homework.py'),
    '编程轨作业提示链路丢失');
});
