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

const METHODS = { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' };

// 优惠（打折 / 调低应收）+ 收款，收银和订单收款共用
const PayDialog = {
  props: ['modelValue', 'user', 'lines', 'title', 'onPay'],
  emits: ['update:modelValue'],
  template: `
  <el-dialog :model-value="modelValue" @update:model-value="v => $emit('update:modelValue', v)" :title="title || '收款'" width="900px" class="paybox" @open="reset" @opened="focusReceived">
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
        <div v-if="limitText" class="hint" style="margin-top:2px">{{limitText}}；只影响本单，不改商品价格</div>
        <div class="methods"><button v-for="(t,k,i) in methods" :key="k" type="button" class="m" :class="{on: method===k}" @click="method=k; field='received'">{{t}}<kbd>F{{i+1}}</kbd></button></div>
      </div>
      <div class="pay-r">
        <template v-if="method==='cash'">
          <div class="field big" :class="{on: field==='received'}" @click="pickField('received')"><span class="fl">实收现金</span>
            <el-input ref="receivedRef" v-model="received" data-no-osk inputmode="decimal" :placeholder="yuan(q.payable_amount)" @focus="field='received'" /><i>元</i></div>
          <div class="quickcash"><button v-for="v in quick" :key="v" type="button" class="chip" @click="received = v; field = 'received'">¥{{v}}</button></div>
          <div class="change"><span>找零</span><b class="money">¥{{change}}</b></div>
        </template>
        <div v-else class="nocash">请确认顾客已通过<b>{{methods[method]}}</b>付款，再点“确认收款”。<br>目前是店员确认后记账，不是在线支付。</div>
        <div class="pad">
          <button v-for="k in PAD" :key="k" type="button" tabindex="-1" class="pk" :class="'pk-' + ({back: 'fn', clear: 'fn', ok: 'ok'}[k] || 'n')" :data-k="k" @pointerdown.prevent @mousedown.prevent @click="padPress(k)">{{ {back: '⌫', clear: '清空', ok: field === 'received' ? '收款' : '确定'}[k] || k }}</button>
        </div>
      </div>
    </div>
    <template #footer><span class="muted keyhint"><kbd>Enter</kbd> 确认收款　<kbd>Esc</kbd> 取消</span><el-button size="large" class="pay-cancel" @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button size="large" type="primary" class="pay-ok" :loading="busy || quoting > 0" :disabled="!!qErr" @click="submit">确认收款 ¥{{yuan(q.payable_amount)}}</el-button></template>
  </el-dialog>`,
  setup(props, { emit }) {
    const q = reactive({ original_amount: 0, payable_amount: 0, discount_amount: 0 }), qErr = ref('');
    const rate = ref(null), rateInput = ref(''), payableInput = ref(''), method = ref('cash'), received = ref(''), busy = ref(false);
    const receivedRef = ref(null), rateRef = ref(null), payableRef = ref(null);
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
    const PAD = ['7', '8', '9', 'back', '4', '5', '6', 'clear', '1', '2', '3', 'ok', '00', '0', '.'];
    const models = { received, rate: rateInput, payable: payableInput };
    const padPress = (k) => {
      const f = field.value, m = models[f];
      if (k === 'ok') {
        if (f === 'rate') applyRate(rateInput.value);
        else if (f === 'payable') quote();
        else return submit();
        return focusReceived();
      }
      const v = String(m.value == null ? '' : m.value);
      if (k === 'back') m.value = v.slice(0, -1);
      else if (k === 'clear') m.value = '';
      else if (k === '.' && v.includes('.')) return;
      else if (/^\d+\.\d\d$/.test(v)) return;  // 最多两位小数
      else m.value = (v === '0' && k !== '.' ? '' : v) + k;
    };
    const reset = () => { field.value = 'received'; rate.value = null; rateInput.value = ''; payableInput.value = ''; method.value = 'cash'; received.value = ''; quote(); };
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
      if (m) { e.preventDefault(); method.value = m; focusReceived(); return; }
      if (c === 'Enter') {
        const own = (r) => r.value && r.value.input === e.target;
        if (own(rateRef) || own(payableRef)) return;
        e.preventDefault(); submit();
      }
    };
    onMounted(() => window.addEventListener('keydown', onKey, true));
    onUnmounted(() => window.removeEventListener('keydown', onKey, true));
    return { q, qErr, rate, rateInput, payableInput, method, received, busy, canDiscount, canAdjust, limitText, quote, reset, roundDown, change, quick, submit, yuan, methods: METHODS,
      receivedRef, rateRef, payableRef, focusReceived, quoting, field, pickField, applyRate, PAD, padPress };
  },
};

// ---------------- 收银 ----------------
const Pos = {
  props: ['user', 'storeId', 'settings', 'agent', 'sync'],
  components: { PayDialog },
  template: `
  <div class="ws-body pos">
    <div class="rail">
      <button type="button" class="rc" :class="{on: !cat}" @click="cat=null">全部</button>
      <button v-for="c in topCats" :key="c.id" type="button" class="rc" :class="{on: cat===c.id}" @click="cat=c.id">{{c.name}}</button>
    </div>
    <div class="pos-left">
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
        <div v-if="settings.osk !== 'off'" class="kb" @pointerdown.prevent @mousedown.prevent>
          <div v-for="(r, i) in KB" :key="i" class="kb-row">
            <template v-for="(k, j) in r" :key="j">
              <span v-if="k.gap" class="kb-gap" :style="{flexGrow: k.gap}"></span>
              <button v-else type="button" tabindex="-1" class="kb-k" :class="'kb-' + (k.k.length > 1 ? k.k : 'c')" :style="{flexGrow: k.w || 1}" :data-k="k.k" @click="kbPress(k.k)">{{ {back: '⌫', clear: '清空', enter: '确认'}[k.k] || k.k.toUpperCase() }}</button>
            </template>
          </div>
        </div>
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
    <pay-dialog v-model="payDlg" :user="user" :lines="lines" @pay="pay" />
    <el-dialog v-model="scanDlg" title="这个条码对应多个规格，请选择" :width="pickWidth(scanMatches.length)" class="pick-dlg">
      <div class="pick-grid">
        <div v-for="(m, i) in scanMatches" :key="m.sku.id" class="pick" @click="add(m.product, m.sku); scanDlg = false">
          <kbd v-if="i < 9" class="no">{{i + 1}}</kbd>
          <div class="pimg" :style="bg(m.sku.image || m.product.image)">{{(m.sku.image || m.product.image) ? '' : m.product.name.slice(0, 1)}}</div>
          <div class="pn">{{m.product.name}}</div><div class="ps">{{m.sku.name !== '默认' ? m.sku.name : ''}}</div>
          <div class="pp">¥{{yuan(m.sku.price)}}</div>
        </div>
      </div>
    </el-dialog>
    <el-dialog v-model="heldDlg" title="已挂起的单" width="520px">
      <div class="muted" style="margin-bottom:8px">挂单只存在这台电脑上，没有收款、不扣库存。取回后价格按现在的售价。</div>
      <div v-for="(h, i) in held" :key="h.at" class="held">
        <div style="flex:1;min-width:0"><kbd>{{i + 1}}</kbd> <b>{{h.time}}</b><span class="muted">　{{h.cart.reduce((a, l) => a + l.qty, 0)}} 件 · ¥{{yuan(h.cart.reduce((a, l) => a + l.qty * l.price, 0))}}</span>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{h.cart.map(l => l.name + (l.sku !== '默认' ? '（' + l.sku + '）' : '') + '×' + l.qty).join('、')}}<span v-if="h.remark">　备注：{{h.remark}}</span></div></div>
        <el-button size="large" @click="dropHeld(i)">删除</el-button><el-button size="large" type="primary" @click="takeHeld(i)">取回</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="skuDlg" :width="pickWidth(skuProduct ? skuProduct.skus.length : 1)" class="pick-dlg">
      <template #header><span class="pick-title">{{skuProduct && skuProduct.name}}</span><span class="muted pick-tip">点选规格</span></template>
      <div class="pick-grid">
        <div v-for="(s, i) in (skuProduct ? skuProduct.skus : [])" :key="s.id" class="pick" @click="add(skuProduct, s); skuDlg=false">
          <kbd v-if="i < 9" class="no">{{i + 1}}</kbd>
          <div class="pimg" :style="bg(s.image || skuProduct.image)">{{(s.image || skuProduct.image) ? '' : (s.name !== '默认' ? s.name : skuProduct.name).slice(0, 1)}}</div>
          <div class="pn">{{s.name}}</div>
          <div class="pp">¥{{yuan(s.price)}}</div>
        </div>
      </div>
    </el-dialog>
    <el-dialog v-model="doneDlg" title="收款成功" width="440px" class="done-dlg">
      <div class="done"><div class="ok"><span class="ico" v-html="icon('check')"></span></div>
        <div class="k">应收 ¥{{yuan(last.payable_amount)}}<span v-if="lastReceived !== last.payable_amount">　实收 ¥{{yuan(lastReceived)}}</span></div><div v-if="lastChange" class="chg">找零 <b class="money">¥{{yuan(lastChange)}}</b></div></div>
      <template #footer><div class="done-btns"><el-button size="large" @click="reprint">补打小票<kbd>F8</kbd></el-button><el-button size="large" type="primary" @click="doneDlg=false">继续收银<kbd>Enter</kbd></el-button></div></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const products = ref([]), cats = ref([]), cat = ref(null), scanText = ref(''), cart = ref([]), remark = ref('');
    const scanDlg = ref(false), scanMatches = ref([]);
    const payDlg = ref(false), skuDlg = ref(false), skuProduct = ref(null), doneDlg = ref(false), last = ref({}), lastChange = ref(0), lastReceived = ref(0), scan = ref(null);
    let reqId = rid();
    const topCats = computed(() => cats.value.filter(c => !c.parent_id && c.active));
    // 边输边搜：名称、助记码（拼音首字母）、货号、规格名、条码
    const matchKw = (p, t) => {
      const k = t.toLowerCase();
      return p.name.toLowerCase().includes(k) || (p.mnemonic || '').includes(k) || (p.code || '').toLowerCase().includes(k)
        || p.skus.some(s => (s.barcode || '').startsWith(t) || (s.name !== '默认' && s.name.toLowerCase().includes(k)));
    };
    const shown = computed(() => {
      const t = scanText.value.trim();
      if (t) return products.value.filter(p => matchKw(p, t));
      if (!cat.value) return products.value;
      const ids = new Set([cat.value, ...cats.value.filter(c => c.parent_id === cat.value).map(c => c.id)]);
      return products.value.filter(p => (p.category_ids || [p.category_id]).some(id => ids.has(id)));
    });
    const priceText = (p) => { const ps = p.skus.map(s => s.price); const a = Math.min(...ps), b = Math.max(...ps); return a === b ? yuan(a) : yuan(a) + ' 起'; };
    const load = async () => { try { [products.value, cats.value] = await Promise.all([api.get('/api/products'), api.get('/api/categories')]); products.value = products.value.filter(p => p.skus.length); } catch (e) { err(e); } };
    const sel = ref(-1), qtyEls = [], remarkRef = ref(null), remarkDlg = ref(false); let qtyBefore = 1;
    const openRemark = () => { remarkDlg.value = true; };
    const drawer = () => openDrawer(false);
    const add = (p, s) => {
      const i = cart.value.findIndex(x => x.sku_id === s.id);
      if (i >= 0) { cart.value[i].qty++; sel.value = i; }
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
        const r = await api.get('/api/products/by-barcode/' + encodeURIComponent(t)); scanText.value = '';
        const ms = (r.matches || [r]).map(m => ({ product: m.product, sku: m.product.skus.find(s => s.id === m.sku_id) })).filter(m => m.sku);
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
    const cartQty = computed(() => { const m = new Map(); for (const l of cart.value) m.set(l.sku_id, (m.get(l.sku_id) || 0) + l.qty); return m; });
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
    const clear = () => { cart.value = []; remark.value = ''; sel.value = -1; };
    // 挂单：顾客临时去拿东西、先收下一位时，把当前购物车存起来（存在本机浏览器）
    const heldKey = 'shouyin_held_' + props.storeId, held = ref([]), heldDlg = ref(false);
    try { held.value = JSON.parse(localStorage.getItem(heldKey) || '[]'); } catch (e) { held.value = []; }
    const saveHeld = () => { try { localStorage.setItem(heldKey, JSON.stringify(held.value)); } catch (e) {} };
    const hold = () => {
      if (!cart.value.length) return;
      const d = new Date();
      held.value.push({ at: Date.now(), time: d.toTimeString().slice(0, 5), cart: JSON.parse(JSON.stringify(cart.value)), remark: remark.value });
      saveHeld(); clear(); ElMessage.success('已挂单，点“取单”可以取回');
    };
    const takeHeld = (i) => {
      const h = held.value[i];
      if (cart.value.length) hold();  // 当前也有商品：先把当前的挂起来
      const skus = new Map(products.value.flatMap(p => p.skus.map(s => [s.id, s])));
      const lines = h.cart.filter(l => skus.has(l.sku_id)).map(l => ({ ...l, price: skus.get(l.sku_id).price }));
      if (lines.length < h.cart.length) ElMessage.warning('有 ' + (h.cart.length - lines.length) + ' 个商品已下架，没有取回');
      cart.value = lines; remark.value = h.remark || '';
      held.value.splice(held.value.indexOf(h), 1); saveHeld(); heldDlg.value = false;
    };
    const dropHeld = async (i) => {
      try { await ElMessageBox.confirm('删除这张挂单？', '删除', { type: 'warning' }); } catch (e) { return; }
      held.value.splice(i, 1); saveHeld(); if (!held.value.length) heldDlg.value = false;
    };
    const count = computed(() => cart.value.reduce((a, l) => a + l.qty, 0));
    const total = computed(() => cart.value.reduce((a, l) => a + l.qty * l.price, 0));
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
      // 到这里收款已经成功。后面的提示音、打印出错都不能让店员误以为没收到钱
      reqId = rid(); last.value = o; lastChange.value = p.change; lastReceived.value = p.received != null ? p.received : o.payable_amount; payDlg.value = false; clear();
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
    // 搜索框旁边的固定键盘：只有英文字母和数字，拼音首字母、货号、条码都够用
    // 按标准键盘排布（每行往右错开），只要英文字母和数字；退格在数字行右边，确认在 L 右边（回车的位置），清空在 M 右边
    const keys = (str) => str.split('').map(k => ({ k }));
    const KB = [
      [...keys('1234567890'), { k: 'back', w: 1.5 }],
      [{ gap: 0.5 }, ...keys('qwertyuiop'), { gap: 1 }],
      [{ gap: 0.75 }, ...keys('asdfghjkl'), { k: 'enter', w: 1.75 }],
      [{ gap: 1.25 }, ...keys('zxcvbnm'), { k: 'clear', w: 2 }, { gap: 1.25 }]];
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
      F4: () => (held.value.length ? (heldDlg.value = true) : ElMessage.info('没有挂起的单')),
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
      // 选规格 / 选条码 / 取挂单：数字键选第几个
      const pickList = skuDlg.value ? skuProduct.value.skus.map(s => () => { add(skuProduct.value, s); skuDlg.value = false; })
        : scanDlg.value ? scanMatches.value.map(m => () => { add(m.product, m.sku); scanDlg.value = false; })
        : heldDlg.value ? held.value.map((h, i) => () => takeHeld(i)) : null;
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
    watch([payDlg, skuDlg, scanDlg, heldDlg, doneDlg, remarkDlg], (now, before) => { if (now.every(v => !v) && before.some(v => v)) focusScan(); });
    onMounted(() => { load(); setTimeout(() => scan.value && scan.value.focus(), 300); window.addEventListener('keydown', onKey, true); });
    watch(() => props.sync, load);  // 顶部“同步”：重新拉商品、价格、分类，购物车里已加的不动
    onUnmounted(() => window.removeEventListener('keydown', onKey, true));
    return { products, cats, cat, topCats, shown, scanText, cart, remark, payDlg, skuDlg, skuProduct, doneDlg, last, lastChange, lastReceived, scan,
      scanDlg, scanMatches, priceText, add, pick, tap, onScan, held, heldDlg, hold, takeHeld, dropHeld, inCart, dec, fix, clear, count, total, lines, pay, reprint, yuan,
      visible, more, thumb: Shouyin.thumb, sel, qtyEls, remarkRef, remarkDlg, openRemark, drawer, remove, icon: Shouyin.icon, posKeys: K.POS_KEYS, KB, kbPress,
      // 选规格框：每格 200px 左右，一行最多 4 个
      pickWidth: (n) => Math.min(4, Math.max(2, n)) * 196 + 72 + 'px',
      bg: (img) => (img ? { backgroundImage: 'url(' + JSON.stringify(Shouyin.thumb(img, 200)) + ')' } : {}), noteQty: (l, i) => { qtyBefore = l.qty; sel.value = i; } };
  },
};

// ---------------- 订单 ----------------
const Orders = {
  props: ['user', 'storeId', 'settings', 'pendingCount', 'tick', 'agent'],
  components: { PayDialog },
  template: `
  <div class="ws-body" style="flex-direction:column">
    <div class="otool">
      <el-radio-group v-model="status" @change="load">
        <el-radio-button value="pending">待接单 {{pendingCount ? '(' + pendingCount + ')' : ''}}</el-radio-button>
        <el-radio-button value="accepted">已接单待收款</el-radio-button>
        <el-radio-button value="completed">已完成</el-radio-button>
        <el-radio-button value="cancelled">已取消</el-radio-button>
        <el-radio-button value="">全部</el-radio-button>
      </el-radio-group>
      <el-select v-model="source" placeholder="全部来源" clearable style="width:120px" @change="load"><el-option label="小程序" value="online" /><el-option label="门店收银" value="pos" /></el-select>
      <el-date-picker v-model="day" type="date" value-format="YYYY-MM-DD" placeholder="日期" style="width:150px" @change="load" />
      <el-input v-model="kw" placeholder="单号 / 床号 / 电话" clearable style="width:170px" @keyup.enter="load" />
      <el-button @click="load">刷新</el-button>
    </div>
    <div class="orders">
      <el-empty v-if="!rows.length" description="没有订单" style="grid-column:1/-1" />
      <div v-for="o in rows" :key="o.id" class="ocard" :class="{pending: o.status==='pending'}" @click="open(o)">
        <div class="h"><span class="where">{{o.area_name || '门店收银'}} {{o.location_note}}</span>
          <el-tag :type="tagType(o)" effect="light" round>{{o.status_text}} · {{o.pay_status_text}}</el-tag></div>
        <div class="meta">{{o.created_at.slice(5, 16)}} · {{o.no}} · {{o.source_text}}</div>
        <div class="goods">{{o.items.map(i => i.product_name + (i.sku_name !== '默认' ? '(' + i.sku_name + ')' : '') + ' × ' + i.qty).join('，')}}</div>
        <div class="f"><span class="muted">{{o.remark ? '备注：' + o.remark : '共 ' + o.item_count + ' 件'}}</span><b class="money">¥{{yuan(o.payable_amount)}}</b></div>
      </div>
    </div>
    <el-drawer v-model="drawer" :title="cur ? '订单 ' + cur.no : ''" size="560px">
      <div v-if="cur">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="状态">{{cur.status_text}} / {{cur.pay_status_text}}</el-descriptions-item>
          <el-descriptions-item label="来源">{{cur.source_text}}</el-descriptions-item>
          <el-descriptions-item label="区域">{{cur.area_name}} {{cur.location_note}}</el-descriptions-item>
          <el-descriptions-item label="电话">{{cur.contact_phone}}</el-descriptions-item>
          <el-descriptions-item label="下单时间" :span="2">{{cur.created_at}}</el-descriptions-item>
          <el-descriptions-item v-if="cur.remark" label="备注" :span="2">{{cur.remark}}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="cur.items" border size="small" style="margin-top:10px">
          <el-table-column label="商品"><template #default="{row}">{{row.product_name}}<span v-if="row.sku_name!=='默认'">（{{row.sku_name}}）</span></template></el-table-column>
          <el-table-column prop="qty" label="数量" width="60" />
          <el-table-column label="金额" width="80"><template #default="{row}">{{yuan(row.amount)}}</template></el-table-column>
          <el-table-column prop="refunded_qty" label="已退" width="60" />
          <el-table-column v-if="['paid','partial_refunded'].includes(cur.pay_status) && can('orders')" label="" width="96" align="center">
            <template #default="{row}"><el-button v-if="row.qty > row.refunded_qty" size="small" @click="openExchange(row)">换规格</el-button></template></el-table-column>
        </el-table>
        <div style="margin:10px 0;text-align:right">商品 ¥{{yuan(cur.original_amount)}}<span v-if="cur.discount_amount">　优惠 −¥{{yuan(cur.discount_amount)}}</span>　应收 <b>¥{{yuan(cur.payable_amount)}}</b><span v-if="cur.refunded_amount">　已退 ¥{{yuan(cur.refunded_amount)}}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <el-button v-if="cur.status==='pending' && can('orders')" type="primary" @click="act('accept')">接单</el-button>
          <el-button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" type="success" @click="payDlg=true">收款</el-button>
          <el-button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" @click="openModify">修改订单</el-button>
          <el-button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" type="danger" plain @click="cancel">取消订单</el-button>
          <el-button v-if="['paid','partial_refunded'].includes(cur.pay_status) && can('refund')" type="warning" @click="openRefund">退货退款</el-button>
          <el-button @click="print">{{cur.print_count ? '补打小票' : '打印小票'}}</el-button>
        </div>
        <el-timeline style="margin-top:16px"><el-timeline-item v-for="(l,i) in cur.logs" :key="i" :timestamp="l.created_at">{{l.action}} {{l.detail}}</el-timeline-item></el-timeline>
      </div>
    </el-drawer>
    <pay-dialog v-model="payDlg" :user="user" :lines="curLines" title="订单收款" @pay="collect" />
    <el-dialog v-model="mDlg" title="修改订单" width="640px" top="6vh">
      <div class="muted" style="margin-bottom:10px">可以改规格、改数量、去掉或添加商品，保存后库存和应收自动调整，不用取消重下。数量改成 0 即去掉该商品。</div>
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
    <el-dialog v-model="xDlg" title="换规格" width="520px">
      <div v-if="xRow" style="margin-bottom:12px">{{xRow.product_name}}　原规格：<b>{{xRow.sku_name}}</b>　¥{{yuan(xRow.unit_price)}}</div>
      <el-form label-width="72px">
        <el-form-item label="换成"><el-radio-group v-model="x.sku_id" class="x-skus">
          <el-radio-button v-for="k in xSkus" :key="k.id" :value="k.id">{{k.name}}　¥{{yuan(k.price)}}</el-radio-button></el-radio-group>
          <div v-if="!xSkus.length" class="muted">这个商品没有其他规格可换</div></el-form-item>
        <el-form-item label="件数"><el-input-number v-model="x.qty" :min="1" :max="xRow ? xRow.qty - xRow.refunded_qty : 1" /></el-form-item>
        <el-form-item v-if="xDiff" :label="xDiff > 0 ? '补收方式' : '退款方式'"><el-select v-model="x.method" style="width:140px"><el-option v-for="(t,k) in methods" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="原因"><el-input v-model="x.reason" placeholder="可不填，如：M 码换 L 码" /></el-form-item>
      </el-form>
      <div class="muted">原规格自动退回本店库存，新规格从库存扣减。</div>
      <template #footer><span style="float:left;line-height:32px"><template v-if="xDiff > 0">需补收 <b>¥{{yuan(xDiff)}}</b></template><template v-else-if="xDiff < 0">需退还 <b>¥{{yuan(-xDiff)}}</b></template><template v-else>价格相同，无需补差价</template></span>
        <el-button @click="xDlg=false">取消</el-button><el-button type="primary" :loading="xBusy" :disabled="!x.sku_id" @click="doExchange">确认换规格</el-button></template>
    </el-dialog>
    <el-dialog v-model="rDlg" title="退货退款" width="560px">
      <el-table :data="rLines" border size="small">
        <el-table-column prop="name" label="商品" />
        <el-table-column label="可退" width="60"><template #default="{row}">{{row.max}}</template></el-table-column>
        <el-table-column label="退几件" width="150"><template #default="{row}"><el-input-number v-model="row.qty" :min="0" :max="row.max" size="small" /></template></el-table-column>
      </el-table>
      <el-form label-width="100px" style="margin-top:12px">
        <el-form-item label="退款方式"><el-select v-model="rf.method" style="width:140px"><el-option v-for="(t,k) in methods" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="退回库存"><el-checkbox v-model="rf.restock">商品退回本店库存（损坏品请取消勾选）</el-checkbox></el-form-item>
        <el-form-item label="原因"><el-input v-model="rf.reason" /></el-form-item>
      </el-form>
      <div class="muted">退款金额按本单实收（含优惠分摊）自动计算。目前是记账，需线下把钱退给顾客。</div>
      <template #footer><el-button link type="primary" style="float:left" @click="refundAll">全部退</el-button><el-button @click="rDlg=false">取消</el-button><el-button type="warning" :loading="rBusy" @click="doRefund">确认退款</el-button></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const status = ref('pending'), source = ref(null), day = ref(''), kw = ref(''), rows = ref([]), drawer = ref(false), cur = ref(null), payDlg = ref(false);
    const rBusy = ref(false);
    const rDlg = ref(false), rLines = ref([]), rf = reactive({ method: 'cash', restock: true, reason: '', rid: '' });
    const can = (p) => props.user.permissions.includes(p);
    const tagType = (o) => o.status === 'pending' ? 'danger' : o.status === 'cancelled' ? 'info' : o.pay_status === 'unpaid' ? 'warning' : o.pay_status === 'paid' ? 'success' : 'info';
    const load = async () => {
      try { rows.value = (await api.get('/api/orders', { store_id: props.storeId, status: status.value, source: source.value, begin: day.value, end: day.value, keyword: kw.value })).items; } catch (e) { err(e); }
    };
    watch(() => props.tick, load);
    const open = async (o) => { try { cur.value = await api.get('/api/orders/' + o.id); drawer.value = true; } catch (e) { err(e); } };
    const refresh = async () => { cur.value = await api.get('/api/orders/' + cur.value.id); load(); };
    const act = async (a) => { try { await api.post('/api/orders/' + cur.value.id + '/' + a); await refresh(); ElMessage.success('已接单'); } catch (e) { err(e); } };
    const curLines = computed(() => cur.value ? cur.value.items.map(i => ({ sku_id: i.sku_id, qty: i.qty })) : []);
    let collecting = false;
    const collect = async (p) => {
      if (collecting) return;  // 连点只发一次
      collecting = true;
      try { await api.post('/api/orders/' + cur.value.id + '/collect', { payments: p.payments, discount_rate: p.discount_rate, payable: p.payable }); payDlg.value = false; await refresh(); ElMessage.success('已收款'); }
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
    // 已收款订单换规格（如 M 码换 L 码）：原规格退回库存、新规格扣库存，有差价补收 / 退还
    const xDlg = ref(false), xRow = ref(null), xSkus = ref([]), xBusy = ref(false), x = reactive({ sku_id: null, qty: 1, method: 'cash', reason: '' });
    const xDiff = computed(() => { const k = xSkus.value.find(k => k.id === x.sku_id); return k && xRow.value ? (k.price - xRow.value.unit_price) * x.qty : 0; });
    const openExchange = async (row) => {
      try { if (!prods.length) prods = (await api.get('/api/products')).filter(p => p.skus.length); } catch (e) { return err(e); }
      const p = prodOf(row.sku_id);
      xRow.value = row; xSkus.value = p ? p.skus.filter(k => k.id !== row.sku_id) : [];
      const pay = cur.value.payments.find(p => p.kind === 'pay');
      Object.assign(x, { sku_id: xSkus.value.length === 1 ? xSkus.value[0].id : null, qty: row.qty - row.refunded_qty, method: pay ? pay.method : 'cash', reason: '' });
      xDlg.value = true;
    };
    const doExchange = async () => {
      if (xBusy.value) return;
      xBusy.value = true;
      try { await api.post('/api/orders/' + cur.value.id + '/exchange', { order_item_id: xRow.value.id, sku_id: x.sku_id, qty: x.qty, method: x.method, reason: x.reason });
        xDlg.value = false; await refresh(); ElMessage.success('已换规格，库存已调整'); } catch (e) { err(e); } finally { xBusy.value = false; }
    };
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
    return { status, source, day, kw, rows, drawer, cur, payDlg, rDlg, rLines, rf, can, tagType, load, open, act, curLines, collect, cancel, openRefund, doRefund, refundAll, rBusy,
      xDlg, xRow, xSkus, xBusy, x, xDiff, openExchange, doExchange,
      mDlg, mLines, mReason, mBusy, mAdd, mKw, mPrice, mTotal, mOptions, openModify, addLine, doModify, print, yuan, methods: METHODS };
  },
};

// ---------------- 交班汇总 ----------------
const Shift = {
  props: ['storeId', 'user', 'sync'],
  template: `
  <div class="ws-body"><div class="page-pad" style="display:flex;flex-direction:column;gap:16px;max-width:820px">
    <div v-if="loaded && !cur" class="panel">
      <div class="toolbar"><b>开班</b><span class="muted">点清钱箱里的备用金（找零用的钱）后开班，交班时按这一班的收款核对现金。</span></div>
      <el-form inline @submit.prevent><el-form-item label="备用金"><el-input v-model="opening" inputmode="decimal" style="width:160px"><template #append>元</template></el-input></el-form-item>
        <el-form-item><el-button type="primary" :loading="busy" @click="openShift">开班</el-button></el-form-item></el-form>
      <div class="muted">不开班也能收银；开班后才能按收银员交班、算现金差额。</div>
    </div>
    <div v-if="cur" class="panel">
      <div class="toolbar"><b>当班中 · {{cur.cashier}}</b><span class="muted">{{cur.started_at}} 开班 · 备用金 ¥{{yuan(cur.opening_cash)}}</span><span class="grow"></span><el-button @click="loadCur">刷新</el-button></div>
      <el-table :data="Object.values(cur.methods)" border size="small">
        <el-table-column prop="method_text" label="方式" />
        <el-table-column prop="pay_count" label="收款笔数" width="90" />
        <el-table-column label="收款"><template #default="{row}">{{yuan(row.pay)}}</template></el-table-column>
        <el-table-column label="退款"><template #default="{row}">{{yuan(row.refund)}}</template></el-table-column>
        <el-table-column label="净额"><template #default="{row}"><b>{{yuan(row.pay - row.refund)}}</b></template></el-table-column>
      </el-table>
      <div class="shift-sum">
        <div><span>本班单数</span><b>{{cur.orders}}</b></div>
        <div><span>本班净收</span><b>¥{{yuan(cur.net)}}</b></div>
        <div><span>钱箱应有现金</span><b>¥{{yuan(cur.expected_cash)}}</b><em>备用金 + 现金收款 − 现金退款</em></div>
      </div>
      <el-form inline style="margin-top:12px" @submit.prevent>
        <el-form-item label="实点现金"><el-input v-model="counted" inputmode="decimal" style="width:150px"><template #append>元</template></el-input></el-form-item>
        <el-form-item v-if="diff !== null"><span :style="{fontWeight: 650, color: diff === 0 ? 'var(--success)' : 'var(--danger)'}">{{ diff === 0 ? '对上了' : (diff > 0 ? '长款 ¥' + yuan(diff) : '短款 ¥' + yuan(-diff)) }}</span></el-form-item>
        <el-form-item label="备注"><el-input v-model="remark" placeholder="差额原因等，选填" style="width:220px" /></el-form-item>
        <el-form-item><el-button type="primary" :loading="busy" @click="closeShift">交班</el-button></el-form-item>
      </el-form>
    </div>
    <div v-if="last" class="panel">
      <div class="toolbar"><b>交班完成</b><span class="muted">{{last.started_at}} — {{last.ended_at}}</span></div>
      <div class="shift-sum">
        <div><span>单数</span><b>{{last.orders}}</b></div><div><span>净收</span><b>¥{{yuan(last.net)}}</b></div>
        <div><span>应有现金</span><b>¥{{yuan(last.expected_cash)}}</b></div><div><span>实点现金</span><b>¥{{yuan(last.counted_cash)}}</b></div>
        <div><span>差额</span><b :style="{color: last.cash_diff ? 'var(--danger)' : 'var(--success)'}">{{ last.cash_diff === 0 ? '0' : (last.cash_diff > 0 ? '长 ' : '短 ') + yuan(Math.abs(last.cash_diff)) }}</b></div>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar"><b>我的交班记录</b></div>
      <el-table :data="history" size="small" border>
        <el-table-column label="时间" min-width="200"><template #default="{row}">{{row.started_at}}<br><span class="muted">{{row.ended_at || '当班中'}}</span></template></el-table-column>
        <el-table-column prop="orders" label="单数" width="70" />
        <el-table-column label="净收" width="100"><template #default="{row}">{{yuan(row.net)}}</template></el-table-column>
        <el-table-column label="备用金" width="90"><template #default="{row}">{{yuan(row.opening_cash)}}</template></el-table-column>
        <el-table-column label="应有 / 实点" width="150"><template #default="{row}">{{yuan(row.expected_cash)}} / {{row.counted_cash == null ? '—' : yuan(row.counted_cash)}}</template></el-table-column>
        <el-table-column label="差额" width="90"><template #default="{row}"><span v-if="row.cash_diff != null" :style="{color: row.cash_diff ? 'var(--danger)' : ''}">{{ row.cash_diff > 0 ? '+' : '' }}{{yuan(row.cash_diff)}}</span></template></el-table-column>
      </el-table>
    </div>
  </div></div>`,
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
    return { cur, loaded, opening, counted, remark, busy, last, history, diff, loadCur, openShift, closeShift, yuan };
  },
};

// ---------------- 本店库存 ----------------
const Stock = {
  props: ['storeId', 'canEdit', 'sync'],
  template: `
  <div class="ws-body"><div class="page-pad">
    <div class="panel">
      <div class="toolbar"><b>本店库存</b><el-input v-model="kw" placeholder="搜索" clearable style="width:160px" @keyup.enter="load" /><el-button @click="load">刷新</el-button>
        <span class="grow"></span><el-button v-if="canEdit" type="primary" @click="startAdjust">盘点</el-button></div>
      <el-table :data="rows" border>
        <el-table-column label="库存品"><template #default="{row}">{{row.name}}<el-tag v-if="row.low" type="danger" size="small" style="margin-left:6px">该补货了</el-tag><span v-if="row.earliest_expiry" class="muted" style="margin-left:8px">最早到期 {{row.earliest_expiry}}</span></template></el-table-column>
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="qty" label="库存" width="100" />
        <el-table-column v-if="adjusting" label="实盘数" width="140"><template #default="{row}"><el-input v-model="row.real" inputmode="decimal" size="small" /></template></el-table-column>
      </el-table>
      <div v-if="adjusting" style="margin-top:10px"><el-button @click="adjusting=false">取消</el-button><el-button type="primary" @click="submit">提交盘点</el-button></div>
    </div>
  </div></div>`,
  setup(props) {
    const kw = ref(''), rows = ref([]), adjusting = ref(false); let reqId = '';
    const load = async () => { try { rows.value = (await api.get('/api/stores/' + props.storeId + '/stock', { keyword: kw.value })).map(r => ({ ...r, real: '' })); } catch (e) { err(e); } };
    const startAdjust = () => { reqId = rid(); adjusting.value = true; };
    const submit = async () => {
      const lines = rows.value.filter(r => r.real !== '').map(r => ({ stock_item_id: r.stock_item_id, qty: parseFloat(r.real) }));
      if (!lines.length) return ElMessage.warning('请填写实盘数');
      try { await api.post('/api/stores/' + props.storeId + '/stock-adjust', { lines, request_id: reqId }); adjusting.value = false; ElMessage.success('已盘点'); load(); } catch (e) { err(e); }
    };
    onMounted(load);
    watch(() => props.sync, load);
    return { kw, rows, adjusting, load, startAdjust, submit };
  },
};

// ---------------- 要货申请 ----------------
const Requisitions = {
  props: ['storeId', 'stockVisible', 'sync'],
  template: `
  <div class="ws-body"><div class="page-pad">
    <div class="panel">
      <div class="toolbar"><b>向仓库要货</b>
        <el-radio-group v-model="status" @change="load"><el-radio-button value="">全部</el-radio-button><el-radio-button value="pending">待处理</el-radio-button><el-radio-button value="done">已调拨</el-radio-button><el-radio-button value="rejected">已驳回</el-radio-button></el-radio-group>
        <el-button @click="load">刷新</el-button><span class="grow"></span><el-button type="primary" @click="openNew">新建要货单</el-button></div>
      <el-table :data="rows" border>
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
        <el-table-column width="90"><template #default="{row}"><el-button v-if="row.status === 'pending'" link type="danger" @click="cancel(row)">撤回</el-button></template></el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="dlg" title="新建要货单" width="640px" top="5vh">
      <div class="toolbar"><el-input v-model="kw" placeholder="搜索库存品" clearable style="width:200px" /><el-input v-model="remark" placeholder="备注（选填）" style="flex:1" /></div>
      <el-table :data="shown" border size="small" max-height="460">
        <el-table-column prop="name" label="库存品" /><el-table-column prop="unit" label="单位" width="70" />
        <el-table-column v-if="stockVisible" label="本店现有" width="90" align="right"><template #default="{row}">{{ have[row.id] ?? 0 }}</template></el-table-column>
        <el-table-column label="要几个" width="120"><template #default="{row}"><el-input v-model="row.qty" inputmode="decimal" size="small" /></template></el-table-column>
      </el-table>
      <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="submit">提交给仓库</el-button></template>
    </el-dialog>
  </div></div>`,
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
      <div class="store"><span class="mark">收</span>
        <span v-if="stores.length <= 1">{{storeName}}</span>
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
      <el-popover placement="bottom" :width="280" trigger="click">
        <template #reference><button type="button" class="tb"><span class="ico" v-html="icon('settings')"></span>本机设置</button></template>
        <div><el-checkbox v-model="settings.sound">提示音和语音播报</el-checkbox></div>
        <div><el-checkbox v-model="settings.keyHints">显示键盘快捷键提示</el-checkbox></div>
        <div class="osk-set"><span>屏幕键盘</span><el-radio-group v-model="settings.osk" size="small">
          <el-radio-button value="auto">触摸时弹出</el-radio-button><el-radio-button value="always">总是弹出</el-radio-button><el-radio-button value="off">关闭</el-radio-button></el-radio-group></div>
        <div v-if="cur.print_mode === 'agent'" class="hint" style="margin:0 0 6px">本店小票由接小票机那台电脑上的“打印小助手”出票（后台设置），下面两项打印选项在本机不起作用。</div>
        <div v-else-if="desk && desk.printMode === 'off'" class="hint" style="margin:0 0 6px">这台电脑设置为不出票，下面两项不起作用。</div>
        <div><el-checkbox v-model="settings.autoPrintOnline">新订单自动打印小票</el-checkbox></div>
        <div><el-checkbox v-model="settings.autoPrintPos">收银后自动打印小票</el-checkbox></div>
        <template v-if="desk">
          <div class="desk-box">
            <div>小票机：<b>{{desk.printer || '未选择'}}</b><span class="muted">　{{ {raw: '直接出票', driver: '驱动出票', off: '不出票'}[desk.printMode] }}</span></div>
            <div style="margin-top:8px"><el-button size="small" @click="deskTest">打印测试页</el-button><el-button size="small" @click="deskDrawer">开钱箱</el-button><el-button size="small" type="primary" plain @click="openDeskSettings">桌面软件设置</el-button></div>
            <div class="muted" style="font-size:12px;margin-top:6px">桌面版 {{desk.version}} · <kbd>F11</kbd> 全屏 · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> 设置 · <kbd>Ctrl</kbd>+<kbd>+</kbd>/<kbd>−</kbd> 缩放</div>
          </div>
        </template>
        <div v-else class="muted" style="font-size:12px;margin-top:6px">本设置只对这台电脑生效。建议安装“收银系统”桌面软件，小票直接出、不弹打印框。</div>
        <div class="muted" style="font-size:12px;margin-top:6px">切换页面：<span v-for="k in tabKeys" :key="k[0]" style="margin-right:6px"><kbd>{{k[0]}}</kbd>{{k[1]}}</span></div>
      </el-popover>
        <a v-if="user.is_admin" class="tb" href="/web/admin/" target="_blank"><span class="ico" v-html="icon('sliders')"></span>后台管理</a>
        <span class="tb-sep"></span>
        <div class="who"><span class="avatar">{{(user.display_name || user.username).slice(0,1)}}</span><span>{{user.display_name || user.username}}</span></div>
        <button type="button" class="tb" @click="changePw"><span class="ico" v-html="icon('lock')"></span>修改密码</button>
        <button type="button" class="tb" @click="logout"><span class="ico" v-html="icon('logout')"></span>退出</button>
      </div>
    </div>
    <el-empty v-if="!storeId" description="账号还没有分配门店，请联系后台" />
    <template v-else>
      <pos v-if="tab==='pos'" :key="'p'+storeId" :user="user" :store-id="storeId" :settings="settings" :agent="cur.print_mode === 'agent'" :sync="syncN" />
      <orders v-if="tab==='orders'" :key="'o'+storeId" :user="user" :store-id="storeId" :settings="settings" :pending-count="pending" :tick="tick" :agent="cur.print_mode === 'agent'" />
      <shift v-if="tab==='shift'" :key="'s'+storeId" :store-id="storeId" :user="user" :sync="syncN" />
      <stock v-if="tab==='stock'" :key="'k'+storeId" :store-id="storeId" :can-edit="stockEditable" :sync="syncN" />
      <requisitions v-if="tab==='req'" :key="'r'+storeId" :store-id="storeId" :stock-visible="stockVisible" :sync="syncN" />
    </template>
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

    const poll = async () => {
      if (!storeId.value || !can('orders')) return;
      if (polling) return;  // 上一次还没返回就不再发，避免同一批订单响铃、打印两次
      polling = true;
      const sid = storeId.value;
      try {
        const r = await api.get('/api/orders/new', { store_id: sid, after_id: lastId });
        if (sid !== storeId.value || sid !== pollStore) return;  // 中途切换了门店，丢弃这次结果
        pending.value = r.pending_count;
        // 第一次只记下当前最新单号（打开页面之前的订单不重复响铃打印，在“待接单”里处理）
        const fresh = primed ? r.orders.filter(o => o.status !== 'cancelled') : [];
        primed = true;
        lastId = r.last_id;
        if (fresh.length) {
          tick.value++;
          if (settings.sound) { beep(3); speak('您有' + fresh.length + '个新订单'); }
          ElementPlus.ElNotification({ title: '新订单', message: fresh.map(o => (o.area_name + ' ' + o.location_note).trim() + ' ¥' + yuan(o.payable_amount)).join('\n'), type: 'warning', duration: 8000 });
          if (settings.autoPrintOnline && cur.value.print_mode !== 'agent' && canPrintHere()) {
            for (const o of fresh) printing = printing.then(async () => { try { await printOrder(o.id, false); } catch (e) { err(e); } });
          }
        }
      } catch (e) {} finally { polling = false; }
    };
    const startPoll = () => { clearInterval(timer); lastId = 0; primed = false; pollStore = storeId.value; poll(); timer = setInterval(poll, 5000); };
    const afterLogin = async () => {
      stores.value = await api.get('/api/stores');
      const saved = pref('store', null);
      storeId.value = stores.value.find(s => s.id === saved) ? saved : (stores.value[0] || {}).id || null;
      tab.value = can('pos') ? 'pos' : 'orders';
      startPoll();
    };
    const switchStore = () => { setPref('store', storeId.value); startPoll(); };
    // 手动同步：重新拿门店设置、账号权限，并让当前页面重新拉商品 / 订单 / 库存（不清购物车、不退出登录）
    const syncN = ref(0), syncing = ref(false);
    const sync = async () => {
      syncing.value = true;
      try {
        const [st, me] = await Promise.all([api.get('/api/stores'), api.get('/api/auth/me')]);
        stores.value = st; user.value = me;
        syncN.value++; tick.value++; poll();
        ElMessage.success('已同步');
      } catch (e) { err(e); } finally { syncing.value = false; }
    };
    const login = async () => {
      busy.value = true;
      try {
        const r = await api.post('/api/auth/login', lf); api.setToken(r.token); user.value = r.user; await afterLogin();
        if (r.weak_password) ElMessage({ type: 'warning', duration: 8000, showClose: true, message: '这个账号还在用默认或过于简单的密码，请点右上角“修改密码”修改' });
      } catch (e) { err(e); } finally { busy.value = false; }
    };
    const logout = () => { api.setToken(''); user.value = null; clearInterval(timer); };
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
    window.onUnauthorized = () => { user.value = null; clearInterval(timer); };
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
    return { icon: Shouyin.icon, user, lf, busy, stores, storeId, storeName, cur, tab, pending, tick, clock, settings, can, stockVisible, stockEditable, login, logout, changePw, switchStore, sync, syncN, syncing,
      desk: deskInfo, openDeskSettings, deskTest, deskDrawer, tabKeys: K.TAB_KEYS, toggleOsk };
  },
};

createApp(App).use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount('#app');
