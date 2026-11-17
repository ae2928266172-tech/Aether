// 门店工作台键盘逻辑（web/store/keys.js）
const test = require('node:test');
const assert = require('node:assert');
const { createScanDetector, combo, printable } = require('../../web/store/keys.js');

const feed = (d, s, start, gap) => { let t = start; for (const ch of s) { d.key(ch, t); t += gap; } return t - gap; };

test('扫码枪：快速连串 + 回车识别为条码', () => {
  const d = createScanDetector();
  const t = feed(d, '6901234567890', 1000, 8);
  assert.strictEqual(d.enter(t + 10), '6901234567890');
  assert.strictEqual(d.buffer, '');
});

test('人手慢慢打字不算扫码', () => {
  const d = createScanDetector();
  const t = feed(d, 'zbbz', 1000, 150);
  assert.strictEqual(d.enter(t + 120), null);
});

test('先慢打几个字再扫码：只取扫码那一串', () => {
  const d = createScanDetector();
  let t = feed(d, '备注', 1000, 300);
  t = feed(d, '690001', t + 400, 5);
  assert.strictEqual(d.enter(t + 5), '690001');
});

test('太短的不算条码；回车来得太晚也不算', () => {
  const d = createScanDetector();
  let t = feed(d, '12', 0, 5);
  assert.strictEqual(d.enter(t + 5), null);
  t = feed(d, '123456', 1000, 5);
  assert.strictEqual(d.enter(t + 1000), null);
});

test('快捷键名称', () => {
  assert.strictEqual(combo({ key: 'F2' }), 'F2');
  assert.strictEqual(combo({ key: 'Delete', ctrlKey: true }), 'Ctrl+Delete');
  assert.strictEqual(combo({ key: '¡', code: 'Digit1', altKey: true }), 'Alt+1');
  assert.strictEqual(combo({ key: '+', shiftKey: true }), '+');
  assert.strictEqual(combo({ key: 'Add' }), '+');
  assert.strictEqual(combo({ key: 'Esc' }), 'Escape');
  assert.strictEqual(combo({ key: 'a' }), 'A');
  assert.strictEqual(combo({ key: 'Tab', shiftKey: true }), 'Shift+Tab');
  assert.ok(printable({ key: '6' }) && !printable({ key: 'F1' }) && !printable({ key: 'c', ctrlKey: true }));
});
