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
  // 触摸搜索框 → 字母键盘
  await p.tap('.scan input'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('.osk-full'), '点搜索框弹字母键盘');
  // 字母键盘停在右侧订单栏底部：不挡左边商品区，收款按钮在键盘上方
  const kb = await p.locator('.osk').boundingBox(), side = await p.locator('.pos-right').boundingBox();
  assert.ok(kb.x >= side.x - 1 && kb.x + kb.width <= side.x + side.width + 1, '键盘不越过订单栏左边');
  const payBtn = await p.locator('.pos-right .btns .el-button--primary').boundingBox();
  assert.ok(payBtn.y + payBtn.height <= kb.y + 1, '收款按钮在键盘上方');
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/osk-dock.png' });
  await tapKeys('zb'); await p.waitForTimeout(300);
  assert.strictEqual(await p.inputValue('.scan input'), 'zb');
  await p.tap('.osk [data-k="enter"]'); await p.waitForTimeout(400);
  assert.deepStrictEqual(await p.$$eval('.line .info div:first-child', e => e.map(x => x.textContent)), ['湿巾', '纸杯'], '确认键 = 回车');
  // 拖动横条换位置，下次弹出还在那里；双击横条回到默认位置
  const bar = await p.locator('.osk-bar').boundingBox();
  await p.mouse.move(bar.x + bar.width / 2, bar.y + 8); await p.mouse.down();
  await p.mouse.move(400, 300, { steps: 5 }); await p.mouse.up();
  const moved = await p.locator('.osk').boundingBox();
  assert.ok(Math.abs(moved.y - 292) < 3, '拖到新位置');
  await p.tap('.osk [data-k="hide"]'); await p.waitForTimeout(200);
  await p.tap('.scan input'); await p.waitForTimeout(300);
  const again = await p.locator('.osk').boundingBox();
  assert.ok(Math.abs(again.x - moved.x) < 3 && Math.abs(again.y - moved.y) < 3, '记住拖动后的位置');
  await p.dblclick('.osk-bar'); await p.waitForTimeout(200);
  const back = await p.locator('.osk').boundingBox();
  assert.ok(Math.abs(back.x - side.x) < 2, '双击回到订单栏底部');
    await p.tap('.osk [data-k="hide"]'); await p.waitForTimeout(200);
  // 收款：数字键盘
  await p.tap('text=收款　F2 / Enter'); await p.waitForSelector('.paybox', { state: 'visible' }); await p.waitForTimeout(500);
  await p.tap('.paybox input[placeholder^=不填按应收]'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('.osk-num'), '收款框弹数字键盘');
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] + '/osk-num.png' });
  await tapKeys('2'); await p.tap('.osk [data-k="0"]');
  assert.strictEqual(await p.inputValue('.paybox input[placeholder^=不填按应收]'), '20');
    await p.tap('.osk [data-k="enter"]'); await p.waitForTimeout(1200);
  assert.ok(await p.isVisible('text=收款成功'), '数字键盘确认收款');
  assert.deepStrictEqual(errs, []);
  console.log('屏幕键盘测试通过');
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
