/*
 * 移动端皮肤层（只在安卓壳里生效）。
 *
 * 做法：**不重写面板，只搬运 DOM**。
 * editor.js 里的图层列表、属性 inspector、时间轴、绑定列表都是现成的，
 * 手机端只是把它们从"三栏"搬到"底部页签"，再补上触屏该有的尺寸与手势。
 * 这样桌面端和手机端永远是同一份逻辑，改一处两边都对。
 *
 * 生效条件：window.LOOW（原生注入的 JS 桥）存在。桌面浏览器里这个文件
 * 被 index.html 里的守卫跳过，连加载都不会发生。
 */
(function () {
  'use strict';

  if (!window.LOOW || typeof window.LOOW.appInfo !== 'function') return;

  const html = document.documentElement;
  html.classList.add('loow-mobile');

  let appInfo = {};
  try { appInfo = JSON.parse(window.LOOW.appInfo()) || {}; } catch (e) { /* 旧壳没有 appInfo 也能跑 */ }

  const main = document.querySelector('main');
  const center = main && main.querySelector('section.center');
  const left = main && main.querySelector('aside.left');
  const right = main && main.querySelector('aside.right');
  if (!main || !center) return;

  const timeline = center.querySelector('.timeline');
  const sections = right ? Array.from(right.children).filter(n => n.classList && n.classList.contains('section')) : [];

  // ---------------------------------------------------------------- 页签与抽屉

  const TABS = [
    { id: 'layers', label: '图层', glyph: '▤' },
    { id: 'props', label: '属性', glyph: '◧' },
    { id: 'anim', label: '动画', glyph: '◈' },
    { id: 'logic', label: '逻辑', glyph: '⌘' }
  ];

  const sheet = document.createElement('div');
  sheet.id = 'm-sheet';

  const panes = {};
  TABS.forEach(tab => {
    const pane = document.createElement('div');
    pane.className = 'm-pane';
    pane.dataset.tab = tab.id;
    sheet.appendChild(pane);
    panes[tab.id] = pane;
  });

  // 搬运（不是复制）：节点对象原样移动，editor.js 里持有的引用继续有效
  if (left) panes.layers.appendChild(left);
  if (sections[0]) panes.props.appendChild(sections[0]);   // 属性
  if (sections[1]) panes.props.appendChild(sections[1]);   // 校验
  if (timeline) panes.anim.appendChild(timeline);
  if (sections[2]) panes.logic.appendChild(sections[2]);   // 交互（触摸事件）
  if (sections[3]) panes.logic.appendChild(sections[3]);   // 绑定
  if (sections[4]) panes.logic.appendChild(sections[4]);   // 变量 / 函数
  if (right) right.remove();

  const bar = document.createElement('nav');
  bar.id = 'm-tabs';
  TABS.forEach(tab => {
    const button = document.createElement('button');
    button.className = 'm-tab';
    button.dataset.tab = tab.id;
    button.innerHTML = '<span class="glyph">' + tab.glyph + '</span>' + tab.label;
    button.addEventListener('click', () => {
      if (active === tab.id && open) {
        open = false;              // 再点一次收起，把整个屏幕还给画布
      } else {
        active = tab.id;
        open = true;
      }
      apply();
    });
    bar.appendChild(button);
  });

  document.body.appendChild(sheet);
  document.body.appendChild(bar);

  let active = 'layers';
  let open = true;

  function apply() {
    sheet.dataset.tab = active;
    sheet.classList.toggle('open', open);
    Object.keys(panes).forEach(id => panes[id].classList.toggle('on', id === active));
    Array.from(bar.children).forEach(button => {
      button.classList.toggle('on', open && button.dataset.tab === active);
    });
    // 面板从 display:none 变可见后，尺寸才是真的：必须重排一次，
    // 否则时间轴宽度按 0 算，关键帧会全挤在左边。
    requestAnimationFrame(() => {
      try { if (typeof renderAll === 'function') renderAll(true); } catch (e) { /* 忽略 */ }
      try { if (typeof resizeCanvas === 'function') resizeCanvas(); } catch (e) { /* 忽略 */ }
    });
  }

  apply();

  // ---------------------------------------------------------------- 顶栏适配

  const save = document.getElementById('btn-send-phone');
  if (save) {
    save.textContent = '保存';
    save.title = '保存到壁纸库（分享给 LOOW 壁纸）';
  }

  // 桌面端的按钮文案是为鼠标写的（"导出预设（单文件·手机用）"），手机顶栏放不下，
  // 这里只改显示文字，不动 onclick。
  const shorten = {
    '导入 JSON': '导入',
    '导出预设（单文件·手机用）': '导出',
    '导出 3 个 JSON': '导出 3 个'
  };
  document.querySelectorAll('header button').forEach(button => {
    const text = (button.textContent || '').trim();
    if (shorten[text]) button.textContent = shorten[text];
  });

  // ---------------------------------------------------------------- 属性面板排序
  //
  // 桌面端把「视差」放最上面：全局参数和本层参数要对照着看。
  // 但手机上属性面板只有半屏高，先看到五行视差滑条加一段说明，才轮得到位置/尺寸/颜色——
  // 日常要调的东西全在下面。这里把整段视差挪到末尾。
  (function moveParallaxLast() {
    const base = window.renderInspector;
    if (typeof base !== 'function') return;
    window.renderInspector = function () {
      const result = base.apply(this, arguments);
      const box = document.getElementById('inspector');
      const block = box && box.querySelector('.parallax-block');
      if (block) box.appendChild(block);
      return result;
    };
  })();

  // ---------------------------------------------------------------- 关键帧面板
  //
  // 没选中关键帧时，这块占着抽屉 46% 的高度只显示一行提示。
  // 空的时候收成一条，把高度还给时间轴。
  (function compactKeyframePanel() {
    const base = window.renderKeyframeInspector;
    if (typeof base !== 'function') return;
    window.renderKeyframeInspector = function () {
      const result = base.apply(this, arguments);
      const box = document.getElementById('kf-inspector');
      const panel = box && box.closest ? box.closest('.tl-kf') : null;
      if (panel) {
        const empty = !!(box.querySelector('.hint') && !box.querySelector('.field'));
        panel.classList.toggle('empty', empty);
      }
      return result;
    };
  })();

  // ---------------------------------------------------------------- 图层提示文案
  //
  // 桌面那句是"拖动图层改层级 · 双击图层名重命名 · 拖到容器中间放进容器 · 越靠下越靠上"，
  // 手机上两行还占高度，而且"拖动"要靠左边的 ≡ 把手，说明里必须点出来。
  (function shortenLayerHint() {
    const hint = document.getElementById('layer-hint');
    if (!hint) return;
    hint.textContent = '拖 ≡ 改层级 · 双击改名 · 拖进容器里就成子层';
  })();

  // ---------------------------------------------------------------- 面板抓取条
  //
  // 面板顶部那根小横条以前只是装饰（CSS ::before），现在做成真按钮：
  // 点一下收起/展开，把画布让出来——手机上画布只有一百多像素宽，需要随时能放大。
  (function sheetGrabber() {
    const grab = document.createElement('button');
    grab.type = 'button';
    grab.id = 'm-sheet-grab';
    grab.title = '收起 / 展开面板';
    grab.setAttribute('aria-label', '收起或展开面板');
    grab.addEventListener('click', () => {
      open = !open;
      apply();
    });
    sheet.appendChild(grab);
  })();

  // ---------------------------------------------------------------- 画板折叠复位
  //
  // 桌面端双击画板会把它折叠成 3%（只剩一个点）。这个状态会存进 shellState，
  // 手机上一旦被误触，重开 App 还是黑的，用户会以为"画板打不开"。
  // 那个手势现在在手机上已经禁用了，这里把历史遗留的折叠状态一并复位。
  (function forcePanelVisible() {
    const panel = document.getElementById('preview-panel');
    if (!panel) return;
    panel.classList.remove('collapsed');
    if (typeof saveShellState === 'function') saveShellState({ panelCollapsed: false });
    requestAnimationFrame(() => {
      try { if (typeof resizeCanvas === 'function') resizeCanvas(); } catch (e) { /* 忽略 */ }
      try { if (typeof draw === 'function') draw(); } catch (e) { /* 忽略 */ }
    });
  })();

  // ---------------------------------------------------------------- 触发器入口
  //
  // 顶栏那排按钮在手机上要横向滑动才看得见「触发器」，很多人根本不知道有这个工作台。
  // 画布右上角放一个常驻的悬浮按钮，一眼能看到。
  (function studioEntry() {
    const source = document.getElementById('btn-studio');
    if (!source) return;
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'm-studio-fab';
    fab.innerHTML = '<span class="glyph">🧩</span>触发器';
    fab.title = '打开触发器工作台';
    fab.addEventListener('click', () => source.click());
    const host = document.querySelector('main') || document.body;
    host.appendChild(fab);
  })();

  // 保存对话框里的文案：手机上"下载到电脑"其实是存到手机文件里
  document.querySelectorAll('#save-modal label').forEach(label => {
    if (label.textContent.indexOf('下载到电脑') >= 0) {
      label.textContent = label.textContent.replace('下载到电脑', '保存为文件');
    }
    if (label.textContent.indexOf('发送到手机') >= 0) {
      label.textContent = label.textContent.replace('发送到手机', '发送到壁纸 App');
    }
  });

  // ---------------------------------------------------------------- 与原生对接

  /**
   * 覆盖导出：桌面端是 <a download>，WebView 里那个下载事件不会落到 DownloadListener
   * （blob: 不触发），必须走原生 SAF。
   */
  window.download = function (name, text) {
    try {
      // 先落进本机项目库：导出/分享都可能被用户中途取消，工程不能因此丢
      if (typeof window.LOOW.saveProject === 'function') window.LOOW.saveProject(text, name);
      window.LOOW.exportFile(text, name);
      if (typeof status === 'function') status('已提交保存：' + name);
    } catch (error) {
      if (typeof status === 'function') status('保存失败：' + error.message);
    }
  };

  /**
   * 覆盖"发送到手机"：App 里没有"手机"这个概念了，直接分享给壁纸 App。
   */
  window.sendBundleToPhone = function () {
    try {
      const bundle = buildBundle();
      const name = (state.doc.manifest && state.doc.manifest.name) || '我的壁纸';
      const json = JSON.stringify(bundle);
      // 分享给壁纸 App 的同时留一份工程，方便下次直接改
      if (typeof window.LOOW.saveProject === 'function') window.LOOW.saveProject(json, name);
      window.LOOW.shareToWallpaper(json, name);
      if (typeof status === 'function') status('已发送到壁纸 App');
    } catch (error) {
      if (typeof status === 'function') status('发送失败：' + error.message);
    }
  };

  // 草稿双写：WebView 的 localStorage 会被"清理缓存"抹掉，这里镜像一份到 App 私有目录
  let lastDraft = '';
  setInterval(() => {
    try {
      const raw = localStorage.getItem('lwpkit.doc.v1');
      if (!raw || raw === lastDraft) return;
      lastDraft = raw;
      window.LOOW.saveDraft(raw);
    } catch (e) { /* 存储不可用时静默跳过，不打断编辑 */ }
  }, 5000);

  // ---------------------------------------------------------------- 返回键

  window.LOOW_ANDROID_BACK = function () {
    const studio = document.getElementById('studio');
    if (studio && !studio.hidden) {
      const back = document.getElementById('btn-studio-back');
      if (back) back.click();
      return true;
    }

    const modal = document.querySelector('.st-modal:not([hidden])');
    if (modal) { modal.hidden = true; return true; }

    const picker = ['icon-picker', 'shape-picker', 'svg-picker']
      .map(id => document.getElementById(id))
      .find(el => el && el.style.display !== 'none');
    if (picker) { picker.style.display = 'none'; return true; }

    if (open) { open = false; apply(); return true; }
    return false;
  };

  // ---------------------------------------------------------------- 图层拖动（触屏）
  //
  // 桌面端用 HTML5 拖放（draggable + dragstart/dragover/drop），这套在触屏上
  // **完全不会触发**：手指按住拖动只会滚动列表，用户看到的就是"图层拖不动"。
  //
  // 为什么不用"长按进入拖动"：浏览器在 touchstart 时就把 touch-action 定死了，
  // 脚本中途改成 none 不生效；第一下移动仍然被判定为滚动，紧接着发 pointercancel
  // （实测：pointerdown → pointermove → pointercancel，拖动还没开始就被掐断）。
  // 所以改成每行前面放一个"≡"把手：把手自己 touch-action:none，浏览器不会抢，
  // 按住即拖，不需要长按，也不会和列表滚动打架。
  (function enableTouchLayerDrag() {
    const list = document.getElementById('layer-list');
    if (!list) return;

    const decorate = () => {
      list.querySelectorAll('.row').forEach(row => {
        if (row.querySelector('.m-drag-handle')) return;
        const handle = document.createElement('span');
        handle.className = 'm-drag-handle';
        handle.textContent = '≡';
        row.insertBefore(handle, row.firstChild);
      });
    };

    // 列表每次重绘都会重建行，包一层渲染函数把把手补回去
    const baseRender = window.renderLayers;
    if (typeof baseRender === 'function') {
      window.renderLayers = function () {
        const result = baseRender.apply(this, arguments);
        decorate();
        return result;
      };
    }
    decorate();

    let drag = null;

    const rowAt = (x, y) => {
      const node = document.elementFromPoint(x, y);
      return node && node.closest ? node.closest('#layer-list .row') : null;
    };

    list.addEventListener('pointerdown', event => {
      const handle = event.target.closest && event.target.closest('.m-drag-handle');
      if (!handle) return;
      const row = handle.closest('.row');
      if (!row || !row.dataset.id) return;
      event.preventDefault();
      drag = { id: row.dataset.id, row, pointerId: event.pointerId };
      row.classList.add('dragging');
      if (typeof state !== 'undefined') state.layerDragId = drag.id;
      try { handle.setPointerCapture(event.pointerId); } catch (e) { /* 老 WebView */ }
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* 无马达 */ } }
    });

    list.addEventListener('pointermove', event => {
      if (!drag) return;
      event.preventDefault();
      const row = rowAt(event.clientX, event.clientY);
      if (!row || !row.dataset.id || row.dataset.id === drag.id) return;
      const target = findNode(row.dataset.id);
      const dragged = findNode(drag.id);
      if (!target) return;
      // 容器不能拖进自己的子孙里，否则成环
      if (dragged && isContainer(dragged) && isDescendantOf(dragged, target.id)) return;
      setDropIndicator(row, dropModeFor(row, target, event.clientY));
    });

    const finish = event => {
      const current = drag;
      drag = null;
      if (!current) return;
      current.row.classList.remove('dragging');
      if (typeof state !== 'undefined') state.layerDragId = null;
      clearDropIndicators();
      if (!event) return;
      const row = rowAt(event.clientX, event.clientY);
      if (!row || !row.dataset.id || row.dataset.id === current.id) return;
      const target = findNode(row.dataset.id);
      if (target) moveNode(current.id, target.id, dropModeFor(row, target, event.clientY));
    };

    list.addEventListener('pointerup', finish);
    list.addEventListener('pointercancel', () => finish(null));
  })();


  // ---------------------------------------------------------------- 节点工作台（触屏）
  //
  // 桌面是"左库 / 中画布 / 右参数"三栏，手机上三栏加起来比屏幕还宽，
  // 而且我之前直接把右栏 display:none 了 —— 结果节点参数根本改不了。
  // 这里改成：画布占满，节点库 / 参数 / 模拟 / 日志 收进底部抽屉。
  (function buildStudioSheet() {
    const studio = document.getElementById('studio');
    if (!studio) return;
    const body = studio.querySelector('.studio-body');
    if (!body) return;

    const library = body.querySelector('.studio-library');
    const right = body.querySelector('.studio-right');
    const panels = right ? Array.from(right.querySelectorAll('.st-panel')) : [];
    const params = panels.find(p => p.classList.contains('st-param-panel'));
    const log = panels.find(p => p.classList.contains('st-log-panel'));
    const sim = panels.find(p => p !== params && p !== log);

    const entries = [
      { id: 'lib', label: '节点库', node: library },
      { id: 'params', label: '参数', node: params },
      { id: 'sim', label: '模拟', node: sim },
      { id: 'log', label: '日志', node: log }
    ].filter(entry => entry.node);
    if (!entries.length) return;

    const sheet = document.createElement('div');
    sheet.id = 'st-sheet';

    const bar = document.createElement('div');
    bar.className = 'st-sheet-tabs';
    sheet.appendChild(bar);

    const panes = {};
    let active = entries[0].id;

    entries.forEach(entry => {
      const pane = document.createElement('div');
      pane.className = 'st-sheet-pane';
      pane.dataset.tab = entry.id;
      pane.appendChild(entry.node);
      sheet.appendChild(pane);
      panes[entry.id] = pane;

      const button = document.createElement('button');
      button.className = 'st-sheet-tab';
      button.dataset.tab = entry.id;
      button.textContent = entry.label;
      button.addEventListener('click', () => {
        if (active === entry.id) {
          sheet.classList.toggle('collapsed');
        } else {
          active = entry.id;
          sheet.classList.remove('collapsed');
        }
        apply();
      });
      bar.appendChild(button);
    });

    function apply() {
      const collapsed = sheet.classList.contains('collapsed');
      sheet.dataset.tab = active;
      Object.keys(panes).forEach(id => panes[id].classList.toggle('on', !collapsed && id === active));
      Array.from(bar.children).forEach(b => {
        b.classList.toggle('on', !collapsed && b.dataset.tab === active);
      });
      requestAnimationFrame(() => {
        try { if (typeof renderStudioCanvas === 'function') renderStudioCanvas(); } catch (e) { /* 忽略 */ }
      });
    }

    // 右栏的三块已经被搬走，空壳留着只会占位
    if (right) right.remove();
    studio.appendChild(sheet);

    // 顶栏按钮文案瘦身（桌面那套长标签在 394px 宽里会挤成竖排）
    const rename = {
      '← 返回编辑器': '←',
      '🗑 清空画布': '🗑',
      '↺ 重置视图': '↺',
      '⌗ 整理': '⌗',
      '{ } 查看 JSON': '{ }',
      '▶ 模拟运行': '▶ 运行'
    };
    studio.querySelectorAll('.studio-top button').forEach(button => {
      const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
      for (const key of Object.keys(rename)) {
        if (text.indexOf(key) === 0) { button.textContent = rename[key]; break; }
      }
    });

    // 供外层（选中节点时）切页签用
    sheet.showTab = function (id) {
      if (!panes[id]) return;
      sheet.classList.remove('collapsed');
      active = id;
      apply();
    };

    apply();
  })();

  // 点卡片只选中，不自动翻到「参数」页。
  //
  // 曾经做过"选中就翻页"：想法是手机上点节点却看不到参数等于白点。但按下卡片
  // 同时也是**拖动的起点**——手指刚碰到卡片，抽屉就换页、重新布局，整个画布
  // 跟着跳一下，拖起来非常难受。
  // 现在参数页由用户自己点：选中看画布，要改参数再点「参数」。

  // ---------------------------------------------------------------- 画布手势不再冒泡到预览面板
  //
  // 预览面板有一套"按住 260ms 拖动整块预览"的逻辑。手指按住一个缩放手柄超过
  // 260ms 是常态（手柄小、要瞄准），于是手柄在缩放的同时，整块画布也跟着跑
  // （真机实测：拖右下角把手 16px，图层宽高变了，面板 left 也 +16）。
  // 画布上的手势交给画布自己处理，别让面板再插一手。
  (function stopCanvasGestureBubbling() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    stage.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return;   // 桌面保持原样
      event.stopPropagation();
    });
  })();

  // ---------------------------------------------------------------- 工作台双指缩放/平移
  //
  // 桌面上靠滚轮缩放、拖空白平移；手机屏幕小、节点一多就没有"空白"可拖。
  // 补一套双指手势：以两指中心为锚点，同时做缩放和平移。
  (function enableStudioPinch() {
    const canvas = document.getElementById('studio-canvas');
    if (!canvas || typeof studio === 'undefined') return;

    const points = new Map();
    let gesture = null;

    const centerOf = () => {
      const list = Array.from(points.values());
      return { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 };
    };
    const spanOf = () => {
      const list = Array.from(points.values());
      return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) || 1;
    };

    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size !== 2) return;
      const box = canvas.getBoundingClientRect();
      const center = centerOf();
      gesture = {
        box,
        span: spanOf(),
        zoom: studio.zoom,
        // 两指中心对应的画布坐标：缩放时它必须钉在手指下面
        anchor: {
          x: (center.x - box.left - studio.offset.x) / studio.zoom,
          y: (center.y - box.top - studio.offset.y) / studio.zoom
        }
      };
    }, true);

    canvas.addEventListener('pointermove', event => {
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!gesture || points.size < 2) return;
      // 双指期间不许节点拖动 / 画布平移插手
      event.stopPropagation();
      event.preventDefault();
      const center = centerOf();
      const next = Math.max(0.3, Math.min(2, gesture.zoom * (spanOf() / gesture.span)));
      studio.zoom = next;
      studio.offset.x = (center.x - gesture.box.left) - gesture.anchor.x * next;
      studio.offset.y = (center.y - gesture.box.top) - gesture.anchor.y * next;
      if (typeof applyStudioStage === 'function') applyStudioStage();
    }, { passive: false, capture: true });

    // 释放监听必须挂在 window 上：手指可能在画布外抬起（比如抬到抽屉上），
    // 挂在 canvas 上就收不到，触点表里会留一个"幽灵手指"——下一次单指触摸
    // 立刻被当成双指，画面突然跳一下。这是"缩放不正常"的直接原因。
    const release = event => {
      points.delete(event.pointerId);
      if (points.size < 2) gesture = null;
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', () => { points.clear(); gesture = null; }, true);
  })();

  // ---------------------------------------------------------------- 工作台打开后的适配
  //
  // openStudio() 会把主编辑器的实时预览面板搬进画布当"悬浮窗"（桌面 298×596）。
  // 在 394px 宽的手机上那就是半块屏幕，节点全被盖住，所以这里把它缩成角落缩略图，
  // 同时把画布默认缩到 60% 左右 —— 244px 宽的节点卡在 1:1 下只能看见一张半。
  (function adaptStudioOnOpen() {
    const baseOpen = window.openStudio;
    if (typeof baseOpen !== 'function') return;

    window.openStudio = function () {
      const result = baseOpen.apply(this, arguments);

      setTimeout(() => {
        const wrap = document.querySelector('.canvas-wrap');
        const slot = document.getElementById('studio-canvas');
        if (wrap && slot) {
          // 缩成角落缩略图：手机上没有第二块地方放 298×596 的桌面尺寸预览
          const width = 92;
          const height = 184;
          wrap.style.width = width + 'px';
          wrap.style.height = height + 'px';
          const box = slot.getBoundingClientRect();
          wrap.style.left = Math.max(6, box.width - width - 8) + 'px';
          wrap.style.top = Math.max(6, box.height - height - 8) + 'px';
          try { if (typeof resizeCanvas === 'function') resizeCanvas(); } catch (e) { /* 忽略 */ }
        }

        // 角落缩略图会压住节点，给一个开关（只在手机上出现）
        const top = document.querySelector('.studio-top');
        if (top && !document.getElementById('m-studio-preview-toggle')) {
          const toggle = document.createElement('button');
          toggle.id = 'm-studio-preview-toggle';
          toggle.className = 'st-toolbtn';
          toggle.textContent = '◱';
          toggle.title = '显示 / 隐藏预览缩略图';
          toggle.addEventListener('click', () => {
            const box = document.querySelector('.canvas-wrap');
            if (!box) return;
            box.style.display = box.style.display === 'none' ? '' : 'none';
            toggle.classList.toggle('on', box.style.display === 'none');
          });
          const runBtn = document.getElementById('btn-studio-run');
          if (runBtn && runBtn.parentElement === top) top.insertBefore(toggle, runBtn);
          else top.appendChild(toggle);
        }

        // 用现成的缩放按钮改视图，避免自己算 transform 与标签
        if (typeof studio !== 'undefined' && studio.zoom > 0.72) {
          const out = document.querySelector('[data-studio-zoom="out"]');
          if (out) { for (let i = 0; i < 2; i += 1) out.click(); }
        }
      }, 150);

      return result;
    };
  })();

  // ---------------------------------------------------------------- 撤销 / 重做
  //
  // 桌面靠 Ctrl+Z / Ctrl+Shift+Z，手机上没键盘等于没有。补两个常驻按钮。
  // history 是 editor.js 里的同名常量（遮蔽了 window.history），这里只读它的长度。
  (function addHistoryButtons() {
    const header = document.querySelector('header');
    if (!header || typeof undoEdit !== 'function') return;
    const hist = (typeof history !== 'undefined' && history && Array.isArray(history.undo)) ? history : null;

    const make = (glyph, title, action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'm-hist';
      button.textContent = glyph;
      button.title = title;
      button.addEventListener('click', action);
      return button;
    };

    const undo = make('↶', '撤销', () => { if (typeof undoEdit === 'function') undoEdit(); });
    const redo = make('↷', '重做', () => { if (typeof redoEdit === 'function') redoEdit(); });
    header.insertBefore(redo, header.firstChild);
    header.insertBefore(undo, header.firstChild);

    const sync = () => {
      undo.disabled = !(hist && hist.undo.length);
      redo.disabled = !(hist && hist.redo.length);
    };
    const baseRender = window.renderAll;
    if (typeof baseRender === 'function') {
      window.renderAll = function () {
        const result = baseRender.apply(this, arguments);
        sync();
        return result;
      };
    }
    setInterval(sync, 800);
    sync();
  })();

  // ---------------------------------------------------------------- 草稿兜底恢复
  //
  // WebView 的 localStorage 被"清理缓存"抹掉时，原生目录里还留着一份 5 秒前的镜像。
  // 之前只写不读，等于白存。
  (function restoreDraftFromNative() {
    let hasLocal = false;
    try { hasLocal = !!localStorage.getItem('lwpkit.doc.v1'); } catch (e) { hasLocal = true; }
    if (hasLocal) return;
    let raw = '';
    try { raw = window.LOOW.loadDraft() || ''; } catch (e) { return; }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.scene) return;
      if (typeof importJson !== 'function') return;
      importJson(raw);
      if (typeof persistDoc === 'function') persistDoc();
      if (typeof status === 'function') status('已从本机备份恢复草稿');
    } catch (e) { /* 备份坏了就当没有，不能拦着启动 */ }
  })();

  // ---------------------------------------------------------------- 项目库
  //
  // 编辑器是独立 App，读不到壁纸 App 的沙箱；之前"保存"只把预设分享出去，
  // 想再改就得去壁纸 App 导出文件再导回来。这里在编辑器自己的目录里留一份工程。
  (function projectLibrary() {
    const header = document.querySelector('header');
    if (!header || typeof window.LOOW.listProjects !== 'function') return;

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = '打开';
    openButton.title = '打开本机项目';
    header.insertBefore(openButton, header.firstChild);

    let panel = null;
    const close = () => { if (panel) { panel.remove(); panel = null; } };

    const buildList = () => {
      const list = document.createElement('div');
      list.className = 'm-proj-list';
      let items = [];
      try { items = JSON.parse(window.LOOW.listProjects() || '[]'); } catch (e) { items = []; }

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'm-proj-empty';
        empty.textContent = '还没有项目。点「保存」之后，这里会出现一份可以再次打开的工程。';
        list.appendChild(empty);
        return list;
      }

      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'm-proj-row';

        const name = document.createElement('b');
        name.textContent = item.name || item.id;
        const meta = document.createElement('span');
        try { meta.textContent = new Date(item.updated).toLocaleString(); } catch (e) { meta.textContent = ''; }

        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.title = '删除这个项目';
        del.addEventListener('click', event => {
          event.stopPropagation();
          window.LOOW.deleteProject(item.id);
          list.replaceWith(buildList());
        });

        row.appendChild(name);
        row.appendChild(meta);
        row.appendChild(del);
        row.addEventListener('click', () => {
          const json = window.LOOW.loadProject(item.id);
          if (!json) return;
          close();
          if (typeof importJson === 'function') {
            importJson(json);
            if (typeof persistDoc === 'function') persistDoc();
          }
        });
        list.appendChild(row);
      });
      return list;
    };

    openButton.addEventListener('click', () => {
      close();
      panel = document.createElement('div');
      panel.className = 'm-proj-panel';

      const head = document.createElement('div');
      head.className = 'm-proj-head';
      const title = document.createElement('b');
      title.textContent = '项目';
      const hint = document.createElement('span');
      hint.textContent = '本机保存的工程';
      const shut = document.createElement('button');
      shut.type = 'button';
      shut.textContent = '关闭';
      shut.addEventListener('click', close);
      head.appendChild(title);
      head.appendChild(hint);
      head.appendChild(shut);

      panel.appendChild(head);
      panel.appendChild(buildList());
      document.body.appendChild(panel);
    });
  })();

  // 供原生调试时确认壳与页面已经握手
  if (typeof console !== 'undefined') {
    console.log('[LOOW] mobile shell ready · ' + (appInfo.version || '?'));
  }
})();
