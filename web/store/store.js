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
      <div class="change"><span>找零</span><b class="money">¥{{change}}</b></div>
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
        let payable = null;
        if (String(payableInput.value == null ? '' : payableInput.value).trim() !== '') {
          payable = Shouyin.parseMoney(payableInput.value);
          if (payable === null) throw new Error('本次应收请填数字，例如 95 或 95.5');
        }
        if (rate.value !== null && !isFinite(rate.value)) throw new Error('折扣请填数字，例如 8.5');
        const r = await api.post('/api/pos/quote', { lines: props.lines, discount_rate: rate.value, payable });
        Object.assign(q, r); qErr.value = '';
      } catch (e) { qErr.value = e.message; err(e); }
    };
    watch(rate, () => { rateInput.value = rate.value && ![95, 90, 88, 85, 80].includes(rate.value) ? rate.value / 10 : ''; payableInput.value = ''; quote(); });
    const reset = () => { rate.value = null; rateInput.value = ''; payableInput.value = ''; method.value = 'cash'; received.value = ''; quote(); };
    const roundDown = async (unit) => { payableInput.value = yuan(Math.floor(q.payable_amount / unit) * unit + (payableInput.value === '' ? 0 : 0)); await quote(); };
    const change = computed(() => { const r = Shouyin.parseMoney(received.value); return r !== null && r >= q.payable_amount ? yuan(r - q.payable_amount) : '0.00'; });
    const quick = computed(() => { const p = q.payable_amount / 100; return [...new Set([p, Math.ceil(p / 10) * 10, Math.ceil(p / 50) * 50, Math.ceil(p / 100) * 100])].map(v => v.toFixed(2)).slice(0, 4); });
    const submit = async () => {
      if (qErr.value) return;
      const pay = { method: method.value, amount: q.payable_amount };
      if (method.value === 'cash') {
        const blank = String(received.value == null ? '' : received.value).trim() === '';
        const r = blank ? q.payable_amount : Shouyin.parseMoney(received.value);
        if (r === null) return ElMessage.warning('实收现金请填数字，例如 50 或 50.5');
        if (r < q.payable_amount) return ElMessage.warning('实收不足');
        pay.received = r;
      }
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
      <div class="scan"><el-input ref="scan" v-model="scanText" size="large" placeholder="扫条码，或输入名称 / 拼音首字母（如 zb 找纸杯）" clearable @keyup.enter="onScan" @keyup.esc="scanText=''" /></div>
      <div class="cats"><div class="cat" :class="{on: !cat}" @click="cat=null">全部</div>
        <div v-for="c in topCats" :key="c.id" class="cat" :class="{on: cat===c.id}" @click="cat=c.id">{{c.name}}</div></div>
      <div class="grid">
        <el-empty v-if="scanText.trim() && !shown.length" :image-size="70" :description="'没有找到“' + scanText.trim() + '”'" style="grid-column:1/-1" />
        <div v-for="p in shown" :key="p.id" class="card" :class="{in: inCart(p)}" @click="tap(p)">
          <span v-if="inCart(p)" class="cnt">{{inCart(p)}}</span>
          <div class="img" :style="p.image ? {backgroundImage: 'url(' + JSON.stringify(p.image) + ')'} : {}">{{p.image ? '' : p.name.slice(0,1)}}</div>
          <div class="n">{{p.name}}</div>
          <div class="sub">{{p.skus.length > 1 ? p.skus.length + ' 个规格' : (p.skus[0].name !== '默认' ? p.skus[0].name : p.unit)}}</div>
          <div class="p">¥{{priceText(p)}}</div>
        </div>
      </div>
    </div>
    <div class="pos-right">
      <div class="cart-head"><b>当前订单</b><span>
        <el-button v-if="cart.length" link @click="hold">挂单</el-button>
        <el-button v-if="held.length" link type="primary" @click="heldDlg=true">取单（{{held.length}}）</el-button>
        <el-button v-if="cart.length" link type="danger" @click="clear">清空</el-button></span></div>
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
    <el-dialog v-model="scanDlg" title="这个条码对应多个规格，请选择" width="480px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <el-button v-for="m in scanMatches" :key="m.sku.id" size="large" style="margin:0;justify-content:space-between;height:52px"
          @click="add(m.product, m.sku); scanDlg = false"><span>{{m.product.name}}<span v-if="m.sku.name !== '默认'" class="muted">　{{m.sku.name}}</span></span><b>¥{{yuan(m.sku.price)}}</b></el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="heldDlg" title="已挂起的单" width="520px">
      <div class="muted" style="margin-bottom:8px">挂单只存在这台电脑上，没有收款、不扣库存。取回后价格按现在的售价。</div>
      <div v-for="(h, i) in held" :key="h.at" class="held">
        <div style="flex:1;min-width:0"><b>{{h.time}}</b><span class="muted">　{{h.cart.reduce((a, l) => a + l.qty, 0)}} 件 · ¥{{yuan(h.cart.reduce((a, l) => a + l.qty * l.price, 0))}}</span>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{h.cart.map(l => l.name + (l.sku !== '默认' ? '（' + l.sku + '）' : '') + '×' + l.qty).join('、')}}<span v-if="h.remark">　备注：{{h.remark}}</span></div></div>
        <el-button type="primary" @click="takeHeld(i)">取回</el-button><el-button link type="danger" @click="dropHeld(i)">删除</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="skuDlg" :title="skuProduct && skuProduct.name" width="460px">
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <el-button v-for="s in (skuProduct ? skuProduct.skus : [])" :key="s.id" size="large" style="min-width:120px;height:64px" @click="add(skuProduct, s); skuDlg=false">
          {{s.name}}<br>¥{{yuan(s.price)}}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="doneDlg" title="收款成功" width="380px">
      <div style="text-align:center;font-size:18px">应收 ¥{{yuan(last.payable_amount)}}<div v-if="lastChange" style="margin-top:6px;font-weight:650;font-size:24px">找零 ¥{{yuan(lastChange)}}</div></div>
      <template #footer><el-button @click="reprint">补打小票</el-button><el-button type="primary" @click="doneDlg=false">继续收银</el-button></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const products = ref([]), cats = ref([]), cat = ref(null), scanText = ref(''), cart = ref([]), remark = ref('');
    const scanDlg = ref(false), scanMatches = ref([]);
    const payDlg = ref(false), skuDlg = ref(false), skuProduct = ref(null), doneDlg = ref(false), last = ref({}), lastChange = ref(0), scan = ref(null);
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
    const add = (p, s) => { const l = cart.value.find(x => x.sku_id === s.id); if (l) l.qty++; else cart.value.push({ sku_id: s.id, name: p.name, sku: s.name, price: s.price, qty: 1 }); };
    const tap = (p) => { pick(p); if (scanText.value) { scanText.value = ''; scan.value && scan.value.focus(); } };
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
        if (m.length === 1) { pick(m[0]); scanText.value = ''; } else if (!m.length) err(e);
      }
    };
    const inCart = (p) => cart.value.filter(l => p.skus.some(s => s.id === l.sku_id)).reduce((a, l) => a + l.qty, 0);
    const dec = (i) => { if (cart.value[i].qty > 1) cart.value[i].qty--; else cart.value.splice(i, 1); };
    const fix = (i) => { const l = cart.value[i]; l.qty = Math.max(1, parseInt(l.qty) || 1); };
    const clear = () => { cart.value = []; remark.value = ''; };
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
    const pay = async (p) => {
      let o;
      try {
        o = await api.post('/api/pos/checkout', { store_id: props.storeId, lines: lines.value, payments: p.payments, discount_rate: p.discount_rate,
          payable: p.payable, remark: remark.value, request_id: reqId });
      } catch (e) { return err(e); }
      // 到这里收款已经成功。后面的提示音、打印出错都不能让店员误以为没收到钱
      reqId = rid(); last.value = o; lastChange.value = p.change; payDlg.value = false; doneDlg.value = true; clear();
      if (props.settings.sound) { beep(1); speak('收款成功，' + yuan(o.payable_amount) + '元' + (p.change ? '，找零' + yuan(p.change) + '元' : '')); }
      if (props.settings.autoPrintPos && !props.agent) {
        try { printReceipt(await api.post('/api/orders/' + o.id + '/print', {})); }
        catch (e) { ElMessage.warning({ message: '收款已成功，但小票没打出来：' + (e.message || e) + '。可以点“补打小票”，不要重新收款。', duration: 8000 }); }
      }
    };
    const reprint = async () => { try { outPrint(await api.post('/api/orders/' + last.value.id + '/print', { reprint: true })); } catch (e) { err(e); } };
    onMounted(() => { load(); setTimeout(() => scan.value && scan.value.focus(), 300); });
    return { products, cats, cat, topCats, shown, scanText, cart, remark, payDlg, skuDlg, skuProduct, doneDlg, last, lastChange, scan,
      scanDlg, scanMatches, priceText, add, pick, tap, onScan, held, heldDlg, hold, takeHeld, dropHeld, inCart, dec, fix, clear, count, total, lines, pay, reprint, yuan };
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
    const collect = async (p) => {
      try { await api.post('/api/orders/' + cur.value.id + '/collect', { payments: p.payments, discount_rate: p.discount_rate, payable: p.payable }); payDlg.value = false; await refresh(); ElMessage.success('已收款'); }
      catch (e) { err(e); }
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
    const doRefund = async () => {
      const lines = rLines.value.filter(l => l.qty > 0).map(l => ({ order_item_id: l.id, qty: l.qty }));
      if (!lines.length) return ElMessage.warning('请填写退货数量');
      if (rBusy.value) return;
      rBusy.value = true;
      try { const r = await api.post('/api/orders/' + cur.value.id + '/refund', { lines, method: rf.method, restock: rf.restock, reason: rf.reason, request_id: rf.rid });
        rDlg.value = false; await refresh(); ElMessage.success('已退款 ¥' + yuan(r.refund.amount)); } catch (e) { err(e); } finally { rBusy.value = false; }
    };
    const refundAll = () => rLines.value.forEach(l => { l.qty = l.max; });
    const print = async () => { try { outPrint(await api.post('/api/orders/' + cur.value.id + '/print', { reprint: cur.value.print_count > 0 })); await refresh(); } catch (e) { err(e); } };
    onMounted(load);
    return { status, source, day, kw, rows, drawer, cur, payDlg, rDlg, rLines, rf, can, tagType, load, open, act, curLines, collect, cancel, openRefund, doRefund, refundAll, rBusy, print, yuan, methods: METHODS };
  },
};

// ---------------- 交班汇总 ----------------
const Shift = {
  props: ['storeId', 'user'],
  template: `
  <div class="ws-body"><div class="page-pad" style="display:flex;flex-direction:column;gap:16px;max-width:820px">
    <div v-if="loaded && !cur" class="panel">
      <div class="toolbar"><b>开班</b><span class="muted">点清钱箱里的备用金（找零用的钱）后开班，交班时按这一班的收款核对现金。</span></div>
      <el-form inline @submit.prevent><el-form-item label="备用金"><el-input v-model="opening" style="width:160px"><template #append>元</template></el-input></el-form-item>
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
        <el-form-item label="实点现金"><el-input v-model="counted" style="width:150px"><template #append>元</template></el-input></el-form-item>
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
    return { cur, loaded, opening, counted, remark, busy, last, history, diff, loadCur, openShift, closeShift, yuan };
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
        <el-table-column label="库存品"><template #default="{row}">{{row.name}}<el-tag v-if="row.low" type="danger" size="small" style="margin-left:6px">该补货了</el-tag><span v-if="row.earliest_expiry" class="muted" style="margin-left:8px">最早到期 {{row.earliest_expiry}}</span></template></el-table-column>
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

// ---------------- 要货申请 ----------------
const Requisitions = {
  props: ['storeId', 'stockVisible'],
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
        <el-table-column label="要几个" width="120"><template #default="{row}"><el-input v-model="row.qty" size="small" /></template></el-table-column>
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
        <div v-if="can('pos')" class="tab" :class="{on: tab==='pos'}" @click="tab='pos'"><span class="ico" v-html="icon('cart')"></span>收银</div>
        <div v-if="can('orders') || can('pos')" class="tab" :class="{on: tab==='orders'}" @click="tab='orders'"><span class="ico" v-html="icon('list')"></span>订单<span v-if="pending" class="badge">{{pending}}</span></div>
        <div v-if="can('pos')" class="tab" :class="{on: tab==='shift'}" @click="tab='shift'"><span class="ico" v-html="icon('clock')"></span>交班</div>
        <div v-if="stockVisible" class="tab" :class="{on: tab==='stock'}" @click="tab='stock'"><span class="ico" v-html="icon('box')"></span>库存</div>
        <div v-if="can('requisition')" class="tab" :class="{on: tab==='req'}" @click="tab='req'"><span class="ico" v-html="icon('truck')"></span>要货</div>
      </div>
      <span class="grow"></span>
      <span class="clock"><span class="ico" v-html="icon('clock')"></span>{{clock}}</span>
      <el-popover placement="bottom" :width="280" trigger="click">
        <template #reference><el-button class="ghost">本机设置</el-button></template>
        <div><el-checkbox v-model="settings.sound">提示音和语音播报</el-checkbox></div>
        <div v-if="cur.print_mode === 'agent'" class="hint" style="margin:0 0 6px">本店小票由接小票机那台电脑上的“打印小助手”出票（后台设置），下面两项打印选项在本机不起作用。</div>
        <div><el-checkbox v-model="settings.autoPrintOnline">新订单自动打印小票</el-checkbox></div>
        <div><el-checkbox v-model="settings.autoPrintPos">收银后自动打印小票</el-checkbox></div>
        <div class="muted" style="font-size:12px;margin-top:6px">本设置只对这台电脑生效。想要不弹打印框直接出票：Chrome 快捷方式“目标”末尾加 --kiosk-printing，并把小票机设为默认打印机。</div>
      </el-popover>
      <a v-if="user.is_admin" class="link" href="/web/admin/">后台管理</a>
      <div class="who"><span class="avatar">{{(user.display_name || user.username).slice(0,1)}}</span><span>{{user.display_name || user.username}}</span></div>
      <el-button link @click="logout">退出</el-button>
    </div>
    <el-empty v-if="!storeId" description="账号还没有分配门店，请联系后台" />
    <template v-else>
      <pos v-if="tab==='pos'" :key="'p'+storeId" :user="user" :store-id="storeId" :settings="settings" :agent="cur.print_mode === 'agent'" />
      <orders v-if="tab==='orders'" :key="'o'+storeId" :user="user" :store-id="storeId" :settings="settings" :pending-count="pending" :tick="tick" :agent="cur.print_mode === 'agent'" />
      <shift v-if="tab==='shift'" :key="'s'+storeId" :store-id="storeId" :user="user" />
      <stock v-if="tab==='stock'" :key="'k'+storeId" :store-id="storeId" :can-edit="stockEditable" />
      <requisitions v-if="tab==='req'" :key="'r'+storeId" :store-id="storeId" :stock-visible="stockVisible" />
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
          if (settings.autoPrintOnline && cur.value.print_mode !== 'agent') {
            for (const o of fresh) printing = printing.then(async () => { try { await printReceipt(await api.post('/api/orders/' + o.id + '/print', {})); } catch (e) { err(e); } });
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
    const login = async () => {
      busy.value = true;
      try { const r = await api.post('/api/auth/login', lf); api.setToken(r.token); user.value = r.user; await afterLogin(); } catch (e) { err(e); } finally { busy.value = false; }
    };
    const logout = () => { api.setToken(''); user.value = null; clearInterval(timer); };
    window.onUnauthorized = () => { user.value = null; clearInterval(timer); };
    onMounted(async () => { if (api.token()) { try { user.value = await api.get('/api/auth/me'); await afterLogin(); } catch (e) {} } });
    onUnmounted(() => { clearInterval(timer); clearInterval(clockTimer); });
    return { icon: Shouyin.icon, user, lf, busy, stores, storeId, storeName, cur, tab, pending, tick, clock, settings, can, stockVisible, stockEditable, login, logout, switchStore };
  },
};

createApp(App).use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount('#app');
