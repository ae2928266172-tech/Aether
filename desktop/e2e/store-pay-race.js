// 收款算价竞态：算价接口慢的时候，点了 9 折马上按回车 / 点确认，提交的必须是打折后的金额。
// 用法：node desktop/e2e/store-pay-race.js http://127.0.0.1:8765（演示数据，store1 有打折权限时测打折，否则测改应收）
const assert = require('assert');
const { chromium } = require('playwright');
(async () => {
  const B = process.argv[2] || 'http://127.0.0.1:8765';
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/web/store/');
  await p.fill('input[placeholder=账号]', 'admin'); await p.fill('input[placeholder=密码]', 'admin123'); await p.keyboard.press('Enter');
  await p.waitForSelector('.card'); await p.waitForTimeout(400);
  await p.click('.card:has-text("湿巾")'); await p.click('.card:has-text("湿巾")');  // 2 × 6 元 = 12 元
  // 算价接口人为延迟 800ms
  await p.route('**/api/pos/quote', async (route) => { await new Promise(r => setTimeout(r, 800)); await route.continue(); });
  let checkout = null;
  p.on('request', (r) => { if (r.url().endsWith('/api/pos/checkout')) checkout = JSON.parse(r.postData()); });
  await p.click('.paybtn'); await p.waitForSelector('.paybox .pad', { state: 'visible' }); await p.waitForTimeout(1200);
  await p.click('.paybox .chip:has-text("9 折")');
  await p.keyboard.press('Enter');  // 立刻回车
  await p.waitForSelector('text=收款成功', { timeout: 8000 });
  assert.ok(checkout, '发出了收款请求');
  assert.strictEqual(checkout.discount_rate, 90, '提交的是 9 折');
  assert.strictEqual(checkout.payable, 1080, '应收 10.80');
  console.log('9 折秒回车：通过'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  // 自定折扣打了数字没按“确定”就点确认收款，也按自定折扣收
  await p.click('.card:has-text("湿巾")'); checkout = null;
  await p.click('.paybtn'); await p.waitForSelector('.paybox .pad', { state: 'visible' }); await p.waitForTimeout(1200);
  await p.click('.paybox .field.sm >> nth=0'); await p.click('.pad [data-k="8"]');
  await p.click('.paybox .pay-ok');
  await p.waitForSelector('text=收款成功', { timeout: 8000 });
  assert.strictEqual(checkout.discount_rate, 80, '自定 8 折生效');
  assert.strictEqual(checkout.payable, 480);
  assert.deepStrictEqual(errs, []);
  console.log('收款算价竞态测试通过');
  await b.close();
})().catch(async e => { console.error(e.message); process.exit(1); });
