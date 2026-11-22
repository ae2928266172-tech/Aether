// 收银系统 · 门店收银桌面软件（Windows）
// 一个窗口打开服务端的门店工作台，接了第二块屏时在上面全屏显示顾客副屏；小票直接发给本机小票机，不弹打印框；服务器地址、小票机在“桌面软件设置”里选。
const { app, BrowserWindow, ipcMain, shell, dialog, screen } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const config = require('./config');
const { RawPrinter, printHtml } = require('./printer');
const { DRAWER, testPage } = require('./escpos');

app.setAppUserModelId('com.shouyin.desktop');
// 设置、打印脚本固定放在 %APPDATA%\收银系统
app.setPath('userData', path.join(app.getPath('appData'), '收银系统'));
if (!app.requestSingleInstanceLock()) { app.quit(); }

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');
let cfg = config.normalize({});
let win = null, setupWin = null, displayWin = null;
let raw = null;
let printChain = Promise.resolve();  // 小票一张一张按顺序出

const page = (name) => path.join(__dirname, 'pages', name);

function checkServer(server, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!server) return resolve('还没有填服务器地址');
    let url;
    try { url = new URL(server + '/api/health'); } catch (e) { return resolve('地址格式不对'); }
    const req = (url.protocol === 'https:' ? https : http).get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200 ? '' : '服务器返回 ' + res.statusCode + '，地址可能填错了');
    });
    req.on('timeout', () => { req.destroy(); resolve('连接超时，请检查网络和服务器是否开着'); });
    req.on('error', (e) => resolve('连不上服务器（' + e.code + '）'));
  });
}

async function openStore() {
  if (!win) return;
  if (!cfg.server) return openSetup();
  const e = await checkServer(cfg.server);
  if (e) return win.loadFile(page('offline.html'), { query: { server: cfg.server, error: e } });
  win.loadURL(config.storeUrl(cfg.server));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1024, minHeight: 640, show: false,
    title: '收银系统', backgroundColor: '#f4f4f5', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => { win.maximize(); if (cfg.fullscreen) win.setFullScreen(true); win.show(); });
  win.on('page-title-updated', (e) => e.preventDefault());

  // 只在窗口里打开门店工作台；后台管理等其他页面用系统浏览器打开
  const external = (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') || config.isStorePage(cfg.server, url)) return;
    e.preventDefault(); external(url);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3 && !url.startsWith('file:')) win.loadFile(page('offline.html'), { query: { server: cfg.server, error: '页面打不开（' + desc + '）' } });
  });
  win.webContents.on('render-process-gone', () => openStore());
  win.on('closed', () => { win = null; if (displayWin) displayWin.close(); });
  win.on('moved', () => setTimeout(syncDisplay, 300));  // 收银窗口拖到另一块屏，副屏跟着换

  // 窗口快捷键：F11 全屏，F5 刷新，Ctrl+Shift+S 设置，Ctrl+Shift+I 调试
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key;
    if (k === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (k === 'F5' && !input.control) { openStore(); e.preventDefault(); }
    else if (input.control && input.shift && k.toUpperCase() === 'S') { openSetup(); e.preventDefault(); }
    else if (input.control && input.shift && k.toUpperCase() === 'I') { win.webContents.toggleDevTools(); e.preventDefault(); }
    else if (input.control && ['+', '=', '-', '0'].includes(k)) {  // 放大 / 缩小 / 还原界面
      const z = win.webContents.getZoomFactor();
      win.webContents.setZoomFactor(k === '0' ? 1 : Math.min(2, Math.max(0.6, z + (k === '-' ? -0.1 : 0.1))));
      e.preventDefault();
    }
  });
  openStore();
}

// ---------------- 顾客副屏 ----------------
// 有第二块屏就在上面全屏打开 /web/display/；副屏不能获得焦点，顾客点它也不会抢走收银窗口的扫码输入
function syncDisplay() {
  const want = cfg.customerDisplay && cfg.server && win && !win.isDestroyed();
  const main = win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  const target = want ? config.pickDisplay(screen.getAllDisplays(), main.id) : null;
  if (!target) { if (displayWin) displayWin.close(); return; }
  if (displayWin) {
    displayWin.setFullScreen(false); displayWin.setBounds(target.bounds); displayWin.setFullScreen(true);
    if (!config.isDisplayPage(cfg.server, displayWin.webContents.getURL())) displayWin.loadURL(config.displayUrl(cfg.server));
    return;
  }
  displayWin = new BrowserWindow({
    ...target.bounds, frame: false, show: false, focusable: false, skipTaskbar: true, fullscreen: true, backgroundColor: '#f5f5f7',
    title: '顾客副屏', icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  displayWin.setMenu(null);
  displayWin.once('ready-to-show', () => displayWin && displayWin.showInactive());
  displayWin.on('closed', () => { displayWin = null; });
  displayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  displayWin.webContents.on('will-navigate', (e, url) => { if (!config.isDisplayPage(cfg.server, url)) e.preventDefault(); });
  displayWin.webContents.on('page-title-updated', (e) => e.preventDefault());
  // 服务器暂时连不上：过 10 秒再试
  displayWin.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3) setTimeout(() => { if (displayWin && cfg.server) displayWin.loadURL(config.displayUrl(cfg.server)); }, 10000);
  });
  displayWin.webContents.on('render-process-gone', () => { if (displayWin && cfg.server) displayWin.loadURL(config.displayUrl(cfg.server)); });
  displayWin.loadURL(config.displayUrl(cfg.server));
}

function openSetup() {
  if (setupWin) { setupWin.focus(); return; }
  setupWin = new BrowserWindow({
    width: 640, height: 790, useContentSize: true, parent: win || undefined, modal: !!win, resizable: false, minimizable: false,
    title: '桌面软件设置', backgroundColor: '#ffffff', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload-setup.js'), contextIsolation: true, nodeIntegration: false },
  });
  setupWin.setMenu(null);
  setupWin.once('ready-to-show', () => setupWin.show());
  setupWin.on('closed', () => { setupWin = null; if (win && !cfg.server) app.quit(); });
  setupWin.loadFile(page('setup.html'));
}

function printRaw(data) {
  const job = printChain.then(() => raw.send(cfg.printer, data));
  printChain = job.catch(() => {});
  return job;
}

function applyAutoStart() {
  try { app.setLoginItemSettings({ openAtLogin: cfg.autoStart }); } catch (e) {}
}

// ---------------- 给门店工作台用 ----------------
const fromStore = (e) => e.senderFrame && config.isStorePage(cfg.server, e.senderFrame.url);

ipcMain.on('desktop:info', (e) => {
  e.returnValue = fromStore(e)
    ? { version: app.getVersion(), server: cfg.server, printer: cfg.printer, printMode: cfg.printMode, drawer: cfg.drawer, paperWidth: cfg.paperWidth }
    : null;
});
ipcMain.handle('desktop:print-raw', async (e, b64) => {
  if (!fromStore(e)) return '不允许';
  if (cfg.printMode === 'off') return '这台电脑设置为不出票';
  return printRaw(Buffer.from(String(b64), 'base64'));
});
ipcMain.handle('desktop:print-html', async (e, html) => {
  if (!fromStore(e)) return '不允许';
  if (cfg.printMode === 'off') return '这台电脑设置为不出票';
  if (!cfg.printer) return '还没有选择小票机，请在“桌面软件设置”里选择';
  const job = printChain.then(() => printHtml(BrowserWindow, cfg.printer, String(html), cfg.paperWidth, cfg.server));
  printChain = job.catch(() => {});
  return job;
});
ipcMain.handle('desktop:open-drawer', async (e) => {
  if (!fromStore(e)) return '不允许';
  if (cfg.printMode === 'off') return '这台电脑设置为不出票';
  return printRaw(DRAWER);
});
ipcMain.handle('desktop:test-print', async (e) => (fromStore(e) ? testPrint() : '不允许'));
// 门店工作台和软件自带的本地页面（连不上服务器时的提示页）可以打开设置；其他网页不行
const fromLocalPage = (e) => !!(e.senderFrame && String(e.senderFrame.url).startsWith('file:'));
ipcMain.on('desktop:open-settings', (e) => { if (fromStore(e) || fromLocalPage(e)) openSetup(); });

async function testPrint(c = cfg) {
  if (c.printMode === 'off') return '出票方式是“不出票”';
  if (c.printMode === 'driver') {
    const html = '<!doctype html><meta charset="utf-8"><body style="font:14px Microsoft YaHei;width:' + (c.paperWidth === 80 ? 72 : 48) + 'mm;margin:0;padding:2mm">'
      + '<h3 style="text-align:center;margin:0">打印测试</h3><p>小票机：' + c.printer + '</p><p>中文显示正常就设置好了</p><br><br></body>';
    return printHtml(BrowserWindow, c.printer, html, c.paperWidth);
  }
  if (!c.printer) return '请先选择小票机';
  const job = printChain.then(() => raw.send(c.printer, testPage({ printer: c.printer, paperWidth: c.paperWidth, server: c.server, version: app.getVersion() })));
  printChain = job.catch(() => {});
  return job;
}

// ---------------- 设置窗口 ----------------
const fromSetup = (e) => setupWin && e.sender === setupWin.webContents;
ipcMain.handle('setup:get', async (e) => {
  if (!fromSetup(e)) return null;
  let printers = [];
  try { printers = (await setupWin.webContents.getPrintersAsync()).map(p => ({ name: p.name, isDefault: p.isDefault })); } catch (err) {}
  return { config: cfg, printers, version: app.getVersion() };
});
ipcMain.handle('setup:check-server', async (e, server) => {
  if (!fromSetup(e)) return '不允许';
  const s = config.normalizeServer(server);
  return s ? checkServer(s) : '地址格式不对，例如 192.168.31.10:8765';
});
ipcMain.handle('setup:test-print', async (e, c) => (fromSetup(e) ? testPrint(config.normalize(c)) : '不允许'));
ipcMain.handle('setup:save', async (e, c) => {
  if (!fromSetup(e)) return '不允许';
  const v = config.normalize(c);
  if (!v.server) return '请填写正确的服务器地址';
  const serverChanged = v.server !== cfg.server;
  cfg = config.save(CONFIG_FILE(), v);
  applyAutoStart();
  if (cfg.printMode === 'raw') raw.warm();
  syncDisplay();
  if (win) { if (serverChanged || !win.webContents.getURL().startsWith(cfg.server)) openStore(); else win.webContents.reload(); }
  setupWin && setupWin.close();
  return '';
});
// 离线页
ipcMain.on('offline:retry', () => openStore());

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => raw && raw.stop());

app.whenReady().then(() => {
  cfg = config.load(CONFIG_FILE());
  raw = new RawPrinter(app.getPath('userData'));
  if (cfg.printMode === 'raw' && cfg.printer) raw.warm();
  createWindow();
  syncDisplay();
  // 插拔副屏、改分辨率后重新摆放
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => setTimeout(syncDisplay, 500));
}).catch((e) => { dialog.showErrorBox('收银系统启动失败', String(e && e.stack || e)); app.quit(); });
