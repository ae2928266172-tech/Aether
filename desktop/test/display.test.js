// 顾客副屏：收银页发给副屏的内容（web/common/display.js）和桌面软件选副屏、地址限制（src/config.js）
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../web/common/display.js');
const config = require('../src/config');

const cart = [
  { sku_id: 1, name: '湿巾', sku: '默认', price: 350, qty: 2 },
  { sku_id: 2, name: '纸杯', sku: '50 只', price: 800, qty: 1 },
];

test('没有商品时显示欢迎画面', () => {
  assert.deepStrictEqual(D.compose({ cart: [] }), { mode: 'idle' });
  assert.deepStrictEqual(D.compose({}), { mode: 'idle' });
});

test('购物明细：规格“默认”不显示，金额按分计算', () => {
  const s = D.compose({ cart });
  assert.strictEqual(s.mode, 'cart');
  assert.deepStrictEqual(s.lines, [
    { name: '湿巾', sku: '', qty: 2, price: 350, amount: 700 },
    { name: '纸杯', sku: '50 只', qty: 1, price: 800, amount: 800 },
  ]);
  assert.strictEqual(s.count, 3);
  assert.strictEqual(s.total, 1500);
});

test('收款中：显示应付、优惠、实收和找零', () => {
  const s = D.compose({ cart, pay: { payable: 1300, discount: 200, method: 'cash', received: 2000 } });
  assert.strictEqual(s.mode, 'pay');
  assert.strictEqual(s.payable, 1300);
  assert.strictEqual(s.discount, 200);
  assert.strictEqual(s.change, 700);
  // 实收还没填够：不显示负的找零
  assert.strictEqual(D.compose({ cart, pay: { payable: 1300, method: 'cash', received: 1000 } }).change, 0);
  // 微信付款没有实收
  const w = D.compose({ cart, pay: { payable: 1500, method: 'wechat', received: null } });
  assert.strictEqual(w.received, null);
  assert.strictEqual(w.change, 0);
});

test('收款成功：购物车清空后显示收款成功；又加了商品就回到明细', () => {
  const done = { payable: 1500, received: 2000, change: 500, method: 'cash' };
  assert.deepStrictEqual(D.compose({ cart: [], done }), { mode: 'done', payable: 1500, received: 2000, change: 500, method: 'cash' });
  assert.strictEqual(D.compose({ cart, done }).mode, 'cart');
});

test('桌面软件：副屏选收银窗口以外的那块屏，只有一块屏不打开', () => {
  const a = { id: 1, bounds: { x: 0, y: 0, width: 1366, height: 768 } }, b = { id: 2, bounds: { x: 1366, y: 0, width: 1024, height: 768 } };
  assert.strictEqual(config.pickDisplay([a, b], 1), b);
  assert.strictEqual(config.pickDisplay([a, b], 2), a);
  assert.strictEqual(config.pickDisplay([a], 1), null);
  assert.strictEqual(config.pickDisplay([], 1), null);
});

test('桌面软件：副屏窗口只能打开副屏页面；副屏默认开启，可以关闭', () => {
  const s = 'http://192.168.31.10:8765';
  assert.strictEqual(config.displayUrl(s), s + '/web/display/');
  assert.ok(config.isDisplayPage(s, s + '/web/display/'));
  assert.ok(!config.isDisplayPage(s, s + '/web/store/'));
  assert.ok(!config.isDisplayPage(s, 'http://evil.example/web/display/'));
  assert.ok(!config.isStorePage(s, s + '/web/display/'), '副屏页面拿不到收银页的桌面功能（打印、开钱箱）');
  assert.strictEqual(config.normalize({}).customerDisplay, true);
  assert.strictEqual(config.normalize({ customerDisplay: false }).customerDisplay, false);
});
