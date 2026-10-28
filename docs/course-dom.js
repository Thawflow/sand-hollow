/*
 * course-dom.js — 静态课程 HTML 的轻量提取器（P3 前端切静态）
 *
 * 为什么存在：Node 26.10 无内置 DOMParser，仓里禁止 npm 依赖，
 * 前端又要在浏览器里把 docs/course/W##.html 注入 #content。
 * → 纯函数（正则/字符串）提取，UMD 双可用：
 *     node:   const dom = require('./docs/course-dom.js')
 *     浏览器: window.CourseDom.extractLessons(html)
 *
 * 提取目标（P1 构建产物的固定形状，见 mentors-den/scripts/build-course-html.js）：
 *   <div class="wrap">
 *     <h1 class="wk-title">起步：让程序开口说话</h1>
 *     <div class="wk-meta">W01 · 3 课</div>
 *     <div class="week-body" data-week="W01">
 *       <section class="lesson" data-lid="W01-L01">
 *         <div class="lesson-head"><span class="lt">标题</span></div>
 *         <div class="md" data-lid="W01-L01"> …渲染好的课文 HTML… </div>
 *       </section>
 *       …
 * syllabus.html：.week-body[data-week="SYLLABUS"] 里直接是 <div class="md">（无 section）。
 *
 * 安全边界：课文来自我们自己的构建产物（构建期已过标题闸），此处只做结构搬运。
 * 坏输入一律返回空值（[]/''），绝不抛异常 —— 前端拿空值走错误 UI。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CourseDom = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 定位某个 data-week 容器的开闭区间（按 </div> 计数配对，允许嵌套 div）
  function findBlock(html, week) {
    if (typeof html !== 'string' || !html) return null;
    var openRe = new RegExp('<div class="week-body" data-week="' + week + '"\\s*>');
    var m = openRe.exec(html);
    if (!m) {
      // 宽松回退：data 属性顺序可能不同
      m = new RegExp('<div[^>]*class="week-body"[^>]*data-week="' + week + '"[^>]*>').exec(html);
      if (!m) return null;
    }
    var start = m.index;
    var i = html.indexOf('>', start);
    if (i < 0) return null;
    var bodyStart = i + 1;
    // 从开标签起数 <div 与 </div> 的配平
    var depth = 1;
    var re = /<\/?div\b[^>]*>/g;
    re.lastIndex = bodyStart;
    var t;
    while ((t = re.exec(html)) !== null) {
      if (t[0][1] === '/') {
        depth--;
        if (depth === 0) {
          return { start: bodyStart, end: t.index };
        }
      } else if (!/\/>$/.test(t[0])) {
        depth++;
      }
    }
    return null; // 未配平（残缺 HTML）
  }

  // 提取一个 section.lesson 的完整块（同样按配平计数）
  function findLessonBlock(html, from, to) {
    var m = /<section class="lesson" data-lid="([^"]*)"\s*>/.exec(html.slice(from, to) ? html.slice(0, to) : html);
    return m;
  }

  function extractLessons(html) {
    if (typeof html !== 'string' || !html) return [];
    // 周页不一定能确定 data-week 值 → 直接扫全篇的 section.lesson
    var lessons = [];
    var secRe = /<section class="lesson" data-lid="([^"]*)"\s*>/g;
    var m;
    while ((m = secRe.exec(html)) !== null) {
      var lid = m[1];
      var openEnd = m.index + m[0].length;
      // section 内部按 <section / </section> 配平找闭标签
      var depth = 1;
      var re = /<\/?section\b[^>]*>/g;
      re.lastIndex = openEnd;
      var t, closeIdx = -1;
      while ((t = re.exec(html)) !== null) {
        if (t[0][1] === '/') {
          depth--;
          if (depth === 0) { closeIdx = t.index; break; }
        } else {
          depth++;
        }
      }
      if (closeIdx < 0) continue; // 残缺：跳过该 section
      var block = html.slice(openEnd, closeIdx);

      // 课时标题
      var title = '';
      var tm = /<span class="lt">([\s\S]*?)<\/span>/.exec(block);
      if (tm) title = tm[1].replace(/<[^>]+>/g, '').trim();

      // .md 正文块（div 配平）
      var mdHtml = '';
      var mm = /<div class="md" data-lid="([^"]*)"\s*>/.exec(block);
      if (mm) {
        var bodyStart = mm.index + mm[0].length;
        var d = 1;
        var dre = /<\/?div\b[^>]*>/g;
        dre.lastIndex = bodyStart;
        var dt;
        while ((dt = dre.exec(block)) !== null) {
          if (dt[0][1] === '/') {
            d--;
            if (d === 0) { mdHtml = block.slice(bodyStart, dt.index); break; }
          } else if (!/\/>$/.test(dt[0])) {
            d++;
          }
        }
      }
      lessons.push({ lid: lid, title: title, html: mdHtml });
    }
    return lessons;
  }

  function extractSyllabus(html) {
    if (typeof html !== 'string' || !html) return '';
    var blk = findBlock(html, 'SYLLABUS');
    if (!blk) return '';
    var body = html.slice(blk.start, blk.end);
    // 取 .week-body 里第一个 <div class="md"> 的内容（构建产物固定形状）
    var mm = /<div class="md"\s*>/.exec(body);
    if (!mm) return '';
    var start = mm.index + mm[0].length;
    var d = 1;
    var re = /<\/?div\b[^>]*>/g;
    re.lastIndex = start;
    var t;
    while ((t = re.exec(body)) !== null) {
      if (t[0][1] === '/') {
        d--;
        if (d === 0) return body.slice(start, t.index);
      } else if (!/\/>$/.test(t[0])) {
        d++;
      }
    }
    return '';
  }

  function extractTitle(html) {
    if (typeof html !== 'string' || !html) return '';
    var m = /<h1 class="wk-title"[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  function extractMeta(html) {
    if (typeof html !== 'string' || !html) return '';
    var m = /<div class="wk-meta"[^>]*>([\s\S]*?)<\/div>/.exec(html);
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  return {
    extractLessons: extractLessons,
    extractSyllabus: extractSyllabus,
    extractTitle: extractTitle,
    extractMeta: extractMeta,
  };
});
