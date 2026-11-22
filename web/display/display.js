// 顾客副屏：接收收银页发来的状态并显示。收银页没打开、或很久没有消息时显示欢迎画面。
(function () {
  const D = ShouyinDisplay;
  const $ = (id) => document.getElementById(id);
  const money = (f) => ((f || 0) / 100).toFixed(2);
  const yuan = (f) => '¥' + money(f);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const METHODS = { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' };
  const WEEK = '日一二三四五六';
  let prev = [], doneTimer = null;

  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date(), date = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`, time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('clock').textContent = `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}　${time}`;
    $('bigTime').textContent = time; $('bigDate').textContent = date;
  };
  tick(); setInterval(tick, 5000);

  function setMode(m) { $('screen').className = 'mode-' + m; }

  function renderRows(lines) {
    const key = (l) => l.name + '|' + l.sku;
    const before = new Map(prev.map(l => [key(l), l.qty]));
    const box = $('rows');
    box.innerHTML = lines.map(l => {
      const changed = before.get(key(l)) !== l.qty;
      return `<div class="row${changed ? ' new' : ''}"><div class="n">${esc(l.name)}${l.sku ? `<span class="sku">${esc(l.sku)}</span>` : ''}</div>`
        + `<div class="p">${yuan(l.price)}<span class="q">× ${l.qty}</span></div><div class="a">${yuan(l.amount)}</div></div>`;
    }).join('');
    prev = lines;
    // 放不下时让最近变动的那一行露出来（一般是最后加的）
    const rows = [...box.querySelectorAll('.row')], hit = rows.filter(r => r.classList.contains('new')).pop() || rows[rows.length - 1];
    if (hit) box.scrollTop = Math.max(0, hit.offsetTop + hit.offsetHeight - box.clientHeight + 8);
  }

  function render(s) {
    const store = s.store || '', addr = s.address || '';
    $('title').textContent = addr ? store + ' · ' + addr : store;
    $('idleName').textContent = store; $('idleAddr').textContent = addr;
    clearTimeout(doneTimer);
    if (s.mode === 'cart' || s.mode === 'pay') {
      setMode(s.mode);
      renderRows(s.lines || []);
      const pay = s.mode === 'pay';
      $('count').textContent = `共 ${s.count} 件`;
      const disc = pay && s.discount > 0;
      $('origRow').style.display = disc ? '' : 'none';
      $('orig').textContent = '原价 ' + yuan(s.total); $('cut').textContent = '立减 ' + yuan(s.discount);
      $('dueLabel').textContent = pay ? '应付金额' : '合计';
      $('due').innerHTML = '<small>¥</small>' + money(pay ? s.payable : s.total);
      $('pill').textContent = !pay ? '正在为您结算' : s.method === 'cash' ? '等待支付' : s.method === 'wechat' || s.method === 'alipay' ? '请出示付款码' : '等待支付';
      const cash = pay && s.method === 'cash' && s.received != null;
      $('cashBox').classList.toggle('on', cash);
      $('recv').textContent = yuan(s.received);
      $('chg').textContent = yuan(s.change);
      return;
    }
    prev = [];
    if (s.mode === 'done' && (!s.at || Date.now() - s.at < D.DONE_MS)) {
      setMode('done');
      const m = METHODS[s.method] ? METHODS[s.method] + '支付　' : '';
      $('doneText').textContent = m + '实付 ' + yuan(s.payable) + (s.received && s.received !== s.payable ? '　实收 ' + yuan(s.received) : '');
      $('doneChg').textContent = yuan(s.change);
      $('doneChgBox').classList.toggle('off', !s.change);
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
