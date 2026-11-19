// 屏幕键盘：触摸屏收银机用。点输入框弹出——金额、数量（inputmode=decimal/numeric）弹数字键盘，其他弹字母数字键盘。
// 键盘按钮不抢焦点，按键直接写进当前输入框并触发 input 事件，Vue 的 v-model 照常更新；“确认”等于按回车。
// 收银页的搜索框有自己的固定键盘（加了 data-no-osk），这里不再弹。
// 字母键盘默认停在右侧订单栏底部（不挡左边商品区），拖顶部横条可以挪到别处，双击横条回到默认位置。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShouyinOSK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 纯函数：在 value 的选区 [a, b) 上按下 key，返回新值和光标位置
  function applyKey(value, a, b, key) {
    value = String(value == null ? '' : value);
    a = a == null ? value.length : a; b = b == null ? a : b;
    if (key === 'clear') return { value: '', caret: 0 };
    if (key === 'back') {
      if (a !== b) return { value: value.slice(0, a) + value.slice(b), caret: a };
      if (a === 0) return { value, caret: 0 };
      return { value: value.slice(0, a - 1) + value.slice(a), caret: a - 1 };
    }
    return { value: value.slice(0, a) + key + value.slice(b), caret: a + key.length };
  }

  const NUM = [['7', '8', '9', 'back'], ['4', '5', '6', 'clear'], ['1', '2', '3', '.'], ['00', '0', 'hide', 'enter']];
  const FULL = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'back'], ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '.'], ['hide', 'clear', ' ', 'enter']];
  const LABEL = { back: '⌫ 退格', clear: '清空', hide: '收起', enter: '确认', shift: '大写', ' ': '空格' };

  const POS_KEY = 'shouyin.osk.pos';
  const loadPos = () => { try { const v = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); return v && isFinite(v.x) && isFinite(v.y) ? v : null; } catch (e) { return null; } };
  const savePos = (v) => { try { v ? localStorage.setItem(POS_KEY, JSON.stringify(v)) : localStorage.removeItem(POS_KEY); } catch (e) {} };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const isNumeric = (el) => /^(decimal|numeric)$/.test(el.getAttribute('inputmode') || '') || el.type === 'number';
  const usable = (el) => !!el && el.tagName === 'INPUT' && !el.closest('[data-no-osk]') && !el.readOnly && !el.disabled && /^(text|search|password|tel|number|)$/.test(el.type || '');

  function create(opts) {
    const o = Object.assign({ mode: () => 'auto' }, opts || {});
    let panel = null, target = null, upper = false, lastPointer = 'mouse', forced = false, numericNow = false;

    function render(numeric) {
      const rows = numeric ? NUM : FULL;
      numericNow = numeric;
      panel.className = 'osk ' + (numeric ? 'osk-num' : 'osk-full');
      panel.innerHTML = '<div class="osk-bar" title="拖动可移动位置，双击回到默认位置"><i></i></div>' + rows.map(r => '<div class="osk-row">' + r.map(k => {
        let t = LABEL[k] || (upper && /^[a-z]$/.test(k) ? k.toUpperCase() : k);
        if (k === 'shift' && upper) t = '小写';
        return '<button type="button" tabindex="-1" data-k="' + (k === ' ' ? 'space' : k) + '" class="osk-k osk-' + (k === ' ' ? 'space' : /^[a-z0-9.\-]+$/.test(k) && k.length <= 2 ? 'c' : k) + '">' + t + '</button>';
      }).join('') + '</div>').join('');
    }

    function show(el) {
      target = el;
      if (!panel) {
        panel = document.createElement('div');
        // 不让键盘按钮拿走焦点
        panel.addEventListener('pointerdown', (e) => e.preventDefault());
        panel.addEventListener('mousedown', (e) => e.preventDefault());
        panel.addEventListener('click', onClick);
        panel.addEventListener('pointerdown', dragStart);
        document.body.appendChild(panel);
      }
      const numeric = isNumeric(el);
      render(numeric);
      panel.style.display = '';
      document.body.classList.add('osk-on');
      document.body.classList.toggle('osk-full-on', !numeric);
      place();
    }
    function hide() { if (panel) panel.style.display = 'none'; document.body.classList.remove('osk-on', 'osk-full-on', 'osk-dock'); target = null; forced = false; }

    // 摆放位置：拖过就用记住的位置；字母键盘没拖过时停靠在右侧订单栏底部，订单栏让出键盘高度；
    // 没有订单栏的页面（登录等）放在底部居中；数字键盘默认右下角（见 CSS）
    function place() {
      if (!panel || panel.style.display === 'none') return;
      const st = panel.style; st.left = st.top = st.width = st.right = st.bottom = st.transform = '';
      document.body.classList.remove('osk-dock');
      const saved = loadPos();
      if (saved) {
        st.left = clamp(saved.x, 0, Math.max(0, innerWidth - panel.offsetWidth)) + 'px';
        st.top = clamp(saved.y, 0, Math.max(0, innerHeight - panel.offsetHeight)) + 'px';
        st.right = st.bottom = 'auto'; st.transform = 'none'; return;
      }
      if (numericNow) return;
      const side = document.querySelector('.pos-right');
      if (side && side.offsetParent) {
        const r = side.getBoundingClientRect();
        st.left = r.left + 'px'; st.width = r.width + 'px'; st.bottom = '0px'; st.transform = 'none';
        document.body.style.setProperty('--osk-h', panel.offsetHeight + 'px');
        document.body.classList.add('osk-dock');
      }
    }
    addEventListener('resize', () => place());

    let drag = null, lastBarDown = 0;
    function dragStart(e) {
      if (!e.target.closest('.osk-bar')) return;
      // 连点两下横条（鼠标双击或手指双击）：回到默认位置
      if (Date.now() - lastBarDown < 400) { lastBarDown = 0; savePos(null); place(); return; }
      lastBarDown = Date.now();
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: r.left, y0: r.top };
      document.body.classList.remove('osk-dock');
      const st = panel.style; st.width = r.width + 'px'; st.left = r.left + 'px'; st.top = r.top + 'px'; st.right = st.bottom = 'auto'; st.transform = 'none';
      try { panel.setPointerCapture(e.pointerId); } catch (err) {}
      panel.addEventListener('pointermove', dragMove);
      panel.addEventListener('pointerup', dragEnd);
      panel.addEventListener('pointercancel', dragEnd);
    }
    function dragMove(e) {
      if (!drag) return;
      panel.style.left = clamp(e.clientX - drag.dx, 0, innerWidth - panel.offsetWidth) + 'px';
      panel.style.top = clamp(e.clientY - drag.dy, 0, innerHeight - panel.offsetHeight) + 'px';
    }
    function dragEnd() {
      if (!drag) return;
      panel.removeEventListener('pointermove', dragMove);
      panel.removeEventListener('pointerup', dragEnd);
      panel.removeEventListener('pointercancel', dragEnd);
      const x = parseFloat(panel.style.left), y = parseFloat(panel.style.top), d = drag;
      drag = null;
      if (Math.abs(x - d.x0) < 4 && Math.abs(y - d.y0) < 4) return place();  // 只是点了一下，没拖
      lastBarDown = 0;
      panel.style.width = '';
      savePos({ x, y });
    }

    function fire(el, type, key) {
      el.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
    }
    function press(k) {
      const el = target;
      if (!el || !document.contains(el)) return hide();
      if (k === 'hide') { el.blur(); return hide(); }
      if (k === 'shift') { upper = !upper; return render(false); }
      if (k === 'enter') { fire(el, 'keydown', 'Enter'); fire(el, 'keyup', 'Enter'); el.dispatchEvent(new Event('change', { bubbles: true })); return; }
      const key = k === 'space' ? ' ' : (upper && /^[a-z]$/.test(k) ? k.toUpperCase() : k);
      let a = null, b = null;
      try { a = el.selectionStart; b = el.selectionEnd; } catch (e) {}
      const r = applyKey(el.value, a, b, key);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, r.value);
      try { el.setSelectionRange(r.caret, r.caret); } catch (e) {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function onClick(e) { const b = e.target.closest('[data-k]'); if (b) press(b.getAttribute('data-k')); }

    // 记住是触摸还是鼠标点的输入框（“触摸时弹出”模式用）
    // 只有手指点了这个输入框才弹；收银后程序自动把光标放回搜索框不算，免得每点一个商品键盘就跳出来
    let downEl = null, downAt = 0;
    document.addEventListener('pointerdown', (e) => {
      if (panel && panel.contains(e.target)) return;
      lastPointer = e.pointerType || 'mouse'; downEl = e.target; downAt = Date.now();
    }, true);
    const touchedIt = (el) => lastPointer === 'touch' && Date.now() - downAt < 1500 && downEl && (downEl === el || downEl.contains(el) || el.contains(downEl));
    // 已经有光标的输入框（比如收款框打开时自动放好光标），手指再点一下也弹出
    document.addEventListener('click', (e) => {
      if (lastPointer !== 'touch' || o.mode() === 'off' || (panel && panel.contains(e.target))) return;
      const el = usable(e.target) ? e.target : document.activeElement;
      if (usable(el) && (el === e.target || e.target.contains(el)) && document.activeElement === el) show(el);
    }, true);
    document.addEventListener('focusin', (e) => {
      const el = e.target, m = o.mode();
      if (panel && panel.contains(el)) return;
      if (!usable(el) || m === 'off') { hide(); return; }
      if (m === 'always' || (forced && target) || touchedIt(el)) show(el);
      else if (target && target !== el) hide();
    });
    document.addEventListener('focusout', () => setTimeout(() => { if (target && document.activeElement !== target) { if (usable(document.activeElement)) return; hide(); } }, 0));

    // 手动打开（顶部“键盘”按钮）：对当前输入框，没有就对搜索框
    function toggle(fallback) {
      if (panel && panel.style.display !== 'none' && target) return hide();
      const el = usable(document.activeElement) ? document.activeElement : (fallback && fallback());
      if (!el) return;
      forced = true; el.focus(); show(el);
    }
    return { show, hide, toggle, press, get visible() { return !!(panel && panel.style.display !== 'none'); } };
  }

  return { applyKey, create, NUM, FULL };
});
