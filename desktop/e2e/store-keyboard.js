// 门店工作台键盘收银 + 桌面出票的浏览器测试（模拟桌面软件的 window.ShouyinDesktop）。
// 用法：先启动服务端并写入演示数据（backend/scripts/demo_data.py），然后
//   node desktop/e2e/store-keyboard.js http://127.0.0.1:8765
const assert = require('assert');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 800 } });
  const logs = [];
  p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('ERR ' + e.message));
  await p.addInitScript(() => {
    window.__calls = [];
    window.ShouyinDesktop = { info: () => ({ version: '1.0.0', server: 'test', printer: 'POS58', printMode: 'raw', drawer: true, paperWidth: 58 }),
      printRaw: async (b64) => { window.__calls.push(['raw', b64.length]); }, printHtml: async () => window.__calls.push(['html']),
      openDrawer: async () => window.__calls.push(['drawer']), testPrint: async () => window.__calls.push(['test']), openSettings: () => window.__calls.push(['settings']) };
  });
  await p.goto(BASE + '/web/store/');
  await p.fill('input[placeholder=账号]', 'store1'); await p.fill('input[placeholder=密码]', 'store123'); await p.keyboard.press('Enter');
  await p.waitForSelector('.card'); await p.waitForTimeout(500);
  const cart = () => p.$$eval('.line', ls => ls.map(l => l.querySelector('.info div').textContent + ' x' + l.querySelector('input').value));
  await p.click('.cart-head b');  // 焦点离开输入框
  await p.keyboard.type('6901000000031', { delay: 5 }); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.deepStrictEqual(await cart(), ['纸杯 x1'], '焦点不在输入框时扫码');
  await p.keyboard.press('Escape'); await p.click('.cart-head b'); await p.keyboard.press('+'); await p.waitForTimeout(100);
  assert.deepStrictEqual(await cart(), ['纸杯 x2'], '+ 加数量');
  await p.click('input[placeholder^=备注]'); await p.keyboard.type('6901000000041', { delay: 5 }); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.deepStrictEqual(await cart(), ['纸杯 x2', '湿巾 x1'], '备注框里扫码');
  assert.strictEqual(await p.inputValue('input[placeholder^=备注]'), '', '条码不写进备注');
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('Delete'); await p.waitForTimeout(100);
  assert.deepStrictEqual(await cart(), ['湿巾 x1'], '↑ Delete 删除');
    await p.keyboard.press('F2'); await p.waitForSelector('.paybox', { state: 'visible' }); await p.waitForTimeout(500);
  await p.keyboard.press('F2'); await p.waitForTimeout(100);
  assert.match(await p.$eval('.paybox .m.on', e => e.textContent), /微信/, '收款框 F2 选微信');
  await p.keyboard.press('F1'); await p.waitForTimeout(200); await p.keyboard.type('50'); 
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  assert.ok(await p.isVisible('text=收款成功'), '回车确认收款');
  const calls = await p.evaluate(() => window.__calls);
  assert.deepStrictEqual(calls.map(c => c[0]).sort(), ['drawer', 'raw'], '现金弹钱箱 + 直接出票');
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.ok(!(await p.isVisible('text=收款成功')), '回车关闭成功框');
  assert.match(await p.evaluate(() => document.activeElement.placeholder || ''), /扫条码/, '回到搜索框');
  await p.keyboard.type('6901000000051', { delay: 5 }); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  assert.ok(await p.isVisible('.paybox'), '空搜索框回车打开收款');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.keyboard.press('F3'); await p.waitForTimeout(300); assert.deepStrictEqual(await cart(), [], 'F3 挂单');
  await p.keyboard.press('F4'); await p.waitForTimeout(400); await p.keyboard.press('1'); await p.waitForTimeout(400); assert.deepStrictEqual(await cart(), ['矿泉水 x1'], 'F4 + 数字键取单');
  await p.keyboard.type('6901000000011'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  assert.deepStrictEqual(await cart(), ['矿泉水 x1', '一次性护理垫 x1'], '搜索框里扫码');
  await p.keyboard.press('Alt+2'); await p.waitForTimeout(500);
  assert.match(await p.$eval('.tab.on', e => e.textContent), /订单/, 'Alt+2 切到订单');
  assert.deepStrictEqual(logs.filter(l => /^ERR/.test(l)), [], '页面没有报错');
  console.log('门店键盘收银测试通过');
  await b.close();
})();
