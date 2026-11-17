// 本机生成的 ESC/POS 指令：测试页、弹钱箱。小票本身由服务端生成（与打印小助手同一套排版）。
const iconv = require('iconv-lite');

const ESC = 0x1b, GS = 0x1d, FS = 0x1c;
const gb = (s) => iconv.encode(s, 'gb18030');
const cmd = (...b) => Buffer.from(b);

// 弹钱箱：ESC p m t1 t2（接在小票机 RJ11 口上的钱箱）
const DRAWER = cmd(ESC, 0x70, 0x00, 0x19, 0xfa);

function testPage({ printer = '', paperWidth = 58, server = '', version = '' } = {}) {
  const width = paperWidth === 80 ? 48 : 32;
  const line = (s = '') => Buffer.concat([gb(s), cmd(0x0a)]);
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const time = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
  return Buffer.concat([
    cmd(ESC, 0x40, FS, 0x26),              // 初始化 + 汉字模式
    cmd(ESC, 0x61, 0x01, GS, 0x21, 0x11, ESC, 0x45, 0x01), line('打印测试'),
    cmd(GS, 0x21, 0x00, ESC, 0x45, 0x00), line('收银系统桌面软件 ' + version),
    cmd(ESC, 0x61, 0x00), line('-'.repeat(width)),
    line('小票机：' + printer), line('服务器：' + server), line('时间：' + time),
    line('中文：收银系统小票机连接正常'),
    line('1234567890'.repeat(width / 16 * 2).slice(0, width)),
    line('-'.repeat(width)),
    cmd(ESC, 0x61, 0x01), line('文字清楚、没有乱码就设置好了'),
    cmd(ESC, 0x61, 0x00, ESC, 0x64, 0x04, GS, 0x56, 0x42, 0x00),  // 走纸 + 切纸（无切刀的机器忽略）
  ]);
}

module.exports = { DRAWER, testPage, gb };
