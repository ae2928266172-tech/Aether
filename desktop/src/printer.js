// 出票：
//  raw    —— 把 ESC/POS 字节经 Windows 打印后台（RAW 方式）发给小票机，58mm 热敏机通用、速度快、不弹框
//  driver —— 用打印机驱动静默打印网页小票（小票机不认 ESC/POS 时的后备方式）
// RAW 打印用一个常驻的 PowerShell 进程（Win7 自带 PowerShell 2.0 即可），只在第一次编译打印代码，之后每张票几十毫秒。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAW_PS = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShouyinRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
    public static string Send(string printer, byte[] data) {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "打不开打印机“" + printer + "”（错误码 " + Marshal.GetLastWin32Error() + "），请检查小票机名称和连线";
        try {
            DOCINFO di = new DOCINFO(); di.pDocName = "收银小票"; di.pDataType = "RAW";
            if (!StartDocPrinter(h, 1, di)) return "开始打印失败，错误码 " + Marshal.GetLastWin32Error();
            StartPagePrinter(h);
            IntPtr p = Marshal.AllocCoTaskMem(data.Length);
            Marshal.Copy(data, 0, p, data.Length);
            int written;
            bool ok = WritePrinter(h, p, data.Length, out written);
            Marshal.FreeCoTaskMem(p);
            EndPagePrinter(h); EndDocPrinter(h);
            if (!ok || written != data.Length) return "写入打印机失败，错误码 " + Marshal.GetLastWin32Error();
            return "";
        } finally { ClosePrinter(h); }
    }
}
"@
[Console]::Out.WriteLine("READY")
while ($true) {
    $l = [Console]::In.ReadLine()
    if ($l -eq $null) { break }
    $parts = $l.Split("` + '`' + String.raw`t")
    $id = $parts[0]
    try {
        $printer = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1]))
        $data = [Convert]::FromBase64String($parts[2])
        $r = [ShouyinRawPrinter]::Send($printer, $data)
    } catch { $r = "打印出错：" + $_.Exception.Message }
    [Console]::Out.WriteLine($id + "` + '`' + String.raw`t" + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($r)))
}
`;

// 一行请求：编号 \t base64(打印机名 UTF-8) \t base64(字节)；一行回复：编号 \t base64(错误信息，空表示成功)
const encodeRequest = (id, printer, data) => id + '\t' + Buffer.from(printer, 'utf8').toString('base64') + '\t' + Buffer.from(data).toString('base64') + '\n';
function parseReply(line) {
  const i = line.indexOf('\t');
  if (i < 0) return null;
  return { id: line.slice(0, i), error: Buffer.from(line.slice(i + 1).trim(), 'base64').toString('utf8') };
}

class RawPrinter {
  constructor(scriptDir) { this.scriptDir = scriptDir; this.proc = null; this.seq = 0; this.waiting = new Map(); this.buf = ''; }

  _start() {
    const file = path.join(this.scriptDir, 'shouyin-rawprint.ps1');
    fs.mkdirSync(this.scriptDir, { recursive: true });
    fs.writeFileSync(file, '﻿' + RAW_PS, 'utf8');  // 带 BOM，PowerShell 2.0 才按 UTF-8 读中文
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      this.buf += d;
      let k;
      while ((k = this.buf.indexOf('\n')) >= 0) {
        const r = parseReply(this.buf.slice(0, k).replace(/\r$/, ''));
        this.buf = this.buf.slice(k + 1);
        if (r && this.waiting.has(r.id)) { const w = this.waiting.get(r.id); this.waiting.delete(r.id); w(r.error); }
      }
    });
    let errText = '';
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d) => { errText += d; });
    const fail = (msg) => {
      if (this.proc !== p) return;
      this.proc = null; this.buf = '';
      for (const w of this.waiting.values()) w(msg || ('打印程序意外退出 ' + errText.slice(0, 200)));
      this.waiting.clear();
    };
    p.on('exit', () => fail());
    p.on('error', (e) => fail('启动打印程序失败：' + e.message));
    this.proc = p;
  }

  warm() { if (!this.proc) this._start(); }

  send(printer, data, timeoutMs = 20000) {
    if (!printer) return Promise.resolve('还没有选择小票机，请在“桌面软件设置”里选择');
    if (!this.proc) this._start();
    const id = String(++this.seq);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (this.waiting.delete(id)) { resolve('小票机没有响应，请检查是否开机、有纸'); this.stop(); } }, timeoutMs);
      this.waiting.set(id, (e) => { clearTimeout(timer); resolve(e); });
      this.proc.stdin.write(encodeRequest(id, printer, data));
    });
  }

  stop() { if (this.proc) { const p = this.proc; this.proc = null; try { p.kill(); } catch (e) {} } }
}

// 驱动打印：在隐藏窗口里载入网页小票，静默打印到指定打印机
function printHtml(BrowserWindow, printer, html, paperWidth, baseUrl) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
    const done = (err) => { try { w.destroy(); } catch (e) {} resolve(err || ''); };
    w.webContents.once('did-finish-load', () => {
      w.webContents.print({ silent: true, deviceName: printer, printBackground: true, margins: { marginType: 'none' },
        pageSize: { width: paperWidth * 1000, height: 297000 } },
      (ok, reason) => done(ok ? '' : '驱动打印失败：' + reason));
    });
    w.webContents.once('did-fail-load', () => done('小票页面载入失败'));
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html), baseUrl ? { baseURLForDataURL: baseUrl + '/' } : undefined);
  });
}

module.exports = { RawPrinter, printHtml, encodeRequest, parseReply, RAW_PS };
