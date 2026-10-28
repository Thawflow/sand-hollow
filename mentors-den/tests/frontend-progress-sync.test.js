// P6 · 前端进度落库接线 —— 断言（不含真网络）
// 运行：node --test mentors-den/tests/frontend-progress-sync.test.js
//
// 约束（与 frontend-static-course.test.js 同款）：
//   · 仓里无 node_modules、Node 26.10 无 DOMParser → 只做**源码静态断言** + 纯函数断言，
//     真实 DOM 交互靠浏览器实测（另行取证），不在此文件里造 DOM。
//   · 断言目标：前端确实接上了 /learning/progress/save|load，且语义正确
//     （登录后拉云端 → 合并；勾选变化 → 防抖同步；load 进幂等白名单；只读不双写）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const DOCS = path.join(REPO, 'docs');
const indexHtml = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');

test('前端调用 /learning/progress/save 与 /learning/progress/load', () => {
  assert.ok(indexHtml.includes("'/learning/progress/save'"), '未找到 /learning/progress/save 调用');
  assert.ok(indexHtml.includes("'/learning/progress/load'"), '未找到 /learning/progress/load 调用');
});

test('/learning/progress/load 进 IDEMPOTENT_POSTS 白名单（只读，回落备域不双写）', () => {
  const m = indexHtml.match(/IDEMPOTENT_POSTS\s*=\s*new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, '未找到 IDEMPOTENT_POSTS 定义');
  assert.ok(
    m[1].includes('/learning/progress/load'),
    'load 必须进白名单（只读语义，回落备域=同字段读两次，不构成双写）；实际=' + m[1].trim()
  );
  assert.ok(
    !m[1].includes('/learning/progress/save'),
    'save 是写接口，**不得**进白名单（进了=双写）'
  );
});

test('进度数据来源：勾选态 + 章节位置（learning-checks + learning-pos）', () => {
  assert.ok(indexHtml.includes("'learning-checks'"), '未找到 learning-checks 键');
  assert.ok(indexHtml.includes("'learning-pos'"), '未找到 learning-pos 键');
});

test('云端进度合并是「并集」语义（不因云端旧而抹掉本机新勾选）', () => {
  // 行为断言（不靠文本正则）：把 mergeProgress 从源码里抽出来真跑一遍
  const src = indexHtml.match(/function\s+mergeProgress[\s\S]*?\n\}/);
  assert.ok(src, '未找到 mergeProgress 合并函数');
  // eslint-disable-next-line no-new-func
  const mergeProgress = new Function(src[0] + '; return mergeProgress;')();
  const local = { checks: { a: true, b: true }, pos: { weekId: 'W01', ts: 100 } };
  const cloud = { checks: { b: true, c: true }, pos: { weekId: 'W09', ts: 200 } };
  const merged = mergeProgress(local, cloud);
  assert.strictEqual(merged.checks.a, true, '本机独有勾选 a 不该被抹掉');
  assert.strictEqual(merged.checks.b, true, '共有勾选 b 应保留');
  assert.strictEqual(merged.checks.c, true, '云端独有勾选 c 应并入');
  assert.strictEqual(Object.keys(merged.checks).length, 3, '并集后应有 3 项，实际=' + Object.keys(merged.checks).length);
  assert.strictEqual(merged.pos.weekId, 'W09', '位置应取较新（ts 200）的那份');
});

test('勾选变化触发防抖同步（不是每次点击都打一次网络）', () => {
  assert.ok(
    /setTimeout\s*\(\s*function\s*\(\)\s*\{\s*syncProgressToCloud|saveProgressDebounced/.test(indexHtml) ||
    /PROGRESS_SYNC_DEBOUNCE/.test(indexHtml),
    '未找到进度同步的防抖实现（应见 setTimeout 防抖或 PROGRESS_SYNC_DEBOUNCE 常量）'
  );
});

test('进度同步失败不打断学习（离线保底：localStorage 仍可写）', () => {
  // 云端同步函数必须整体 try/catch，且不 return 掉本地写入
  const m = indexHtml.match(/async function syncProgressToCloud[\s\S]{0,900}/);
  assert.ok(m, '未找到 syncProgressToCloud 函数');
  assert.ok(/try\s*\{/.test(m[0]), 'syncProgressToCloud 必须有 try/catch 兜底');
  assert.ok(/catch/.test(m[0]), 'syncProgressToCloud 必须有 catch 兜底');
});

test('进度同步只在「已登录」时触发（未登录不白打接口）', () => {
  const m = indexHtml.match(/async function syncProgressToCloud[\s\S]{0,900}/);
  assert.ok(m, '未找到 syncProgressToCloud 函数');
  assert.ok(
    /getActiveId\(\)/.test(m[0]),
    'syncProgressToCloud 必须先看 getActiveId()（未登录直接返回）'
  );
});

test('登录成功后触发一次云端进度拉取（acceptLogin 或其后调用）', () => {
  const m = indexHtml.match(/function acceptLogin[\s\S]{0,900}/);
  assert.ok(m, '未找到 acceptLogin');
  assert.ok(
    /loadProgressFromCloud|pullProgress/.test(m[0]),
    'acceptLogin 内应触发云端进度拉取，实际=' + m[0].slice(0, 500)
  );
});
