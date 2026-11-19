// 触摸屏收银测试：登录键盘、拼音搜索键盘、数字键盘改数量、备注弹键盘、收款框数字键盘。
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
  // 点“搜索”在商品区底部出拼音键盘；点搜索框本身不弹浮动键盘
  await p.tap('.tool-btn'); await p.waitForTimeout(300);
  const grid = await p.locator('.grid').boundingBox(), kbBox = await p.locator('.kb').boundingBox();
  assert.ok(kbBox.y >= grid.y + grid.height - 1, '拼音键盘在商品区下方');
  await p.tap('.scan input'); await p.waitForTimeout(300);
  assert.ok(!(await p.isVisible('.osk')), '点搜索框不弹浮动键盘');
  for (const ch of 'zb') await p.tap(`.kb [data-k="${ch}"]`);
  await p.waitForTimeout(300);
  assert.strictEqual(await p.inputValue('.scan input'), 'zb');
  await p.tap('.kb [data-k="enter"]'); await p.waitForTimeout(400);
  assert.deepStrictEqual(await p.$$eval('.line .ln', e => e.map(x => x.textContent)), ['湿巾', '纸杯'], '确定键 = 回车');
  for (const ch of 'abc') await p.tap(`.kb [data-k="${ch}"]`);
  await p.tap('.kb [data-k="back"]');
  assert.strictEqual(await p.inputValue('.scan input'), 'ab', '退格');
  await p.tap('.kb [data-k="clear"]');
  assert.strictEqual(await p.inputValue('.scan input'), '', '清空');
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/pos-kb.png' });
  // 点数量弹数字键盘改数量
  await p.tap('.line .qn >> nth=0'); await p.waitForSelector('.qty-dlg', { state: 'visible' });
  await p.tap('.qty-dlg .np-k[data-k="3"]'); await p.tap('.qty-dlg .bigbtn.primary'); await p.waitForTimeout(300);
  assert.strictEqual(await p.textContent('.line .qn >> nth=0'), '3', '数字键盘改数量');
  // 备注弹框：直接弹浮动键盘，停在订单栏底部
  await p.tap('.act:has-text("备注")'); await p.waitForTimeout(500);
  assert.ok(await p.isVisible('.osk-full'), '打开备注弹浮动键盘');
  const kb = await p.locator('.osk').boundingBox(), side = await p.locator('.pos-right').boundingBox();
  assert.ok(kb.x >= side.x - 1 && kb.x + kb.width <= side.x + side.width + 1, '键盘不越过订单栏左边');
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
  await tapKeys('bed3'); await p.tap('.osk [data-k="enter"]'); await p.waitForTimeout(300);
  assert.match(await p.textContent('.remark-show'), /bed3/, '键盘确认 = 备注确定');
  // 收款：收款框里自带数字键盘
  await p.tap('.paybtn'); await p.waitForSelector('.paybox', { state: 'visible' }); await p.waitForTimeout(500);
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/pay.png' });
  await p.tap('.paybox .np-k[data-k="1"]'); await p.tap('.paybox .np-k[data-k="0"]'); await p.tap('.paybox .np-k[data-k="0"]');
  assert.match(await p.textContent('.paybox .field.on'), /100/, '数字键盘输实收');
  await p.tap('.paybox .bigbtn.primary'); await p.waitForTimeout(1200);
  assert.ok(await p.isVisible('text=收款成功'), '确认收款');
  assert.deepStrictEqual(errs, []);
  console.log('屏幕键盘测试通过');
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
