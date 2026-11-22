// 顾客副屏：收银页加商品、收款时，副屏（/web/display/）同步显示明细、应付、找零，收款后显示收款成功再回欢迎画面。
// 用法：先启动服务端并写入演示数据，然后 node desktop/e2e/store-display.js http://127.0.0.1:8765 [截图目录]
const assert = require('assert');
const { chromium } = require('playwright');
(async () => {
  const B = process.argv[2] || 'http://127.0.0.1:8765', shots = process.argv[3];
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, hasTouch: true });
  const errs = [];
  // 副屏先打开（收银页还没登录）：欢迎画面
  const d = await ctx.newPage(); d.on('pageerror', e => errs.push(e.message));
  await d.setViewportSize({ width: 1024, height: 768 });
  await d.goto(B + '/web/display/');
  assert.strictEqual(await d.getAttribute('#screen', 'class'), 'mode-idle');
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/web/store/');
  await p.fill('input[placeholder=账号]', 'store1'); await p.fill('input[type=password]', 'store123');
  await p.click('.login-card .el-button--primary'); await p.waitForSelector('.card'); await p.waitForTimeout(400);
  const store = (await p.textContent('.ws-top .store > span:not(.mark)')).trim();
  assert.strictEqual(await d.textContent('#idleName'), store, '欢迎画面显示门店名');
  if (shots) await d.screenshot({ path: shots + '/副屏-欢迎.png' });
  // 加商品
  await p.tap('.card:has-text("湿巾")'); await p.tap('.card:has-text("湿巾")'); await p.waitForTimeout(300);
  assert.strictEqual(await d.getAttribute('#screen', 'class'), 'mode-cart');
  assert.strictEqual(await d.locator('.row').count(), 1);
  assert.strictEqual((await d.textContent('.row .q')).trim(), '× 2');
  const total = await d.textContent('#due');
  assert.ok(/^¥\d+\.\d\d$/.test(total), '合计 ' + total);
  await p.tap('.card:has-text("纸杯")'); await p.waitForTimeout(300);
  assert.strictEqual(await d.locator('.row').count(), 2);
  // 副屏后打开（比如刚插上）：也能马上拿到当前购物车
  const d2 = await ctx.newPage(); await d2.goto(B + '/web/display/'); await d2.waitForTimeout(300);
  assert.strictEqual(await d2.locator('.row').count(), 2, '后打开的副屏拿到当前状态'); await d2.close();
  if (shots) await d.screenshot({ path: shots + '/副屏-购物明细.png' });
  // 收款：现金实收 100
  await p.tap('.paybtn'); await p.waitForSelector('.paybox .pay-ok'); await p.waitForTimeout(500);
  assert.strictEqual(await d.getAttribute('#screen', 'class'), 'mode-pay');
  assert.strictEqual(await d.textContent('#dueLabel'), '应付金额');
  assert.strictEqual(await d.textContent('#pill'), '等待支付');
  await p.fill('.paybox input[placeholder]:not([placeholder="自定"]):not([placeholder="不改"])', '100'); await p.waitForTimeout(300);
  const due = await d.textContent('#due'), chg = await d.textContent('#chg');
  assert.ok(await d.isVisible('#cashBox'), '现金显示实收找零');
  assert.strictEqual(await d.textContent('#recv'), '¥100.00');
  assert.strictEqual(chg, '¥' + (100 - parseFloat(due.slice(1))).toFixed(2));
  if (shots) await d.screenshot({ path: shots + '/副屏-收款.png' });
  // 取消收款：回到明细
  await p.click('.paybox .pay-cancel'); await p.waitForTimeout(400);
  assert.strictEqual(await d.getAttribute('#screen', 'class'), 'mode-cart', '取消收款回到明细');
  await p.tap('.paybtn'); await p.waitForSelector('.paybox .pay-ok'); await p.waitForTimeout(500);
  await p.fill('.paybox input[placeholder]:not([placeholder="自定"]):not([placeholder="不改"])', '100'); await p.waitForTimeout(300);
  await p.click('.paybox .pay-ok'); await p.waitForTimeout(800);
  assert.strictEqual(await d.getAttribute('#screen', 'class'), 'mode-done', '收款成功画面');
  assert.ok(await d.isVisible('#doneChgBox'), '有找零时大字显示');
  assert.ok((await d.textContent('#doneChg')).startsWith('¥'));
  if (shots) await d.screenshot({ path: shots + '/副屏-收款成功.png' });
  // 8 秒后回到欢迎画面；期间加了新商品立刻显示明细
  await p.tap('.card:has-text("湿巾")'); await p.waitForTimeout(300);
  assert.strictEqual(await d.getAttribute('#screen', 'class'), 'mode-cart');
  await p.tap('.fb:has-text("清空")'); await p.waitForTimeout(300);
  const box = p.locator('.el-message-box'); if (await box.isVisible()) { await p.click('.el-message-box .el-button--primary'); await p.waitForTimeout(300); }
  assert.strictEqual(await d.getAttribute('#screen', 'class'), 'mode-idle', '清空后回到欢迎画面');
  // 商品很多、一屏放不下：最后加的那一行露出来
  await d.evaluate(() => window.__render({ mode: 'cart', store: '门店', count: 14, total: 14 * 650,
    lines: Array.from({ length: 14 }, (_, i) => ({ name: '一次性医用口罩 ' + (i + 1), sku: i % 2 ? '10 只装' : '', qty: 1, price: 650, amount: 650 })) }));
  await d.waitForTimeout(100);
  const lastVisible = await d.evaluate(() => { const box = document.getElementById('rows'), r = [...box.querySelectorAll('.row')].pop(); return r.offsetTop + r.offsetHeight <= box.scrollTop + box.clientHeight + 9; });
  assert.ok(lastVisible, '最后一行可见');
  if (shots) await d.screenshot({ path: shots + '/副屏-商品多.png' });
  assert.deepStrictEqual(errs, []);
  console.log('副屏测试通过');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
