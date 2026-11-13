'use strict';
/**
 * 音标课「内容质量闸」（2026-11-13 owner 拍板后新增）
 * 跑法：node --test mentors-den/tests/phonics-content-quality.test.js
 *
 * 为什么有这道闸：owner 11-13 反馈「P00-S1 内容质量很差，属于死记硬背的，
 * 没有给出各个音标的标志性的单词」+「她已经会发音，比我还要标准，
 * 她缺的是音标的符号体系」⇒ 课程主体必须从「教发音」改成
 * 「用她已认识的词学符号」。这两条很容易在后续迭代里悄悄退回去，
 * 所以做成自动化闸。
 *
 * 覆盖：
 *   ① 禁词（口型/舌位/送气类发音教学词）0 命中
 *   ② 禁用美式符号 0 命中（英式 44 口径）
 *   ③ 每个课时都带锚点词（反引号英文词 + 中文意思）
 *   ④ 「拼读对照」块 ≥2 且带尾句
 *   ⑤ 结构齐全（今天学什么 / 自查段 / 无作业段）
 *   ⑥ 长度区间
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const PHONICS_DIR = path.join(REPO, 'mentors-den', 'course', 'phonics');

// ① 教发音类禁词（owner：她发音已标准，这门课练的是符号）
const BANNED_TEACHING = [
  '口型', '嘴型', '双唇', '嘴唇', '收圆', '撅嘴', '开口度',
  '舌位', '舌尖', '舌面', '舌根', '上颚', '软腭', '齿龈',
  '送气', '要领', '口诀', '气流从', '吹气', '震动喉咙', '发音部位',
];

// ② 禁用美式符号（课程统一英式 44 口径）
const BANNED_SYMBOLS = ['/oʊ/', '/ɚ/', '/ɜːr/', '/ɑːr/', '/ɔːr/', '/ɪr/', '/ʊr/', '/ɛ/'];

const lessonFiles = fs.readdirSync(PHONICS_DIR)
  .filter(f => /^P\d\d-S\d\.md$/.test(f))
  .sort();

test('音标课源文件齐全：P00-S1 + P01–P08 各 5 节 = 41 节', () => {
  assert.strictEqual(lessonFiles.length, 41, '应有 41 个课时源文件，实际 ' + lessonFiles.length);
  const p00 = lessonFiles.filter(f => f.startsWith('P00'));
  assert.strictEqual(p00.length, 1, 'P00 只有 1 节（总览课）');
  for (let u = 1; u <= 8; u++) {
    const id = 'P' + String(u).padStart(2, '0');
    const got = lessonFiles.filter(f => f.startsWith(id + '-'));
    assert.strictEqual(got.length, 5, id + ' 应有 5 节，实际 ' + got.length);
  }
});

test('每节 0 命中「教发音」禁词（课程练符号，不教发音）', () => {
  const hits = [];
  for (const f of lessonFiles) {
    const txt = fs.readFileSync(path.join(PHONICS_DIR, f), 'utf8');
    for (const w of BANNED_TEACHING) {
      if (txt.includes(w)) hits.push(f + ' → ' + w);
    }
  }
  assert.deepStrictEqual(hits, [], '出现教发音类内容：\n' + hits.join('\n'));
});

test('每节 0 命中禁用美式符号（英式 44 口径）', () => {
  const hits = [];
  for (const f of lessonFiles) {
    const txt = fs.readFileSync(path.join(PHONICS_DIR, f), 'utf8');
    for (const s of BANNED_SYMBOLS) {
      if (txt.includes(s)) hits.push(f + ' → ' + s);
    }
  }
  assert.deepStrictEqual(hits, [], '出现禁用美式符号：\n' + hits.join('\n'));
});

test('每节都有锚点词（反引号英文词 ≥5 个）+ 中文意思提示', () => {
  const bad = [];
  for (const f of lessonFiles) {
    const txt = fs.readFileSync(path.join(PHONICS_DIR, f), 'utf8');
    const words = [...new Set((txt.match(/`[a-zA-Z][a-zA-Z'-]{1,14}`/g) || []))];
    if (words.length < 5) bad.push(f + ' → 锚点词仅 ' + words.length + ' 个');
    // 中文意思提示：至少 5 处「英文词 中文」或「中文」紧跟在词旁 —— 用「| 中文」表行计数近似
    const meaningHints = (txt.match(/[一-龥]{2,6}/g) || []).length;
    if (meaningHints < 20) bad.push(f + ' → 中文提示过少');
  }
  assert.deepStrictEqual(bad, [], '锚点词/中文意思不足：\n' + bad.join('\n'));
});

test('每节「拼读对照」块 ≥2 且带尾句「拼读给你「读得出」，IPA 给你「说得准」」', () => {
  const bad = [];
  for (const f of lessonFiles) {
    const txt = fs.readFileSync(path.join(PHONICS_DIR, f), 'utf8');
    const blocks = (txt.match(/拼读对照/g) || []).length;
    if (blocks < 2) bad.push(f + ' → 拼读对照仅 ' + blocks + ' 处');
    if (!txt.includes('拼读给你') || !txt.includes('IPA 给你')) {
      bad.push(f + ' → 缺尾句');
    }
  }
  assert.deepStrictEqual(bad, [], '拼读对照不足：\n' + bad.join('\n'));
});

test('每节结构齐全：H1 标题 / 今天学什么 / 自查段 / 无作业段', () => {
  const bad = [];
  for (const f of lessonFiles) {
    const txt = fs.readFileSync(path.join(PHONICS_DIR, f), 'utf8');
    const wid = f.slice(0, 3);
    if (!new RegExp('^# ' + wid + '-S\\d · ', 'm').test(txt)) bad.push(f + ' → H1 格式');
    if (!txt.includes('## 今天学什么')) bad.push(f + ' → 缺「今天学什么」');
    if (!txt.includes('## ✅ 本节完成自查')) bad.push(f + ' → 缺自查段');
    if (txt.includes('## 📝 今日作业')) bad.push(f + ' → 不该有作业段（这门课无作业）');
    const checks = (txt.match(/^- \[ \]/gm) || []).length;
    if (checks < 4) bad.push(f + ' → 自查项仅 ' + checks + ' 条');
  }
  assert.deepStrictEqual(bad, [], '结构缺失：\n' + bad.join('\n'));
});

test('每节长度在区间内（P00 全景课上限放宽：48 符号全表装得下；其余节 2500–3500）', () => {
  const bad = [];
  for (const f of lessonFiles) {
    const n = fs.readFileSync(path.join(PHONICS_DIR, f)).length;
    // P00-S1 是 48 符号全景课（一张表 + 拼读对照）⇒ 放宽上限；下限仍守（防三行速记）
    const isOverview = f === 'P00-S1.md';
    const max = isOverview ? 8000 : 3500;
    if (n < 2500 || n > max) bad.push(f + ' → ' + n + ' 字节（上限 ' + max + '）');
  }
  assert.deepStrictEqual(bad, [], '长度越界：\n' + bad.join('\n'));
});

test('P00-S1 必须给全部 48 个符号配锚点词（不能只给 4 个）', () => {
  const txt = fs.readFileSync(path.join(PHONICS_DIR, 'P00-S1.md'), 'utf8');
  const syms = [
    '/iː/', '/ɪ/', '/e/', '/æ/', '/ɜː/', '/ə/', '/ʌ/', '/ɑː/', '/ɒ/', '/ɔː/', '/uː/', '/ʊ/',
    '/eɪ/', '/aɪ/', '/ɔɪ/', '/əʊ/', '/aʊ/', '/ɪə/', '/eə/', '/ʊə/',
    '/p/', '/b/', '/t/', '/d/', '/k/', '/g/',
    '/f/', '/v/', '/θ/', '/ð/', '/s/', '/z/', '/ʃ/', '/ʒ/', '/h/', '/r/',
    '/tʃ/', '/dʒ/', '/ts/', '/dz/', '/tr/', '/dr/',
    '/m/', '/n/', '/ŋ/', '/l/', '/w/', '/j/',
  ];
  const missing = syms.filter(s => !txt.includes(s));
  assert.deepStrictEqual(missing, [], 'P00-S1 缺这些符号：' + missing.join(' '));
  // 每个符号必须配有锚点词（反引号英文词）：同表行 `| /iː/ | \`sheep\` |` 或同段内
  // 「符号行 + 下一行锚点词」形态都认（P00-S1 用表格，锚点词在同行）。
  const lines = txt.split('\n');
  const noWord = [];
  for (const s of syms) {
    const idx = lines.findIndex(l => l.includes('` ' + s + '`') || l.includes('` ' + s) || l.trim().startsWith('| ' + s));
    if (idx < 0) { noWord.push(s); continue; }
    const line = lines[idx];
    const next = lines[idx + 1] || '';
    const hasWord = (l) => /`[a-zA-Z][a-zA-Z'-]+`/.test(l);
    if (!hasWord(line) && !hasWord(next)) noWord.push(s);
  }
  assert.deepStrictEqual(noWord, [], '这些符号行没有锚点词：' + noWord.join(' '));
});
