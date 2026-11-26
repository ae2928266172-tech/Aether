// 门店工作台：收银、订单（新订单提示音 + 自动打印）、交班、库存
const { createApp, ref, reactive, computed, onMounted, onUnmounted, watch } = Vue;
const { api, yuan, toFen, rid, today, printReceipt, beep, speak, desk, deskInfo, printOpts, canPrintHere } = Shouyin;
const K = ShouyinKeys;
const { ElMessage, ElMessageBox } = ElementPlus;
const err = (e) => ElMessage.error(e.message || String(e));

function pref(key, def) { try { const v = localStorage.getItem('shouyin_pref_' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function setPref(key, v) { try { localStorage.setItem('shouyin_pref_' + key, JSON.stringify(v)); } catch (e) {} }

// 打印小助手模式下已发到小票机队列；否则在本机出票（桌面软件直接发给小票机，网页版用浏览器打印）
async function outPrint(r) { if (r && r.queued) ElMessage.success('已发送到小票机'); else await printReceipt(r); }
const printOrder = async (id, reprint) => outPrint(await api.post('/api/orders/' + id + '/print', { reprint: !!reprint, ...printOpts() }));
// 弹钱箱（只有桌面软件能用）
async function openDrawer(quiet) {
  if (!desk) { if (!quiet) ElMessage.info('开钱箱需要在桌面收银软件里使用'); return; }
  try { await desk.openDrawer(); } catch (e) { ElMessage.warning('钱箱没打开：' + (e.message || e)); }
}
const editable = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const msgBoxOpen = () => !!document.querySelector('.el-message-box');

// 门店页自用的几个图标（公共图标表里没有的）
const EXTRA_ICONS = { bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>', chevronDown: '<path d="m6 9 6 6 6-6"/>' };
const icon = (n) => EXTRA_ICONS[n] ? Shouyin.icon('').replace('</svg>', EXTRA_ICONS[n] + '</svg>') : Shouyin.icon(n);

const METHODS = { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' };
// 班次时间简写：2026-11-24 14:50:28 → 11-24 14:50；同一天下班只写时分，如 11-24 14:50 – 22:30
const shortTime = (t) => (t ? String(t).slice(5, 16) : '');
const timeRange = (r) => {
  if (!r.ended_at) return shortTime(r.started_at) + ' 起 · 当班中';
  const same = String(r.ended_at).slice(0, 10) === String(r.started_at).slice(0, 10);
  return shortTime(r.started_at) + ' – ' + (same ? String(r.ended_at).slice(11, 16) : shortTime(r.ended_at));
};
const PAD = ['7', '8', '9', 'back', '4', '5', '6', 'clear', '1', '2', '3', 'ok', '00', '0', '.'];
// 数字键盘输入金额：返回按下 k 之后的值，最多两位小数（ok 由各处自己处理）
const padNext = (v, k) => {
  v = String(v == null ? '' : v);
  if (k === 'back') return v.slice(0, -1);
  if (k === 'clear') return '';
  const n = (v === '0' && k !== '.' ? '' : v || (k === '.' ? '0' : '')) + k;
  return /^\d+(\.\d{0,2})?$/.test(n) ? n : v;
};

// 收银和换货使用同一套字母数字键盘、商品搜索和规格选择。
const keys = (str) => str.split('').map(k => ({ k }));
const KB = [
  [...keys('1234567890'), { k: 'back', w: 1.5 }],
  [{ gap: 0.5 }, ...keys('qwertyuiop'), { gap: 1 }],
  [{ gap: 0.75 }, ...keys('asdfghjkl'), { k: 'enter', w: 1.75 }],
  [{ gap: 1.25 }, ...keys('zxcvbnm'), { k: 'clear', w: 2 }, { gap: 1.25 }]];
const PosKeyboard = {
  props: ['space'],
  emits: ['press'],
  template: `
    <div class="kb" @pointerdown.prevent @mousedown.prevent>
      <div v-for="(r, i) in KB" :key="i" class="kb-row">
        <template v-for="(k, j) in r" :key="j">
          <span v-if="k.gap" class="kb-gap" :style="{flexGrow: k.gap}"></span>
          <button v-else type="button" tabindex="-1" class="kb-k" :class="'kb-' + (k.k.length > 1 ? k.k : 'c')" :style="{flexGrow: k.w || 1}" :data-k="k.k" @click="$emit('press', k.k)">{{ {back: '⌫', clear: '清空', enter: '确认'}[k.k] || k.k.toUpperCase() }}</button>
        </template>
      </div>
      <button v-if="space" type="button" tabindex="-1" class="kb-k" @click="$emit('press', ' ')">空格</button>
    </div>`,
  setup: () => ({ KB }),
};

const matchKw = (p, t) => {
  const k = t.toLowerCase();
  return p.name.toLowerCase().includes(k) || (p.mnemonic || '').includes(k) || (p.code || '').toLowerCase().includes(k)
    || p.skus.some(s => (s.barcode || '').startsWith(t) || (s.name !== '默认' && s.name.toLowerCase().includes(k)));
};
const priceText = (p) => {
  const ps = p.skus.map(s => s.price), a = Math.min(...ps), b = Math.max(...ps);
  return a === b ? yuan(a) : yuan(a) + ' 起';
};
const barcodeMatches = async (code) => {
  const r = await api.get('/api/products/by-barcode/' + encodeURIComponent(code));
  return (r.matches || [r]).map(m => ({ product: m.product, sku: m.product.skus.find(s => s.id === m.sku_id) })).filter(m => m.sku);
};
const PickDialog = {
  props: ['modelValue', 'product', 'matches', 'shortcuts'],
  emits: ['update:modelValue', 'pick'],
  template: `
    <el-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
      :title="matches ? '这个条码对应多个规格，请选择' : undefined" :width="width" class="pick-dlg">
      <template v-if="!matches" #header><span class="pick-title">{{product && product.name}}</span></template>
      <div class="pick-grid">
        <button v-for="({product: p, sku: s}, i) in options" :key="s.id" type="button" class="pick" @click="$emit('pick', p, s); $emit('update:modelValue', false)">
          <kbd v-if="shortcuts && i < 9" class="no">{{i + 1}}</kbd>
          <div class="pimg" :style="bg(s.image || p.image)">{{(s.image || p.image) ? '' : (!matches && s.name !== '默认' ? s.name : p.name).slice(0, 1)}}</div>
          <div class="pn">{{matches ? p.name : s.name}}</div><div v-if="matches && s.name !== '默认'" class="ps">{{s.name}}</div>
          <div class="pp">¥{{yuan(s.price)}}</div>
        </button>
      </div>
    </el-dialog>`,
  setup(props) {
    const options = computed(() => props.matches || (props.product ? props.product.skus.map(sku => ({ product: props.product, sku })) : []));
    // 每格约 200px，一行最多 4 个。
    const width = computed(() => Math.min(4, Math.max(2, options.value.length)) * 196 + 72 + 'px');
    const bg = (img) => (img ? { backgroundImage: 'url(' + JSON.stringify(Shouyin.thumb(img, 200)) + ')' } : {});
    return { options, width, bg, yuan };
  },
};

// 优惠（打折 / 调低应收）+ 收款，收银和订单收款共用
const PayDialog = {
  // storeId + onOnline：收银时传，微信 / 支付宝开通后走在线收款（付成功才开单），onOnline 收到开好的订单
  props: ['modelValue', 'user', 'lines', 'title', 'onPay', 'storeId', 'onOnline', 'remark'],
  emits: ['update:modelValue'],
  template: `
  <el-dialog :model-value="modelValue" @update:model-value="v => v ? $emit('update:modelValue', v) : closeDlg()" :title="title || '收款'" width="min(900px, 96vw)" class="paybox" @open="reset" @opened="focusReceived">
    <div class="pay-grid">
      <div class="pay-l">
        <div class="total">
          <div class="k">本次应收</div>
          <div class="v money">¥{{yuan(q.payable_amount)}}</div>
          <div class="s">商品金额 ¥{{yuan(q.original_amount)}}<span v-if="q.discount_amount">　优惠 −¥{{yuan(q.discount_amount)}}</span></div>
        </div>
        <div v-if="canDiscount" class="opt"><div class="ol">打折</div>
          <div class="chips"><button v-for="r in [95,90,88,85,80]" :key="r" type="button" class="chip" :class="{on: rate===r}" @click="rate = rate===r ? null : r">{{r/10}} 折</button>
            <span class="field sm" :class="{on: field==='rate'}" @click="pickField('rate')"><el-input ref="rateRef" v-model="rateInput" data-no-osk inputmode="decimal" placeholder="自定" @focus="field='rate'" @change="applyRate" /><i>折</i></span></div></div>
        <div v-if="canAdjust" class="opt"><div class="ol">改应收</div>
          <div class="chips"><button type="button" class="chip" @click="roundDown(100)">抹零头</button><button type="button" class="chip" @click="roundDown(1000)">抹到十元</button>
            <span class="field sm" :class="{on: field==='payable'}" @click="pickField('payable')"><el-input ref="payableRef" v-model="payableInput" data-no-osk inputmode="decimal" placeholder="不改" @focus="field='payable'" @change="quote" /><i>元</i></span></div></div>
        <div v-if="limitText" class="hint" style="margin-top:2px">{{limitText}}</div>
        <div class="methods"><button v-for="(t,k,i) in methods" :key="k" type="button" class="m" :class="{on: method===k}" @click="method=k; field='received'">{{t}}<kbd>F{{i+1}}</kbd></button></div>
      </div>
      <div class="pay-r">
        <template v-if="method==='cash'">
          <div class="field big" :class="{on: field==='received'}" @click="pickField('received')"><span class="fl">实收现金</span>
            <el-input ref="receivedRef" v-model="received" data-no-osk inputmode="decimal" :placeholder="yuan(q.payable_amount)" @focus="field='received'" /><i>元</i></div>
          <div class="quickcash"><button v-for="v in quick" :key="v" type="button" class="chip" @click="received = v; field = 'received'">¥{{v}}</button></div>
          <div class="change"><span>找零</span><b class="money">¥{{change}}</b></div>
        </template>
        <div v-else-if="online" class="olpay">
          <template v-if="!ol.txn">
            <div class="ol-t">扫顾客付款码</div>
            <el-input ref="codeRef" v-model="ol.code" data-no-osk size="large" placeholder="用扫码枪扫顾客手机上的付款码" @keydown.enter.prevent.stop="startOnline('code')" />
            <div class="ol-or">或</div>
            <el-button size="large" :loading="ol.busy" @click="startOnline('qr')">出{{methods[method]}}收款码，顾客扫码付</el-button>
            <div v-if="ol.msg" class="ol-err">{{ol.msg}}</div>
          </template>
          <template v-else>
            <img v-if="ol.qr" :src="ol.qr" class="ol-qr" alt="收款码">
            <div class="ol-t">{{ol.qr ? '请顾客用' + methods[ol.txn.provider] + '扫码付款' : '等待顾客在手机上确认付款'}}</div>
            <div class="ol-s"><span class="spin"></span>¥{{yuan(ol.txn.amount)}}　正在等待付款结果</div>
            <el-button size="large" @click="cancelOnline">不收了</el-button>
            <el-button v-if="chan[ol.txn.provider] && chan[ol.txn.provider].mode === 'mock'" size="large" text @click="mockPay">模拟顾客付款</el-button>
          </template>
        </div>
        <div v-else class="nocash">请确认顾客已通过<b>{{methods[method]}}</b>付款，再点“确认收款”。<br>目前是店员确认后记账，不是在线支付。</div>
        <div v-if="!online" class="pad">
          <button v-for="k in PAD" :key="k" type="button" tabindex="-1" class="pk" :class="'pk-' + ({back: 'fn', clear: 'fn', ok: 'ok'}[k] || 'n')" :data-k="k" @pointerdown.prevent @mousedown.prevent @click="padPress(k)">{{ {back: '⌫', clear: '清空', ok: field === 'received' ? '收款' : '确定'}[k] || k }}</button>
        </div>
      </div>
    </div>
    <template #footer><span class="muted keyhint"><kbd>Enter</kbd> 确认收款　<kbd>Esc</kbd> 取消</span><el-button size="large" class="pay-cancel" @click="closeDlg">取消</el-button>
      <el-button v-if="!online" size="large" type="primary" class="pay-ok" :loading="busy || quoting > 0" :disabled="!!qErr" @click="submit">确认收款 ¥{{yuan(q.payable_amount)}}</el-button></template>
  </el-dialog>`,
  setup(props, { emit }) {
    const q = reactive({ original_amount: 0, payable_amount: 0, discount_amount: 0 }), qErr = ref('');
    const rate = ref(null), rateInput = ref(''), payableInput = ref(''), method = ref('cash'), received = ref(''), busy = ref(false);
    const receivedRef = ref(null), rateRef = ref(null), payableRef = ref(null), codeRef = ref(null);
    // ----- 在线收款 -----
    const chan = ref({});
    if (props.storeId !== undefined) api.get('/api/pay/channels').then(r => { chan.value = r; }).catch(() => {});
    const online = computed(() => !!props.onOnline && ['wechat', 'alipay'].includes(method.value)
      && Object.values(chan.value).some(c => c.mode !== 'off' && c.scenes.includes('micropay')));
    const ol = reactive({ txn: null, code: '', qr: '', msg: '', busy: false });
    let polling = 0;
    const olReset = () => { polling++; Object.assign(ol, { txn: null, code: '', qr: '', msg: '', busy: false }); };
    const focusCode = () => setTimeout(() => { if (codeRef.value) codeRef.value.focus(); }, 30);
    const olDone = async (t) => {
      polling++;
      if (t.status === 'paid') {
        if (!t.order) { ol.msg = t.message || '已收款但开单失败，请联系管理员'; ol.txn = null; return ElMessage.error({ message: ol.msg, duration: 0, showClose: true }); }
        const p = { payments: [{ method: t.provider, amount: t.amount }], change: 0, received: t.amount };
        olReset();
        return props.onOnline(t.order, p);
      }
      ol.msg = (t.status === 'closed' ? '交易已关闭' : '付款失败') + (t.message ? '：' + t.message : '') + '，可以重扫或换方式';
      ol.txn = null; ol.qr = ''; ol.code = ''; focusCode();
    };
    const poll = async (my) => {
      const until = Date.now() + 180000;
      while (my === polling && ol.txn && Date.now() < until) {
        await new Promise(r => setTimeout(r, 2000));
        if (my !== polling || !ol.txn) return;
        try { const t = await api.get('/api/pay/pos/txns/' + ol.txn.id); if (t.status !== 'pending') return olDone(t); } catch (e) { /* 网络抖一下接着查 */ }
      }
      if (my === polling && ol.txn) ol.msg = '顾客一直没有付款，可以点“不收了”';
    };
    const startOnline = async (kind) => {
      if (ol.busy || ol.txn) return;
      const code = String(ol.code || '').trim();
      if (kind === 'code' && !code) return focusCode();
      ol.busy = true; ol.msg = '';
      try {
        if (!(await settle())) { ol.msg = qErr.value || '金额还没算好，请稍等'; return; }
        const t = await api.post('/api/pay/pos/start', { store_id: props.storeId, lines: props.lines, discount_rate: q.discount_rate, payable: q.payable_amount, remark: props.remark || '',
          auth_code: kind === 'code' ? code : '', provider: kind === 'qr' ? method.value : '', request_id: rid() });
        if (t.status !== 'pending') return olDone(t);
        ol.txn = t;
        if (t.code_url) { const qr = qrcode(0, 'M'); qr.addData(t.code_url); qr.make(); ol.qr = qr.createDataURL(6, 8); }
        poll(++polling);
      } catch (e) { ol.msg = e.message || String(e); ol.code = ''; focusCode(); }
      finally { ol.busy = false; }
    };
    const cancelOnline = async () => {
      if (!ol.txn) return true;
      try {
        const t = await api.post('/api/pay/pos/txns/' + ol.txn.id + '/close');
        if (t.status === 'paid') { await olDone(t); return false; }
        olReset(); focusCode(); return true;
      } catch (e) { err(e); return false; }
    };
    const mockPay = () => api.post('/api/pay/mock/' + ol.txn.out_no + '/pay').catch(err);
    const closeDlg = async () => { if (await cancelOnline()) { olReset(); emit('update:modelValue', false); } };
    watch(method, () => { olReset(); if (online.value) focusCode(); });
    const field = ref('received');  // 数字键盘当前输入到哪个框
    const focusReceived = () => setTimeout(() => { field.value = 'received'; if (method.value === 'cash' && receivedRef.value) receivedRef.value.focus(); }, 30);
    const pickField = (f) => { field.value = f; const r = { received: receivedRef, rate: rateRef, payable: payableRef }[f]; if (r && r.value) r.value.focus(); };
    const perms = computed(() => (props.user && props.user.permissions) || []);
    const canDiscount = computed(() => perms.value.includes('discount'));
    const canAdjust = computed(() => perms.value.includes('adjust_amount'));
    const limitText = computed(() => {
      const u = props.user || {}; const r = u.min_discount_rate || u.role_min_discount_rate; const a = u.max_adjust_amount != null ? u.max_adjust_amount : u.role_max_adjust_amount;
      const parts = []; if (r > 1) parts.push('最低 ' + r / 10 + ' 折'); if (a != null) parts.push('单笔最多调低 ' + yuan(a) + ' 元');
      return parts.length ? '你的权限：' + parts.join('，') : '';
    });
    // 算价：每次都记下用的是哪组折扣 / 应收，只采用最后一次的结果；收款前必须等算价完成且和当前输入一致
    let seq = 0, quotedKey = null;
    const inflight = new Set();  // 还没回来的算价请求
    const quoting = ref(0);
    const inputKey = () => JSON.stringify([rate.value, String(payableInput.value == null ? '' : payableInput.value).trim(), props.lines]);
    const quote = () => {
      const my = ++seq, key = inputKey();
      quoting.value++;
      const job = (async () => {
        try {
          let payable = null;
          if (String(payableInput.value == null ? '' : payableInput.value).trim() !== '') {
            payable = Shouyin.parseMoney(payableInput.value);
            if (payable === null) throw new Error('本次应收请填数字，例如 95 或 95.5');
          }
          if (rate.value !== null && !isFinite(rate.value)) throw new Error('折扣请填数字，例如 8.5');
          const r = await api.post('/api/pos/quote', { lines: props.lines, discount_rate: rate.value, payable });
          if (my === seq) { Object.assign(q, r); qErr.value = ''; quotedKey = key; }
        } catch (e) { if (my === seq) { qErr.value = e.message; quotedKey = null; err(e); } }
        finally { quoting.value--; inflight.delete(job); }
      })();
      inflight.add(job);
      return job;
    };
    // 收款前把还没生效的输入（打了自定折扣没按“确定”、改应收框还没离开）先算进去，等算价结束
    const settle = async () => {
      const a = document.activeElement;
      if (a && a.closest && a.closest('.paybox') && a.tagName === 'INPUT') a.blur();  // 触发输入框的 change
      await Vue.nextTick();
      const typed = String(rateInput.value == null ? '' : rateInput.value).trim();
      if (typed && Math.round(parseFloat(typed) * 10) !== rate.value) { applyRate(typed); await Vue.nextTick(); }
      if (quotedKey !== inputKey()) quote();
      // 等所有还没回来的算价都结束（只等最后一个不行：旧请求更慢时会原地空转，把页面卡死）
      while (inflight.size) await Promise.all([...inflight]);
      return !qErr.value && quotedKey === inputKey();
    };
    watch(rate, () => { rateInput.value = rate.value && ![95, 90, 88, 85, 80].includes(rate.value) ? rate.value / 10 : ''; payableInput.value = ''; quote(); });
    const applyRate = (v) => { rate.value = String(v == null ? '' : v).trim() ? Math.round(parseFloat(v) * 10) : null; };
    // 收款框内置数字键盘（触摸屏用）：输入到当前选中的框；“确定”应用折扣 / 改应收，“收款”直接确认收款
    const models = { received, rate: rateInput, payable: payableInput };
    const padPress = (k) => {
      const f = field.value, m = models[f];
      if (k === 'ok') {
        if (f === 'rate') applyRate(rateInput.value);
        else if (f === 'payable') quote();
        else return submit();
        return focusReceived();
      }
      m.value = padNext(m.value, k);
    };
    const reset = () => { olReset(); field.value = 'received'; rate.value = null; rateInput.value = ''; payableInput.value = ''; method.value = 'cash'; received.value = ''; quote(); };
    const roundDown = async (unit) => { payableInput.value = yuan(Math.floor(q.payable_amount / unit) * unit + (payableInput.value === '' ? 0 : 0)); await quote(); };
    const change = computed(() => { const r = Shouyin.parseMoney(received.value); return r !== null && r >= q.payable_amount ? yuan(r - q.payable_amount) : '0.00'; });
    const quick = computed(() => { const p = q.payable_amount / 100; return [...new Set([p, Math.ceil(p / 10) * 10, Math.ceil(p / 50) * 50, Math.ceil(p / 100) * 100])].map(v => v.toFixed(2)).slice(0, 4); });
    const submit = async () => {
      if (busy.value) return;
      busy.value = true;
      try { await doSubmit(); } finally { busy.value = false; }
    };
    const doSubmit = async () => {
      if (!(await settle())) return ElMessage.warning(qErr.value || '金额还没算好，请稍等再确认');
      const pay = { method: method.value, amount: q.payable_amount };
      if (method.value === 'cash') {
        const blank = String(received.value == null ? '' : received.value).trim() === '';
        const r = blank ? q.payable_amount : Shouyin.parseMoney(received.value);
        if (r === null) return ElMessage.warning('实收现金请填数字，例如 50 或 50.5');
        if (r < q.payable_amount) return ElMessage.warning('实收不足');
        pay.received = r;
      }
      // 等收款请求真正结束再放开按钮（emit 不会等处理函数，所以这里直接调用 onPay）
      if (props.onPay) await props.onPay({ payments: [pay], discount_rate: q.discount_rate, payable: q.payable_amount, change: pay.received ? pay.received - pay.amount : 0, received: pay.received || pay.amount });
    };
    // 键盘：F1 现金 F2 微信 F3 支付宝 F4 其他，回车确认收款（在折扣、改应收输入框里回车只是算价）
    const onKey = (e) => {
      if (!props.modelValue || e.isComposing || msgBoxOpen()) return;
      const c = K.combo(e);
      const m = { F1: 'cash', F2: 'wechat', F3: 'alipay', F4: 'other' }[c];
      if (m) { e.preventDefault(); if (ol.txn) return; method.value = m; focusReceived(); return; }
      if (c === 'Escape' && ol.txn) { e.preventDefault(); e.stopPropagation(); cancelOnline(); return; }
      if (c === 'Enter' && online.value) return;
      if (c === 'Enter') {
        const own = (r) => r.value && r.value.input === e.target;
        if (own(rateRef) || own(payableRef)) return;
        e.preventDefault(); submit();
      }
    };
    onMounted(() => window.addEventListener('keydown', onKey, true));
    onUnmounted(() => window.removeEventListener('keydown', onKey, true));
    return { q, qErr, rate, rateInput, payableInput, method, received, busy, canDiscount, canAdjust, limitText, quote, reset, roundDown, change, quick, submit, yuan, methods: METHODS,
      receivedRef, rateRef, payableRef, focusReceived, quoting, field, pickField, applyRate, PAD, padPress,
      chan, online, ol, codeRef, startOnline, cancelOnline, mockPay, closeDlg };
  },
};

// ---------------- 收银 ----------------
const Pos = {
  props: ['user', 'storeId', 'settings', 'agent', 'sync'],
  components: { PayDialog, PosKeyboard, PickDialog },
  template: `
  <div class="ws-body pos">
    <div class="pos-left">
      <div class="cats">
        <button type="button" class="rc" :class="{on: !cat}" @click="cat=null">全部</button>
        <button v-for="c in topCats" :key="c.id" type="button" class="rc" :class="{on: cat===c.id}" @click="cat=c.id">{{c.name}}</button>
      </div>
      <div class="grid">
        <el-empty v-if="scanText.trim() && !shown.length" :image-size="70" :description="'没有找到“' + scanText.trim() + '”'" style="grid-column:1/-1" />
        <div v-for="p in visible" :key="p.id" class="card" :class="{in: inCart(p)}" @click="tap(p)">
          <span v-if="inCart(p)" class="cnt">{{inCart(p)}}</span>
          <div class="img"><img v-if="p.image" :src="thumb(p.image, 200)" loading="lazy" decoding="async" alt="" draggable="false"><template v-else>{{p.name.slice(0,1)}}</template></div>
          <div class="n">{{p.name}}</div>
          <div class="sub">{{p.skus.length > 1 ? p.skus.length + ' 个规格' : (p.skus[0].name !== '默认' ? p.skus[0].name : p.unit)}}</div>
          <div class="p">¥{{priceText(p)}}</div>
        </div>
        <div v-if="visible.length < shown.length" ref="more" class="more">加载更多……</div>
      </div>
      <div class="dock">
        <div class="dock-l">
          <div class="scan" data-no-osk><el-input ref="scan" v-model="scanText" size="large" placeholder="扫条码，或输入名称 / 拼音首字母（如 zb 找纸杯）" clearable>
            <template #prefix><span class="ico" v-html="icon('scan')"></span></template></el-input></div>
          <div v-if="scanText.trim()" class="dock-tip">找到 <b>{{shown.length}}</b> 个商品，点商品加入（搜索词会保留，可接着点别的规格，再按字母就重新输入）；输入完整条码后点“确认”</div>
          <div v-else class="dock-tip">扫码枪直接扫，不用先点这里<br>也可以用右边键盘输入拼音首字母，如 <b>ZB</b> 找纸杯</div>
          <div class="keys"><span v-for="k in posKeys" :key="k[0]"><kbd>{{k[0]}}</kbd>{{k[1]}}</span></div>
        </div>
        <pos-keyboard v-if="settings.osk !== 'off'" @press="kbPress" />
      </div>
    </div>
    <div class="pos-right">
      <div class="cart-head"><b>当前订单</b><span class="muted">{{cart.length ? cart.length + ' 种 · ' + count + ' 件' : ''}}</span></div>
      <div class="cart">
        <el-empty v-if="!cart.length" :image-size="90" description="点商品或扫码加入" />
        <div v-for="(l,i) in cart" :key="l.sku_id" class="line" :class="{sel: i===sel}" @click="sel=i">
          <div class="info"><div class="ln">{{l.name}}</div><div class="muted">{{l.sku !== '默认' ? l.sku + ' · ' : ''}}¥{{yuan(l.price)}}</div>
            <div class="amt money">¥{{yuan(l.price * l.qty)}}</div></div>
          <div class="qty"><button type="button" tabindex="-1" @click.stop="dec(i)">−</button><input :ref="el => qtyEls[i] = el" v-model.number="l.qty" inputmode="numeric" @change="fix(i)" @focus="noteQty(l, i)" /><button type="button" tabindex="-1" @click.stop="l.qty++">＋</button></div>
          <button type="button" tabindex="-1" class="del" title="删除" @click.stop="remove(i)"><span class="ico" v-html="icon('x')"></span></button>
        </div>
      </div>
      <div class="fn">
        <button type="button" class="fb" :disabled="!cart.length" @click="hold"><span class="ico" v-html="icon('pause')"></span>挂单<kbd>F3</kbd></button>
        <button type="button" class="fb" :disabled="!held.length" @click="heldDlg=true"><span class="ico" v-html="icon('inbox')"></span>取单<em v-if="held.length" class="dot">{{held.length}}</em><kbd>F4</kbd></button>
        <button type="button" class="fb" :class="{set: remark}" @click="openRemark"><span class="ico" v-html="icon('note')"></span>备注<kbd>F7</kbd></button>
        <button type="button" class="fb" :disabled="!last.id" @click="reprint"><span class="ico" v-html="icon('printer')"></span>补打小票<kbd>F8</kbd></button>
        <button type="button" class="fb" @click="drawer"><span class="ico" v-html="icon('cash')"></span>开钱箱<kbd>F9</kbd></button>
        <button type="button" class="fb danger" :disabled="!cart.length" @click="clear"><span class="ico" v-html="icon('trash')"></span>清空</button>
      </div>
      <div class="sum">
        <div v-if="remark" class="rmk" @click="openRemark">备注：{{remark}}</div>
        <div class="row"><span>合计</span><span class="big money">¥{{yuan(total)}}</span></div>
        <button type="button" class="paybtn" :disabled="!cart.length" @click="payDlg=true">收款<kbd>F2</kbd></button>
      </div>
    </div>
    <el-dialog v-model="remarkDlg" title="整单备注" width="520px" @opened="remarkRef && remarkRef.focus()">
      <el-input ref="remarkRef" v-model="remark" size="large" maxlength="200" placeholder="例如：24 病区 12 床，下午送" clearable />
      <div class="chips"><button v-for="t in ['送到病房', '自取', '加急', '已电话确认']" :key="t" type="button" class="chip" @click="remark = remark ? remark + '，' + t : t">{{t}}</button></div>
      <template #footer><el-button size="large" @click="remark = ''; remarkDlg = false">清除备注</el-button><el-button size="large" type="primary" @click="remarkDlg = false">完成</el-button></template>
    </el-dialog>
    <pay-dialog v-model="payDlg" :user="user" :lines="lines" :store-id="storeId" :remark="remark" @pay="pay" @online="paidOnline" />
    <pick-dialog v-model="scanDlg" :matches="scanMatches" shortcuts @pick="add" />
    <el-dialog v-model="heldDlg" width="min(960px, 94vw)" class="held-dlg">
      <template #header><span class="pick-title">挂单</span><span class="muted pick-tip">共 {{held.length}} 单</span></template>
      <div class="held-grid">
        <div v-for="(h, j) in heldPage" :key="h.at" class="held-card">
          <div class="hc-head"><kbd>{{j + 1}}</kbd><b>{{h.time}}</b><span class="muted">{{h.cart.reduce((a, l) => a + l.qty, 0)}} 件</span><span class="hc-amt">¥{{yuan(h.cart.reduce((a, l) => a + l.qty * l.price, 0))}}</span></div>
          <ul class="hc-lines">
            <li v-for="l in h.cart.slice(0, 4)" :key="l.sku_id"><span>{{l.name}}<em v-if="l.sku !== '默认'">（{{l.sku}}）</em></span><b>×{{l.qty}}</b></li>
            <li v-if="h.cart.length > 4" class="muted">另有 {{h.cart.length - 4}} 种商品</li>
          </ul>
          <div v-if="h.remark" class="hc-remark">备注：{{h.remark}}</div>
          <div class="hc-btns"><el-button size="large" @click="askDropHeld(h)">删除</el-button><el-button size="large" type="primary" @click="takeHeld(held.indexOf(h))">取回</el-button></div>
        </div>
      </div>
      <template #footer v-if="heldPages > 1">
        <div class="held-pager"><el-button size="large" :disabled="heldPg === 0" @click="heldPg--">上一页</el-button><span>第 {{heldPg + 1}} / {{heldPages}} 页</span><el-button size="large" :disabled="heldPg >= heldPages - 1" @click="heldPg++">下一页</el-button></div>
      </template>
    </el-dialog>
    <el-dialog v-model="dropDlg" title="删除挂单" width="400px" append-to-body>
      <div>确定删除 {{dropTarget && dropTarget.time}} 的挂单吗？删除后无法恢复。</div>
      <template #footer><el-button size="large" @click="dropDlg = false">取消</el-button><el-button size="large" type="danger" @click="dropHeld">删除</el-button></template>
    </el-dialog>
    <pick-dialog v-model="skuDlg" :product="skuProduct" shortcuts @pick="add" />
    <el-dialog v-model="doneDlg" title="收款成功" width="440px" class="done-dlg">
      <div class="done"><div class="ok"><span class="ico" v-html="icon('check')"></span></div>
        <div class="k">应收 ¥{{yuan(last.payable_amount)}}<span v-if="lastReceived !== last.payable_amount">　实收 ¥{{yuan(lastReceived)}}</span></div><div v-if="lastChange" class="chg">找零 <b class="money">¥{{yuan(lastChange)}}</b></div></div>
      <template #footer><div class="done-btns"><el-button size="large" @click="reprint">补打小票<kbd>F8</kbd></el-button><el-button size="large" type="primary" @click="doneDlg=false">继续收银<kbd>Enter</kbd></el-button></div></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const products = ref([]), cats = ref([]), cat = ref(null), scanText = ref(''), cart = ref([]), remark = ref('');
    // 当前购物车存在本标签页（sessionStorage）：点“同步”刷新到新版本、或误按 F5 刷新后，购物车还在
    const cartKey = 'shouyin_cart_' + props.storeId;
    try { const s = JSON.parse(sessionStorage.getItem(cartKey) || 'null'); if (s) { cart.value = s.cart || []; remark.value = s.remark || ''; } } catch (e) {}
    watch([cart, remark], () => { try { sessionStorage.setItem(cartKey, JSON.stringify({ cart: cart.value, remark: remark.value })); } catch (e) {} }, { deep: true });
    const scanDlg = ref(false), scanMatches = ref([]);
    const payDlg = ref(false), skuDlg = ref(false), skuProduct = ref(null), doneDlg = ref(false), last = ref({}), lastChange = ref(0), lastReceived = ref(0), scan = ref(null);
    let reqId = rid();
    const topCats = computed(() => cats.value.filter(c => !c.parent_id && c.active));
    const shown = computed(() => {
      const t = scanText.value.trim();
      if (t) return products.value.filter(p => matchKw(p, t));
      if (!cat.value) return products.value;
      const ids = new Set([cat.value, ...cats.value.filter(c => c.parent_id === cat.value).map(c => c.id)]);
      return products.value.filter(p => (p.category_ids || [p.category_id]).some(id => ids.has(id)));
    });
    const load = async () => { try { [products.value, cats.value] = await Promise.all([api.get('/api/products'), api.get('/api/categories')]); products.value = products.value.filter(p => p.skus.length); } catch (e) { err(e); } };
    const sel = ref(-1), qtyEls = [], remarkRef = ref(null), remarkDlg = ref(false); let qtyBefore = 1;
    const openRemark = () => { remarkDlg.value = true; };
    const drawer = () => openDrawer(false);
    // 已在购物车里的商品再加一件：这一行（加完会被选中）闪一下深一点的蓝，再回到选中色（只是视觉提示）
    const flashLine = (i) => Vue.nextTick(() => {
      const el = document.querySelectorAll('.pos-right .line')[i];
      if (el && el.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        el.animate([{ backgroundColor: '#cce3f9' }, { backgroundColor: '#e8f2fd' }], { duration: 600, easing: 'cubic-bezier(.23, 1, .32, 1)' });
    });
    // 选中行（新加的、再加一件的、上下键选的）不在可见范围内时，购物车滚到这一行
    watch(() => [sel.value, cart.value.length], () => Vue.nextTick(() => {
      const el = document.querySelectorAll('.pos-right .line')[sel.value];
      if (el) el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));
    const add = (p, s) => {
      const i = cart.value.findIndex(x => x.sku_id === s.id);
      if (i >= 0) { cart.value[i].qty++; sel.value = i; flashLine(i); }
      else { cart.value.push({ sku_id: s.id, name: p.name, sku: s.name, price: s.price, qty: 1 }); sel.value = cart.value.length - 1; }
    };
    const focusScan = () => setTimeout(() => scan.value && scan.value.focus(), 0);
    // 用助记码 / 名称搜出来点选后，搜索词保留，方便接着选同一种商品的其他规格（如两种规格的纱布）。
    // 保留期间（fresh）再按字母会重新输入、回车直接收款、+ − Delete 改购物车，不用先清空
    let fresh = false;
    watch(scanText, () => { fresh = false; });
    const keepSearch = () => { if (!scanText.value) return; setTimeout(() => { fresh = true; const el = scan.value; if (el) { el.focus(); el.select(); } }, 0); };
    const tap = (p) => { pick(p); keepSearch(); };
    const pick = (p) => { if (p.skus.length === 1) add(p, p.skus[0]); else { skuProduct.value = p; skuDlg.value = true; } };
    const onScan = async () => {
      const t = scanText.value.trim(); if (!t) return;
      try {
        const ms = await barcodeMatches(t); scanText.value = '';
        if (ms.length === 1) add(ms[0].product, ms[0].sku);
        else { scanMatches.value = ms; scanDlg.value = true; }  // 一个条码对应多个规格：让店员选
      }
      catch (e) {
        // 不是条码：只剩一个商品就直接加入，多个就留在列表里让店员点
        const m = products.value.filter(p => matchKw(p, t));
        if (m.length === 1) { pick(m[0]); keepSearch(); } else if (!m.length) err(e);
      }
    };
    // 每个商品在购物车里的件数：购物车一变只算一次，不用每张卡片各自去翻购物车
    // 数量框删空还没失焦时 l.qty 是空字符串，按现有规则（fix）一律当 1 件算
    const qtyOf = (l) => Math.max(1, parseInt(l.qty, 10) || 1);
    const cartQty = computed(() => { const m = new Map(); for (const l of cart.value) m.set(l.sku_id, (m.get(l.sku_id) || 0) + qtyOf(l)); return m; });
    const inCart = (p) => { const m = cartQty.value; if (!m.size) return 0; let n = 0; for (const s of p.skus) n += m.get(s.id) || 0; return n; };
    // 商品多时先画前 36 个，滚到底再接着画，切分类、搜索时回到前 36 个
    const PAGE = 36, limit = ref(PAGE), more = ref(null);
    const visible = computed(() => shown.value.length > limit.value ? shown.value.slice(0, limit.value) : shown.value);
    watch([cat, scanText], () => { limit.value = PAGE; const g = document.querySelector('.pos .grid'); if (g) g.scrollTop = 0; });
    let io = null;
    watch(more, (el) => {
      if (io) io.disconnect();
      if (!el) return;
      io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) limit.value += PAGE; }, { root: el.parentElement, rootMargin: '1500px' });
      io.observe(el);
    });
    onUnmounted(() => io && io.disconnect());
    const dec = (i) => { if (cart.value[i].qty > 1) cart.value[i].qty--; else remove(i); };
    const remove = (i) => { cart.value.splice(i, 1); sel.value = Math.min(sel.value, cart.value.length - 1); };
    const fix = (i) => { const l = cart.value[i]; l.qty = Math.max(1, parseInt(l.qty) || 1); };
    const resetCart = () => { cart.value = []; remark.value = ''; sel.value = -1; };
    const clear = async () => {
      const n = cart.value.reduce((a, l) => a + qtyOf(l), 0);
      if (n >= 2) {  // 只有 1 件时直接清，避免多一次点击；2 件以上误触代价大
        try {
          await ElMessageBox.confirm(`购物车里还有 ${n} 件商品，确定清空吗？`, '清空购物车',
            { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning', customClass: 'big-confirm' });
        } catch (e) { return; }
      }
      resetCart();
    };
    // 挂单：顾客临时去拿东西、先收下一位时，把当前购物车存起来（存在本机浏览器）
    const heldKey = 'shouyin_held_' + props.storeId, held = ref([]), heldDlg = ref(false);
    try { held.value = JSON.parse(localStorage.getItem(heldKey) || '[]'); } catch (e) { held.value = []; }
    const saveHeld = () => { try { localStorage.setItem(heldKey, JSON.stringify(held.value)); } catch (e) {} };
    const hold = () => {
      if (!cart.value.length) return;
      const d = new Date();
      held.value.push({ at: Date.now(), time: d.toTimeString().slice(0, 5), cart: JSON.parse(JSON.stringify(cart.value)), remark: remark.value });
      saveHeld(); resetCart(); ElMessage.success('已挂单，可通过“取单”取回');
    };
    const HELD_PER_PAGE = 6, heldPg = ref(0);
    const heldPages = computed(() => Math.max(1, Math.ceil(held.value.length / HELD_PER_PAGE)));
    const heldPage = computed(() => held.value.slice(heldPg.value * HELD_PER_PAGE, (heldPg.value + 1) * HELD_PER_PAGE));
    watch(heldPages, (n) => { if (heldPg.value > n - 1) heldPg.value = n - 1; });
    watch(heldDlg, (v) => { if (v) heldPg.value = 0; });
    const takeHeld = (i) => {
      const h = held.value[i];
      if (!h) return;
      if (cart.value.length) hold();  // 当前也有商品：先把当前的挂起来
      const skus = new Map(products.value.flatMap(p => p.skus.map(s => [s.id, s])));
      const lines = h.cart.filter(l => skus.has(l.sku_id)).map(l => ({ ...l, price: skus.get(l.sku_id).price }));
      if (lines.length < h.cart.length) ElMessage.warning((h.cart.length - lines.length) + ' 种商品已下架，未能取回');
      cart.value = lines; remark.value = h.remark || '';
      held.value.splice(held.value.indexOf(h), 1); saveHeld(); heldDlg.value = false;
    };
    const dropDlg = ref(false), dropTarget = ref(null);
    const askDropHeld = (h) => { dropTarget.value = h; dropDlg.value = true; };
    const dropHeld = () => {
      const i = held.value.indexOf(dropTarget.value);
      dropDlg.value = false;
      if (i < 0) return;
      held.value.splice(i, 1); saveHeld(); ElMessage.success('挂单已删除');
      if (!held.value.length) heldDlg.value = false;
    };
    const count = computed(() => cart.value.reduce((a, l) => a + qtyOf(l), 0));
    const total = computed(() => cart.value.reduce((a, l) => a + qtyOf(l) * l.price, 0));
    const lines = computed(() => cart.value.map(l => ({ sku_id: l.sku_id, qty: l.qty })));
    let paying = false;
    const pay = async (p) => {
      if (paying) return;  // 连按回车不会重复收款
      paying = true;
      try { await doPay(p); } finally { paying = false; }
    };
    const doPay = async (p) => {
      let o;
      try {
        o = await api.post('/api/pos/checkout', { store_id: props.storeId, lines: lines.value, payments: p.payments, discount_rate: p.discount_rate,
          payable: p.payable, remark: remark.value, request_id: reqId });
      } catch (e) { return err(e); }
      return afterPaid(o, p);
    };
    // 微信 / 支付宝在线收款成功，订单已由服务端开好
    const paidOnline = (o, p) => afterPaid(o, p);
    const afterPaid = async (o, p) => {
      // 到这里收款已经成功。后面的提示音、打印出错都不能让店员误以为没收到钱
      reqId = rid(); last.value = o; lastChange.value = p.change; lastReceived.value = p.received != null ? p.received : o.payable_amount; payDlg.value = false; resetCart();
      // 收款成功只在顶部提示，不弹框、不用点；现金有找零时提示停留久一点（要补打小票点右侧“补打小票”或按 F8）
      ElMessage({ type: 'success', duration: p.change ? 6000 : 2500, showClose: !!p.change,
        message: '收款成功　应收 ¥' + yuan(o.payable_amount) + (lastReceived.value !== o.payable_amount ? '　实收 ¥' + yuan(lastReceived.value) : '') + (p.change ? '　找零 ¥' + yuan(p.change) : '') });
      setTimeout(focusScan, 350);  // 收款框关闭动画结束后回到搜索框，接着扫下一单
      if (props.settings.sound) { beep(1); speak('收款成功，' + yuan(o.payable_amount) + '元' + (p.change ? '，找零' + yuan(p.change) + '元' : '')); }
      if (deskInfo && deskInfo.drawer && p.payments.some(x => x.method === 'cash')) openDrawer(true);
      if (props.settings.autoPrintPos && !props.agent && canPrintHere()) {
        try { await printOrder(o.id, false); }
        catch (e) { ElMessage.warning({ message: '收款已成功，但小票没打出来：' + (e.message || e) + '。可以点“补打小票”，不要重新收款。', duration: 8000 }); }
      }
    };
    const reprint = async () => {
      if (!last.value.id) return ElMessage.info('这台电脑还没有收过款');
      try { await printOrder(last.value.id, true); } catch (e) { err(e); }
    };

    // ---------- 键盘收银 ----------
    // 扫码枪当键盘用：焦点不在输入框时打的字自动进搜索框；在备注、数量框里扫码也能认出来，不会把条码写进去
    const det = K.createScanDetector();
    const isEl = (r, t) => r && r.value && (r.value.input === t || r.value.textarea === t);
    const payNow = () => { if (cart.value.length) payDlg.value = true; };
    const move = (d) => { if (cart.value.length) sel.value = Math.max(0, Math.min(cart.value.length - 1, (sel.value < 0 ? cart.value.length : sel.value) + d)); };
    const bump = (d) => { const l = cart.value[sel.value]; if (!l) return; if (d < 0) dec(sel.value); else l.qty++; };
    const editQty = () => { const el = qtyEls[sel.value]; if (el) { el.focus(); el.select(); } };
    const kbPress = (k) => {
      if (k === 'enter') { scanText.value.trim() && !fresh ? onScan() : payNow(); }
      else if (k === 'back') scanText.value = fresh ? '' : scanText.value.slice(0, -1);
      else if (k === 'clear') scanText.value = '';
      else scanText.value = (fresh ? '' : scanText.value) + k;
      if (!payDlg.value) focusScan();
    };
    const scanCode = (code) => { scanText.value = code; onScan(); focusScan(); };
    const keyMap = {
      F1: () => { focusScan(); scan.value && scan.value.select(); }, F2: payNow, F3: hold,
      F4: () => (held.value.length ? (heldDlg.value = true) : ElMessage.info('暂无挂单')),
      F6: editQty, F7: openRemark, F8: reprint, F9: () => openDrawer(false),
      'Ctrl+Delete': clear, ArrowUp: () => move(-1), ArrowDown: () => move(1),
    };
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229 || msgBoxOpen() || payDlg.value) return;  // 输入法打字中、确认框、收款框（收款框自己处理）
      const c = K.combo(e), t = e.target, now = e.timeStamp || performance.now();
      const inScan = isEl(scan, t), inRemark = isEl(remarkRef, t), qi = qtyEls.indexOf(t);
      if (doneDlg.value) {  // 收款成功框：回车继续；直接扫下一件也行
        if (['Enter', 'Escape', 'Space'].includes(c)) { e.preventDefault(); doneDlg.value = false; focusScan(); return; }
        if (c === 'F8') { e.preventDefault(); reprint(); return; }
        if (!K.printable(e)) return;
        doneDlg.value = false;
      }
      if (dropDlg.value) return;  // 删除挂单确认框：只用按钮
      if (heldDlg.value && (c === 'PageDown' || c === 'PageUp')) {  // 挂单翻页
        e.preventDefault(); heldPg.value = Math.min(heldPages.value - 1, Math.max(0, heldPg.value + (c === 'PageDown' ? 1 : -1))); return;
      }
      // 选规格 / 选条码 / 取挂单：数字键选第几个（挂单按当前页）
      const pickList = skuDlg.value ? skuProduct.value.skus.map(s => () => { add(skuProduct.value, s); skuDlg.value = false; })
        : scanDlg.value ? scanMatches.value.map(m => () => { add(m.product, m.sku); scanDlg.value = false; })
        : heldDlg.value ? heldPage.value.map(h => () => takeHeld(held.value.indexOf(h))) : null;
      if (pickList) {
        if (/^[1-9]$/.test(c) && pickList[+c - 1]) { e.preventDefault(); pickList[+c - 1](); focusScan(); }
        return;
      }
      const free = !editable(t) || (inScan && (!scanText.value || fresh));  // 不在打字：+ − Delete 用来改购物车
      if ((c === '+' || c === '-') && free && sel.value >= 0) { e.preventDefault(); bump(c === '+' ? 1 : -1); return; }
      if (c === 'Delete' && free && sel.value >= 0) { e.preventDefault(); remove(sel.value); return; }
      if (K.printable(e)) {
        det.key(e.key, now);
        // 搜索词保留着时，在搜索框里接着打字/扫码也是重新输入（不接在旧词后面）
        if (!editable(t) || (inScan && fresh)) { e.preventDefault(); scanText.value = (fresh ? '' : scanText.value) + e.key; focusScan(); }
        return;
      }
      if (c === 'Enter') {
        const code = det.enter(now);
        if (inScan) {
          e.preventDefault();
          // 保险：扫码枪的条码万一接在了旧搜索词后面，只拿条码去查
          if (code && scanText.value !== code && scanText.value.endsWith(code)) scanText.value = code;
          scanText.value.trim() && !fresh ? onScan() : payNow(); return;
        }
        if (inRemark) {
          e.preventDefault();
          remarkDlg.value = false;
          if (code && remark.value.endsWith(code)) { remark.value = remark.value.slice(0, -code.length); scanCode(code); } else focusScan();
          return;
        }
        if (qi >= 0) {
          e.preventDefault();
          const l = cart.value[qi];
          if (code && l) { l.qty = qtyBefore; scanCode(code); } else { fix(qi); focusScan(); }
          return;
        }
        if (!editable(t)) { e.preventDefault(); scanText.value.trim() && !fresh ? onScan() : payNow(); }
        return;
      }
      if (c === 'Escape') { if (scanText.value) scanText.value = ''; focusScan(); return; }
      const fn = keyMap[c];
      if (fn) { e.preventDefault(); det.reset(); fn(); }
    };
    // 弹框关掉后回到搜索框，接着扫
    watch([payDlg, skuDlg, scanDlg, heldDlg, doneDlg, remarkDlg, dropDlg], (now, before) => { if (now.every(v => !v) && before.some(v => v)) focusScan(); });
    onMounted(() => { load(); setTimeout(() => scan.value && scan.value.focus(), 300); window.addEventListener('keydown', onKey, true); });
    watch(() => props.sync, load);  // 顶部“同步”：重新拉商品、价格、分类，购物车里已加的不动
    onUnmounted(() => window.removeEventListener('keydown', onKey, true));
    return { paidOnline, products, cats, cat, topCats, shown, scanText, cart, remark, payDlg, skuDlg, skuProduct, doneDlg, last, lastChange, lastReceived, scan,
      scanDlg, scanMatches, priceText, add, pick, tap, onScan, held, heldDlg, hold, takeHeld, dropHeld, askDropHeld, dropDlg, dropTarget, heldPg, heldPages, heldPage, inCart, dec, fix, clear, count, total, lines, pay, reprint, yuan,
      visible, more, thumb: Shouyin.thumb, sel, qtyEls, remarkRef, remarkDlg, openRemark, drawer, remove, icon: Shouyin.icon, posKeys: K.POS_KEYS, kbPress,
      noteQty: (l, i) => { qtyBefore = l.qty; sel.value = i; } };
  },
};

// ---------------- 订单 ----------------
const Orders = {
  props: ['user', 'store', 'storeId', 'settings', 'pendingCount', 'tick', 'agent'],
  components: { PayDialog, PosKeyboard, PickDialog },
  template: `
  <div class="ws-body opage">
    <div class="olist-pane">
      <div class="chips">
        <button v-for="t in statusTabs" :key="t[0]" type="button" class="chip" :class="{on: status === t[0]}" @click="status = t[0]; cur = null; load()">{{t[1]}}<em v-if="t[2]" class="cn">{{t[2]}}</em></button>
      </div>
      <div class="otool">
        <el-select v-model="source" placeholder="全部来源" clearable size="large" style="flex:1 1 140px" @change="load"><el-option label="扫码点单" value="online" /><el-option label="门店收银" value="pos" /></el-select>
        <el-date-picker v-model="day" type="date" value-format="YYYY-MM-DD" placeholder="日期" size="large" style="flex:1 1 170px" @change="load" />
        <el-input v-model="kw" placeholder="单号 / 床号 / 电话" clearable size="large" style="flex:1 1 250px" @keyup.enter="load" @clear="load" />
        <el-button size="large" @click="load">刷新</el-button>
      </div>
      <div class="orders">
        <el-empty v-if="!rows.length" description="没有订单" />
        <div v-for="o in rows" :key="o.id" class="ocard" :class="[o.source, {pending: o.status==='pending', on: cur && cur.id === o.id}]" @click="open(o)">
          <div class="h"><span class="where"><span class="src" :class="o.source">{{o.source === 'online' ? '扫码点单' : '门店收银'}}</span><span v-if="o.source === 'online'" class="loc">{{ ((o.area_name || '') + ' ' + (o.location_note || '')).trim() }}</span></span>
            <b class="money">¥{{yuan(o.payable_amount)}}</b></div>
          <div class="goods">{{o.items.map(i => i.product_name + (i.sku_name !== '默认' ? '(' + i.sku_name + ')' : '') + ' × ' + i.qty).join('，')}}</div>
          <div class="f"><span class="muted">{{o.created_at.slice(5, 16)}} · {{o.no}}</span><el-tag :type="tagType(o)" effect="light" round>{{o.status_text}} · {{o.pay_status_text}}</el-tag></div>
        </div>
      </div>
    </div>
    <div class="odetail">
      <el-empty v-if="!cur" description="点左边的订单查看详情" />
      <template v-else>
        <div class="od-head">
          <div><h2>{{ cur.source === 'online' ? (((cur.area_name || '') + ' ' + (cur.location_note || '')).trim() || '扫码点单') : '门店收银' }}
            <el-tag :type="tagType(cur)" effect="light" round>{{cur.status_text}} · {{cur.pay_status_text}}</el-tag></h2>
            <div class="muted">订单 {{cur.no}} · {{cur.source_text}} · {{cur.created_at.slice(5, 16)}} 下单</div></div>
          <el-button size="large" @click="print">{{cur.print_count ? '补打小票' : '打印小票'}}</el-button>
        </div>
        <div class="od-info">
          <div><span>区域 / 位置</span><b>{{ ((cur.area_name || '') + ' ' + (cur.location_note || '')).trim() || '—' }}</b></div>
          <div><span>电话</span><b>{{cur.contact_phone || '—'}}</b></div>
          <div><span>备注</span><b :class="{rmk: cur.remark}">{{cur.remark || '—'}}</b></div>
        </div>
        <el-table :data="cur.items" class="od-items">
          <el-table-column label="商品" min-width="180"><template #default="{row}"><b>{{row.product_name}}</b><el-tag v-if="row.added_at" size="small" type="info" style="margin-left:4px">换货</el-tag><div v-if="row.sku_name!=='默认'" class="muted">{{row.sku_name}}</div></template></el-table-column>
          <el-table-column prop="qty" label="数量" width="70" align="right" />
          <el-table-column label="单价" width="100" align="right"><template #default="{row}">¥{{yuan(row.unit_price)}}</template></el-table-column>
          <el-table-column label="金额" width="100" align="right"><template #default="{row}">¥{{yuan(row.amount)}}</template></el-table-column>
          <el-table-column label="已退换" width="80" align="right"><template #default="{row}"><span v-if="row.refunded_qty">{{row.refunded_qty}}</span><span v-else class="muted">—</span></template></el-table-column>
        </el-table>
        <div class="od-sum"><span class="muted">商品 ¥{{yuan(cur.original_amount)}}<template v-if="cur.discount_amount"> · 优惠 −¥{{yuan(cur.discount_amount)}}</template><template v-if="cur.exchanges && cur.exchanges.length"> · 换货差价 {{ xSum >= 0 ? '+' : '−' }}¥{{yuan(Math.abs(xSum))}}</template><template v-if="cur.refunded_amount - xRefund"> · 已退 ¥{{yuan(cur.refunded_amount - xRefund)}}</template></span>
          <span>应收 <b>¥{{yuan(cur.payable_amount)}}</b></span></div>
        <div v-if="cur.exchanges && cur.exchanges.length" class="od-x">
          <div class="muted" style="margin-bottom:6px">换货单</div>
          <div v-for="e in cur.exchanges" :key="e.id" class="x-rec"><span>{{e.no}}　{{e.created_at.slice(5, 16)}}　<template v-if="e.diff > 0">补收 ¥{{yuan(e.diff)}}</template><template v-else-if="e.diff < 0">退还 ¥{{yuan(-e.diff)}}</template><template v-else>差价 0</template>　{{e.condition === 'good' ? '完好回库' : '进残次品库'}}</span>
            <el-button size="small" @click="printExchange(e)">补打凭证</el-button></div>
        </div>
        <el-timeline class="od-log"><el-timeline-item v-for="(l,i) in cur.logs" :key="i" :timestamp="l.created_at">{{l.action}} {{l.detail}}</el-timeline-item></el-timeline>
        <div class="od-btns">
          <button v-if="cur.status==='pending' && can('orders')" type="button" class="bigbtn ok wide" @click="act('accept')">接单</button>
          <button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" type="button" class="bigbtn pri" @click="payDlg=true">收款</button>
          <button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" type="button" class="bigbtn" @click="openModify">修改订单</button>
          <button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" type="button" class="bigbtn dng" @click="cancel">取消订单</button>
          <button v-if="['paid','partial_refunded'].includes(cur.pay_status) && can('orders') && cur.items.some(i => i.qty > i.refunded_qty)" type="button" class="bigbtn pri" @click="openExchange">售后换货</button>
          <button v-if="['paid','partial_refunded'].includes(cur.pay_status) && can('refund')" type="button" class="bigbtn dng" @click="openRefund">退货退款</button>
        </div>
      </template>
    </div>
    <pay-dialog v-model="payDlg" :user="user" :lines="curLines" title="订单收款" @pay="collect" />
    <el-dialog v-model="mDlg" title="修改订单" width="640px" top="6vh">
      <el-table :data="mLines" border size="small">
        <el-table-column label="商品"><template #default="{row}">{{row.name}}</template></el-table-column>
        <el-table-column label="规格" width="190"><template #default="{row}">
          <el-select v-if="row.skus.length > 1" v-model="row.sku_id" size="small" style="width:170px"><el-option v-for="k in row.skus" :key="k.id" :label="k.name + '　¥' + yuan(k.price)" :value="k.id" /></el-select>
          <span v-else>{{row.skus.length ? (row.skus[0].name === '默认' ? '—' : row.skus[0].name) : row.sku_name}}</span></template></el-table-column>
        <el-table-column label="数量" width="140"><template #default="{row}"><el-input-number v-model="row.qty" :min="0" size="small" style="width:116px" /></template></el-table-column>
        <el-table-column label="小计" width="80" align="right"><template #default="{row}">{{yuan(mPrice(row) * row.qty)}}</template></el-table-column>
      </el-table>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <el-select v-model="mAdd" filterable :filter-method="v => (mKw = v)" placeholder="添加商品：输入名称或拼音首字母" style="flex:1" @change="addLine">
          <el-option v-for="o in mOptions" :key="o.id" :label="o.label" :value="o.id" />
        </el-select>
      </div>
      <el-form label-width="60px" style="margin-top:12px"><el-form-item label="原因"><el-input v-model="mReason" placeholder="可不填，如：顾客要换尺码" /></el-form-item></el-form>
      <template #footer><span style="float:left;line-height:32px">修改后应收 <b>¥{{yuan(mTotal)}}</b></span><el-button @click="mDlg=false">取消</el-button><el-button type="primary" :loading="mBusy" @click="doModify">保存修改</el-button></template>
    </el-dialog>
    <el-dialog v-model="xDlg" title="售后换货" width="min(900px, 96vw)" top="4vh" class="xd"
      :show-close="!xBusy" :close-on-press-escape="!xBusy" :close-on-click-modal="false">
      <fieldset class="x-content" :disabled="xBusy">
      <div class="x-sec">退回商品</div>
      <div v-for="row in xBack" :key="row.id" class="x-row">
        <div class="x-name">{{row.name}}<span class="muted">可退换 {{row.max}} 件</span></div>
        <div class="qty"><button type="button" aria-label="减少退回数量" @click="row.qty = Math.max(0, (parseInt(row.qty) || 0) - 1)">−</button>
          <input v-model.number="row.qty" data-no-osk aria-label="退回数量" inputmode="none" @change="row.qty = Math.min(row.max, Math.max(0, parseInt(row.qty) || 0))" />
          <button type="button" aria-label="增加退回数量" @click="row.qty = Math.min(row.max, (parseInt(row.qty) || 0) + 1)">＋</button></div>
      </div>
      <div class="x-sec">更换产品</div>
      <div v-if="xAlternatives.length" class="x-grid">
        <button v-for="({product, sku}) in xAlternatives" :key="sku.id" type="button" class="x-card" @click="xAddLine(product, sku)">
          <span class="muted">{{product.name}}</span><strong>{{sku.name}}</strong><span>¥{{yuan(sku.price)}}</span>
        </button>
      </div>
      <div v-for="row in xNew" :key="row.sku_id" class="x-row">
        <div class="x-name">{{row.name}}<span class="muted">单价 ¥{{yuan(row.price)}}</span></div>
        <div class="qty"><button type="button" aria-label="减少换出数量" @click="xSetNewQty(row, (parseInt(row.qty) || 0) - 1)">−</button>
          <input v-model.number="row.qty" data-no-osk aria-label="换出数量" inputmode="none" @change="xSetNewQty(row, row.qty)" />
          <button type="button" aria-label="增加换出数量" @click="row.qty = (parseInt(row.qty) || 0) + 1">＋</button></div>
      </div>
      <el-button size="large" class="x-add" :aria-expanded="xSearch" @click="xToggleSearch">{{xSearch ? '收起商品搜索' : '＋ 换其他商品'}}</el-button>
      <div v-if="xSearch" ref="xSearchPanel" class="x-search">
        <div class="x-search-input" data-no-osk>
          <el-input v-model="xKw" size="large" inputmode="none" aria-label="搜索商品" placeholder="输入名称或拼音首字母" clearable @keydown.enter.prevent="xConfirmSearch" />
          <p v-if="xKw.trim() && !xOptions.length" class="muted">未找到匹配的商品</p>
        </div>
        <pos-keyboard @press="xSearchKey" />
        <div v-if="xOptions.length" class="x-grid">
          <button v-for="p in xOptions" :key="p.id" type="button" class="x-card" @click="xPickProduct(p)">
            <strong>{{p.name}}</strong><span class="muted">{{p.skus.map(s => s.name).join(' / ')}}</span><span>¥{{priceText(p)}}</span>
          </button>
        </div>
      </div>
      <div class="x-sec">退回商品状态</div>
      <div class="x-opts two">
        <button type="button" class="m" :class="{on: x.condition === 'good'}" :aria-pressed="x.condition === 'good'" @click="x.condition = 'good'">完好，可再次销售</button>
        <button type="button" class="m" :class="{on: x.condition === 'defective'}" :aria-pressed="x.condition === 'defective'" @click="x.condition = 'defective'">已拆封或破损</button>
      </div>
      <template v-if="xQ && xQ.diff">
        <div class="x-sec">{{xQ.diff > 0 ? '补收方式' : '退款方式'}}</div>
        <div class="x-opts"><button v-for="(t,k) in methods" :key="k" type="button" class="m" :class="{on: x.method === k}" :aria-pressed="x.method === k" @click="x.method = k">{{t}}</button></div>
      </template>
      <template v-if="can('adjust_amount') && xBody.items.length">
        <div class="x-sec">更换产品金额</div>
        <el-button size="large" class="x-amt" aria-label="更换产品金额" :aria-expanded="xAmountOpen" @click="xToggleAmount">{{x.amount || '现价 ' + yuan(xOriginal)}} 元</el-button>
        <div v-if="xAmountOpen" ref="xPad" class="x-amount-panel">
          <el-input v-model="xAmountDraft" data-no-osk inputmode="none" size="large" aria-label="输入更换产品金额" :placeholder="'现价 ' + yuan(xOriginal)" @keydown.enter.prevent="xAmountKey('ok')"><template #append>元</template></el-input>
          <div class="pad">
            <button v-for="k in PAD" :key="k" type="button" tabindex="-1" class="pk" :class="'pk-' + ({back: 'fn', clear: 'fn', ok: 'ok'}[k] || 'n')" :data-k="k" @pointerdown.prevent @mousedown.prevent @click="xAmountKey(k)">{{ {back: '⌫', clear: '清空', ok: '确定'}[k] || k }}</button>
          </div>
        </div>
      </template>
      <div class="x-sec">原因 <span class="muted">选填</span></div>
      <div class="x-opts x-reasons"><button v-for="t in xReasons" :key="t" type="button" class="m" :class="{on: x.reason === t}" :aria-pressed="x.reason === t" @click="xPickReason(t)">{{t}}</button></div>
      <div v-if="x.reason === '其他'" ref="xReasonPanel" class="x-reason-input" data-no-osk>
        <el-input ref="xReasonInput" v-model="xReasonText" size="large" aria-label="其他换货原因" placeholder="请输入其他原因" @focus="xReasonKeys = true" @keydown.enter.prevent="xReasonKeys = false" />
        <pos-keyboard v-if="xReasonKeys" space @press="xReasonKey" />
      </div>
      </fieldset>
      <template #footer>
        <div class="x-foot">
          <span v-if="xQ" class="x-sum" aria-live="polite">
            退回 ¥{{yuan(xQ.old_amount)}}　换出 ¥{{yuan(xQ.new_amount)}}　
            <template v-if="xQ.diff > 0">需补收 <b>¥{{yuan(xQ.diff)}}</b></template>
            <template v-else-if="xQ.diff < 0">需退还 <b>¥{{yuan(-xQ.diff)}}</b></template>
            <b v-else>无需补收或退还</b>
          </span>
          <span v-else class="muted" role="status">{{xErr || (xBody.returns.length && xBody.items.length ? '正在计算差价…' : '请选择退回商品和更换产品')}}</span>
          <span class="x-btns">
            <el-button size="large" :disabled="xBusy" @click="xDlg=false">取消</el-button>
            <el-button size="large" type="primary" :loading="xBusy" :disabled="!xQ || xAmountOpen || xScanning > 0" @click="doExchange">确认换货</el-button>
          </span>
        </div>
      </template>
    </el-dialog>
    <pick-dialog v-model="xPickDlg" :product="xProduct" :matches="xMatches" class="x-picker" @pick="xAddLine" />
    <el-dialog v-model="rDlg" title="退货退款" width="560px">
      <el-table :data="rLines" border size="small">
        <el-table-column prop="name" label="商品" />
        <el-table-column label="可退" width="60"><template #default="{row}">{{row.max}}</template></el-table-column>
        <el-table-column label="退几件" width="150"><template #default="{row}"><el-input-number v-model="row.qty" :min="0" :max="row.max" size="small" /></template></el-table-column>
      </el-table>
      <el-form label-width="100px" style="margin-top:12px">
        <el-form-item label="退款方式"><el-select v-model="rf.method" style="width:140px"><el-option v-for="(t,k) in methods" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="退回库存"><el-checkbox v-model="rf.restock">退回本店库存</el-checkbox></el-form-item>
        <el-form-item label="原因"><el-input v-model="rf.reason" /></el-form-item>
      </el-form>
      <template #footer><el-button link type="primary" style="float:left" @click="refundAll">全部退</el-button><el-button @click="rDlg=false">取消</el-button><el-button type="warning" :loading="rBusy" @click="doRefund">确认退款</el-button></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const status = ref(''), source = ref(null), day = ref(''), kw = ref(''), rows = ref([]), cur = ref(null), payDlg = ref(false);
    const counts = ref({});
    const rBusy = ref(false);
    const rDlg = ref(false), rLines = ref([]), rf = reactive({ method: 'cash', restock: true, reason: '', rid: '' });
    const can = (p) => props.user.permissions.includes(p);
    const tagType = (o) => o.status === 'pending' ? 'danger' : o.status === 'cancelled' ? 'info' : o.pay_status === 'unpaid' ? 'warning' : o.pay_status === 'paid' ? 'success' : 'info';
    // 开了自动接单，新单进店就是“已接单待收款”，不会有待接单的；关掉才显示这个筛选项
    const autoAccept = computed(() => !props.store || props.store.accept_online_orders !== false);
    // 两个中间态都按需出现：手上真压着这类单才显示，免得常驻空筛选项
    const showPending = computed(() => !autoAccept.value || (counts.value.pending || 0) > 0 || status.value === 'pending');
    const showUnpaid = computed(() => (counts.value.unpaid || 0) > 0 || status.value === 'accepted');
    const load = async () => {
      const q = { store_id: props.storeId, source: source.value, begin: day.value, end: day.value, keyword: kw.value };
      if (status.value === 'refund') q.pay_status = 'partial_refunded,refunded';
      else if (status.value) q.status = status.value;
      try { const r = await api.get('/api/orders', q); rows.value = r.items; counts.value = r.counts || {}; } catch (e) { return err(e); }
      // 右边详情：没选中时默认打开第一单（优先待接单）
      if (!cur.value && rows.value.length) open(rows.value.find(o => o.status === 'pending') || rows.value[0]);
    };
    const statusTabs = computed(() => [['', '全部'], ...(showPending.value ? [['pending', '待接单', counts.value.pending]] : []),
      ...(showUnpaid.value ? [['accepted', '已接单待收款', counts.value.unpaid]] : []), ['completed', '已完成'], ['cancelled', '已取消'], ['refund', '退款退货']]);
    watch(() => props.tick, load);
    watch(showPending, (v) => { if (!v && status.value === 'pending') { status.value = ''; load(); } });
    watch(showUnpaid, (v) => { if (!v && status.value === 'accepted') { status.value = ''; load(); } });
    const open = async (o) => { try { cur.value = await api.get('/api/orders/' + o.id); } catch (e) { err(e); } };
    const refresh = async () => { cur.value = await api.get('/api/orders/' + cur.value.id); load(); };
    const act = async (a) => { try { await api.post('/api/orders/' + cur.value.id + '/' + a); await refresh(); ElMessage.success('已接单'); } catch (e) { err(e); } };
    const curLines = computed(() => cur.value ? cur.value.items.map(i => ({ sku_id: i.sku_id, qty: i.qty })) : []);
    let collecting = false, collectRid = '';
    watch(payDlg, (v) => { if (v) collectRid = rid(); });  // 每次打开收款框生成新请求号；网络重试沿用同一个
    const collect = async (p) => {
      if (collecting) return;  // 连点只发一次
      collecting = true;
      try { await api.post('/api/orders/' + cur.value.id + '/collect', { payments: p.payments, discount_rate: p.discount_rate, payable: p.payable, request_id: collectRid || undefined }); payDlg.value = false; await refresh(); ElMessage.success('已收款'); }
      catch (e) { err(e); } finally { collecting = false; }
    };
    const cancel = async () => {
      let reason; try { ({ value: reason } = await ElMessageBox.prompt('取消原因（可不填）', '取消订单', { inputValue: '' })); } catch (e) { return; }
      try { await api.post('/api/orders/' + cur.value.id + '/cancel', { reason: reason || '' }); await refresh(); ElMessage.success('已取消，库存已退回'); } catch (e) { err(e); }
    };
    const openRefund = () => {
      rLines.value = cur.value.items.map(i => ({ id: i.id, name: i.product_name + (i.sku_name !== '默认' ? '（' + i.sku_name + '）' : ''), max: i.qty - i.refunded_qty, qty: 0 })).filter(l => l.max > 0);
      const pay = cur.value.payments.find(p => p.kind === 'pay');
      Object.assign(rf, { method: pay ? pay.method : 'cash', restock: true, reason: '', rid: rid() });
      rDlg.value = true;
    };
    // 修改订单（未收款）：改规格 / 数量、去掉或添加商品
    const mDlg = ref(false), mLines = ref([]), mReason = ref(''), mBusy = ref(false), mAdd = ref(null), mKw = ref('');
    let prods = [];
    const prodOf = (sid) => prods.find(p => p.skus.some(k => k.id === sid));
    const mPrice = (l) => { const k = l.skus.find(k => k.id === l.sku_id); return k ? k.price : l.price; };
    const mTotal = computed(() => mLines.value.reduce((a, l) => a + mPrice(l) * l.qty, 0));
    const mOptions = computed(() => {
      const k = mKw.value.trim().toLowerCase(); if (!k) return [];
      const out = [];
      for (const p of prods) {
        if (!(p.name.toLowerCase().includes(k) || (p.mnemonic || '').includes(k) || (p.code || '').toLowerCase().includes(k))) continue;
        for (const s of p.skus) out.push({ id: s.id, label: p.name + (s.name !== '默认' ? '（' + s.name + '）' : '') + '　¥' + yuan(s.price) });
        if (out.length > 50) break;
      }
      return out;
    });
    const openModify = async () => {
      try { if (!prods.length) prods = (await api.get('/api/products')).filter(p => p.skus.length); } catch (e) { return err(e); }
      mLines.value = cur.value.items.map(i => { const p = prodOf(i.sku_id);
        return { name: i.product_name, sku_name: i.sku_name, sku_id: i.sku_id, qty: i.qty, price: i.unit_price, skus: p ? p.skus : [] }; });
      mReason.value = ''; mAdd.value = null; mKw.value = ''; mDlg.value = true;
    };
    const addLine = (sid) => {
      mAdd.value = null; mKw.value = '';
      const ex = mLines.value.find(l => l.sku_id === sid); if (ex) { ex.qty++; return; }
      const p = prodOf(sid); if (!p) return;
      mLines.value.push({ name: p.name, sku_name: '', sku_id: sid, qty: 1, price: 0, skus: p.skus });
    };
    const doModify = async () => {
      const lines = mLines.value.filter(l => l.qty > 0).map(l => ({ sku_id: l.sku_id, qty: l.qty }));
      if (!lines.length) return ElMessage.warning('至少保留一件商品；全部不要了请点“取消订单”');
      if (mBusy.value) return;
      mBusy.value = true;
      try { await api.post('/api/orders/' + cur.value.id + '/modify', { lines, reason: mReason.value }); mDlg.value = false; await refresh(); ElMessage.success('订单已修改'); }
      catch (e) { err(e); } finally { mBusy.value = false; }
    };
    // 售后换货：拿已购商品换其他商品或规格（可部分、可一换多），退回按原实收、换出按现价，多退少补
    const xDlg = ref(false), xBack = ref([]), xNew = ref([]), xCatalog = ref([]), xOrderId = ref(null), xBusy = ref(false);
    const xSearch = ref(false), xKw = ref(''), xSearchPanel = ref(null), xPickDlg = ref(false), xProduct = ref(null), xMatches = ref(null), xScanning = ref(0);
    const xAmountOpen = ref(false), xAmountDraft = ref(''), xPad = ref(null);
    const xReasonInput = ref(null), xReasonPanel = ref(null), xReasonText = ref(''), xReasonKeys = ref(false);
    const xReasons = ['尺码不合适', '质量问题', '拿错商品', '顾客不需要', '其他'];
    const x = reactive({ condition: 'good', amount: '', method: 'cash', reason: '', rid: '' });
    let xSession = 0;
    const xAlternatives = computed(() => {
      const selected = xBack.value.filter(l => l.qty > 0);
      const rows = selected.length ? selected : xBack.value;
      const productIds = new Set(rows.map(l => l.product_id));
      const oldSkus = new Set(rows.map(l => l.sku_id));
      return xCatalog.value.filter(p => productIds.has(p.id)).flatMap(product =>
        product.skus.filter(sku => !oldSkus.has(sku.id)).map(sku => ({ product, sku })));
    });
    const xOptions = computed(() => {
      const k = xKw.value.trim();
      return k ? xCatalog.value.filter(p => matchKw(p, k)) : [];
    });
    const xBody = computed(() => ({
      returns: xBack.value.filter(l => Number.isInteger(l.qty) && l.qty > 0 && l.qty <= l.max).map(l => ({ order_item_id: l.id, qty: l.qty })),
      items: xNew.value.filter(l => Number.isInteger(l.qty) && l.qty > 0).map(l => ({ sku_id: l.sku_id, qty: l.qty })),
      new_amount: Shouyin.parseMoney(x.amount),
    }));
    const xQuote = ref(null), xErr = ref('');
    const xQuoteKey = computed(() => JSON.stringify([xOrderId.value, xBody.value]));
    const xQ = computed(() => xQuote.value?.key === xQuoteKey.value ? xQuote.value.result : null);
    const xOriginal = computed(() => xQ.value?.new_original ?? xNew.value.reduce((n, l) => n + (Number.isInteger(l.qty) ? l.qty * l.price : 0), 0));
    watch([xDlg, xQuoteKey], ([open, key], _, onCleanup) => {
      xQuote.value = null; xErr.value = '';
      const body = xBody.value, orderId = xOrderId.value;
      if (!open || !body.returns.length || !body.items.length) return;
      let current = true;
      const timer = setTimeout(async () => {
        try {
          const result = await api.post('/api/orders/' + orderId + '/exchange/quote', body);
          if (current) xQuote.value = { key, result };
        } catch (e) {
          if (current) xErr.value = e.message || '无法计算差价';
        }
      }, 250);
      onCleanup(() => { current = false; clearTimeout(timer); });
    });
    watch(() => xBody.value.items.length, (n) => { if (!n) xAmountOpen.value = false; });
    const xToggleAmount = async () => {
      xAmountOpen.value = !xAmountOpen.value;
      if (!xAmountOpen.value) return;
      xAmountDraft.value = x.amount;
      await Vue.nextTick();
      xPad.value?.scrollIntoView({ block: 'nearest' });
    };
    const xAmountKey = (k) => {
      const value = xAmountDraft.value;
      if (k === 'ok') {
        const amount = value.trim().replace(/\.$/, '');
        if (amount && !Number.isSafeInteger(Shouyin.parseMoney(amount))) return ElMessage.warning('请输入有效金额，最多两位小数');
        x.amount = amount;
        xAmountOpen.value = false;
      } else xAmountDraft.value = padNext(value, k);
    };
    const xPickReason = async (reason) => {
      x.reason = reason === x.reason && reason !== '其他' ? '' : reason;
      xReasonKeys.value = x.reason === '其他';
      if (xReasonKeys.value) {
        await Vue.nextTick();
        xReasonPanel.value?.scrollIntoView({ block: 'nearest' });
      }
    };
    const xReasonKey = async (k) => {
      if (k === 'enter') { xReasonKeys.value = false; return; }
      const input = xReasonInput.value?.input;
      if (!input) return;
      const { value, caret } = ShouyinOSK.applyKey(xReasonText.value, input.selectionStart, input.selectionEnd, k);
      xReasonText.value = value;
      await Vue.nextTick();
      input.setSelectionRange(caret, caret);
    };
    const xAddLine = (product, sku) => {
      const row = xNew.value.find(l => l.sku_id === sku.id);
      if (row) row.qty = (parseInt(row.qty) || 0) + 1;
      else xNew.value.push({ sku_id: sku.id, qty: 1, price: sku.price, name: product.name + (sku.name !== '默认' ? '（' + sku.name + '）' : '') });
    };
    const xSetNewQty = (row, qty) => {
      const i = xNew.value.indexOf(row);
      if (i < 0) return;
      const count = parseInt(qty) || 0;
      if (count > 0) row.qty = count;
      else {
        xNew.value.splice(i, 1);
        if (!xNew.value.length) x.amount = '';
      }
    };
    const xPickProduct = (product) => {
      if (product.skus.length === 1) xAddLine(product, product.skus[0]);
      else { xProduct.value = product; xMatches.value = null; xPickDlg.value = true; }
    };
    const xScan = async (code, fromSearch = false) => {
      const session = xSession;
      xScanning.value++;
      try {
        const matches = await barcodeMatches(code);
        if (session !== xSession || !xDlg.value || xBusy.value) return;
        if (fromSearch && xKw.value.trim() !== code) return;
        if (matches.length === 1) xAddLine(matches[0].product, matches[0].sku);
        else if (matches.length) { xMatches.value = matches; xPickDlg.value = true; }
      } catch (e) {
        if (session !== xSession || !xDlg.value || xBusy.value) return;
        if (!fromSearch) err(e);
        else if (xKw.value.trim() === code && xOptions.value.length === 1) xPickProduct(xOptions.value[0]);
      } finally {
        if (session === xSession) xScanning.value--;
      }
    };
    const xToggleSearch = async () => {
      xSearch.value = !xSearch.value;
      if (!xSearch.value) return;
      await Vue.nextTick();
      xSearchPanel.value?.scrollIntoView({ block: 'start' });
    };
    const xConfirmSearch = () => { const code = xKw.value.trim(); if (code) xScan(code, true); };
    const xSearchKey = (k) => {
      if (k === 'enter') xConfirmSearch();
      else if (k === 'back') xKw.value = xKw.value.slice(0, -1);
      else if (k === 'clear') xKw.value = '';
      else xKw.value += k;
    };
    const xDetector = K.createScanDetector();
    let xScanInput = null;
    const xScanKey = (e) => {
      if (!xDlg.value || xBusy.value || e.isComposing || e.keyCode === 229 || msgBoxOpen()) return;
      const input = e.target, now = e.timeStamp || performance.now();
      if (K.printable(e)) {
        if (!xDetector.key(e.key, now)) {
          xScanInput = input.tagName === 'INPUT' && input.closest('.xd')
            ? { input, value: input.value, start: input.selectionStart, end: input.selectionEnd } : null;
        }
      } else if (e.key === 'Enter') {
        const code = xDetector.enter(now), before = xScanInput;
        xScanInput = null;
        if (!code) return;
        e.preventDefault(); e.stopPropagation();
        // 扫码枪会向当前输入框打字。还原原文和光标，再按条码查商品。
        if (before && before.input === input && input.value !== before.value) {
          input.value = before.value;
          input.setSelectionRange(before.start, before.end);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        xScan(code);
      } else if (['Escape', 'Backspace', 'Delete', 'Tab'].includes(e.key)) {
        xDetector.reset(); xScanInput = null;
      }
    };
    watch(xDlg, (open) => {
      if (open) return;
      xSession++; xPickDlg.value = false; xScanning.value = 0;
      xDetector.reset(); xScanInput = null;
    });
    onMounted(() => window.addEventListener('keydown', xScanKey, true));
    onUnmounted(() => window.removeEventListener('keydown', xScanKey, true));
    const openExchange = async () => {
      const order = cur.value, session = ++xSession;
      xOrderId.value = order.id;
      xBack.value = order.items.filter(i => i.qty > i.refunded_qty).map(i => ({ id: i.id, sku_id: i.sku_id, product_id: i.product_id, qty: 0, max: i.qty - i.refunded_qty,
        name: i.product_name + (i.sku_name !== '默认' ? '（' + i.sku_name + '）' : '') + (i.added_at ? '（换货）' : '') }));
      if (xBack.value.length === 1) xBack.value[0].qty = 1;
      xNew.value = []; xCatalog.value = []; xSearch.value = false; xKw.value = '';
      xAmountOpen.value = false; xReasonText.value = ''; xReasonKeys.value = false;
      const pay = order.payments.find(p => p.kind === 'pay');
      Object.assign(x, { condition: 'good', amount: '', method: pay ? pay.method : 'cash', reason: '', rid: rid() });
      xDlg.value = true;
      try {
        const products = await api.get('/api/products');
        if (session === xSession && xDlg.value) xCatalog.value = products
          .map(p => ({ ...p, skus: p.skus.filter(s => s.active !== false) })).filter(p => p.skus.length);
      } catch (e) { if (session === xSession && xDlg.value) err(e); }
    };
    const doExchange = async () => {
      if (xBusy.value || !xQ.value || xAmountOpen.value || xScanning.value) return;
      xBusy.value = true;
      let r;
      try {
        r = await api.post('/api/orders/' + xOrderId.value + '/exchange', { ...xBody.value, condition: x.condition, method: x.method,
          reason: x.reason === '其他' ? xReasonText.value.trim() : x.reason, request_id: x.rid, ...printOpts() });
      } catch (e) { return err(e); } finally { xBusy.value = false; }
      xDlg.value = false;
      const exchanges = (cur.value.exchanges || []).filter(e => e.id !== r.exchange.id);
      cur.value = { ...cur.value, ...r.order, exchanges: [...exchanges, r.exchange] };
      const updated = cur.value;
      api.get('/api/orders/' + r.order.id).then(detail => { if (cur.value === updated) cur.value = detail; }).catch(() => {});
      load();
      const d = r.exchange.diff;
      ElMessage.success('换货完成' + (d > 0 ? '，已补收 ¥' + yuan(d) : d < 0 ? '，已退还 ¥' + yuan(-d) : ''));
      if (r.receipt) {
        try { await outPrint(r.receipt); }
        catch (e) { ElMessage.warning('换货已完成，但凭证打印失败，可在换货单中补打'); }
      }
    };
    const xSum = computed(() => ((cur.value && cur.value.exchanges) || []).reduce((a, e) => a + e.diff, 0));
    const xRefund = computed(() => ((cur.value && cur.value.exchanges) || []).reduce((a, e) => a + Math.max(0, -e.diff), 0));
    const printExchange = async (e) => { try { await outPrint(await api.post('/api/exchanges/' + e.id + '/print', { reprint: true, ...printOpts() })); } catch (er) { err(er); } };
    const doRefund = async () => {
      const lines = rLines.value.filter(l => l.qty > 0).map(l => ({ order_item_id: l.id, qty: l.qty }));
      if (!lines.length) return ElMessage.warning('请填写退货数量');
      if (rBusy.value) return;
      rBusy.value = true;
      try { const r = await api.post('/api/orders/' + cur.value.id + '/refund', { lines, method: rf.method, restock: rf.restock, reason: rf.reason, request_id: rf.rid });
        rDlg.value = false; await refresh(); ElMessage.success('已退款 ¥' + yuan(r.refund.amount)); } catch (e) { err(e); } finally { rBusy.value = false; }
    };
    const refundAll = () => rLines.value.forEach(l => { l.qty = l.max; });
    const print = async () => { try { await printOrder(cur.value.id, cur.value.print_count > 0); } catch (e) { err(e); } try { await refresh(); } catch (e) {} };
    onMounted(load);
    return { status, source, day, kw, rows, counts, statusTabs, cur, payDlg, rDlg, rLines, rf, can, tagType, load, open, act, curLines, collect, cancel, openRefund, doRefund, refundAll, rBusy, showPending, showUnpaid,
      xDlg, xBack, xNew, xAlternatives, xSearch, xKw, xOptions, xSearchPanel, xPickDlg, xProduct, xMatches, xBusy, xScanning, xQ, xErr, x, xBody, xOriginal,
      xAmountOpen, xAmountDraft, xPad, PAD, xToggleAmount, xAmountKey, xReasons, xReasonInput, xReasonPanel, xReasonText, xReasonKeys, xPickReason, xReasonKey,
      priceText, xToggleSearch, xConfirmSearch, xSearchKey, xPickProduct, openExchange, xAddLine, xSetNewQty, doExchange, printExchange, xSum, xRefund,
      mDlg, mLines, mReason, mBusy, mAdd, mKw, mPrice, mTotal, mOptions, openModify, addLine, doModify, print, yuan, methods: METHODS };
  },
};

// ---------------- 交班汇总 ----------------
const Shift = {
  props: ['storeId', 'user', 'sync'],
  template: `
  <div class="ws-body shiftpage">
    <section class="spane grow">
      <template v-if="cur">
        <div class="sp-head"><div><h2>当班中 · {{cur.cashier}}</h2><div class="muted">{{shortTime(cur.started_at)}} 开班 · 备用金 ¥{{yuan(cur.opening_cash)}}</div></div><el-button size="large" @click="loadCur">刷新</el-button></div>
        <div class="kpis">
          <div><span>本班单数</span><b>{{cur.orders}}</b></div>
          <div><span>本班净收</span><b>¥{{yuan(cur.net)}}</b></div>
          <div><span>换货补差 / 退差</span><b class="sm">+¥{{yuan(cur.exchange_pay || 0)}} / −¥{{yuan(cur.exchange_refund || 0)}}</b></div>
        </div>
        <el-table :data="Object.values(cur.methods)">
          <el-table-column prop="method_text" label="方式" />
          <el-table-column prop="pay_count" label="收款笔数" align="right" />
          <el-table-column label="收款" align="right"><template #default="{row}">¥{{yuan(row.pay)}}</template></el-table-column>
          <el-table-column label="退款" align="right"><template #default="{row}">¥{{yuan(row.refund)}}</template></el-table-column>
          <el-table-column v-if="cur.exchange_pay || cur.exchange_refund" label="其中换货补差 / 退差" width="170" align="right"><template #default="{row}">{{yuan(row.exchange_pay)}} / {{yuan(row.exchange_refund)}}</template></el-table-column>
          <el-table-column label="净额" align="right"><template #default="{row}"><b>¥{{yuan(row.pay - row.refund)}}</b></template></el-table-column>
        </el-table>
      </template>
      <template v-else-if="last">
        <div class="sp-head"><div><h2>交班完成</h2><div class="muted">{{timeRange(last)}}</div></div></div>
        <div class="kpis">
          <div><span>单数</span><b>{{last.orders}}</b></div><div><span>净收</span><b>¥{{yuan(last.net)}}</b></div>
          <div v-if="last.exchange_pay || last.exchange_refund"><span>换货补差 / 退差</span><b class="sm">¥{{yuan(last.exchange_pay)}} / ¥{{yuan(last.exchange_refund)}}</b></div>
          <div><span>应有 / 实点现金</span><b class="sm">¥{{yuan(last.expected_cash)}} / ¥{{yuan(last.counted_cash)}}</b></div>
          <div><span>差额</span><b :style="{color: last.cash_diff ? 'var(--danger)' : 'var(--success)'}">{{ last.cash_diff === 0 ? '0' : (last.cash_diff > 0 ? '长 ' : '短 ') + yuan(Math.abs(last.cash_diff)) }}</b></div>
        </div>
      </template>
      <div class="sp-sec">我的交班记录</div>
      <el-table :data="history">
        <el-table-column label="时间" min-width="200"><template #default="{row}">{{timeRange(row)}}</template></el-table-column>
        <el-table-column prop="orders" label="单数" width="70" align="right" />
        <el-table-column label="净收" width="110" align="right"><template #default="{row}">¥{{yuan(row.net)}}</template></el-table-column>
        <el-table-column label="备用金" width="100" align="right"><template #default="{row}">¥{{yuan(row.opening_cash)}}</template></el-table-column>
        <el-table-column label="应有 / 实点" width="170" align="right"><template #default="{row}">{{yuan(row.expected_cash)}} / {{row.counted_cash == null ? '—' : yuan(row.counted_cash)}}</template></el-table-column>
        <el-table-column label="差额" width="90" align="right"><template #default="{row}"><span v-if="row.cash_diff != null" :style="{color: row.cash_diff ? 'var(--danger)' : ''}">{{ row.cash_diff > 0 ? '+' : '' }}{{yuan(row.cash_diff)}}</span></template></el-table-column>
      </el-table>
    </section>
    <section v-if="loaded" class="spane side">
      <template v-if="cur">
        <h2>交班</h2>
        <div class="calc">
          <div><span>备用金</span><span>¥{{yuan(cur.opening_cash)}}</span></div>
          <div><span>＋ 现金收款</span><span>¥{{yuan(cashOf('pay'))}}</span></div>
          <div><span>− 现金退款</span><span>¥{{yuan(cashOf('refund'))}}</span></div>
          <div class="t"><b>钱箱应有现金</b><b>¥{{yuan(cur.expected_cash)}}</b></div>
        </div>
        <label class="bigfield"><span>实点现金</span><el-input v-model="counted" data-no-osk inputmode="decimal" placeholder="点钱箱后填" /><i>元</i></label>
        <div v-if="diff !== null" class="diffbox" :class="{bad: diff !== 0}"><span>差额</span><b>{{ diff === 0 ? '¥0.00 · 刚好' : (diff > 0 ? '长款 ¥' + yuan(diff) : '短款 ¥' + yuan(-diff)) }}</b></div>
        <el-input v-model="remark" size="large" placeholder="备注：差额原因等，选填" />
        <div class="pad"><button v-for="k in PAD" :key="k" type="button" tabindex="-1" class="pk" :class="'pk-' + ({back: 'fn', clear: 'fn', ok: 'ok'}[k] || 'n')" @pointerdown.prevent @mousedown.prevent @click="k === 'ok' ? closeShift() : (counted = padNext(counted, k))">{{ {back: '⌫', clear: '清空', ok: '交班'}[k] || k }}</button></div>
      </template>
      <template v-else>
        <h2>开班</h2>
        <label class="bigfield"><span>备用金</span><el-input v-model="opening" data-no-osk inputmode="decimal" placeholder="0" /><i>元</i></label>
        <div class="pad"><button v-for="k in PAD" :key="k" type="button" tabindex="-1" class="pk" :class="'pk-' + ({back: 'fn', clear: 'fn', ok: 'ok'}[k] || 'n')" @pointerdown.prevent @mousedown.prevent @click="k === 'ok' ? openShift() : (opening = padNext(opening, k))">{{ {back: '⌫', clear: '清空', ok: '开班'}[k] || k }}</button></div>
      </template>
    </section>
  </div>`,
  setup(props) {
    const cur = ref(null), loaded = ref(false), opening = ref(''), counted = ref(''), remark = ref(''), busy = ref(false), last = ref(null), history = ref([]);
    const parse = (v) => Shouyin.parseMoney(v);
    const diff = computed(() => { if (!cur.value || String(counted.value).trim() === '') return null; const c = parse(counted.value); return c === null ? null : c - cur.value.expected_cash; });
    const loadCur = async () => { try { cur.value = (await api.get('/api/shifts/current', { store_id: props.storeId })).shift; loaded.value = true; } catch (e) { err(e); } };
    const loadHistory = async () => { try { history.value = (await api.get('/api/shifts', { store_id: props.storeId, mine: true })).slice(0, 20); } catch (e) {} };
    const openShift = async () => {
      const v = String(opening.value).trim() === '' ? 0 : parse(opening.value);
      if (v === null) return ElMessage.warning('备用金请填数字，没有填 0');
      busy.value = true;
      try { cur.value = await api.post('/api/shifts/open', { store_id: props.storeId, opening_cash: v }); last.value = null; ElMessage.success('已开班'); loadHistory(); }
      catch (e) { err(e); } finally { busy.value = false; }
    };
    const closeShift = async () => {
      const c = parse(counted.value);
      if (String(counted.value).trim() === '' || c === null) return ElMessage.warning('请先点钱箱，填实点现金');
      await loadCur();
      const d = c - cur.value.expected_cash;
      try { await ElMessageBox.confirm(`应有现金 ¥${yuan(cur.value.expected_cash)}，实点 ¥${yuan(c)}，${d === 0 ? '没有差额' : (d > 0 ? '长款 ¥' + yuan(d) : '短款 ¥' + yuan(-d))}。确定交班吗？`, '交班', { type: d ? 'warning' : 'info' }); } catch (e) { return; }
      busy.value = true;
      try { last.value = await api.post('/api/shifts/' + cur.value.id + '/close', { counted_cash: c, remark: remark.value }); cur.value = null; counted.value = ''; remark.value = ''; opening.value = ''; ElMessage.success('已交班'); loadHistory(); }
      catch (e) { err(e); } finally { busy.value = false; }
    };
    onMounted(() => { loadCur(); loadHistory(); });
    watch(() => props.sync, () => { loadCur(); loadHistory(); });
    const cashOf = (k) => ((cur.value && cur.value.methods.cash) || {})[k] || 0;
    return { cur, loaded, opening, counted, remark, busy, last, history, diff, loadCur, openShift, closeShift, cashOf, shortTime, timeRange, PAD, padNext, yuan };
  },
};

// ---------------- 本店库存 ----------------
const Stock = {
  props: ['storeId', 'canEdit', 'sync'],
  template: `
  <div class="ws-body shiftpage"><section class="spane grow">
    <div class="sp-head"><h2>本店库存 <span class="muted">{{rows.length}} 个库存品</span></h2>
      <div class="sp-btns"><el-button size="large" @click="load">刷新</el-button><el-button v-if="canEdit && !adjusting" size="large" type="primary" @click="startAdjust">盘点</el-button></div></div>
    <div class="otool">
      <el-input v-model="kw" size="large" placeholder="搜索名称" clearable style="flex:1 1 280px" @keyup.enter="load" @clear="load" />
      <div class="chips"><button type="button" class="chip" :class="{on: !onlyLow}" @click="onlyLow = false">全部</button><button type="button" class="chip" :class="{on: onlyLow}" @click="onlyLow = true">该补货了 · {{lowCount}}</button></div>
    </div>
    <el-table :data="shownRows">
      <el-table-column label="库存品" min-width="200"><template #default="{row}"><b>{{row.name}}</b></template></el-table-column>
      <el-table-column prop="unit" label="单位" width="80" />
      <el-table-column label="库存" width="100" align="right"><template #default="{row}"><b :style="{color: row.qty <= 0 ? '#CB2634' : (row.low ? '#86501A' : '')}">{{row.qty}}</b></template></el-table-column>
      <el-table-column label="最早到期" width="130"><template #default="{row}">{{row.earliest_expiry || '—'}}</template></el-table-column>
      <el-table-column label="状态" width="110"><template #default="{row}"><el-tag v-if="row.qty <= 0" type="danger" round>缺货</el-tag><el-tag v-else-if="row.low" type="warning" round>该补货了</el-tag></template></el-table-column>
      <el-table-column v-if="adjusting" label="实盘数" width="150"><template #default="{row}"><el-input v-model="row.real" inputmode="decimal" size="large" /></template></el-table-column>
    </el-table>
    <div v-if="adjusting" class="sp-foot"><button type="button" class="bigbtn" @click="adjusting=false">取消</button><button type="button" class="bigbtn pri" @click="submit">提交盘点</button></div>
    <div class="note">没填实盘数的库存品保持不变。</div>
  </section></div>`,
  setup(props) {
    const kw = ref(''), rows = ref([]), adjusting = ref(false), onlyLow = ref(false); let reqId = '';
    const lowCount = computed(() => rows.value.filter(r => r.low || r.qty <= 0).length);
    const shownRows = computed(() => onlyLow.value ? rows.value.filter(r => r.low || r.qty <= 0) : rows.value);
    const load = async () => { try { rows.value = (await api.get('/api/stores/' + props.storeId + '/stock', { keyword: kw.value })).map(r => ({ ...r, real: '' })); } catch (e) { err(e); } };
    const startAdjust = () => { reqId = rid(); adjusting.value = true; };
    const submit = async () => {
      const lines = rows.value.filter(r => r.real !== '').map(r => ({ stock_item_id: r.stock_item_id, qty: parseFloat(r.real) }));
      if (!lines.length) return ElMessage.warning('请填写实盘数');
      try { await api.post('/api/stores/' + props.storeId + '/stock-adjust', { lines, request_id: reqId }); adjusting.value = false; ElMessage.success('已盘点'); load(); } catch (e) { err(e); }
    };
    onMounted(load);
    watch(() => props.sync, load);
    return { kw, rows, adjusting, onlyLow, lowCount, shownRows, load, startAdjust, submit };
  },
};

// ---------------- 要货申请 ----------------
const Requisitions = {
  props: ['storeId', 'stockVisible', 'sync'],
  template: `
  <div class="ws-body shiftpage"><section class="spane grow">
      <div class="sp-head"><h2>向仓库要货</h2><div class="sp-btns"><el-button size="large" @click="load">刷新</el-button><el-button size="large" type="primary" @click="openNew">新建要货单</el-button></div></div>
      <div class="chips"><button v-for="t in [['', '全部'], ['pending', '待处理'], ['done', '已调拨'], ['rejected', '已驳回']]" :key="t[0]" type="button" class="chip" :class="{on: status === t[0]}" @click="status = t[0]; load()">{{t[1]}}</button></div>
      <el-table :data="rows">
        <el-table-column type="expand"><template #default="{row}"><div style="padding:4px 16px 10px 48px">
          <el-table :data="row.lines" size="small" border>
            <el-table-column prop="name" label="库存品" /><el-table-column prop="unit" label="单位" width="70" />
            <el-table-column prop="qty" label="要" width="80" align="right" />
            <el-table-column label="实发" width="80" align="right"><template #default="{row: l}">{{ l.sent_qty == null ? '—' : l.sent_qty }}</template></el-table-column>
          </el-table></div></template></el-table-column>
        <el-table-column label="要货单" min-width="190"><template #default="{row}"><div>{{row.no}}</div><div class="muted">{{row.created_at}} · {{row.created_by_name}}</div></template></el-table-column>
        <el-table-column label="内容" min-width="220"><template #default="{row}">{{ row.lines.filter(l => +l.qty > 0).map(l => l.name + '×' + l.qty).join('、') }}<div v-if="row.remark" class="muted">备注：{{row.remark}}</div></template></el-table-column>
        <el-table-column label="状态" width="210"><template #default="{row}">
          <el-tag :type="{pending: 'warning', done: 'success', rejected: 'danger', cancelled: 'info'}[row.status]" size="small">{{row.status_text}}</el-tag>
          <div v-if="row.status === 'done'" class="muted">{{row.handled_at}} 调拨 {{row.transfer_doc_no}}</div>
          <div v-if="row.handle_note" class="muted">{{ row.status === 'rejected' ? '驳回原因：' : '仓库备注：' }}{{row.handle_note}}</div></template></el-table-column>
        <el-table-column width="100"><template #default="{row}"><el-button v-if="row.status === 'pending'" size="large" type="danger" plain @click="cancel(row)">撤回</el-button></template></el-table-column>
      </el-table>
    </section>
    <el-dialog v-model="dlg" title="新建要货单" width="640px" top="5vh">
      <div class="otool" style="margin-bottom:10px"><el-input v-model="kw" size="large" placeholder="搜索库存品" clearable style="width:220px" /><el-input v-model="remark" size="large" placeholder="备注（选填）" style="flex:1" /></div>
      <el-table :data="shown" max-height="460">
        <el-table-column prop="name" label="库存品" /><el-table-column prop="unit" label="单位" width="70" />
        <el-table-column v-if="stockVisible" label="本店现有" width="90" align="right"><template #default="{row}">{{ have[row.id] ?? 0 }}</template></el-table-column>
        <el-table-column label="要几个" width="130"><template #default="{row}"><el-input v-model="row.qty" inputmode="decimal" /></template></el-table-column>
      </el-table>
      <template #footer><el-button size="large" @click="dlg=false">取消</el-button><el-button size="large" type="primary" :loading="saving" @click="submit">提交给仓库</el-button></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const rows = ref([]), status = ref(''), dlg = ref(false), items = ref([]), kw = ref(''), remark = ref(''), saving = ref(false), have = ref({});
    let reqId = '';
    const load = async () => { try { rows.value = (await api.get('/api/requisitions', { store_id: props.storeId, status: status.value })).items; } catch (e) { err(e); } };
    const shown = computed(() => kw.value ? items.value.filter(i => i.name.includes(kw.value)) : items.value);
    const openNew = async () => {
      reqId = rid(); remark.value = ''; kw.value = '';
      try { items.value = (await api.get('/api/stock-items')).filter(i => i.active).map(i => ({ id: i.id, name: i.name, unit: i.unit, qty: '' })); } catch (e) { return err(e); }
      if (props.stockVisible) { try { have.value = Object.fromEntries((await api.get('/api/stores/' + props.storeId + '/stock')).map(r => [r.stock_item_id, r.qty])); } catch (e) {} }
      dlg.value = true;
    };
    const submit = async () => {
      const bad = items.value.find(i => String(i.qty).trim() !== '' && !/^\d+(\.\d{1,3})?$/.test(String(i.qty).trim()));
      if (bad) return ElMessage.warning(bad.name + ' 的数量请填数字');
      const lines = items.value.filter(i => parseFloat(i.qty) > 0).map(i => ({ stock_item_id: i.id, qty: parseFloat(i.qty) }));
      if (!lines.length) return ElMessage.warning('请填写要货数量');
      saving.value = true;
      try { await api.post('/api/stores/' + props.storeId + '/requisitions', { lines, remark: remark.value, request_id: reqId }); dlg.value = false; ElMessage.success('已提交给仓库'); load(); }
      catch (e) { err(e); } finally { saving.value = false; }
    };
    const cancel = async (row) => {
      try { await ElMessageBox.confirm('撤回要货单 ' + row.no + '？', '撤回', { type: 'warning' }); } catch (e) { return; }
      try { await api.post('/api/requisitions/' + row.id + '/cancel'); load(); } catch (e) { err(e); }
    };
    onMounted(load);
    watch(() => props.sync, load);
    return { rows, status, dlg, kw, remark, saving, have, shown, load, openNew, submit, cancel };
  },
};

// ---------------- 主框架 ----------------
const App = {
  components: { Pos, Orders, Shift, Stock, Requisitions },
  template: `
  <div v-if="!user" class="login-wrap">
    <div class="login-hero">
      <div class="logo"><span class="mark">收</span>收银系统 · 门店工作台</div>
      <div><h2>收银、接单、出票<br>一个页面全搞定</h2>
        <ul><li>扫码枪扫条码直接加入</li><li>小程序新订单响铃并自动打印</li><li>打折、抹零按权限开放</li><li>退货退款、补打小票</li></ul></div>
      <div class="foot">{{desk ? '桌面版 ' + desk.version : '建议在收银电脑上设为浏览器首页'}}</div>
    </div>
    <div class="login-side"><div class="login-card">
      <h1>门店登录</h1><p>使用后台分配的门店账号</p>
      <el-input v-model="lf.username" placeholder="账号" size="large" />
      <el-input v-model="lf.password" type="password" placeholder="密码" size="large" show-password @keyup.enter="login" />
      <el-button type="primary" size="large" style="width:100%;margin-top:6px" :loading="busy" @click="login">登录</el-button>
      <div class="switch"><a href="javascript:;" @mousedown.prevent @click="toggleOsk">打开屏幕键盘</a></div>
      <div class="switch">管理员请使用 <a href="/web/admin/" target="_blank">后台管理</a></div>
      <div v-if="desk" class="switch">服务器 {{desk.server}} · <a href="javascript:;" @click="openDeskSettings">桌面软件设置</a></div>
    </div></div>
  </div>
  <div v-else class="ws">
    <div class="ws-top">
      <div class="store"><span class="mark">AW</span>
        <span v-if="stores.length <= 1" class="sn">{{storeName}}<small>收银系统 · 门店工作台</small></span>
        <el-select v-else v-model="storeId" @change="switchStore"><el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" /></el-select></div>
      <div class="tabs">
        <div v-if="can('pos')" class="tab" :class="{on: tab==='pos'}" @click="tab='pos'"><span class="ico" v-html="icon('cart')"></span>收银</div>
        <div v-if="can('orders') || can('pos')" class="tab" :class="{on: tab==='orders'}" @click="tab='orders'"><span class="ico" v-html="icon('list')"></span>订单<span v-if="pending" class="badge">{{pending}}</span></div>
        <div v-if="can('pos')" class="tab" :class="{on: tab==='shift'}" @click="tab='shift'"><span class="ico" v-html="icon('clock')"></span>交班</div>
        <div v-if="stockVisible" class="tab" :class="{on: tab==='stock'}" @click="tab='stock'"><span class="ico" v-html="icon('box')"></span>库存</div>
        <div v-if="can('requisition')" class="tab" :class="{on: tab==='req'}" @click="tab='req'"><span class="ico" v-html="icon('truck')"></span>要货</div>
      </div>
      <span class="grow"></span>
      <div class="tools">
        <span class="clock"><span class="ico" v-html="icon('clock')"></span>{{clock}}</span>
        <span class="tb-sep"></span>
        <button type="button" class="tb" :class="{busy: syncing}" :disabled="syncing" title="从服务器获取最新的商品、价格及门店设置" @click="sync"><span class="ico" v-html="icon('refresh')"></span>同步</button>
      <el-popover placement="bottom" :width="340" trigger="click" popper-class="setpop">
        <template #reference><button type="button" class="tb"><span class="ico" v-html="icon('settings')"></span>本机设置</button></template>
        <div><el-checkbox v-model="settings.sound">提示音和语音播报</el-checkbox></div>
        <div><el-checkbox v-model="settings.keyHints">显示键盘快捷键提示</el-checkbox></div>
        <div class="osk-set"><span>屏幕键盘</span><el-radio-group v-model="settings.osk">
          <el-radio-button value="auto">触摸时弹出</el-radio-button><el-radio-button value="always">总是弹出</el-radio-button><el-radio-button value="off">关闭</el-radio-button></el-radio-group></div>
        <div v-if="cur.print_mode === 'agent'" class="hint" style="margin:0 0 6px">本店由“打印小助手”出票，下面两项在本机不起作用。</div>
        <div v-else-if="desk && desk.printMode === 'off'" class="hint" style="margin:0 0 6px">这台电脑设置为不出票，下面两项不起作用。</div>
        <div><el-checkbox v-model="settings.autoPrintOnline">新订单自动打印小票</el-checkbox></div>
        <div><el-checkbox v-model="settings.autoPrintPos">收银后自动打印小票</el-checkbox></div>
        <template v-if="desk">
          <div class="desk-box">
            <div>小票机：<b>{{desk.printer || '未选择'}}</b><span class="muted">　{{ {raw: '直接出票', driver: '驱动出票', off: '不出票'}[desk.printMode] }}</span></div>
            <div class="desk-btns"><el-button @click="deskTest">打印测试页</el-button><el-button @click="deskDrawer">开钱箱</el-button><el-button type="primary" plain @click="openDeskSettings">桌面软件设置</el-button></div>
            <div class="muted" style="font-size:12px;margin-top:6px">桌面版 {{desk.version}}<template v-if="settings.keyHints"> · <kbd>F11</kbd> 全屏 · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> 设置 · <kbd>Ctrl</kbd>+<kbd>+</kbd>/<kbd>−</kbd> 缩放</template></div>
          </div>
        </template>
        <div v-if="settings.keyHints" class="muted" style="font-size:12px;margin-top:6px">切换页面：<span v-for="k in tabKeys" :key="k[0]" style="margin-right:6px"><kbd>{{k[0]}}</kbd>{{k[1]}}</span></div>
      </el-popover>
        <a v-if="user.is_admin" class="tb" href="/web/admin/" target="_blank"><span class="ico" v-html="icon('sliders')"></span>后台管理</a>
        <span class="tb-sep"></span>
        <el-popover v-model:visible="meOpen" placement="bottom-end" :width="200" trigger="click" popper-class="mepop">
          <template #reference><button type="button" class="who"><span class="avatar">{{(user.display_name || user.username).slice(0,1)}}</span><span class="nm">{{user.display_name || user.username}}</span><span class="ico caret" v-html="icon('chevronDown')"></span></button></template>
          <div class="me-menu">
            <button type="button" @click="meOpen = false; changePw()"><span class="ico" v-html="icon('lock')"></span>修改密码</button>
            <button type="button" class="dng" @click="meOpen = false; logout()"><span class="ico" v-html="icon('logout')"></span>退出登录</button>
          </div>
        </el-popover>
      </div>
    </div>
    <el-empty v-if="!storeId" description="账号还没有分配门店，请联系后台" />
    <template v-else>
      <pos v-if="tab==='pos'" :key="'p'+storeId" :user="user" :store-id="storeId" :settings="settings" :agent="cur.print_mode === 'agent'" :sync="syncN" />
      <orders v-if="tab==='orders'" :key="'o'+storeId" :user="user" :store="cur" :store-id="storeId" :settings="settings" :pending-count="pending" :tick="tick" :agent="cur.print_mode === 'agent'" />
      <shift v-if="tab==='shift'" :key="'s'+storeId" :store-id="storeId" :user="user" :sync="syncN" />
      <stock v-if="tab==='stock'" :key="'k'+storeId" :store-id="storeId" :can-edit="stockEditable" :sync="syncN" />
      <requisitions v-if="tab==='req'" :key="'r'+storeId" :store-id="storeId" :stock-visible="stockVisible" :sync="syncN" />
    </template>
    <div v-if="toasts.length" class="toast-stack">
      <div v-for="t in toasts" :key="t.id" class="new-toast" role="alert">
        <span class="nt-ico"><span class="ico" v-html="icon('bell')"></span></span>
        <span class="nt-txt"><b>{{toastTitle(t)}}</b><span class="muted" :class="{bad: t.failed}">{{toastSub(t)}}</span></span>
        <button v-if="!otherStore(t)" type="button" class="nt-go" @click="goOrders">去接单</button>
        <button type="button" class="nt-x" aria-label="关闭" @click="closeToast(t)"><span class="ico" v-html="icon('x')"></span></button>
      </div>
    </div>
  </div>`,
  setup() {
    const user = ref(null), lf = reactive({ username: '', password: '' }), busy = ref(false), stores = ref([]), storeId = ref(null), tab = ref('pos');
    const pending = ref(0), tick = ref(0), clock = ref('');
    const tickClock = () => { const d = new Date(); clock.value = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    tickClock(); const clockTimer = setInterval(tickClock, 15000);
    const settings = reactive({ sound: pref('sound', true), autoPrintOnline: pref('autoPrintOnline', true), autoPrintPos: pref('autoPrintPos', true), osk: pref('osk', 'auto'), keyHints: pref('keyHints', false) });
    // 屏幕键盘（触摸屏用）：auto 手指点输入框时弹出，always 一点输入框就弹，off 不用
    const osk = ShouyinOSK.create({ mode: () => settings.osk });
    const toggleOsk = () => osk.toggle(() => document.querySelector('.login-card input'));  // 登录页“打开屏幕键盘”
    watch(() => settings.osk, (v) => { if (v === 'off') osk.hide(); });
    // 触摸屏收银默认不显示键盘快捷键提示（F1、F2……），接了键盘的电脑可以在本机设置里打开
    watch(() => settings.keyHints, (v) => document.body.classList.toggle('show-keys', !!v), { immediate: true });
    watch(settings, () => Object.entries(settings).forEach(([k, v]) => setPref(k, v)), { deep: true });
    const can = (p) => user.value && user.value.permissions.includes(p);
    const cur = computed(() => stores.value.find(s => s.id === storeId.value) || {});
    const storeName = computed(() => cur.value.name || '门店工作台');
    const stockVisible = computed(() => can('inventory') || (can('stock_view') && cur.value.staff_can_view_stock));
    const stockEditable = computed(() => can('inventory') || (can('stock_edit') && cur.value.staff_can_edit_stock));
    let lastId = 0, timer = null, printing = Promise.resolve(), polling = false, primed = false, pollStore = null;
    // 会话号：session 在登录、切店、退出、登录失效时加一，在途的轮询发现变了就作废，不再弹提醒。
    // authSes 只在登录、退出、登录失效时加一：已排队的小票切店后照常打完，退出后不再用旧登录打印
    let session = 0, authSes = 0;

    const poll = async () => {
      if (!storeId.value || !can('orders')) return;
      if (polling) return;  // 上一次还没返回就不再发，避免同一批订单响铃、打印两次
      polling = true;
      const sid = storeId.value, ses = session, aus = authSes;
      try {
        const r = await api.get('/api/orders/new', { store_id: sid, after_id: lastId });
        if (ses !== session || !user.value || sid !== storeId.value || sid !== pollStore) return;  // 中途退出或切换了门店，丢弃这次结果
        pending.value = r.pending_count;
        // 第一次只记下当前最新单号（打开页面之前的订单不重复响铃打印，在“待接单”里处理）
        const fresh = primed ? r.orders.filter(o => o.status !== 'cancelled') : [];
        primed = true;
        lastId = r.last_id;
        if (fresh.length) {
          tick.value++;
          if (settings.sound) { beep(3); speak('您有' + fresh.length + '个新订单'); }
          const autoPrint = settings.autoPrintOnline && cur.value.print_mode !== 'agent' && canPrintHere();
          const t = showNewToast(fresh, autoPrint);
          if (autoPrint) {
            for (const o of fresh) printing = printing.then(async () => {
              if (aus !== authSes || !user.value) return;  // 已退出，不再用旧登录打印
              try { await printOrder(o.id, false); markPrinted(t, true); } catch (e) { markPrinted(t, false); }
            });
          }
        }
      } catch (e) {} finally { polling = false; }
    };
    // 新扫码订单提醒：右上角卡片，点“去接单”到订单页。新订单另起一张，最新的在最上面。
    // 要自动打印的，打印结果出来后才开始 15 秒倒计时。正在打印和打印失败的卡片一直留着：
    // 不会被新订单挤掉，“去接单”、切店也不清，只有店员点 × 或退出登录才关。
    // 桌面软件直接出票，能知道打印成功；网页版只能打开浏览器打印对话框，看不出店员点的是打印还是取消
    const toasts = ref([]); let toastSeq = 0;
    const timers = new Map();
    const where = (o) => ((o.area_name || '') + ' ' + (o.location_note || '')).trim();
    const busyToast = (t) => t.failed > 0 || (t.toPrint > 0 && t.printed + t.failed < t.toPrint);
    const closeToast = (t) => { clearTimeout(timers.get(t.id)); timers.delete(t.id); toasts.value = toasts.value.filter(x => x.id !== t.id); };
    const hideToast = () => { timers.forEach(clearTimeout); timers.clear(); toasts.value = []; };
    const closePlainToasts = (pred) => toasts.value.filter(t => !busyToast(t) && (!pred || pred(t))).forEach(closeToast);
    const countdown = (id) => { clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => closeToast({ id }), 15000)); };
    const MAX_PLAIN = 4;  // 普通提醒最多叠 4 张，多了挤掉最早的普通提醒；打印中、打印失败的不计、不挤
    const showNewToast = (list, printing) => {
      const n = list.reduce((a, o) => a + (o.item_count || 0), 0), amt = list.reduce((a, o) => a + o.payable_amount, 0);
      const t = list.length === 1
        ? { id: ++toastSeq, title: '新扫码订单' + (where(list[0]) ? ' · ' + where(list[0]) : ''), base: n + ' 件 · ¥' + yuan(amt) }
        : { id: ++toastSeq, title: list.length + ' 个新扫码订单', base: list.map(where).filter(Boolean).join('、') + ' · 共 ¥' + yuan(amt) };
      Object.assign(t, { toPrint: printing ? list.length : 0, printed: 0, failed: 0, browser: !deskInfo, storeId: storeId.value, storeName: cur.value.name || '' });
      let plain = 0;
      const all = [t, ...toasts.value].filter(x => busyToast(x) || ++plain <= MAX_PLAIN);
      toasts.value.filter(x => !all.includes(x)).forEach(x => { clearTimeout(timers.get(x.id)); timers.delete(x.id); });
      toasts.value = all;
      if (!t.toPrint) countdown(t.id);
      return t.id;
    };
    const markPrinted = (id, ok) => {
      const t = toasts.value.find(x => x.id === id);
      if (!t) return;  // 卡片已关掉
      if (ok) t.printed++; else t.failed++;
      if (t.printed + t.failed < t.toPrint) return;  // 这批还没打完
      if (t.failed) clearTimeout(timers.get(id)); else countdown(id);  // 打印失败不自动消失
    };
    const otherStore = (t) => t.storeId !== storeId.value;
    const toastTitle = (t) => t.title + (otherStore(t) && t.storeName ? '（' + t.storeName + '）' : '');
    const toastSub = (t) => {
      if (!t.toPrint) return t.base;
      if (t.failed) return t.base + ' · ' + (t.failed < t.toPrint ? t.failed + ' 张' : '') + '小票打印失败，请到' + (otherStore(t) && t.storeName ? t.storeName : '') + '订单页补打';
      if (t.printed < t.toPrint) return t.base + ' · 正在打印小票…';
      return t.base + (t.browser ? ' · 已打开打印对话框' : ' · 小票已打印');
    };
    // 收款框等弹窗开着时不切页，免得把收银界面卸掉、打断收款
    const dialogOpen = () => [...document.querySelectorAll('.el-overlay')].some(e => getComputedStyle(e).display !== 'none');
    const goOrders = () => {
      if (dialogOpen()) return ElMessage.warning('请先完成或取消当前操作，再去接单');
      closePlainToasts((t) => !otherStore(t)); tab.value = 'orders';  // 正在打印、打印失败的留着
    };
    const meOpen = ref(false);
    // 切店：上一家店的普通提醒关掉；正在打印、打印失败的留着，并标明原门店
    const startPoll = () => { session++; closePlainToasts(); clearInterval(timer); lastId = 0; primed = false; pollStore = storeId.value; poll(); timer = setInterval(poll, 5000); };
    const afterLogin = async () => {
      authSes++; hideToast();
      stores.value = await api.get('/api/stores');
      const saved = pref('store', null);
      storeId.value = stores.value.find(s => s.id === saved) ? saved : (stores.value[0] || {}).id || null;
      tab.value = can('pos') ? 'pos' : 'orders';
      startPoll();
    };
    const switchStore = () => { setPref('store', storeId.value); startPoll(); };
    // 手动同步：重新拿门店设置、账号权限，并让当前页面重新拉商品 / 订单 / 库存（不清购物车、不退出登录）
    const syncN = ref(0), syncing = ref(false);
    // 页面引用的 js/css 版本号（如 store.js?v=32）；服务器上的版本号变了，说明收银页有更新
    const assetVers = (html) => (html.match(/[\w.-]+\.(?:js|css)\?v=\d+/g) || []).sort().join(',');
    const sync = async () => {
      syncing.value = true;
      try {
        // 收银页本身有新版本：直接刷新页面（购物车、登录都会保留），不用重开软件或按 Ctrl+R
        try {
          const html = await (await fetch('/web/store/?_=' + Date.now(), { cache: 'no-store' })).text();
          if (assetVers(html) && assetVers(html) !== assetVers(document.documentElement.innerHTML)) {
            try { sessionStorage.setItem('shouyin_synced', '1'); } catch (e) {}
            location.reload();
            return;
          }
        } catch (e) {}  // 拿不到页面就只同步数据
        const [st, me] = await Promise.all([api.get('/api/stores'), api.get('/api/auth/me')]);
        stores.value = st; user.value = me;
        syncN.value++; tick.value++; poll();
        ElMessage.success('已同步');
      } catch (e) { err(e); } finally { syncing.value = false; }
    };
    try { if (sessionStorage.getItem('shouyin_synced')) { sessionStorage.removeItem('shouyin_synced'); setTimeout(() => ElMessage.success('已同步，收银页已更新到最新版本'), 600); } } catch (e) {}
    const login = async () => {
      busy.value = true;
      try {
        const r = await api.post('/api/auth/login', lf); api.setToken(r.token); user.value = r.user; await afterLogin();
        if (r.weak_password) ElMessage({ type: 'warning', duration: 8000, showClose: true, message: '这个账号还在用默认或过于简单的密码，请点右上角头像，选“修改密码”' });
      } catch (e) { err(e); } finally { busy.value = false; }
    };
    const logout = async () => {
      try {
        await ElMessageBox.confirm('确定退出登录吗？退出后需要重新输入账号密码。', '退出登录',
          { confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning', customClass: 'big-confirm' });
      } catch (e) { return; }
      api.setToken(''); user.value = null; clearInterval(timer); session++; authSes++; hideToast();
    };
    // 自己改密码：旧密码 + 两次新密码。忘记密码找管理员在后台“账号与权限”里重置
    const changePw = async () => {
      let o, n, n2;
      const box = (msg, step) => ElMessageBox.prompt(msg, '修改密码（' + step + '/3）', { inputType: 'password', confirmButtonText: '下一步', cancelButtonText: '取消' });
      try {
        ({ value: o } = await box('当前密码', 1));
        ({ value: n } = await box('新密码（至少 6 位）', 2));
        ({ value: n2 } = await box('再输一次新密码', 3));
      } catch (e) { return; }
      if (!n || n.length < 6) return ElMessage.error('新密码至少 6 位');
      if (n !== n2) return ElMessage.error('两次输入的新密码不一样，没有修改');
      try { const r = await api.post('/api/auth/password', { old_password: o || '', new_password: n }); api.setToken(r.token); ElMessage.success('密码已修改，下次用新密码登录'); } catch (e) { err(e); }
    };
    window.onUnauthorized = () => { user.value = null; clearInterval(timer); session++; authSes++; hideToast(); };
    // Alt+1~5 切换收银 / 订单 / 交班 / 库存 / 要货
    const tabOk = { pos: () => can('pos'), orders: () => can('orders') || can('pos'), shift: () => can('pos'), stock: () => stockVisible.value, req: () => can('requisition') };
    const onKey = (e) => {
      if (!user.value || msgBoxOpen()) return;
      const m = /^Alt\+([1-5])$/.exec(ShouyinKeys.combo(e));
      if (!m) return;
      const t = ['pos', 'orders', 'shift', 'stock', 'req'][m[1] - 1];
      e.preventDefault();
      if (tabOk[t]()) tab.value = t;
    };
    window.addEventListener('keydown', onKey);
    const openDeskSettings = () => desk && desk.openSettings();
    const deskTest = async () => { try { await desk.testPrint(); ElMessage.success('测试页已发送'); } catch (e) { err(e); } };
    const deskDrawer = () => openDrawer(false);
    onMounted(async () => { if (api.token()) { try { user.value = await api.get('/api/auth/me'); await afterLogin(); } catch (e) {} } });
    onUnmounted(() => { clearInterval(timer); clearInterval(clockTimer); window.removeEventListener('keydown', onKey); });
    return { icon, user, lf, busy, stores, storeId, storeName, cur, tab, pending, tick, clock, settings, can, stockVisible, stockEditable, login, logout, changePw, switchStore, sync, syncN, syncing, meOpen, toasts, toastSub, toastTitle, otherStore, closeToast, goOrders,
      desk: deskInfo, openDeskSettings, deskTest, deskDrawer, tabKeys: K.TAB_KEYS, toggleOsk };
  },
};

createApp(App).use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount('#app');
