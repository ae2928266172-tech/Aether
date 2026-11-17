const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const iconv = require('iconv-lite');
const config = require('../src/config');
const { encodeRequest, parseReply, RAW_PS } = require('../src/printer');
const { testPage, DRAWER } = require('../src/escpos');

test('服务器地址整理', () => {
  assert.strictEqual(config.normalizeServer('192.168.31.10:8765'), 'http://192.168.31.10:8765');
  assert.strictEqual(config.normalizeServer(' http://192.168.31.10:8765/web/store/ '), 'http://192.168.31.10:8765');
  assert.strictEqual(config.normalizeServer('https://shouyin.example.cn/'), 'https://shouyin.example.cn');
  assert.strictEqual(config.normalizeServer(''), '');
  assert.strictEqual(config.normalizeServer('http://'), '');
});

test('设置读写与默认值', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sy-')), 'sub', 'config.json');
  assert.deepStrictEqual(config.load(f), config.normalize({}));  // 没有文件用默认
  const v = config.save(f, { server: '10.0.0.2:8000', printer: ' POS58 ', printMode: 'bad', paperWidth: '80', drawer: 1 });
  assert.strictEqual(v.server, 'http://10.0.0.2:8000');
  assert.strictEqual(v.printer, 'POS58');
  assert.strictEqual(v.printMode, 'raw');
  assert.strictEqual(v.paperWidth, 80);
  assert.strictEqual(v.drawer, true);
  assert.deepStrictEqual(config.load(f), v);
  fs.writeFileSync(f, '{坏的');
  assert.strictEqual(config.load(f).server, '');  // 文件损坏不崩
});

test('窗口里只允许门店工作台', () => {
  const s = 'http://192.168.31.10:8765';
  assert.ok(config.isStorePage(s, s + '/web/store/'));
  assert.ok(config.isStorePage(s, s + '/web/store/index.html?x=1'));
  assert.ok(!config.isStorePage(s, s + '/web/admin/'));
  assert.ok(!config.isStorePage(s, 'http://evil.example/web/store/'));
  assert.ok(!config.isStorePage('', s + '/web/store/'));
});

test('RAW 打印请求编码：中文打印机名、二进制数据都能原样传过去', () => {
  const data = Buffer.from([0x1b, 0x40, 0x00, 0xff, 0x0a]);
  const line = encodeRequest('7', '小票机 POS58', data);
  assert.ok(line.endsWith('\n') && !line.slice(0, -1).includes('\n'));
  const [id, p, d] = line.trim().split('\t');
  assert.strictEqual(id, '7');
  assert.strictEqual(Buffer.from(p, 'base64').toString('utf8'), '小票机 POS58');
  assert.deepStrictEqual(Buffer.from(d, 'base64'), data);
  assert.deepStrictEqual(parseReply('7\t'), { id: '7', error: '' });
  assert.deepStrictEqual(parseReply('8\t' + Buffer.from('打不开打印机').toString('base64')), { id: '8', error: '打不开打印机' });
  assert.strictEqual(parseReply('READY'), null);
  // PowerShell 脚本里分隔符是真正的 `t，不是被 JS 吃掉的字符
  assert.ok(RAW_PS.includes('$l.Split("`t")'));
});

test('测试页是 GB18030 中文 ESC/POS，带切纸；钱箱指令正确', () => {
  const b = testPage({ printer: 'POS58', paperWidth: 58, server: 'http://x', version: '1.0.0' });
  assert.deepStrictEqual([...b.subarray(0, 2)], [0x1b, 0x40]);
  assert.ok(b.includes(iconv.encode('打印测试', 'gb18030')));
  assert.ok(b.includes(Buffer.from('POS58')));
  assert.deepStrictEqual([...b.subarray(b.length - 4)], [0x1d, 0x56, 0x42, 0x00]);
  assert.deepStrictEqual([...DRAWER], [0x1b, 0x70, 0x00, 0x19, 0xfa]);
});
