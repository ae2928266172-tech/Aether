const q = new URLSearchParams(location.search);
document.getElementById('err').textContent = (q.get('server') || '') + '　' + (q.get('error') || '');
document.getElementById('retry').onclick = () => ShouyinDesktop.retry();
document.getElementById('settings').onclick = () => ShouyinDesktop.openSettings();
// 每 15 秒自动重连一次
let n = 15;
setInterval(() => { n -= 1; document.getElementById('count').textContent = n + ' 秒后自动重连'; if (n <= 0) { n = 15; ShouyinDesktop.retry(); } }, 1000);
