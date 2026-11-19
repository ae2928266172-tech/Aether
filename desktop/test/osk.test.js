// 屏幕键盘按键逻辑（web/store/osk.js）
const test = require('node:test');
const assert = require('node:assert');
const { applyKey } = require('../../web/store/osk.js');

test('在光标处输入、退格、清空', () => {
  assert.deepStrictEqual(applyKey('', 0, 0, '5'), { value: '5', caret: 1 });
  assert.deepStrictEqual(applyKey('12', 1, 1, '0'), { value: '102', caret: 2 });
  assert.deepStrictEqual(applyKey('50', 2, 2, '00'), { value: '5000', caret: 4 });
  assert.deepStrictEqual(applyKey('123', 3, 3, 'back'), { value: '12', caret: 2 });
  assert.deepStrictEqual(applyKey('123', 0, 0, 'back'), { value: '123', caret: 0 });
  assert.deepStrictEqual(applyKey('zbz', 0, 3, 'k'), { value: 'k', caret: 1 });   // 选中全部再打字 = 替换
  assert.deepStrictEqual(applyKey('abcd', 1, 3, 'back'), { value: 'ad', caret: 1 });
  assert.deepStrictEqual(applyKey('abc', 1, 1, 'clear'), { value: '', caret: 0 });
  assert.deepStrictEqual(applyKey(null, null, null, '7'), { value: '7', caret: 1 });
});
