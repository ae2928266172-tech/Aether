// 屏幕键盘的触摸测试：登录、搜索框弹字母键盘、收款框弹数字键盘、确认键收款。
// 用法：先启动服务端并写入演示数据，然后 node desktop/e2e/store-osk.js http://127.0.0.1:8765
const assert = require('assert');
const { chromium } = require('playwright');
(async () => {
  const B = process.argv[2] || 'http://127.0.0.1:8765';
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/web/store/');
  await p.tap('input[placeholder=账号]'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('.osk-full'), '点账号框弹字母键盘');
  const tapKeys = async (s) => { for (const ch of s) await p.tap(`.osk [data-k="${ch}"]`); };
  await tapKeys('store1');
  await p.tap('input[type=password]'); await tapKeys('store123');
  await p.tap('.osk [data-k="enter"]'); await p.waitForSelector('.card'); await p.waitForTimeout(500);
  assert.ok(!(await p.isVisible('.osk')), '登录后键盘收起');
  // 点商品卡（触摸），键盘不应弹出
  await p.tap('.card:has-text("湿巾")'); await p.waitForTimeout(400);
  assert.ok(!(await p.isVisible('.osk')), '点商品不弹键盘');
  // 搜索框在商品区下方，旁边是固定的字母数字键盘；点搜索框不再弹浮动键盘
  const grid = await p.locator('.grid').boundingBox(), scanBox = await p.locator('.scan').boundingBox(), kbBox = await p.locator('.kb').boundingBox();
  assert.ok(scanBox.y > grid.y + grid.height - 1, '搜索框在商品区下方');
  assert.ok(kbBox.x > scanBox.x + scanBox.width - 1 && Math.abs(kbBox.y - scanBox.y) < 4, '固定键盘在搜索框旁边');
  await p.tap('.scan input'); await p.waitForTimeout(300);
  assert.ok(!(await p.isVisible('.osk')), '点搜索框不弹浮动键盘');
  for (const ch of 'zb') await p.tap(`.kb [data-k="${ch}"]`);
  await p.waitForTimeout(300);
  assert.strictEqual(await p.inputValue('.scan input'), 'zb');
  assert.ok(await p.evaluate(() => document.activeElement === document.querySelector('.scan input')), '按固定键盘后光标仍在搜索框');
  await p.tap('.kb [data-k="enter"]'); await p.waitForTimeout(400);
  assert.deepStrictEqual(await p.$$eval('.line .info div:first-child', e => e.map(x => x.textContent)), ['湿巾', '纸杯'], '确认键 = 回车');
  for (const ch of 'abc') await p.tap(`.kb [data-k="${ch}"]`);
  await p.tap('.kb [data-k="back"]');
  assert.strictEqual(await p.inputValue('.scan input'), 'ab', '退格');
  await p.tap('.kb [data-k="clear"]');
  assert.strictEqual(await p.inputValue('.scan input'), '', '清空');
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/pos-kb.png' });
  // 触摸屏默认不显示 F1、F2 这类快捷键提示
  assert.ok(!(await p.isVisible('.keys')) && !(await p.isVisible('.paybtn kbd')), '默认隐藏快捷键提示');
  // 功能按钮：挂单、取单
  await p.tap('.fb:has-text("挂单")'); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('.line').count(), 0, '挂单后购物车清空');
  await p.tap('.fb:has-text("取单")'); await p.waitForSelector('.held'); await p.tap('.held .el-button--primary'); await p.waitForTimeout(400);
  assert.strictEqual(await p.locator('.line').count(), 2, '取单取回');
  // 删除按钮、加减按钮
  await p.tap('.line:nth-child(1) .qty button:last-child'); await p.waitForTimeout(100);
  assert.strictEqual(await p.inputValue('.line:nth-child(1) .qty input'), '2', '＋ 按钮');
  // 备注（文字）弹浮动键盘，停在订单栏底部，收款按钮在键盘上方
  await p.tap('.fb:has-text("备注")'); await p.waitForTimeout(500);
  await p.tap('.el-dialog input[placeholder^=例如]'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('.osk-full'), '点备注弹浮动键盘');
  const kb = await p.locator('.osk').boundingBox(), side = await p.locator('.pos-right').boundingBox();
  assert.ok(kb.x >= side.x - 1 && kb.x + kb.width <= side.x + side.width + 1, '键盘不越过订单栏左边');
  const payBtn = await p.locator('.paybtn').boundingBox();
  assert.ok(payBtn.y + payBtn.height <= kb.y + 1, '收款按钮在键盘上方');
  // 拖动横条换位置，下次弹出还在那里；双击横条回到默认位置
  const bar = await p.locator('.osk-bar').boundingBox();
  await p.mouse.move(bar.x + bar.width / 2, bar.y + 8); await p.mouse.down();
  await p.mouse.move(400, 300, { steps: 5 }); await p.mouse.up();
  const moved = await p.locator('.osk').boundingBox();
  assert.ok(Math.abs(moved.y - 292) < 3, '拖到新位置');
  await p.tap('.osk [data-k="hide"]'); await p.waitForTimeout(200);
  await p.tap('.el-dialog input[placeholder^=例如]'); await p.waitForTimeout(300);
  const again = await p.locator('.osk').boundingBox();
  assert.ok(Math.abs(again.x - moved.x) < 3 && Math.abs(again.y - moved.y) < 3, '记住拖动后的位置');
  await p.dblclick('.osk-bar'); await p.waitForTimeout(200);
  const back = await p.locator('.osk').boundingBox();
  assert.ok(Math.abs(back.x - side.x) < 2, '双击回到订单栏底部');
  await p.tap('.osk [data-k="hide"]'); await p.waitForTimeout(200);
  await p.tap('.chips .chip:has-text("加急")'); await p.tap('.el-dialog__footer .el-button--primary'); await p.waitForTimeout(400);
  assert.match(await p.textContent('.sum .rmk'), /加急/, '备注快捷词');
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/pos-touch.png' });
  // 收款框：内置数字键盘，不弹浮动键盘
  await p.tap('.paybtn'); await p.waitForSelector('.paybox', { state: 'visible' }); await p.waitForTimeout(500);
  const recv = '.pay-r .field.big input';
  await p.tap('.pad [data-k="5"]'); await p.tap('.pad [data-k="0"]'); await p.tap('.pad [data-k="0"]'); await p.tap('.pad [data-k="back"]');
  assert.strictEqual(await p.inputValue(recv), '50', '内置数字键盘输入实收');
  assert.ok(!(await p.isVisible('.osk')), '收款框不弹浮动键盘');
  assert.match(await p.textContent('.paybox .change b'), /35\.00/, '找零');
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/pay-touch.png' });
  await p.tap('.pad [data-k="ok"]'); await p.waitForTimeout(1200);
  assert.ok(await p.isVisible('text=收款成功'), '数字键盘“收款”键确认收款');
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/done-touch.png' });
  assert.deepStrictEqual(errs, []);
  console.log('屏幕键盘测试通过');
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
