// 桌面软件本机设置：服务器地址、小票机、出票方式、钱箱、开机启动。存在 %APPDATA%\收银系统\config.json
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  server: '',            // 收银系统地址，例如 http://192.168.31.10:8765
  printer: '',           // 小票机名称（Windows 里的打印机名，如 POS58）
  printMode: 'raw',      // raw：直接发 ESC/POS 指令（推荐，58mm 热敏机通用）；driver：走打印机驱动排版；off：这台电脑不出票
  paperWidth: 58,
  drawer: false,         // 现金收款后弹钱箱（钱箱接在小票机上）
  autoStart: false,      // 开机自动打开
  fullscreen: false,     // 启动即全屏
  customerDisplay: true, // 接了第二块屏时，在上面全屏显示顾客副屏
};

// 把用户填的地址整理成 http://主机:端口（不带末尾斜杠和路径）；填错返回空字符串
function normalizeServer(s) {
  let v = String(s || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  try {
    const u = new URL(v);
    if (!u.hostname) return '';
    return u.protocol + '//' + u.host;
  } catch (e) { return ''; }
}

function normalize(c) {
  const out = { ...DEFAULTS, ...(c || {}) };
  out.server = normalizeServer(out.server);
  out.printer = String(out.printer || '').trim();
  if (!['raw', 'driver', 'off'].includes(out.printMode)) out.printMode = 'raw';
  out.paperWidth = Number(out.paperWidth) === 80 ? 80 : 58;
  out.drawer = !!out.drawer; out.autoStart = !!out.autoStart; out.fullscreen = !!out.fullscreen;
  out.customerDisplay = out.customerDisplay !== false;
  return out;
}

function load(file) {
  try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { return normalize({}); }
}

function save(file, c) {
  const v = normalize(c);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return v;
}

// 门店工作台地址
const storeUrl = (server) => server + '/web/store/';

// 窗口里只允许打开门店工作台；其他页面（如后台管理）交给系统浏览器
function isStorePage(server, url) {
  try {
    const u = new URL(url);
    return u.protocol + '//' + u.host === server && u.pathname.startsWith('/web/store/');
  } catch (e) { return false; }
}

// 顾客副屏地址
const displayUrl = (server) => server + '/web/display/';
function isDisplayPage(server, url) {
  try {
    const u = new URL(url);
    return u.protocol + '//' + u.host === server && u.pathname.startsWith('/web/display/');
  } catch (e) { return false; }
}

// 选副屏：收银窗口所在的那块屏以外的第一块屏；只有一块屏返回 null
function pickDisplay(displays, mainId) {
  return (displays || []).find(d => d.id !== mainId) || null;
}

module.exports = { DEFAULTS, normalizeServer, normalize, load, save, storeUrl, isStorePage, displayUrl, isDisplayPage, pickDisplay };
