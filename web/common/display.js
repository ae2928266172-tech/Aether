// 顾客副屏的消息通道：收银页把当前购物车、应付、实收找零发给副屏页（/web/display/）。
// 两个页面在同一台电脑、同一个地址下打开（桌面软件的两个窗口，或同一个浏览器的两个窗口），用 BroadcastChannel 互通，不经过服务器。
(function (root) {
  const NAME = 'shouyin-display';
  const DONE_MS = 8000;  // 收款成功画面停留多久回到欢迎画面

  // 购物车行 → 副屏显示的行（金额都是分）
  const lines = (cart) => (cart || []).map(l => ({ name: l.name, sku: l.sku && l.sku !== '默认' ? l.sku : '', qty: l.qty, price: l.price, amount: l.qty * l.price }));

  // 根据收银页当前状态算出副屏该显示什么：idle 欢迎 / cart 购物明细 / pay 收款中 / done 收款成功
  function compose({ cart, pay, done }) {
    if (cart && cart.length) {
      const ls = lines(cart);
      const s = { mode: 'cart', lines: ls, count: ls.reduce((a, l) => a + l.qty, 0), total: ls.reduce((a, l) => a + l.amount, 0) };
      if (pay) Object.assign(s, { mode: 'pay', discount: pay.discount || 0, payable: pay.payable, method: pay.method || '', received: pay.received == null ? null : pay.received,
        change: pay.received != null && pay.received >= pay.payable ? pay.received - pay.payable : 0 });
      return s;
    }
    if (done) return { mode: 'done', payable: done.payable, received: done.received, change: done.change || 0, method: done.method || '' };
    return { mode: 'idle' };
  }

  // 收银页用：send(状态) 发给所有副屏；副屏后打开时会发 hello，这边重发一遍当前状态
  function createSender() {
    const ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NAME) : null;
    let store = '', last = { mode: 'idle' }, lastKey = '';
    const post = () => { if (ch) try { ch.postMessage({ type: 'state', state: { ...last, store } }); } catch (e) {} };
    if (ch) ch.onmessage = (e) => { if (e.data && e.data.type === 'hello') post(); };
    return {
      send(s) {
        const k = JSON.stringify(s);
        if (k === lastKey) return;  // 内容没变不重发
        lastKey = k; last = s.mode === 'done' ? { ...s, at: Date.now() } : s; post();
      },
      setStore(n) { n = n || ''; if (n !== store) { store = n; post(); } },
    };
  }

  const api = { NAME, DONE_MS, lines, compose, createSender };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShouyinDisplay = Object.assign(api, { sender: createSender() });
})(typeof window !== 'undefined' ? window : globalThis);
