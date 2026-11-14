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
  function receiptHtml(r) {
    const w = r.paper_width === 80 ? 72 : 48; // 可打印宽度 mm
    const rows = [];
    r.head.forEach((h, i) => rows.push(`<div class="c ${i === 0 ? 'b big' : ''}">${esc(h)}</div>`));
    rows.push('<div class="hr"></div>');
    r.info.forEach(([k, v]) => rows.push(`<div>${k ? esc(k) + '：' : ''}${esc(v)}</div>`));
    rows.push('<div class="hr"></div>');
    r.items.forEach(it => {
      rows.push(`<div class="b">${esc(it.name)}</div>`);
      rows.push(`<div class="lr"><span>&nbsp;&nbsp;${it.qty}${esc(it.unit)}${it.unit_price ? ' × ' + it.unit_price : ''}</span><span>${it.amount}</span></div>`);
      (it.medical || []).forEach(([k, v]) => rows.push(`<div class="s">&nbsp;&nbsp;${esc(k)}：${esc(v)}</div>`));
      if (it.refunded_qty) rows.push(`<div class="s">&nbsp;&nbsp;已退 ${it.refunded_qty}</div>`);
    });
    rows.push('<div class="hr"></div>');
    r.totals.forEach(([k, v]) => rows.push(`<div class="lr ${k === '应收' ? 'b' : ''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`));
    if (r.remark) rows.push(`<div>备注：${esc(r.remark)}</div>`);
    rows.push('<div class="hr"></div>');
    r.footer.forEach(f => rows.push(`<div class="c">${esc(f)}</div>`));
    if (r.footer_image) rows.push(`<div class="c"><img src="${esc(r.footer_image)}" style="width:${Math.round(w * 0.6)}mm"></div>`);
    const page = `<div class="page">${rows.join('')}</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${r.paper_width}mm auto; margin: 0; }
      body { margin: 0; font-family: "Microsoft YaHei", "SimHei", sans-serif; font-size: 12px; color: #000; }
      .page { width: ${w}mm; padding: 2mm ${(r.paper_width - w) / 2}mm 6mm; page-break-after: always; }
      .c { text-align: center; } .b { font-weight: bold; } .big { font-size: 15px; } .s { font-size: 10px; }
      .lr { display: flex; justify-content: space-between; gap: 4px; }
      .hr { border-top: 1px dashed #000; margin: 3px 0; }
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
