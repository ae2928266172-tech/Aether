// 门店收银键盘操作：扫码枪识别 + 快捷键名称。纯函数，网页和测试共用。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShouyinKeys = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 扫码枪就是“打字很快的键盘”：一串字符每个间隔不超过 maxGap 毫秒，最后跟回车。
  // 人手打字间隔一般 > 80ms，所以慢慢打的字不会被当成条码。
  function createScanDetector(opts) {
    const o = Object.assign({ minLen: 4, maxGap: 45 }, opts || {});
    let buf = '', last = 0;
    return {
      // 每个可打印字符调用一次；返回当前这一串是否仍像在扫码
      key(ch, t) {
        if (!buf || t - last > o.maxGap) buf = '';
        buf += ch; last = t;
        return buf.length >= 2;
      },
      // 回车时调用：像扫码就返回条码，否则返回 null
      enter(t) {
        const code = buf;
        const ok = code.length >= o.minLen && t - last <= o.maxGap * 3;
        buf = '';
        return ok ? code : null;
      },
      reset() { buf = ''; },
      get buffer() { return buf; },
    };
  }

  // 键盘事件 → 快捷键名，例如 "F2"、"Ctrl+Delete"、"Alt+1"、"+"
  function combo(e) {
    let k = e.key;
    if (k === 'Add') k = '+';
    if (k === 'Subtract') k = '-';
    if (k === ' ' || k === 'Spacebar') k = 'Space';
    if (k === 'Esc') k = 'Escape';
    if (k === 'Del') k = 'Delete';
    if (k === 'Up') k = 'ArrowUp';
    if (k === 'Down') k = 'ArrowDown';
    if (k && k.length === 1 && /[a-z]/.test(k)) k = k.toUpperCase();
    // Alt+数字在部分键盘布局下 key 不是数字，用 code 兜底
    if (e.altKey && /^Digit\d$/.test(e.code || '')) k = e.code.slice(5);
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey && k && k.length > 1 && k !== 'Shift') mods.push('Shift');
    return mods.concat([k]).join('+');
  }

  // 单个可打印字符（会进输入框的字）
  const printable = (e) => !!e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;

  // 收银页快捷键说明（界面底部提示条和帮助里用同一份）
  const POS_KEYS = [
    ['F1', '搜索 / 扫码'], ['Enter', '空框时收款'], ['F2', '收款'], ['↑ ↓', '选商品'], ['+ −', '加减数量'],
    ['F6', '改数量'], ['Delete', '删除'], ['F3', '挂单'], ['F4', '取单'], ['F7', '备注'], ['F8', '补打上一单'],
    ['F9', '开钱箱'], ['Ctrl+Delete', '清空'], ['Esc', '清空搜索'],
  ];
  const PAY_KEYS = [['F1', '现金'], ['F2', '微信'], ['F3', '支付宝'], ['F4', '其他'], ['Enter', '确认收款'], ['Esc', '取消']];
  const TAB_KEYS = [['Alt+1', '收银'], ['Alt+2', '订单'], ['Alt+3', '交班'], ['Alt+4', '库存'], ['Alt+5', '要货']];

  return { createScanDetector, combo, printable, POS_KEYS, PAY_KEYS, TAB_KEYS };
});
