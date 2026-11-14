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
    r.info.forEach(([k, v]) => rows.push(k ? `<div style="${sty('info_size')}">${esc(k)}：${esc(v)}</div>` : `<div style="${sty('info_size', true, 'center')}">${esc(v)}</div>`));
    rows.push(hr);
    r.items.forEach(it => {
      rows.push(`<div style="${sty('item_size', st.item_bold)}">${esc(it.name)}</div>`);
      rows.push(`<div class="lr" style="${sty('item_size')}"><span>&nbsp;&nbsp;${it.qty}${esc(it.unit)}${it.unit_price ? ' × ' + it.unit_price : ''}</span><span>${it.amount}</span></div>`);
      (it.medical || []).forEach(([k, v]) => rows.push(`<div style="${sty('medical_size')}">&nbsp;&nbsp;${esc(k)}：${esc(v)}</div>`));
      if (it.refunded_qty) rows.push(`<div>&nbsp;&nbsp;已退 ${it.refunded_qty}</div>`);
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

  function printReceipt(r) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      const doc = f.contentWindow.document;
      doc.open(); doc.write(receiptHtml(r)); doc.close();
      const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => { f.remove(); resolve(); }, 1000); };
      const imgs = doc.images;
      if (!imgs.length) return setTimeout(go, 50);
      let n = 0; const done = () => { if (++n >= imgs.length) go(); };
      Array.from(imgs).forEach(i => { if (i.complete) done(); else { i.onload = done; i.onerror = done; } });
    });
  }

  // 提示音（不依赖音频文件）
  function beep(times = 2) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

  window.Shouyin = { api, yuan, toFen, rid, today, esc, receiptHtml, printReceipt, beep, speak };
})();
