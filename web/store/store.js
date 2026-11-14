// 门店工作台：收银、订单（新订单提示音 + 自动打印）、交班、库存
const { createApp, ref, reactive, computed, onMounted, onUnmounted, watch } = Vue;
const { api, yuan, toFen, rid, today, printReceipt, beep, speak } = Shouyin;
const { ElMessage, ElMessageBox } = ElementPlus;
const err = (e) => ElMessage.error(e.message || String(e));

function pref(key, def) { try { const v = localStorage.getItem('shouyin_pref_' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function setPref(key, v) { try { localStorage.setItem('shouyin_pref_' + key, JSON.stringify(v)); } catch (e) {} }

// 打印小助手模式下已发到小票机队列；否则在本机浏览器打印
function outPrint(r) { if (r && r.queued) ElMessage.success('已发送到小票机'); else printReceipt(r); }

const METHODS = { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' };

// 优惠（打折 / 调低应收）+ 收款，收银和订单收款共用
const PayDialog = {
  props: ['modelValue', 'user', 'lines', 'title'],
  emits: ['update:modelValue', 'pay'],
  template: `
  <el-dialog :model-value="modelValue" @update:model-value="v => $emit('update:modelValue', v)" :title="title || '收款'" width="560px" class="paybox" @open="reset">
    <div class="total">
      <div class="k">本次应收</div>
      <div class="v money">¥{{yuan(q.payable_amount)}}</div>
      <div class="s">商品金额 ¥{{yuan(q.original_amount)}}<span v-if="q.discount_amount">　优惠 −¥{{yuan(q.discount_amount)}}</span></div>
    </div>
    <div v-if="canDiscount" class="opt"><span>打折</span>
      <span><el-button v-for="r in [95,90,88,85,80]" :key="r" size="small" :type="rate===r?'primary':''" @click="rate = rate===r ? null : r">{{r/10}}折</el-button>
        <el-input v-model="rateInput" size="small" style="width:86px;margin-left:6px" placeholder="自定" @change="v => rate = v ? Math.round(parseFloat(v)*10) : null"><template #append>折</template></el-input></span></div>
    <div v-if="canAdjust" class="opt"><span>改本次应收</span>
      <span><el-button size="small" @click="roundDown(100)">抹角</el-button><el-button size="small" @click="roundDown(1000)">抹到十元</el-button>
        <el-input v-model="payableInput" size="small" style="width:116px;margin-left:6px" placeholder="不改" @change="quote"><template #append>元</template></el-input></span></div>
    <div v-if="limitText" class="hint" style="text-align:right;margin-top:0">{{limitText}}；只影响本单，不改商品价格</div>
    <div class="methods"><div v-for="(t,k) in methods" :key="k" class="m" :class="{on: method===k}" @click="method=k">{{t}}</div></div>
    <div v-if="method==='cash'">
      <el-input v-model="received" size="large" placeholder="不填按应收" @keyup.enter="submit"><template #prepend>实收现金</template><template #append>元</template></el-input>
      <div class="quickcash"><el-button v-for="v in quick" :key="v" @click="received = v">¥{{v}}</el-button></div>
      <div class="change"><span>找零</span><b class="money" style="color:#0f766e">¥{{change}}</b></div>
    </div>
    <div v-else class="hint" style="font-size:13px">请确认顾客已通过{{methods[method]}}付款，再点“确认收款”。目前是店员确认后记账，不是在线支付。</div>
    <template #footer><el-button size="large" @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button size="large" type="primary" :loading="busy" :disabled="!!qErr" @click="submit">确认收款 ¥{{yuan(q.payable_amount)}}</el-button></template>
  </el-dialog>`,
  setup(props, { emit }) {
    const q = reactive({ original_amount: 0, payable_amount: 0, discount_amount: 0 }), qErr = ref('');
    const rate = ref(null), rateInput = ref(''), payableInput = ref(''), method = ref('cash'), received = ref(''), busy = ref(false);
    const perms = computed(() => (props.user && props.user.permissions) || []);
    const canDiscount = computed(() => perms.value.includes('discount'));
    const canAdjust = computed(() => perms.value.includes('adjust_amount'));
    const limitText = computed(() => {
      const u = props.user || {}; const r = u.min_discount_rate || u.role_min_discount_rate; const a = u.max_adjust_amount != null ? u.max_adjust_amount : u.role_max_adjust_amount;
      const parts = []; if (r > 1) parts.push('最低 ' + r / 10 + ' 折'); if (a != null) parts.push('单笔最多调低 ' + yuan(a) + ' 元');
      return parts.length ? '你的权限：' + parts.join('，') : '';
    });
    const quote = async () => {
      try {
        const r = await api.post('/api/pos/quote', { lines: props.lines, discount_rate: rate.value, payable: payableInput.value === '' ? null : toFen(payableInput.value) });
        Object.assign(q, r); qErr.value = '';
      } catch (e) { qErr.value = e.message; err(e); }
    };
    watch(rate, () => { rateInput.value = rate.value && ![95, 90, 88, 85, 80].includes(rate.value) ? rate.value / 10 : ''; payableInput.value = ''; quote(); });
    const reset = () => { rate.value = null; rateInput.value = ''; payableInput.value = ''; method.value = 'cash'; received.value = ''; quote(); };
    const roundDown = async (unit) => { payableInput.value = yuan(Math.floor(q.payable_amount / unit) * unit + (payableInput.value === '' ? 0 : 0)); await quote(); };
    const change = computed(() => { const r = toFen(received.value); return r >= q.payable_amount ? yuan(r - q.payable_amount) : '0.00'; });
    const quick = computed(() => { const p = q.payable_amount / 100; return [...new Set([p, Math.ceil(p / 10) * 10, Math.ceil(p / 50) * 50, Math.ceil(p / 100) * 100])].map(v => v.toFixed(2)).slice(0, 4); });
    const submit = async () => {
      if (qErr.value) return;
      const pay = { method: method.value, amount: q.payable_amount };
      if (method.value === 'cash') { const r = received.value === '' ? q.payable_amount : toFen(received.value); if (r < q.payable_amount) return ElMessage.warning('实收不足'); pay.received = r; }
      busy.value = true;
      try { await emit('pay', { payments: [pay], discount_rate: q.discount_rate, payable: q.payable_amount, change: pay.received ? pay.received - pay.amount : 0 }); }
      finally { busy.value = false; }
    };
    return { q, qErr, rate, rateInput, payableInput, method, received, busy, canDiscount, canAdjust, limitText, quote, reset, roundDown, change, quick, submit, yuan, methods: METHODS };
  },
};

// ---------------- 收银 ----------------
const Pos = {
  props: ['user', 'storeId', 'settings', 'agent'],
  components: { PayDialog },
  template: `
  <div class="ws-body">
    <div class="pos-left">
      <div class="scan"><el-input ref="scan" v-model="scanText" size="large" placeholder="扫条码，或输入商品名称后回车" clearable @keyup.enter="onScan" /></div>
      <div class="cats"><div class="cat" :class="{on: !cat}" @click="cat=null">全部</div>
        <div v-for="c in topCats" :key="c.id" class="cat" :class="{on: cat===c.id}" @click="cat=c.id">{{c.name}}</div></div>
      <div class="grid">
        <div v-for="p in shown" :key="p.id" class="card" :class="{in: inCart(p)}" @click="pick(p)">
          <span v-if="inCart(p)" class="cnt">{{inCart(p)}}</span>
          <div class="img" :style="p.image ? {backgroundImage: 'url(' + p.image + ')'} : {}">{{p.image ? '' : p.name.slice(0,1)}}</div>
          <div class="n">{{p.name}}</div>
          <div class="sub">{{p.skus.length > 1 ? p.skus.length + ' 个规格' : (p.skus[0].name !== '默认' ? p.skus[0].name : p.unit)}}</div>
          <div class="p">¥{{priceText(p)}}</div>
        </div>
      </div>
    </div>
    <div class="pos-right">
      <div class="cart-head"><b>当前订单</b><el-button v-if="cart.length" link type="danger" @click="clear">清空</el-button></div>
      <div class="cart">
        <el-empty v-if="!cart.length" :image-size="90" description="点商品或扫码加入" />
        <div v-for="(l,i) in cart" :key="l.sku_id" class="line">
          <div class="info"><div>{{l.name}}</div><div class="muted">{{l.sku !== '默认' ? l.sku + ' · ' : ''}}¥{{yuan(l.price)}}</div></div>
          <div class="qty"><button @click="dec(i)">−</button><input v-model.number="l.qty" @change="fix(i)" /><button @click="l.qty++">＋</button></div>
          <div class="amt money">{{yuan(l.price * l.qty)}}</div>
        </div>
      </div>
      <div class="sum">
        <el-input v-model="remark" placeholder="备注（可选）" />
        <div class="row" style="margin-top:10px"><span>共 {{count}} 件</span><span class="big money">¥{{yuan(total)}}</span></div>
        <div class="btns"><el-button @click="clear">清空</el-button><el-button type="primary" :disabled="!cart.length" @click="payDlg=true">收款</el-button></div>
      </div>
    </div>
    <pay-dialog v-model="payDlg" :user="user" :lines="lines" @pay="pay" />
    <el-dialog v-model="skuDlg" :title="skuProduct && skuProduct.name" width="460px">
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <el-button v-for="s in (skuProduct ? skuProduct.skus : [])" :key="s.id" size="large" style="min-width:120px;height:64px" @click="add(skuProduct, s); skuDlg=false">
          {{s.name}}<br>¥{{yuan(s.price)}}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="doneDlg" title="收款成功" width="380px">
      <div style="text-align:center;font-size:18px">应收 ¥{{yuan(last.payable_amount)}}<div v-if="lastChange" style="margin-top:6px;color:#0f766e;font-size:24px">找零 ¥{{yuan(lastChange)}}</div></div>
      <template #footer><el-button @click="reprint">补打小票</el-button><el-button type="primary" @click="doneDlg=false">继续收银</el-button></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const products = ref([]), cats = ref([]), cat = ref(null), scanText = ref(''), cart = ref([]), remark = ref('');
    const payDlg = ref(false), skuDlg = ref(false), skuProduct = ref(null), doneDlg = ref(false), last = ref({}), lastChange = ref(0), scan = ref(null);
    let reqId = rid();
    const topCats = computed(() => cats.value.filter(c => !c.parent_id && c.active));
    const shown = computed(() => {
      if (!cat.value) return products.value;
      const ids = new Set([cat.value, ...cats.value.filter(c => c.parent_id === cat.value).map(c => c.id)]);
      return products.value.filter(p => ids.has(p.category_id));
    });
    const priceText = (p) => { const ps = p.skus.map(s => s.price); const a = Math.min(...ps), b = Math.max(...ps); return a === b ? yuan(a) : yuan(a) + ' 起'; };
    const load = async () => { try { [products.value, cats.value] = await Promise.all([api.get('/api/products'), api.get('/api/categories')]); products.value = products.value.filter(p => p.skus.length); } catch (e) { err(e); } };
    const add = (p, s) => { const l = cart.value.find(x => x.sku_id === s.id); if (l) l.qty++; else cart.value.push({ sku_id: s.id, name: p.name, sku: s.name, price: s.price, qty: 1 }); };
    const pick = (p) => { if (p.skus.length === 1) add(p, p.skus[0]); else { skuProduct.value = p; skuDlg.value = true; } };
    const onScan = async () => {
      const t = scanText.value.trim(); if (!t) return;
      try { const r = await api.get('/api/products/by-barcode/' + encodeURIComponent(t)); add(r.product, r.product.skus.find(s => s.id === r.sku_id)); scanText.value = ''; }
      catch (e) {
        const m = products.value.filter(p => p.name.includes(t));
        if (m.length === 1) { pick(m[0]); scanText.value = ''; } else if (m.length) { products.value = m.concat(products.value.filter(p => !m.includes(p))); cat.value = null; } else err(e);
      }
    };
    const inCart = (p) => cart.value.filter(l => p.skus.some(s => s.id === l.sku_id)).reduce((a, l) => a + l.qty, 0);
    const dec = (i) => { if (cart.value[i].qty > 1) cart.value[i].qty--; else cart.value.splice(i, 1); };
    const fix = (i) => { const l = cart.value[i]; l.qty = Math.max(1, parseInt(l.qty) || 1); };
    const clear = () => { cart.value = []; remark.value = ''; };
    const count = computed(() => cart.value.reduce((a, l) => a + l.qty, 0));
    const total = computed(() => cart.value.reduce((a, l) => a + l.qty * l.price, 0));
    const lines = computed(() => cart.value.map(l => ({ sku_id: l.sku_id, qty: l.qty })));
    const pay = async (p) => {
      try {
        const o = await api.post('/api/pos/checkout', { store_id: props.storeId, lines: lines.value, payments: p.payments, discount_rate: p.discount_rate,
          payable: p.payable, remark: remark.value, request_id: reqId });
        reqId = rid(); last.value = o; lastChange.value = p.change; payDlg.value = false; doneDlg.value = true; clear();
        if (props.settings.sound) { beep(1); speak('收款成功，' + yuan(o.payable_amount) + '元' + (p.change ? '，找零' + yuan(p.change) + '元' : '')); }
        if (props.settings.autoPrintPos && !props.agent) printReceipt(await api.post('/api/orders/' + o.id + '/print', {}));
      } catch (e) { err(e); }
    };
    const reprint = async () => { try { outPrint(await api.post('/api/orders/' + last.value.id + '/print', { reprint: true })); } catch (e) { err(e); } };
    onMounted(() => { load(); setTimeout(() => scan.value && scan.value.focus(), 300); });
    return { products, cats, cat, topCats, shown, scanText, cart, remark, payDlg, skuDlg, skuProduct, doneDlg, last, lastChange, scan,
      priceText, add, pick, onScan, inCart, dec, fix, clear, count, total, lines, pay, reprint, yuan };
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
        </el-table>
        <div style="margin:10px 0;text-align:right">商品 ¥{{yuan(cur.original_amount)}}<span v-if="cur.discount_amount">　优惠 −¥{{yuan(cur.discount_amount)}}</span>　应收 <b>¥{{yuan(cur.payable_amount)}}</b><span v-if="cur.refunded_amount">　已退 ¥{{yuan(cur.refunded_amount)}}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <el-button v-if="cur.status==='pending' && can('orders')" type="primary" @click="act('accept')">接单</el-button>
          <el-button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" type="success" @click="payDlg=true">收款</el-button>
          <el-button v-if="cur.pay_status==='unpaid' && cur.status!=='cancelled' && can('orders')" type="danger" plain @click="cancel">取消订单</el-button>
          <el-button v-if="['paid','partial_refunded'].includes(cur.pay_status) && can('refund')" type="warning" @click="openRefund">退货退款</el-button>
          <el-button @click="print">{{cur.print_count ? '补打小票' : '打印小票'}}</el-button>
        </div>
        <el-timeline style="margin-top:16px"><el-timeline-item v-for="(l,i) in cur.logs" :key="i" :timestamp="l.created_at">{{l.action}} {{l.detail}}</el-timeline-item></el-timeline>
      </div>
    </el-drawer>
    <pay-dialog v-model="payDlg" :user="user" :lines="curLines" title="订单收款" @pay="collect" />
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
      <template #footer><el-button @click="rDlg=false">取消</el-button><el-button type="warning" @click="doRefund">确认退款</el-button></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const status = ref('pending'), source = ref(null), day = ref(''), kw = ref(''), rows = ref([]), drawer = ref(false), cur = ref(null), payDlg = ref(false);
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
    const collect = async (p) => {
      try { await api.post('/api/orders/' + cur.value.id + '/collect', { payments: p.payments, discount_rate: p.discount_rate, payable: p.payable }); payDlg.value = false; await refresh(); ElMessage.success('已收款'); }
      catch (e) { err(e); }
    };
    const cancel = async () => {
      let reason; try { ({ value: reason } = await ElMessageBox.prompt('取消原因（可不填）', '取消订单', { inputValue: '' })); } catch (e) { return; }
      try { await api.post('/api/orders/' + cur.value.id + '/cancel', { reason: reason || '' }); await refresh(); ElMessage.success('已取消，库存已退回'); } catch (e) { err(e); }
    };
    const openRefund = () => {
      rLines.value = cur.value.items.map(i => ({ id: i.id, name: i.product_name + (i.sku_name !== '默认' ? '（' + i.sku_name + '）' : ''), max: i.qty - i.refunded_qty, qty: i.qty - i.refunded_qty })).filter(l => l.max > 0);
      const pay = cur.value.payments.find(p => p.kind === 'pay');
      Object.assign(rf, { method: pay ? pay.method : 'cash', restock: true, reason: '', rid: rid() });
      rDlg.value = true;
    };
    const doRefund = async () => {
      const lines = rLines.value.filter(l => l.qty > 0).map(l => ({ order_item_id: l.id, qty: l.qty }));
      if (!lines.length) return ElMessage.warning('请填写退货数量');
      try { const r = await api.post('/api/orders/' + cur.value.id + '/refund', { lines, method: rf.method, restock: rf.restock, reason: rf.reason, request_id: rf.rid });
        rDlg.value = false; await refresh(); ElMessage.success('已退款 ¥' + yuan(r.refund.amount)); } catch (e) { err(e); }
    };
    const print = async () => { try { outPrint(await api.post('/api/orders/' + cur.value.id + '/print', { reprint: cur.value.print_count > 0 })); await refresh(); } catch (e) { err(e); } };
    onMounted(load);
    return { status, source, day, kw, rows, drawer, cur, payDlg, rDlg, rLines, rf, can, tagType, load, open, act, curLines, collect, cancel, openRefund, doRefund, print, yuan, methods: METHODS };
  },
};

// ---------------- 交班汇总 ----------------
const Shift = {
  props: ['storeId'],
  template: `
  <div class="ws-body"><div class="page-pad">
    <div class="panel" style="max-width:720px">
      <div class="toolbar"><b>交班汇总（我今天经手的收款）</b><span class="grow"></span><el-date-picker v-model="day" type="date" value-format="YYYY-MM-DD" @change="load" /></div>
      <el-table :data="rows" border>
        <el-table-column prop="method_text" label="方式" />
        <el-table-column prop="pay_count" label="收款笔数" />
        <el-table-column label="收款"><template #default="{row}">{{yuan(row.pay)}}</template></el-table-column>
        <el-table-column label="退款"><template #default="{row}">{{yuan(row.refund)}}</template></el-table-column>
        <el-table-column label="净额"><template #default="{row}"><b>{{yuan(row.pay - row.refund)}}</b></template></el-table-column>
      </el-table>
      <div style="margin-top:14px;font-size:18px">合计净收 <b style="color:#0f766e">¥{{yuan(net)}}</b></div>
    </div>
  </div></div>`,
  setup(props) {
    const day = ref(today()), rows = ref([]), net = ref(0);
    const load = async () => { try { const r = await api.get('/api/pos/summary', { store_id: props.storeId, day: day.value }); rows.value = Object.values(r.methods); net.value = r.net; } catch (e) { err(e); } };
    onMounted(load);
    return { day, rows, net, load, yuan };
  },
};

// ---------------- 本店库存 ----------------
const Stock = {
  props: ['storeId', 'canEdit'],
  template: `
  <div class="ws-body"><div class="page-pad">
    <div class="panel">
      <div class="toolbar"><b>本店库存</b><el-input v-model="kw" placeholder="搜索" clearable style="width:160px" @keyup.enter="load" /><el-button @click="load">刷新</el-button>
        <span class="grow"></span><el-button v-if="canEdit" type="primary" @click="startAdjust">盘点</el-button></div>
      <el-table :data="rows" border>
        <el-table-column prop="name" label="库存品" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="qty" label="库存" width="100" />
        <el-table-column v-if="adjusting" label="实盘数" width="140"><template #default="{row}"><el-input v-model="row.real" size="small" /></template></el-table-column>
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
    return { kw, rows, adjusting, load, startAdjust, submit };
  },
};

// ---------------- 主框架 ----------------
const App = {
  components: { Pos, Orders, Shift, Stock },
  template: `
  <div v-if="!user" class="login-wrap">
    <div class="login-hero">
      <div class="logo"><span class="mark">收</span>收银系统 · 门店工作台</div>
      <div><h2>收银、接单、出票<br>一个页面全搞定</h2>
        <ul><li>扫码枪扫条码直接加入</li><li>小程序新订单响铃并自动打印</li><li>打折、抹零按权限开放</li><li>退货退款、补打小票</li></ul></div>
      <div class="foot">建议在收银电脑上设为浏览器首页</div>
    </div>
    <div class="login-side"><div class="login-card">
      <h1>门店登录</h1><p>使用后台分配的门店账号</p>
      <el-input v-model="lf.username" placeholder="账号" size="large" />
      <el-input v-model="lf.password" type="password" placeholder="密码" size="large" show-password @keyup.enter="login" />
      <el-button type="primary" size="large" style="width:100%;margin-top:6px" :loading="busy" @click="login">登录</el-button>
      <div class="switch">管理员请使用 <a href="/web/admin/">后台管理</a></div>
    </div></div>
  </div>
  <div v-else class="ws">
    <div class="ws-top">
      <div class="store"><span class="mark">收</span>
        <span v-if="stores.length <= 1">{{storeName}}</span>
        <el-select v-else v-model="storeId" @change="switchStore"><el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" /></el-select></div>
      <div class="tabs">
        <div v-if="can('pos')" class="tab" :class="{on: tab==='pos'}" @click="tab='pos'">收银</div>
        <div v-if="can('orders') || can('pos')" class="tab" :class="{on: tab==='orders'}" @click="tab='orders'">订单<span v-if="pending" class="badge">{{pending}}</span></div>
        <div v-if="can('pos')" class="tab" :class="{on: tab==='shift'}" @click="tab='shift'">交班</div>
        <div v-if="stockVisible" class="tab" :class="{on: tab==='stock'}" @click="tab='stock'">库存</div>
      </div>
      <span class="grow"></span>
      <span class="clock">{{clock}}</span>
      <el-popover placement="bottom" :width="280" trigger="click">
        <template #reference><el-button class="ghost">本机设置</el-button></template>
        <div><el-checkbox v-model="settings.sound">提示音和语音播报</el-checkbox></div>
        <div v-if="cur.print_mode === 'agent'" class="hint" style="margin:0 0 6px">本店小票由接小票机那台电脑上的“打印小助手”出票（后台设置），下面两项打印选项在本机不起作用。</div>
        <div><el-checkbox v-model="settings.autoPrintOnline">新订单自动打印小票</el-checkbox></div>
        <div><el-checkbox v-model="settings.autoPrintPos">收银后自动打印小票</el-checkbox></div>
        <div class="muted" style="font-size:12px;margin-top:6px">本设置只对这台电脑生效。想要不弹打印框直接出票：Chrome 快捷方式“目标”末尾加 --kiosk-printing，并把小票机设为默认打印机。</div>
      </el-popover>
      <a v-if="user.is_admin" href="/web/admin/" style="color:#9fc3be">后台 →</a>
      <div class="who"><span class="avatar">{{(user.display_name || user.username).slice(0,1)}}</span><span>{{user.display_name || user.username}}</span></div>
      <el-button link style="color:#9fc3be" @click="logout">退出</el-button>
    </div>
    <el-empty v-if="!storeId" description="账号还没有分配门店，请联系后台" />
    <template v-else>
      <pos v-if="tab==='pos'" :key="'p'+storeId" :user="user" :store-id="storeId" :settings="settings" :agent="cur.print_mode === 'agent'" />
      <orders v-if="tab==='orders'" :key="'o'+storeId" :user="user" :store-id="storeId" :settings="settings" :pending-count="pending" :tick="tick" :agent="cur.print_mode === 'agent'" />
      <shift v-if="tab==='shift'" :key="'s'+storeId" :store-id="storeId" />
      <stock v-if="tab==='stock'" :key="'k'+storeId" :store-id="storeId" :can-edit="stockEditable" />
    </template>
  </div>`,
  setup() {
    const user = ref(null), lf = reactive({ username: '', password: '' }), busy = ref(false), stores = ref([]), storeId = ref(null), tab = ref('pos');
    const pending = ref(0), tick = ref(0), clock = ref('');
    const tickClock = () => { const d = new Date(); clock.value = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    tickClock(); const clockTimer = setInterval(tickClock, 15000);
    const settings = reactive({ sound: pref('sound', true), autoPrintOnline: pref('autoPrintOnline', true), autoPrintPos: pref('autoPrintPos', true) });
    watch(settings, () => Object.entries(settings).forEach(([k, v]) => setPref(k, v)), { deep: true });
    const can = (p) => user.value && user.value.permissions.includes(p);
    const cur = computed(() => stores.value.find(s => s.id === storeId.value) || {});
    const storeName = computed(() => cur.value.name || '门店工作台');
    const stockVisible = computed(() => can('inventory') || (can('stock_view') && cur.value.staff_can_view_stock));
    const stockEditable = computed(() => can('inventory') || (can('stock_edit') && cur.value.staff_can_edit_stock));
    let lastId = 0, timer = null, printing = Promise.resolve();

    const poll = async () => {
      if (!storeId.value || !can('orders')) return;
      try {
        const r = await api.get('/api/orders/new', { store_id: storeId.value, after_id: lastId });
        pending.value = r.pending_count;
        const fresh = lastId ? r.orders.filter(o => o.status !== 'cancelled') : [];
        lastId = r.last_id;
        if (fresh.length) {
          tick.value++;
          if (settings.sound) { beep(3); speak('您有' + fresh.length + '个新订单'); }
          ElementPlus.ElNotification({ title: '新订单', message: fresh.map(o => (o.area_name + ' ' + o.location_note).trim() + ' ¥' + yuan(o.payable_amount)).join('\n'), type: 'warning', duration: 8000 });
          if (settings.autoPrintOnline && cur.value.print_mode !== 'agent') {
            for (const o of fresh) printing = printing.then(async () => { try { await printReceipt(await api.post('/api/orders/' + o.id + '/print', {})); } catch (e) { err(e); } });
          }
        }
      } catch (e) {}
    };
    const startPoll = () => { clearInterval(timer); lastId = 0; poll(); timer = setInterval(poll, 5000); };
    const afterLogin = async () => {
      stores.value = await api.get('/api/stores');
      const saved = pref('store', null);
      storeId.value = stores.value.find(s => s.id === saved) ? saved : (stores.value[0] || {}).id || null;
      tab.value = can('pos') ? 'pos' : 'orders';
      startPoll();
    };
    const switchStore = () => { setPref('store', storeId.value); startPoll(); };
    const login = async () => {
      busy.value = true;
      try { const r = await api.post('/api/auth/login', lf); api.setToken(r.token); user.value = r.user; await afterLogin(); } catch (e) { err(e); } finally { busy.value = false; }
    };
    const logout = () => { api.setToken(''); user.value = null; clearInterval(timer); };
    window.onUnauthorized = () => { user.value = null; clearInterval(timer); };
    onMounted(async () => { if (api.token()) { try { user.value = await api.get('/api/auth/me'); await afterLogin(); } catch (e) {} } });
    onUnmounted(() => { clearInterval(timer); clearInterval(clockTimer); });
    return { user, lf, busy, stores, storeId, storeName, cur, tab, pending, tick, clock, settings, can, stockVisible, stockEditable, login, logout, switchStore };
  },
};

createApp(App).use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount('#app');
