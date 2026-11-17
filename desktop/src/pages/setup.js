const $ = (id) => document.getElementById(id);
const msg = (id, text, ok) => { const el = $(id); el.textContent = text || ''; el.className = 'msg ' + (ok ? 'ok' : 'err'); };

function current() {
  return {
    server: $('server').value, printer: $('printer').value, paperWidth: Number($('paper').value),
    printMode: (document.querySelector('input[name=mode]:checked') || {}).value || 'raw',
    drawer: $('drawer').checked, autoStart: $('autoStart').checked, fullscreen: $('fullscreen').checked,
  };
}

async function init() {
  const { config: c, printers, version } = await Setup.get();
  $('ver').textContent = '版本 ' + version;
  $('server').value = c.server.replace(/^http:\/\//, '');
  const sel = $('printer');
  const names = printers.map(p => p.name);
  if (c.printer && !names.includes(c.printer)) names.unshift(c.printer);
  // 没选过就猜一个像小票机的（POS58 等）
  const guess = c.printer || names.find(n => /pos|58|80|小票|热敏|receipt/i.test(n)) || '';
  sel.innerHTML = '<option value="">（不选）</option>' + names.map(n => '<option></option>').join('');
  names.forEach((n, i) => { sel.options[i + 1].value = n; sel.options[i + 1].textContent = n + (printers.find(p => p.name === n && p.isDefault) ? '（默认打印机）' : '') + (printers.some(p => p.name === n) ? '' : '（没找到）'); });
  sel.value = guess;
  $('paper').value = String(c.paperWidth);
  document.querySelector('input[name=mode][value=' + c.printMode + ']').checked = true;
  $('drawer').checked = c.drawer; $('autoStart').checked = c.autoStart; $('fullscreen').checked = c.fullscreen;
  if (!names.length) msg('printMsg', '这台电脑没有找到打印机，请先装好小票机驱动（如 POS58）');
  $('server').focus();
}

$('check').onclick = async () => {
  msg('serverMsg', '正在连接……', true);
  const e = await Setup.checkServer($('server').value);
  msg('serverMsg', e || '连接成功', !e);
};
$('test').onclick = async () => {
  $('test').disabled = true; msg('printMsg', '正在打印……', true);
  try { const e = await Setup.testPrint(current()); msg('printMsg', e || '已发送，请看小票机是否出纸', !e); }
  finally { $('test').disabled = false; }
};
$('save').onclick = async () => {
  const e0 = await Setup.checkServer($('server').value);
  if (e0) { msg('serverMsg', e0); if (!confirm('现在连不上这个地址：' + e0 + '\n仍然保存吗？')) return; }
  const e = await Setup.save(current());
  if (e) msg('saveMsg', e);
};
$('cancel').onclick = () => window.close();
$('server').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('check').click(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') window.close(); });
init();
