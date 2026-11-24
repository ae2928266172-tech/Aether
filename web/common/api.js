// 公共：接口调用、金额格式、请求号、小票打印
(function () {
  const TOKEN_KEY = 'shouyin_token_' + (window.APP_KIND || 'staff');

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  async function request(method, url, body, opts = {}) {
    const headers = {};
    const t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(url, { method, headers, body: payload });
    if (opts.raw) {
      if (!res.ok) throw new Error('下载失败（' + res.status + '）');
      return res;
    }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && !opts.noRedirect) { setToken(''); if (window.onUnauthorized) window.onUnauthorized(); }
    if (!res.ok) {
      let msg = data && data.detail;
      if (Array.isArray(msg)) msg = msg.map(d => (d.loc || []).slice(-1)[0] + '：' + d.msg).join('；');
      throw new Error(msg || ('请求失败（' + res.status + '）'));
    }
    return data;
  }

  function qs(params) {
    const p = Object.entries(params || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    return p.length ? '?' + new URLSearchParams(p).toString() : '';
  }

  const api = {
    get: (url, params) => request('GET', url + qs(params)),
    post: (url, body) => request('POST', url, body === undefined ? {} : body),
    put: (url, body) => request('PUT', url, body),
    upload: (file) => { const f = new FormData(); f.append('file', file); return request('POST', '/api/uploads', f); },
    async download(url, params) {
      const res = await request('GET', url + qs({ ...params, export: true }), undefined, { raw: true });
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const name = m ? decodeURIComponent(m[1]) : '导出.xlsx';
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    token, setToken, request,
  };

  // 金额：接口用“分”，界面用“元”
  const yuan = (fen) => ((fen || 0) / 100).toFixed(2);
  const toFen = (y) => Math.round(parseFloat(y || 0) * 100);
  // 严格版：用于用户手填的金额。不是合法数字（或为负数）时返回 null，调用处必须拦住，不能当 0 处理
  const parseMoney = (y) => { const s = String(y == null ? '' : y).trim(); if (!/^\d+(\.\d{1,2})?$/.test(s)) return null; return Math.round(parseFloat(s) * 100); };
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // 小票：把接口返回的结构排成 58mm / 80mm 网页，在隐藏框架里调用打印
  // 按后台“小票设置 → 排版”生成网页小票（与小票机直连出票的排版一致）
  function receiptHtml(r) {
    const w = r.paper_width === 80 ? 72 : 48; // 可打印宽度 mm
    const st = r.style || {};
    const px = { s: 12, m: 16, l: 22 };
    const fs = (k) => px[st[k] || 's'] || 12;
    const sty = (sizeKey, bold, align) => `font-size:${fs(sizeKey)}px;${bold ? 'font-weight:bold;' : ''}${align ? 'text-align:' + align + ';' : ''}`;
    const sepChar = (st.separator || '-');
    const hr = sepChar === ' ' ? '<div style="height:8px"></div>' : `<div class="hr" style="border-top:1px ${sepChar === '=' ? 'double' : (sepChar === '.' || sepChar === '*' ? 'dotted' : (sepChar === '_' ? 'solid' : 'dashed'))} #000"></div>`;
    const rows = [];
    for (let i = 0; i < (st.top_blank || 0); i++) rows.push('<div>&nbsp;</div>');
    const head = r.title !== undefined ? null : r.head;
    if (head) head.forEach((h, i) => rows.push(`<div style="${sty(i === 0 ? 'title_size' : 'header_size', i === 0, 'center')}">${esc(h)}</div>`));
    if (r.title) rows.push(`<div style="${sty('title_size', st.title_bold, st.title_align || 'center')}">${esc(r.title)}</div>`);
    if (r.store_line) rows.push(`<div style="${sty('store_size', st.store_bold, st.title_align || 'center')}">${esc(r.store_line)}</div>`);
    (r.header_lines || []).forEach(h => rows.push(`<div style="${sty('header_size', false, st.header_align || 'center')}">${esc(h)}</div>`));
    rows.push(hr);
    r.info.forEach((row) => {
      const [k, v] = row, big = row[2] === 'big';
      rows.push(k ? `<div style="${sty(big ? 'area_size' : 'info_size', big && st.area_bold !== false)}">${esc(k)}：${esc(v)}</div>`
        : `<div style="${sty('info_size', true, 'center')}">${esc(v)}</div>`);
    });
    rows.push(hr);
    r.items.forEach(it => {
      rows.push(`<div style="${sty('item_size', st.item_bold)}">${esc(it.name)}</div>`);
      rows.push(`<div class="lr" style="${sty('item_size')}"><span>&nbsp;&nbsp;${esc(it.qty)}${esc(it.unit)}${it.unit_price ? ' × ' + esc(it.unit_price) : ''}</span><span>${esc(it.amount)}</span></div>`);
      (it.medical || []).forEach(([k, v]) => rows.push(`<div style="${sty('medical_size')}">&nbsp;&nbsp;${esc(k)}：${esc(v)}</div>`));
      if (it.refunded_qty) rows.push(`<div>&nbsp;&nbsp;已退 ${esc(it.refunded_qty)}</div>`);
    });
    rows.push(hr);
    r.totals.forEach(([k, v]) => rows.push(k === '应收'
      ? `<div class="lr" style="${sty('total_size', st.total_bold)}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
      : `<div class="lr"><span>${esc(k)}</span><span>${esc(v)}</span></div>`));
    if (r.remark) rows.push(`<div style="${sty('info_size')}">备注：${esc(r.remark)}</div>`);
    rows.push(hr);
    r.footer.forEach(f => rows.push(`<div style="${sty('footer_size', false, st.footer_align || 'center')}">${esc(f)}</div>`));
    if (r.footer_image) rows.push(`<div style="text-align:${st.footer_align || 'center'}"><img src="${esc(r.footer_image)}" style="width:${Math.round(w * (st.image_width || 60) / 100)}mm"></div>`);
    for (let i = 0; i < (st.bottom_blank == null ? 4 : st.bottom_blank); i++) rows.push('<div>&nbsp;</div>');
    const lh = { compact: 1.25, normal: 1.5, loose: 1.9 }[st.line_spacing || 'normal'];
    const page = `<div class="page">${rows.join('')}</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${r.paper_width}mm auto; margin: 0; }
      body { margin: 0; font-family: "Microsoft YaHei", "SimHei", sans-serif; font-size: 12px; color: #000; line-height: ${lh}; }
      .page { width: ${w}mm; padding: 2mm ${(r.paper_width - w) / 2}mm 2mm; page-break-after: always; }
      .lr { display: flex; justify-content: space-between; gap: 4px; }
      .hr { margin: 3px 0; }
      img { display: inline-block; margin-top: 4px; }
    </style></head><body>${page.repeat(Math.max(1, r.copies || 1))}</body></html>`;
  }

  // 桌面收银软件（Windows）里打开时有 window.ShouyinDesktop：小票直接发给本机小票机，不弹打印框
  const desk = window.ShouyinDesktop || null;
  let deskInfo = null;
  try { deskInfo = desk ? desk.info() : null; } catch (e) { deskInfo = null; }
  // 取小票时要不要服务端一并生成 ESC/POS 指令
  const printOpts = () => (deskInfo && deskInfo.printMode === 'raw' ? { escpos: true } : {});
  // 这台电脑能不能出票（桌面软件可设为“不出票”）
  const canPrintHere = () => !deskInfo || deskInfo.printMode !== 'off';

  async function printReceipt(r) {
    if (deskInfo) {
      if (deskInfo.printMode === 'off') throw new Error('这台电脑设置为不出票，可在“桌面软件设置”里修改');
      if (r.escpos && deskInfo.printMode === 'raw') return desk.printRaw(r.escpos);
      return desk.printHtml(receiptHtml(r));
    }
    return browserPrint(r);
  }

  function browserPrint(r) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      const doc = f.contentWindow.document;
      doc.open(); doc.write(receiptHtml(r)); doc.close();
      const go = () => {
        f.contentWindow.focus(); f.contentWindow.print();
        // 打印完把焦点还给收银页，不然键盘事件都进了这个隐藏框，回车关不掉“收款成功”
        window.focus(); if (document.activeElement === f) f.blur();
        setTimeout(() => { f.remove(); resolve(); }, 1000);
      };
      const imgs = doc.images;
      if (!imgs.length) return setTimeout(go, 50);
      let n = 0; const done = () => { if (++n >= imgs.length) go(); };
      Array.from(imgs).forEach(i => { if (i.complete) done(); else { i.onload = done; i.onerror = done; } });
    });
  }

  // 提示音（不依赖音频文件）
  let audioCtx = null;  // 整个页面共用一个，避免长时间运行后浏览器因音频对象过多而静音
  function beep(times = 2) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      for (let i = 0; i < times; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880 + i * 220;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.35;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.start(t); o.stop(t + 0.32);
      }
    } catch (e) {}
  }

  function speak(text) {
    try { const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; speechSynthesis.speak(u); } catch (e) {}
  }

  // 线条图标（24×24，描边）
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2h6v4H9z"/><path d="m9 13 2 2 4-4"/>',
    package: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
    truck: '<path d="M1 4h14v12H1z"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    warehouse: '<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
    store: '<path d="M3 9 5 3h14l2 6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/>',
    printer: '<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a7 7 0 0 1 14 0v1"/><path d="M16 3.5a4 4 0 0 1 0 9M19 21v-1a6 6 0 0 0-3-5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    box: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
    scan: '<path d="M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M7 12h10"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7z"/>',
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

  // 商品图缩略图：本系统上传的图（/media/xxx.jpg）走 /media/t/宽度/xxx.jpg，服务器缩成小图并长期缓存；外部链接原样用
  const thumb = (url, w) => {
    const m = /^\/media\/([0-9A-Za-z_\-]+\.(png|jpe?g|webp))$/i.exec(url || '');
    if (!m) return url || '';
    const dpr = window.devicePixelRatio || 1, want = (w || 320) * dpr;
    return '/media/t/' + (want <= 160 ? 160 : want <= 320 ? 320 : 640) + '/' + m[1];
  };

  window.Shouyin = { thumb, api, yuan, toFen, parseMoney, rid, today, esc, receiptHtml, printReceipt, beep, speak, icon, desk, deskInfo, printOpts, canPrintHere };
})();
