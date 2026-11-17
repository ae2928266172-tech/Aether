// 门店工作台页面里可用的桌面功能：window.ShouyinDesktop（网页版里没有这个对象，照旧用浏览器打印）
const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, arg) => {
  const e = await ipcRenderer.invoke(ch, arg);
  if (e) throw new Error(e);
};

contextBridge.exposeInMainWorld('ShouyinDesktop', {
  info: () => ipcRenderer.sendSync('desktop:info'),   // { version, server, printer, printMode, drawer, paperWidth }；非收银页面为 null
  printRaw: (b64) => call('desktop:print-raw', b64),  // 服务端生成的 ESC/POS（base64）
  printHtml: (html) => call('desktop:print-html', html),
  openDrawer: () => call('desktop:open-drawer'),
  testPrint: () => call('desktop:test-print'),
  openSettings: () => ipcRenderer.send('desktop:open-settings'),
  retry: () => ipcRenderer.send('offline:retry'),
});
