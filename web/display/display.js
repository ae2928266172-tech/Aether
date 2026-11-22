// 顾客副屏：接收收银页发来的状态并显示。收银页没打开、或很久没有消息时显示欢迎画面。
(function () {
  const D = ShouyinDisplay;
  const $ = (id) => document.getElementById(id);
  const yuan = (f) => '¥' + ((f || 0) / 100).toFixed(2);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const METHODS = { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' };
  let prev = [], doneTimer = null;

  const tick = () => { const d = new Date(); $('clock').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  tick(); setInterval(tick, 10000);

  function setMode(m) { $('screen').className = 'mode-' + m; }

  function renderRows(lines) {
    const key = (l) => l.name + '|' + l.sku;
    const before = new Map(prev.map(l => [key(l), l.qty]));
    const box = $('rows');
    box.innerHTML = lines.map(l => {
      const changed = before.get(key(l)) !== l.qty;
      return `<div class="row${changed ? ' new' : ''}"><div class="n">${esc(l.name)}${l.sku ? `<span class="sku">${esc(l.sku)}</span>` : ''}</div>`
        + `<div class="q">×${l.qty}</div><div class="a">${yuan(l.amount)}</div></div>`;
    }).join('');
    prev = lines;
    // 放不下时让最近变动的那一行露出来（一般是最后加的）
    const rows = box.querySelectorAll('.row'), hit = box.querySelector('.row.new') ? [...rows].filter(r => r.classList.contains('new')).pop() : rows[rows.length - 1];
    if (hit) box.scrollTop = Math.max(0, hit.offsetTop + hit.offsetHeight - box.clientHeight + 8);
  }

  function render(s) {
    const store = s.store || '';
    $('store').textContent = store; $('storeBig').textContent = store;
    clearTimeout(doneTimer);
    if (s.mode === 'cart' || s.mode === 'pay') {
      setMode(s.mode);
      renderRows(s.lines || []);
      $('count').textContent = s.count + ' 件';
      $('total').textContent = yuan(s.total);
      const pay = s.mode === 'pay';
      $('discRow').style.display = pay && s.discount ? '' : 'none';
      $('disc').textContent = '−' + yuan(s.discount);
      $('dueLabel').textContent = pay ? '应付' : '合计';
      $('due').textContent = yuan(pay ? s.payable : s.total);
      const cash = pay && s.method === 'cash' && s.received != null;
      $('cashBox').classList.toggle('on', cash);
      $('recv').textContent = yuan(s.received);
      $('chg').textContent = yuan(s.change);
      return;
    }
    prev = [];
    if (s.mode === 'done' && (!s.at || Date.now() - s.at < D.DONE_MS)) {
      setMode('done');
      const m = METHODS[s.method] ? METHODS[s.method] + '　' : '';
      $('doneText').textContent = m + '应付 ' + yuan(s.payable) + (s.received && s.received !== s.payable ? '　实收 ' + yuan(s.received) : '');
      $('doneChg').textContent = s.change ? '找零 ' + yuan(s.change) : '';
      doneTimer = setTimeout(() => setMode('idle'), s.at ? Math.max(1000, D.DONE_MS - (Date.now() - s.at)) : D.DONE_MS);
      return;
    }
    setMode('idle');
  }

  if (typeof BroadcastChannel === 'function') {
    const ch = new BroadcastChannel(D.NAME);
    ch.onmessage = (e) => { if (e.data && e.data.type === 'state' && e.data.state) render(e.data.state); };
    ch.postMessage({ type: 'hello' });  // 收银页先打开的话，请它把当前状态再发一遍
  }
  window.__render = render;  // 测试用
})();
