// 后台管理
const { createApp, ref, reactive, computed, onMounted, watch } = Vue;
const { api, yuan, toFen, rid, today, receiptHtml } = Shouyin;
const { ElMessage, ElMessageBox } = ElementPlus;

const money = Shouyin.parseMoney;  // 手填金额 → 分；不是合法数字返回 null
const blank = (v) => String(v == null ? '' : v).trim() === '';
const err = (e) => ElMessage.error(e.message || String(e));
const daysAgo = (n) => { const d = new Date(Date.now() - n * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const ok = (m) => ElMessage.success(m || '已保存');

// ---------------- 商品 ----------------
const Products = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-input v-model="kw" placeholder="名称 / 助记码 / 货号 / 条码" clearable style="width:220px" @keyup.enter="load" />
      <el-select v-model="cat" placeholder="全部分类" clearable style="width:160px" @change="load">
        <el-option v-for="c in meta.categories" :key="c.id" :label="catLabel(c)" :value="c.id" />
      </el-select>
      <el-checkbox v-model="showOff" @change="load">显示已下架</el-checkbox>
      <el-button @click="load">查询</el-button>
      <el-button @click="exp">导出</el-button>
      <span class="grow"></span>
      <el-button type="primary" @click="edit()">新增商品</el-button>
    </div>
    <div class="muted" style="margin:-4px 0 12px">共 {{rows.length}} 个商品 · 在售 {{rows.filter(r => r.active).length}} · 仅门店 {{rows.filter(r => r.active && !r.online_visible).length}}</div>
    <el-table :data="rows" @row-click="edit" row-class-name="clickable">
      <el-table-column label="商品" min-width="220"><template #default="{row}">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="thumb"><img v-if="row.image" :src="row.image"><span v-else>{{row.name.slice(0,1)}}</span></div>
          <div style="min-width:0"><div class="c-main">{{row.name}}</div>
            <div class="c-sub">{{[row.code && '货号 ' + row.code, row.mnemonic && '助记码 ' + row.mnemonic, row.supplier_name].filter(Boolean).join(' · ') || '—'}}</div></div>
        </div></template></el-table-column>
      <el-table-column label="分类" min-width="150"><template #default="{row}">
        <span v-for="n in (row.category_name || '').split('、').filter(Boolean)" :key="n" class="chip">{{n}}</span>
        <span v-if="!row.category_name" class="muted">未分类</span></template></el-table-column>
      <el-table-column label="规格与售价" min-width="230"><template #default="{row}">
        <div class="skus"><span v-for="s in row.skus.filter(x => x.active)" :key="s.id" class="sku-chip">{{s.name === '默认' ? '' : s.name + ' '}}<b>¥{{yuan(s.price)}}</b></span></div></template></el-table-column>
      <el-table-column label="扣库存" min-width="190"><template #default="{row}">
        <div v-for="s in row.skus.filter(x => x.active)" :key="s.id" class="c-sub" style="margin:0">
          <template v-if="s.stock_item_name">{{s.stock_item_name}} <span style="color:var(--text)">−{{s.deduct_qty}}</span><span v-if="row.skus.filter(x => x.active).length > 1"> /{{s.name}}</span></template>
          <template v-else>不扣库存</template></div></template></el-table-column>
      <el-table-column label="扫码点单" min-width="130"><template #default="{row}">
        <span v-if="!row.online_visible" class="muted">不显示</span>
        <template v-else>
          <div class="c-sub" style="margin:0;color:var(--text-2)">{{qtyText(row)}}</div>
          <div class="c-sub" style="margin:0" v-if="row.area_limited">仅 {{row.area_ids.length}} 个区域</div></template></template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{row}">
        <el-tag v-if="!row.active" type="info" size="small">已下架</el-tag>
        <el-tag v-else-if="!row.online_visible" type="warning" size="small">仅门店</el-tag>
        <el-tag v-else type="success" size="small">在售</el-tag></template></el-table-column>
      <el-table-column width="80" align="right"><template #default><span class="muted" style="white-space:nowrap">编辑 ›</span></template></el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="form.id ? '编辑商品' : '新增商品'" width="900px" top="4vh">
      <el-form :model="form" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="商品名称" required><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="货号"><el-input v-model="form.code" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="助记码" label-width="70px"><el-input v-model="form.mnemonic" placeholder="留空自动生成" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="分类">
            <el-select v-model="form.category_ids" multiple clearable filterable placeholder="可选多个分类" style="width:100%">
              <el-option v-for="c in meta.categories" :key="c.id" :label="catLabel(c)" :value="c.id" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="单位"><el-input v-model="form.unit" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="小程序可见"><el-switch v-model="form.online_visible" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="上架"><el-switch v-model="form.active" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="图片">
          <el-image v-if="form.image" :src="form.image" style="width:80px;height:80px;margin-right:12px" fit="cover" />
          <input type="file" accept="image/*" @change="upload" />
          <el-button v-if="form.image" link @click="form.image=''">移除</el-button>
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>

        <div class="form-section">规格（每个规格可以绑定库存品和扣减量，不同商品可以绑定同一个库存品）</div>
        <el-table :data="form.skus" border size="small">
          <el-table-column label="规格名称" min-width="110"><template #default="{row}"><el-input v-model="row.name" size="small" /></template></el-table-column>
          <el-table-column label="条码" min-width="120"><template #default="{row}"><el-input v-model="row.barcode" size="small" /></template></el-table-column>
          <el-table-column label="售价（元）" width="110"><template #default="{row}"><el-input v-model="row.price_y" size="small" /></template></el-table-column>
          <el-table-column label="成本（元）" width="110"><template #default="{row}"><el-input v-model="row.cost_y" size="small" placeholder="按库存品" /></template></el-table-column>
          <el-table-column label="库存品" min-width="150"><template #default="{row}">
            <el-select v-model="row.stock_item_id" size="small" clearable filterable placeholder="不扣库存">
              <el-option v-for="i in meta.stockItems" :key="i.id" :label="i.name + '（' + i.unit + '）'" :value="i.id" /></el-select></template></el-table-column>
          <el-table-column label="扣减量" width="90"><template #default="{row}"><el-input v-model="row.deduct_qty" size="small" /></template></el-table-column>
          <el-table-column label="启用" width="60"><template #default="{row}"><el-checkbox v-model="row.active" /></template></el-table-column>
          <el-table-column width="60"><template #default="{$index}"><el-button link type="danger" @click="form.skus.splice($index,1)">删除</el-button></template></el-table-column>
        </el-table>
        <el-button style="margin-top:8px" @click="addSku">添加规格</el-button>

        <div class="form-section">医疗器械等详细资料（可选择打印在小票上）</div>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="注册证号"><el-input v-model="form.reg_cert_no" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生产许可证号"><el-input v-model="form.production_license_no" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="注册人"><el-input v-model="form.registrant" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生产地址"><el-input v-model="form.production_address" /></el-form-item></el-col>
        </el-row>

        <div class="form-section">扫码点单<small>只限制顾客扫码点单，门店收银不受限；每个区域还可以在“门店与区域 → 点单规则”里单独设置</small></div>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="每单起订量"><el-input v-model="form.min_qty" placeholder="不限" style="width:140px"><template #append>件</template></el-input></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="每单限购量"><el-input v-model="form.max_qty" placeholder="不限" style="width:140px"><template #append>件</template></el-input></el-form-item></el-col>
        </el-row>
        <el-form-item label="可点区域">
          <el-radio-group v-model="form.area_limited"><el-radio :value="false">所有区域</el-radio><el-radio :value="true">只在指定区域</el-radio></el-radio-group>
          <el-select v-if="form.area_limited" v-model="form.area_ids" multiple filterable placeholder="选择区域" style="width:100%;margin-top:6px">
            <el-option v-for="a in meta.areas" :key="a.id" :label="a.store_name + ' · ' + a.name" :value="a.id" /></el-select>
        </el-form-item>

        <div class="form-section">供应商</div>
        <el-form-item label="供应商">
          <el-select v-model="form.supplier_id" clearable filterable style="width:300px">
            <el-option v-for="s in meta.suppliers" :key="s.id" :label="s.name" :value="s.id" /></el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>`,
  setup(props) {
    const rows = ref([]), kw = ref(''), cat = ref(null), showOff = ref(false), dlg = ref(false), saving = ref(false);
    const form = reactive({});
    const catLabel = (c) => { const p = props.meta.categories.find(x => x.id === c.parent_id); return p ? p.name + ' / ' + c.name : c.name; };
    const load = async () => { try { rows.value = await api.get('/api/products', { keyword: kw.value, category_id: cat.value, include_inactive: showOff.value }); } catch (e) { err(e); } };
    const blankSku = () => ({ name: '默认', barcode: '', price_y: '', cost_y: '', stock_item_id: null, deduct_qty: 1, active: true });
    const edit = (row) => {
      Object.keys(form).forEach(k => delete form[k]);
      Object.assign(form, row ? JSON.parse(JSON.stringify(row)) : {
        name: '', code: '', mnemonic: '', category_ids: [], min_qty: '', max_qty: '', area_limited: false, area_ids: [], unit: '件', image: '', description: '', online_visible: true, active: true,
        reg_cert_no: '', production_license_no: '', registrant: '', production_address: '', supplier_id: null, skus: [] });
      form.skus = row ? form.skus.map(s => ({ ...s, price_y: yuan(s.price), cost_y: s.cost == null ? '' : yuan(s.cost) })) : [blankSku()];
      form._name0 = row ? row.name : ''; form._mn0 = row ? row.mnemonic : '';
      if (row) { form.min_qty = row.min_qty || ''; form.max_qty = row.max_qty || ''; form.area_ids = row.area_ids || []; form.category_ids = row.category_ids || []; }
      dlg.value = true;
    };
    const addSku = () => form.skus.push({ ...blankSku(), name: '' });
    const upload = async (ev) => { const f = ev.target.files[0]; if (!f) return; try { form.image = (await api.upload(f)).url; } catch (e) { err(e); } ev.target.value = ''; };
    const save = async () => {
      if (!String(form.name || '').trim()) return ElMessage.warning('请填写商品名称');
      if (!form.skus.length) return ElMessage.warning('至少一个规格');
      // 价格、成本、扣减量必须是明确的数字：空着或填错不能悄悄当成 0
      let zero = false;
      for (const s of form.skus) {
        const label = '规格“' + (s.name || '未命名') + '”';
        const p = money(s.price_y);
        if (p === null) return ElMessage.warning(label + '的售价请填数字，例如 12 或 12.5');
        if (p === 0 && s.active) zero = true;
        if (!blank(s.cost_y) && money(s.cost_y) === null) return ElMessage.warning(label + '的成本请填数字，或留空按库存品成本算');
        const d = parseFloat(s.deduct_qty);
        if (!isFinite(d) || d <= 0) return ElMessage.warning(label + '的扣减量必须大于 0');
      }
      const qtyOf = (v) => blank(v) ? null : (/^\d+$/.test(String(v).trim()) && +v >= 1 ? +v : NaN);
      const minQ = qtyOf(form.min_qty), maxQ = qtyOf(form.max_qty);
      if (Number.isNaN(minQ) || Number.isNaN(maxQ)) return ElMessage.warning('起订量、限购量请填正整数，或留空表示不限');
      if (minQ && maxQ && minQ > maxQ) return ElMessage.warning('起订量不能大于限购量');
      if (form.area_limited && !form.area_ids.length) return ElMessage.warning('选了“只在指定区域”，请至少选一个区域');
      if (zero) { try { await ElMessageBox.confirm('有规格的售价是 0 元，确定要保存吗？', '售价为 0', { type: 'warning' }); } catch (e) { return; } }
      const body = { ...form, min_qty: minQ, max_qty: maxQ, category_id: (form.category_ids || [])[0] || null, skus: form.skus.map((s, i) => ({ id: s.id, name: s.name, barcode: s.barcode || '', price: money(s.price_y),
        cost: blank(s.cost_y) ? null : money(s.cost_y), stock_item_id: s.stock_item_id || null,
        deduct_qty: parseFloat(s.deduct_qty), active: s.active, sort: i })) };
      // 改了名称但没动助记码：按新名称重新生成
      if (form.id && form.name !== form._name0 && form.mnemonic === form._mn0) body.mnemonic = '';
      delete body._name0; delete body._mn0;
      saving.value = true;
      try { form.id ? await api.put('/api/products/' + form.id, body) : await api.post('/api/products', body); ok(); dlg.value = false; load(); }
      catch (e) { err(e); } finally { saving.value = false; }
    };
    onMounted(load);
    const qtyText = (r) => [r.min_qty > 1 ? r.min_qty + ' 件起' : '', r.max_qty ? '限 ' + r.max_qty + ' 件' : ''].filter(Boolean).join('，') || '不限数量';
    const exp = async () => { try { await api.download('/api/products', { keyword: kw.value, category_id: cat.value, include_inactive: showOff.value }); } catch (e) { err(e); } };
    return { exp, rows, kw, cat, showOff, dlg, form, saving, load, edit, addSku, upload, save, catLabel, qtyText, yuan };
  },
};

// ---------------- 通用简单资料表（分类、供应商、库存品） ----------------
function simpleCrud({ title, desc, url, fields, columns, after, order }) {
  return {
    props: ['meta'],
    template: `
    <div class="panel">
      <div class="toolbar">
        <el-input v-model="kw" placeholder="搜索名称" clearable style="width:220px" />
        <span class="muted">共 {{rows.length}} 个<span v-if="rows.some(r => r.active === false)"> · 停用 {{rows.filter(r => r.active === false).length}}</span></span>
        <span class="grow"></span><el-button type="primary" @click="edit()">新增${title}</el-button></div>
      ${desc ? `<div class="hint" style="margin:-6px 0 12px">${desc}</div>` : ''}
      <el-table :data="shown" @row-click="edit" row-class-name="clickable">
        <el-table-column v-for="(c, i) in columns" :key="c.prop" :label="c.label" :min-width="c.width || 120" :align="c.align">
          <template #default="{row}">
            <template v-if="i === 0"><div class="c-main" :style="c.indent && c.indent(row) ? 'padding-left:18px' : ''"><span v-if="c.indent && c.indent(row)" class="muted">└ </span>{{ c.fmt ? c.fmt(row, meta) : row[c.prop] }}</div>
              <div v-if="c.sub && c.sub(row, meta)" class="c-sub" :style="c.indent && c.indent(row) ? 'padding-left:18px' : ''">{{ c.sub(row, meta) }}</div></template>
            <el-tag v-else-if="c.prop === 'active'" :type="row.active ? 'success' : 'info'" size="small">{{row.active ? '启用' : '停用'}}</el-tag>
            <span v-else :class="{muted: !(c.fmt ? c.fmt(row, meta) : row[c.prop])}">{{ (c.fmt ? c.fmt(row, meta) : row[c.prop]) || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column width="80" align="right"><template #default><span class="muted" style="white-space:nowrap">编辑 ›</span></template></el-table-column>
      </el-table>
      <el-dialog v-model="dlg" :title="(form.id ? '编辑' : '新增') + '${title}'" width="480px">
        <el-form :model="form" label-width="90px">
          <el-form-item v-for="f in fields" :key="f.prop" :label="f.label">
            <el-switch v-if="f.type==='bool'" v-model="form[f.prop]" />
            <el-select v-else-if="f.type==='select'" v-model="form[f.prop]" clearable filterable style="width:100%">
              <el-option v-for="o in f.options(meta, form)" :key="o.id" :label="o.name" :value="o.id" /></el-select>
            <el-input v-else-if="f.type==='money'" v-model="form[f.prop]"><template #append>元</template></el-input>
            <el-input-number v-else-if="f.type==='int'" v-model="form[f.prop]" />
            <el-input v-else-if="f.type==='qty'" v-model="form[f.prop]" :placeholder="f.placeholder || ''"><template v-if="f.suffix" #append>{{f.suffix}}</template></el-input>
            <el-input v-else v-model="form[f.prop]" />
          </el-form-item>
        </el-form>
        <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
      </el-dialog>
    </div>`,
    setup(props) {
      const rows = ref([]), dlg = ref(false), form = reactive({}), saving = ref(false), kw = ref('');
      const shown = computed(() => {
        const list = kw.value ? rows.value.filter(r => String(r.name || '').includes(kw.value)) : rows.value;
        return order ? order(list) : list;
      });
      const load = async () => { try { rows.value = await api.get(url); if (after) after(props.meta, rows.value); } catch (e) { err(e); } };
      const edit = (row) => {
        Object.keys(form).forEach(k => delete form[k]);
        fields.forEach(f => { form[f.prop] = row ? row[f.prop] : (f.default !== undefined ? f.default : (f.type === 'bool' ? true : '')); if (f.type === 'money' && row) form[f.prop] = yuan(row[f.prop]); if (f.type === 'qty' && form[f.prop] == null) form[f.prop] = ''; });
        if (row) form.id = row.id;
        dlg.value = true;
      };
      const save = async () => {
        const body = {};
        for (const f of fields) {
          let v = form[f.prop];
          if (f.prop === 'name' && !String(v || '').trim()) return ElMessage.warning('请填写名称');
          if (f.type === 'money') { v = money(v); if (v === null) return ElMessage.warning(f.label + '请填数字，例如 0 或 1.5'); }
          if (f.type === 'select' && v === '') v = null;
          if (f.type === 'qty') { if (blank(v)) v = null; else if (!/^\d+(\.\d{1,3})?$/.test(String(v).trim())) return ElMessage.warning(f.label + '请填数字，不需要就留空'); else v = parseFloat(v); }
          body[f.prop] = v;
        }
        if (saving.value) return;
        saving.value = true;
        try { form.id ? await api.put(url + '/' + form.id, body) : await api.post(url, body); ok(); dlg.value = false; load(); } catch (e) { err(e); } finally { saving.value = false; }
      };
      onMounted(load);
      return { rows, shown, kw, dlg, form, edit, save, fields, columns };
    },
  };
}

const Categories = simpleCrud({
  title: '分类', desc: '先建大类，再在大类下建小类；一个商品可以同时放进多个分类。', url: '/api/categories',
  fields: [{ prop: 'name', label: '名称' }, { prop: 'parent_id', label: '上级大类', type: 'select', default: null,
    options: (m, f) => m.categories.filter(c => !c.parent_id && c.id !== f.id) }, { prop: 'sort', label: '排序', type: 'int', default: 0 }, { prop: 'active', label: '启用', type: 'bool' }],
  columns: [{ prop: 'name', label: '分类', width: 260, indent: r => !!r.parent_id, sub: (r, m) => r.parent_id ? '' : (m.categories.filter(c => c.parent_id === r.id).length ? m.categories.filter(c => c.parent_id === r.id).length + ' 个小类' : '') },
    { prop: 'sort', label: '排序', width: 80, fmt: r => String(r.sort) }, { prop: 'active', label: '状态', width: 80 }],
  // 大类后面紧跟它的小类，看起来像目录
  order: (list) => { const out = []; list.filter(c => !c.parent_id).forEach(p => { out.push(p); list.filter(c => c.parent_id === p.id).forEach(c => out.push(c)); });
    list.forEach(c => { if (!out.includes(c)) out.push(c); }); return out; },
  after: (m, rows) => { m.categories = rows; },
});
const Suppliers = simpleCrud({
  title: '供应商', url: '/api/suppliers',
  fields: [{ prop: 'name', label: '名称' }, { prop: 'contact', label: '联系人' }, { prop: 'phone', label: '电话' }, { prop: 'remark', label: '备注' }, { prop: 'active', label: '启用', type: 'bool' }],
  columns: [{ prop: 'name', label: '供应商', width: 220, sub: r => r.remark }, { prop: 'contact', label: '联系人' }, { prop: 'phone', label: '电话', width: 150 },
    { prop: 'active', label: '状态', width: 80 }],
  after: (m, rows) => { m.suppliers = rows; },
});
const StockItems = simpleCrud({
  title: '库存品', desc: '库存品是实际占库存的东西；不同商品、不同规格可以绑定同一个库存品，按各自的扣减量扣。', url: '/api/stock-items',
  fields: [{ prop: 'name', label: '名称' }, { prop: 'code', label: '编码' }, { prop: 'unit', label: '单位', default: '份' }, { prop: 'cost', label: '单位成本', type: 'money', default: '0' },
    { prop: 'supplier_id', label: '供应商', type: 'select', default: null, options: m => m.suppliers },
    { prop: 'alert_qty', label: '库存预警', type: 'qty', default: '', placeholder: '库存 ≤ 这个数时提醒补货，留空不提醒' }, { prop: 'active', label: '启用', type: 'bool' }],
  columns: [{ prop: 'name', label: '库存品', width: 220, sub: r => r.code ? '编码 ' + r.code : '' }, { prop: 'unit', label: '单位', width: 80 },
    { prop: 'alert_qty', label: '预警量', width: 90, fmt: r => r.alert_qty == null ? '' : String(r.alert_qty) },
    { prop: 'cost', label: '单位成本', width: 110, fmt: r => '¥' + yuan(r.cost) }, { prop: 'supplier_id', label: '供应商', width: 160, fmt: (r, m) => (m.suppliers.find(s => s.id === r.supplier_id) || {}).name || '' },
    { prop: 'active', label: '状态', width: 80 }],
  after: (m, rows) => { m.stockItems = rows.filter(r => r.active); },
});

// ---------------- 门店与区域二维码 ----------------
const Stores = {
  props: ['meta'],
  template: `
  <div>
  <div class="panel">
    <div class="toolbar"><b>门店</b><span class="grow"></span><el-button type="primary" @click="editStore()">新增门店</el-button></div>
    <el-table :data="meta.stores" @row-click="editStore" row-class-name="clickable">
      <el-table-column label="门店" min-width="200"><template #default="{row}">
        <div class="c-main">{{row.name}}</div><div class="c-sub">{{[row.address, row.phone].filter(Boolean).join(' · ') || '未填地址电话'}}</div></template></el-table-column>
      <el-table-column label="扫码点单" width="110"><template #default="{row}"><el-tag :type="row.accept_online_orders ? 'success' : 'warning'" size="small">{{row.accept_online_orders ? '接单中' : '暂停接单'}}</el-tag></template></el-table-column>
      <el-table-column label="店员对本店库存" min-width="150"><template #default="{row}">
        <span class="chip">{{row.staff_can_view_stock ? '可查看' : '不可查看'}}</span><span class="chip">{{row.staff_can_edit_stock ? '可盘点' : '不可修改'}}</span></template></el-table-column>
      <el-table-column label="出票" min-width="120"><template #default="{row}"><span class="c-main" style="font-weight:400">{{row.print_mode === 'agent' ? '打印小助手' : '本机浏览器'}}</span></template></el-table-column>
      <el-table-column label="状态" width="80"><template #default="{row}"><el-tag :type="row.active ? 'success' : 'info'" size="small">{{row.active ? '营业' : '停用'}}</el-tag></template></el-table-column>
      <el-table-column width="80" align="right"><template #default><span class="muted" style="white-space:nowrap">编辑 ›</span></template></el-table-column>
    </el-table>
  </div>
  <div class="panel">
    <div class="toolbar"><b>区域与二维码</b><span class="muted">顾客扫区域二维码点单，订单自动带上门店和区域</span><span class="grow"></span><el-button type="primary" @click="editArea()">新增区域</el-button></div>
    <el-table :data="areas">
      <el-table-column label="区域" min-width="200"><template #default="{row}">
        <div class="c-main">{{row.name}}</div><div class="c-sub">{{row.store_name}}</div></template></el-table-column>
      <el-table-column label="点单数量" width="120"><template #default="{row}"><el-tag v-if="row.no_qty_limit" type="success" size="small">不限数量</el-tag><span v-else class="muted" style="white-space:nowrap">按规则</span></template></el-table-column>
      <el-table-column label="状态" width="80"><template #default="{row}"><el-tag :type="row.active ? 'success' : 'info'" size="small">{{row.active ? '启用' : '停用'}}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="320" align="right"><template #default="{row}">
        <el-button size="small" @click="openRules(row)">点单规则</el-button>
        <el-button size="small" @click="showQr(row)">二维码</el-button>
        <el-button size="small" @click="editArea(row)">编辑</el-button>
        <el-button size="small" link type="danger" @click="resetCode(row)">作废旧码</el-button></template></el-table-column>
    </el-table>
  </div>
  <el-dialog v-model="sDlg" :title="sForm.id ? '编辑门店' : '新增门店'" width="520px">
    <el-form :model="sForm" label-width="130px">
      <el-form-item label="门店名称"><el-input v-model="sForm.name" /></el-form-item>
      <el-form-item label="地址"><el-input v-model="sForm.address" /></el-form-item>
      <el-form-item label="电话"><el-input v-model="sForm.phone" /></el-form-item>
      <el-form-item label="允许门店看库存"><el-switch v-model="sForm.staff_can_view_stock" /></el-form-item>
      <el-form-item label="允许门店改库存"><el-switch v-model="sForm.staff_can_edit_stock" /></el-form-item>
      <el-form-item label="接收小程序订单"><el-switch v-model="sForm.accept_online_orders" /></el-form-item>
      <el-form-item label="营业"><el-switch v-model="sForm.active" /></el-form-item>
      <div class="form-section">出票方式</div>
      <el-form-item label="小票机接在">
        <el-radio-group v-model="sForm.print_mode">
          <el-radio value="browser">开门店工作台的这台电脑</el-radio>
          <el-radio value="agent">另一台电脑（打印小助手）</el-radio>
        </el-radio-group>
      </el-form-item>
      <template v-if="sForm.print_mode==='agent'">
        <el-form-item label="自动出票"><el-checkbox v-model="sForm.auto_print_online">新的小程序订单</el-checkbox><el-checkbox v-model="sForm.auto_print_pos">门店收银后</el-checkbox></el-form-item>
        <el-form-item v-if="sForm.id" label="打印密钥">
          <el-input :model-value="printer.print_key || '还没生成'" readonly style="width:230px" />
          <el-button style="margin-left:6px" @click="resetKey">{{printer.print_key ? '换新密钥' : '生成'}}</el-button>
        </el-form-item>
        <el-form-item v-if="sForm.id" label="打印小助手">
          <el-tag :type="printer.agent_online ? 'success' : 'info'">{{printer.agent_online ? '在线' : (printer.agent_seen_at ? '离线，最后联网 ' + printer.agent_seen_at : '还没连接过')}}</el-tag>
          <el-button link type="primary" style="margin-left:8px" :disabled="!printer.print_key" @click="testPrint">打印测试页</el-button>
        </el-form-item>
        <div class="hint" style="margin-left:130px">在接小票机的电脑上（Win7 也可以，只要能上网）用浏览器打开 <a :href="agentUrl" target="_blank">{{agentUrl}}</a> 下载，解压后双击“安装打印小助手.bat”，按提示填系统地址 {{origin}} 和上面的打印密钥。新订单会在那台电脑上响铃并自动出票。</div>
      </template>
    </el-form>
    <template #footer><el-button @click="sDlg=false">取消</el-button><el-button type="primary" @click="saveStore">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="aDlg" :title="aForm.id ? '编辑区域' : '新增区域'" width="460px">
    <el-form :model="aForm" label-width="80px">
      <el-form-item label="门店"><el-select v-model="aForm.store_id"><el-option v-for="s in meta.stores" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
      <el-form-item label="区域名称"><el-input v-model="aForm.name" placeholder="如：一病区、3 楼" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="aForm.sort" /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="aForm.active" /></el-form-item>
      <el-form-item label="不限数量"><el-switch v-model="aForm.no_qty_limit" /><span class="hint" style="margin:0 0 0 8px">打开后这个区域点单不受起订量、限购量限制（如 ICU）</span></el-form-item>
    </el-form>
    <template #footer><el-button @click="aDlg=false">取消</el-button><el-button type="primary" @click="saveArea">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="rDlg" :title="rArea.store_name + ' · ' + rArea.name + ' 点单规则'" width="820px" top="5vh">
    <div class="hint" style="margin:0 0 12px">只影响顾客扫码点单。起订量、限购量留空 = 用商品自己的设置，填 0 = 本区域不限。
      <b v-if="rArea.no_qty_limit">这个区域已设为“不限数量”，下面的数量设置不生效。</b></div>
    <div class="toolbar" style="margin-bottom:8px">
      <el-input v-model="rKw" placeholder="搜索商品" clearable style="width:200px" />
      <el-button size="small" @click="rRows.forEach(r => r.allowed = true)">全部可点</el-button>
      <el-button size="small" @click="rRows.forEach(r => r.allowed = false)">全部不可点</el-button>
    </div>
    <el-table :data="rShown" size="small" max-height="460">
      <el-table-column prop="name" label="商品" min-width="160" />
      <el-table-column label="可点" width="70"><template #default="{row}"><el-checkbox v-model="row.allowed" :disabled="row.area_limited" /></template></el-table-column>
      <el-table-column label="起订量" width="130"><template #default="{row}"><el-input v-model="row.min_qty" size="small" :placeholder="row.product_min_qty ? '商品：' + row.product_min_qty : '不限'" /></template></el-table-column>
      <el-table-column label="限购量" width="130"><template #default="{row}"><el-input v-model="row.max_qty" size="small" :placeholder="row.product_max_qty ? '商品：' + row.product_max_qty : '不限'" /></template></el-table-column>
      <el-table-column label="当前效果" min-width="150"><template #default="{row}">
        <span v-if="row.area_limited" class="muted">商品设了只在其他区域可点</span>
        <span v-else-if="!row.effective.allowed" style="color:var(--danger)">不能点</span>
        <span v-else>{{ effText(row.effective) }}</span></template></el-table-column>
    </el-table>
    <template #footer><el-button @click="rDlg=false">取消</el-button><el-button type="primary" :loading="rSaving" @click="saveRules">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="qDlg" title="区域二维码" width="380px">
    <div class="qr-box">
      <div style="font-weight:600;margin-bottom:6px">{{qArea.store_name}} · {{qArea.name}}</div>
      <img :src="qImg" />
      <div class="muted" style="font-size:12px;word-break:break-all;margin-top:6px">{{qUrl}}</div>
      <el-alert v-if="qLocal" type="warning" :closable="false" style="margin-top:8px;text-align:left" title="这个二维码只能在本机或同一个局域网里扫开" description="正式张贴前，请先在“业务规则”里填好“顾客访问网址”（正式域名），再回来下载。" />
      <div class="muted" style="font-size:12px;margin-top:6px">小程序上线前先用网页版点单；小程序发布后这里改为小程序码。</div>
      <el-button type="primary" style="margin-top:10px" @click="downloadQr">下载图片</el-button>
    </div>
  </el-dialog>
  </div>`,
  setup(props, { emit }) {
    const areas = ref([]), sDlg = ref(false), aDlg = ref(false), qDlg = ref(false);
    const sForm = reactive({}), aForm = reactive({}), qArea = ref({}), qImg = ref(''), qUrl = ref('');
    const loadAreas = async () => { try { areas.value = await api.get('/api/areas'); props.meta.areas = areas.value; } catch (e) { err(e); } };
    const reloadStores = async () => { props.meta.stores = await api.get('/api/stores'); };
    const printer = ref({}), origin = location.origin, agentUrl = location.origin + '/api/print-agent/download';
    const loadPrinter = async () => { printer.value = sForm.id ? await api.get('/api/stores/' + sForm.id + '/printer').catch(() => ({})) : {}; };
    const editStore = (r) => {
      Object.assign(sForm, r ? { ...r } : { id: null, name: '', address: '', phone: '', staff_can_view_stock: false, staff_can_edit_stock: false, accept_online_orders: true, active: true,
        print_mode: 'browser', auto_print_online: true, auto_print_pos: true });
      printer.value = {}; loadPrinter(); sDlg.value = true;
    };
    const saveStore = async () => { try { sForm.id ? await api.put('/api/stores/' + sForm.id, sForm) : await api.post('/api/stores', sForm); ok(); sDlg.value = false; reloadStores(); } catch (e) { err(e); } };
    const resetKey = async () => {
      if (printer.value.print_key) { try { await ElMessageBox.confirm('换新密钥后，打印小助手要用新密钥重新安装才能出票。确定吗？', '换新密钥', { type: 'warning' }); } catch (e) { return; } }
      try { printer.value = await api.post('/api/stores/' + sForm.id + '/printer/key'); } catch (e) { err(e); }
    };
    const testPrint = async () => {
      // 不顺带保存表单：出票方式还没保存时提示先保存
      const saved = props.meta.stores.find(s => s.id === sForm.id) || {};
      if (saved.print_mode !== 'agent') return ElMessage.warning('请先点“保存”，把出票方式存为“打印小助手”，再打印测试页');
      try { printer.value = { ...printer.value, ...(await api.post('/api/stores/' + sForm.id + '/printer/test')) }; ok('测试页已发送，打印小助手在线时几秒内出纸'); } catch (e) { err(e); }
    };
    const editArea = (r) => { Object.assign(aForm, r ? { ...r } : { id: null, store_id: (props.meta.stores[0] || {}).id, name: '', sort: 0, active: true, no_qty_limit: false }); aDlg.value = true; };
    // 区域点单规则
    const rDlg = ref(false), rArea = ref({}), rRows = ref([]), rKw = ref(''), rSaving = ref(false);
    const rShown = computed(() => rKw.value ? rRows.value.filter(r => r.name.includes(rKw.value)) : rRows.value);
    const effText = (e) => [e.min_qty ? e.min_qty + ' 件起' : '', e.max_qty ? '每单最多 ' + e.max_qty + ' 件' : ''].filter(Boolean).join('，') || '可点，不限数量';
    const fillRules = (res) => { rArea.value = res.area; rRows.value = res.rules.map(r => ({ ...r, min_qty: r.min_qty == null ? '' : r.min_qty, max_qty: r.max_qty == null ? '' : r.max_qty })); };
    const openRules = async (a) => { rKw.value = ''; try { fillRules(await api.get('/api/areas/' + a.id + '/rules')); rDlg.value = true; } catch (e) { err(e); } };
    const saveRules = async () => {
      const qty = (v) => blank(v) ? null : (/^\d+$/.test(String(v).trim()) ? +v : NaN);
      const body = [];
      for (const r of rRows.value) {
        const mn = qty(r.min_qty), mx = qty(r.max_qty);
        if (Number.isNaN(mn) || Number.isNaN(mx)) return ElMessage.warning(r.name + '：数量请填整数，留空用商品设置，0 表示不限');
        if (mn && mx && mn > mx) return ElMessage.warning(r.name + '：起订量不能大于限购量');
        body.push({ product_id: r.product_id, allowed: r.allowed, min_qty: mn, max_qty: mx });
      }
      rSaving.value = true;
      try { fillRules(await api.put('/api/areas/' + rArea.value.id + '/rules', body)); ok(); } catch (e) { err(e); } finally { rSaving.value = false; }
    };
    const saveArea = async () => { try { aForm.id ? await api.put('/api/areas/' + aForm.id, aForm) : await api.post('/api/areas', aForm); ok(); aDlg.value = false; loadAreas(); } catch (e) { err(e); } };
    const resetCode = async (r) => {
      try { await ElMessageBox.confirm('作废后，已经贴出去的旧二维码将无法点单，需要重新打印。确定吗？', '作废旧码', { type: 'warning' }); } catch (e) { return; }
      try { await api.post('/api/areas/' + r.id + '/reset-code'); ok('已生成新二维码'); loadAreas(); } catch (e) { err(e); }
    };
    const showQr = (r) => {
      const base = (publicUrl.value || location.origin).replace(/\/+$/, '');
      qLocal.value = !publicUrl.value && /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.origin);
      qArea.value = r; qUrl.value = base + '/web/h5/?area=' + r.code;
      const q = qrcode(0, 'M'); q.addData(qUrl.value); q.make(); qImg.value = q.createDataURL(8, 16); qDlg.value = true;
    };
    const downloadQr = () => { const a = document.createElement('a'); a.href = qImg.value; a.download = qArea.value.store_name + '_' + qArea.value.name + '.gif'; a.click(); };
    const publicUrl = ref(''), qLocal = ref(false);
    onMounted(async () => { loadAreas(); try { publicUrl.value = (await api.get('/api/settings/rules')).public_url || ''; } catch (e) {} });
    return { rDlg, rArea, rRows, rKw, rShown, rSaving, effText, openRules, saveRules, qLocal, areas, sDlg, aDlg, qDlg, sForm, aForm, qArea, qImg, qUrl, editStore, saveStore, printer, origin, agentUrl, resetKey, testPrint, editArea, saveArea, resetCode, showQr, downloadQr };
  },
};

// ---------------- 仓库与库存 ----------------
const Inventory = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="segs">
      <div v-for="l in locations" :key="l.id" class="seg" :class="{on: loc === l.id}" @click="loc = l.id; load()">
        {{l.name}}<span class="n">{{l.kind_text}}</span></div>
      <span class="seg" style="color:var(--primary)" @click="newWarehouse">+ 新增仓库</span>
    </div>
    <div class="toolbar">
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:250px" @change="load" />
      <el-input v-model="kw" placeholder="搜索库存品" clearable style="width:160px" @keyup.enter="load" @clear="load" />
      <el-button @click="load">查询</el-button>
      <el-button @click="expLedger">导出</el-button>
      <span class="grow"></span>
      <el-button @click="openDocs">单据记录</el-button>
      <el-button @click="openDoc('in')">入库</el-button>
      <el-button @click="openDoc('out')">出库</el-button>
      <el-button @click="openDoc('adjust')">盘点</el-button>
      <el-button type="primary" @click="openDoc('transfer')">调拨到门店</el-button>
    </div>
    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><div class="k">库存品</div><div class="v">{{rows.length}}</div><div class="s">本地点有记录的</div></div>
      <div class="stat"><div class="k">期间入库 + 调入</div><div class="v">{{fmtN(sumOf('in') + sumOf('transfer_in'))}}</div></div>
      <div class="stat"><div class="k">期间销售</div><div class="v">{{fmtN(sumOf('sale') - sumOf('sale_return'))}}</div><div class="s">已扣除退货回补</div></div>
      <div class="stat"><div class="k">库存为 0 或负数</div><div class="v" :style="lowCount ? 'color:var(--danger)' : ''">{{lowCount}}</div><div class="s">需要补货或核对</div></div>
      <div class="stat clickable" @click="onlyLow = !onlyLow"><div class="k">低于预警量</div><div class="v" :style="alertCount ? 'color:var(--danger)' : ''">{{alertCount}}</div><div class="s">{{ onlyLow ? '只看预警中 · 点击看全部' : '在“库存品”里设预警量 · 点击只看这些' }}</div></div>
    </div>
    <el-table :data="shownRows" show-summary :summary-method="summary" :row-class-name="({row}) => row.current <= 0 || row.low ? 'row-low' : ''">
      <el-table-column label="库存品" min-width="150" fixed><template #default="{row}"><div class="c-main">{{row.name}}<el-tag v-if="row.low" type="danger" size="small" style="margin-left:6px">低于预警 {{row.alert_qty}}</el-tag></div><div class="c-sub">{{row.unit}}</div></template></el-table-column>
      <el-table-column v-for="c in cols" :key="c[0]" :label="c[1]" min-width="78" align="right">
        <template #default="{row}"><span v-if="!row[c[0]]" class="zero">–</span>
          <el-button v-else link :class="{strong: c[0] === 'closing'}" @click="showMoves(row)">{{fmtN(row[c[0]])}}</el-button></template></el-table-column>
      <el-table-column label="当前库存" min-width="96" align="right" fixed="right"><template #default="{row}">
        <b class="money" :style="row.current <= 0 ? 'color:var(--danger)' : ''">{{fmtN(row.current)}}</b></template></el-table-column>
    </el-table>
    <div class="muted" style="margin-top:6px">期初 = 开始日之前的累计；结余 = 期初 + 入库 − 出库 + 调入 − 调出 − 销售 + 退货回补 ± 盘点。点数字查看流水。</div>

    <el-dialog v-model="dDlg" :title="docTitle" width="720px" top="4vh">
      <el-form label-width="80px" inline>
        <el-form-item v-if="doc.kind==='out' || doc.kind==='transfer'" label="调出"><el-select v-model="doc.from" style="width:170px"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind!=='out'" :label="doc.kind==='transfer' ? '调入' : (doc.kind==='adjust' ? '盘点地点' : '入库到')"><el-select v-model="doc.to" style="width:170px"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind==='out'" label="出库原因"><el-select v-model="doc.reason" clearable placeholder="选填" style="width:170px"><el-option v-for="r in outReasons" :key="r" :label="r" :value="r" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind==='in' || (doc.kind==='out' && doc.reason==='退供应商')" label="供应商"><el-select v-model="doc.supplier_id" clearable filterable style="width:170px"><el-option v-for="s in meta.suppliers" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="doc.remark" style="width:170px" /></el-form-item>
      </el-form>
      <div class="muted" style="margin-bottom:6px">{{ doc.kind==='adjust' ? '填写实际盘点数量，留空表示不盘该项。' : '在数量列直接填数，留空或 0 表示不处理。' }}</div>
      <el-table :data="doc.lines" border size="small" max-height="420">
        <el-table-column prop="name" label="库存品" />
        <el-table-column prop="unit" label="单位" width="60" />
        <el-table-column label="来源现有" width="90"><template #default="{row}">{{ stockAt(doc.kind==='in' || doc.kind==='adjust' ? doc.to : doc.from, row.id) }}</template></el-table-column>
        <el-table-column :label="doc.kind==='adjust' ? '实盘数' : '数量'" width="110"><template #default="{row}"><el-input v-model="row.qty" size="small" /></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" label="进价（元）" width="110"><template #default="{row}"><el-input v-model="row.price" size="small" /></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" label="金额" width="90" align="right"><template #default="{row}">{{ lineAmt(row) == null ? '' : yuan(lineAmt(row)) }}</template></el-table-column>
        <el-table-column v-if="doc.kind==='adjust'" label="盈亏" width="80" align="right"><template #default="{row}"><span v-if="diffOf(row) != null" :style="{color: diffOf(row) < 0 ? 'var(--danger)' : (diffOf(row) > 0 ? 'var(--success, #16a34a)' : '')}">{{ diffOf(row) > 0 ? '+' : '' }}{{ diffOf(row) }}</span></template></el-table-column>
      </el-table>
      <div v-if="doc.kind==='in' && docAmt" style="text-align:right;margin-top:8px">进货金额合计 <b class="money">¥{{yuan(docAmt)}}</b></div>
      <template #footer><el-button @click="dDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="submitDoc">提交</el-button></template>
    </el-dialog>
    <el-dialog v-model="lDlg" title="出入库单据" width="980px" top="4vh">
      <div class="toolbar">
        <el-select v-model="lq.kind" placeholder="全部类型" clearable style="width:110px" @change="loadDocs"><el-option v-for="(t, k) in kindText" :key="k" :label="t" :value="k" /></el-select>
        <el-select v-model="lq.location_id" placeholder="全部地点" clearable style="width:140px" @change="loadDocs"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select>
        <el-date-picker v-model="lq.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:240px" @change="loadDocs" />
        <el-input v-model="lq.keyword" placeholder="单号 / 备注" clearable style="width:150px" @keyup.enter="loadDocs" @clear="loadDocs" />
        <el-button @click="loadDocs">查询</el-button><el-button @click="expDocs">导出</el-button>
      </div>
      <el-table :data="docs" size="small" max-height="560" :row-class-name="({row}) => row.voided ? 'row-void' : ''">
        <el-table-column type="expand"><template #default="{row}">
          <div style="padding:4px 12px 10px 48px">
            <div class="muted" style="margin-bottom:6px">
              <span v-if="row.supplier_name">供应商：{{row.supplier_name}}　</span><span v-if="row.reason">原因：{{row.reason}}　</span>
              <span v-if="row.remark">备注：{{row.remark}}　</span><span>制单：{{row.created_by_name}}</span>
              <span v-if="row.voided" style="color:var(--danger)">　{{row.voided_at}} 由 {{row.voided_by_name}} 作废：{{row.void_reason}}</span></div>
            <el-table :data="row.lines" size="small" border>
              <el-table-column prop="name" label="库存品" /><el-table-column prop="unit" label="单位" width="60" />
              <el-table-column v-if="row.kind==='adjust'" prop="book_qty" label="账面" width="80" align="right" />
              <el-table-column prop="qty" :label="row.kind==='adjust' ? '实盘' : '数量'" width="80" align="right" />
              <el-table-column v-if="row.kind==='adjust'" label="盈亏" width="80" align="right"><template #default="{row: l}">{{ l.diff > 0 ? '+' : '' }}{{l.diff}}</template></el-table-column>
              <el-table-column label="单价" width="90" align="right"><template #default="{row: l}">{{ l.unit_cost == null ? '' : yuan(l.unit_cost) }}</template></el-table-column>
              <el-table-column :label="row.kind==='adjust' ? '盈亏金额' : '金额'" width="100" align="right"><template #default="{row: l}">{{ l.amount == null ? '' : yuan(l.amount) }}</template></el-table-column>
            </el-table></div></template></el-table-column>
        <el-table-column label="单号" min-width="170"><template #default="{row}"><div class="c-main">{{row.no}}</div><div class="c-sub">{{row.created_at}}</div></template></el-table-column>
        <el-table-column label="类型" width="100"><template #default="{row}">{{row.kind_text}}<span v-if="row.reason" class="muted"> · {{row.reason}}</span></template></el-table-column>
        <el-table-column label="地点" min-width="160"><template #default="{row}">{{ row.kind==='transfer' ? row.from_location + ' → ' + row.to_location : (row.from_location || row.to_location) }}</template></el-table-column>
        <el-table-column label="数量" width="80" align="right"><template #default="{row}">{{ row.kind==='adjust' && row.total_qty > 0 ? '+' : '' }}{{row.total_qty}}</template></el-table-column>
        <el-table-column label="金额" width="100" align="right"><template #default="{row}">{{ row.total_amount == null ? '' : yuan(row.total_amount) }}</template></el-table-column>
        <el-table-column label="状态" width="120" align="right"><template #default="{row}">
          <el-tag v-if="row.voided" type="info" size="small">已作废</el-tag>
          <el-button v-else link type="danger" @click="voidDoc(row)">作废</el-button></template></el-table-column>
      </el-table>
      <div class="muted" style="margin-top:6px">填错的单据点“作废”：库存按原单反向冲回，单据保留可查。盘点单作废只冲回当时的盈亏数量。</div>
    </el-dialog>
    <el-dialog v-model="mDlg" :title="mTitle" width="640px">
      <el-table :data="moves" border size="small" max-height="460">
        <el-table-column prop="created_at" label="时间" width="160" />
        <el-table-column prop="kind_text" label="类型" width="90" />
        <el-table-column prop="qty" label="变动" width="80" />
        <el-table-column prop="balance_after" label="结存" width="80" />
        <el-table-column prop="ref" label="单据 / 订单" />
      </el-table>
    </el-dialog>
  </div>`,
  setup(props) {
    const locations = ref([]), loc = ref(null), range = ref([today(), today()]), kw = ref(''), rows = ref([]);
    const cols = [['opening', '期初'], ['in', '入库'], ['out', '出库'], ['transfer_in', '调入'], ['transfer_out', '调出'], ['sale', '销售'], ['sale_return', '退货回补'], ['adjust', '盘点'], ['closing', '结余']];
    const dDlg = ref(false), saving = ref(false), doc = reactive({ kind: 'in', from: null, to: null, remark: '', reason: '', supplier_id: null, lines: [], rid: '' });
    const outReasons = ['领用', '报损', '退供应商', '其他'], kindText = { in: '入库', out: '出库', transfer: '调拨', adjust: '盘点' };
    const lineAmt = (r) => { const q = parseFloat(r.qty), p = money(r.price); return q > 0 && p !== null ? Math.round(q * p) : null; };
    const docAmt = computed(() => doc.kind === 'in' ? doc.lines.reduce((a, r) => a + (lineAmt(r) || 0), 0) : 0);
    const diffOf = (r) => { if (!balances[doc.to] || blank(r.qty) || !isFinite(parseFloat(r.qty))) return null; return +(parseFloat(r.qty) - (+stockAt(doc.to, r.id) || 0)).toFixed(3); };
    const lDlg = ref(false), docs = ref([]), lq = reactive({ kind: '', location_id: null, range: [daysAgo(30), today()], keyword: '' });
    const docParams = () => ({ kind: lq.kind || undefined, location_id: lq.location_id || undefined, begin: (lq.range || [])[0], end: (lq.range || [])[1], keyword: lq.keyword });
    const loadDocs = async () => { try { docs.value = await api.get('/api/stock-docs', docParams()); } catch (e) { err(e); } };
    const openDocs = () => { lq.location_id = loc.value; lDlg.value = true; loadDocs(); };
    const expDocs = async () => { try { await api.download('/api/stock-docs', docParams()); } catch (e) { err(e); } };
    const expLedger = async () => { try { await api.download('/api/stock-ledger', { location_id: loc.value, begin: (range.value || [])[0], end: (range.value || [])[1], keyword: kw.value }); } catch (e) { err(e); } };
    const voidDoc = async (row) => {
      let reason;
      try { ({ value: reason } = await ElMessageBox.prompt(`作废 ${row.kind_text}单 ${row.no}？库存会按原单反向冲回（${row.kind === 'adjust' ? '冲回当时的盈亏' : '共 ' + row.total_qty}），作废后不能恢复。请写明原因：`, '作废单据',
        { type: 'warning', confirmButtonText: '作废', inputValidator: v => !blank(v) || '请写原因' })); } catch (e) { return; }
      try { await api.post('/api/stock-docs/' + row.id + '/void', { reason }); ok('已作废，库存已冲回'); loadDocs(); load(); } catch (e) { err(e); }
    };
    const balances = reactive({});
    const mDlg = ref(false), moves = ref([]), mTitle = ref('');
    const loadLocs = async () => { locations.value = await api.get('/api/locations'); if (!loc.value && locations.value.length) loc.value = locations.value[0].id; };
    const load = async () => {
      if (!loc.value) return;
      try { rows.value = await api.get('/api/stock-ledger', { location_id: loc.value, begin: (range.value || [])[0], end: (range.value || [])[1], keyword: kw.value }); } catch (e) { err(e); }
    };
    const fmtN = (v) => +(+v || 0).toFixed(3);
    const sumOf = (k) => shownRows.value.reduce((a, r) => a + (+r[k] || 0), 0);
    const lowCount = computed(() => rows.value.filter(r => r.current <= 0).length);
    const onlyLow = ref(false);
    const alertCount = computed(() => rows.value.filter(r => r.low).length);
    const shownRows = computed(() => onlyLow.value ? rows.value.filter(r => r.low) : rows.value);
    // 合计行：各列数量相加（不同单位相加只用于核对，和表格里点出来的流水对得上即可）
    const summary = ({ columns }) => columns.map((c, i) => {
      if (i === 0) return '合计';
      const key = i <= cols.length ? cols[i - 1][0] : 'current';
      return fmtN(sumOf(key)) || '–';
    });
    const docTitle = computed(() => ({ in: '入库', out: '出库', transfer: '调拨（仓库 → 门店）', adjust: '盘点' }[doc.kind]));
    const stockAt = (lid, sid) => { const m = balances[lid]; if (!m) return ''; const r = m.find(x => x.stock_item_id === sid); return r ? r.qty : 0; };
    const fetchBal = async (lid) => { if (lid && !balances[lid]) balances[lid] = await api.get('/api/stock', { location_id: lid }); };
    watch(() => [doc.from, doc.to], ([a, b]) => { fetchBal(a).catch(() => {}); fetchBal(b).catch(() => {}); });
    const openDoc = async (kind) => {
      Object.keys(balances).forEach(k => delete balances[k]);
      const wh = locations.value.find(l => l.kind === 'warehouse'), st = locations.value.find(l => l.kind === 'store');
      Object.assign(doc, { kind, remark: '', reason: '', supplier_id: null, rid: rid(),
        from: kind === 'out' ? loc.value : (kind === 'transfer' ? (wh || {}).id : null),
        to: kind === 'transfer' ? (st || {}).id : (kind === 'out' ? null : loc.value) });
      // 地点没变时 watch 不会触发，这里主动取一次现有库存
      fetchBal(doc.from).catch(() => {}); fetchBal(doc.to).catch(() => {});
      // 停用的库存品也列出来（排在后面），方便把剩余库存出库或盘为 0
      let all = props.meta.stockItems;
      try { all = await api.get('/api/stock-items'); } catch (e) {}
      doc.lines = [...all.filter(i => i.active), ...all.filter(i => !i.active)]
        .map(i => ({ id: i.id, name: i.name + (i.active ? '' : '（已停用）'), unit: i.unit, qty: '', price: i.cost == null ? '' : yuan(i.cost) }));
      dDlg.value = true;
    };
    const submitDoc = async () => {
      const bad = doc.lines.find(l => String(l.qty).trim() !== '' && !(isFinite(parseFloat(l.qty)) && /^\d+(\.\d{1,3})?$/.test(String(l.qty).trim())));
      if (bad) return ElMessage.warning(bad.name + ' 的数量请填数字');
      const picked = doc.lines.filter(l => String(l.qty).trim() !== '' && (doc.kind === 'adjust' || parseFloat(l.qty) > 0));
      if (doc.kind === 'in') { const badP = picked.find(l => !blank(l.price) && money(l.price) === null); if (badP) return ElMessage.warning(badP.name + ' 的进价请填数字'); }
      const lines = picked.map(l => ({ stock_item_id: l.id, qty: parseFloat(l.qty), unit_cost: doc.kind === 'in' && !blank(l.price) ? money(l.price) : null }));
      if (!lines.length) return ElMessage.warning('请填写数量');
      const locName = (id) => (locations.value.find(l => l.id === id) || {}).name || '';
      const where = { in: '入库到 ' + locName(doc.to), out: '从 ' + locName(doc.from) + ' 出库', transfer: '从 ' + locName(doc.from) + ' 调拨到 ' + locName(doc.to), adjust: '盘点 ' + locName(doc.to) }[doc.kind];
      const total = lines.reduce((a, l) => a + l.qty, 0);
      const extra = doc.kind === 'in' && docAmt.value ? `，金额 ¥${yuan(docAmt.value)}` : (doc.kind === 'adjust' ? `，盘盈 ${picked.filter(l => diffOf(l) > 0).length} 项、盘亏 ${picked.filter(l => diffOf(l) < 0).length} 项` : '');
      try { await ElMessageBox.confirm(`${where}：共 ${lines.length} 项，合计 ${+total.toFixed(3)}${extra}。提交后库存立即变化，确定吗？`, '确认' + docTitle.value, { type: 'warning' }); } catch (e) { return; }
      saving.value = true;
      try {
        await api.post('/api/stock-docs', { kind: doc.kind, from_location_id: doc.kind === 'out' || doc.kind === 'transfer' ? doc.from : null,
          to_location_id: doc.kind === 'out' ? null : doc.to, supplier_id: doc.kind === 'in' || doc.reason === '退供应商' ? doc.supplier_id : null,
          reason: doc.kind === 'out' ? (doc.reason || '') : '', remark: doc.remark, request_id: doc.rid, lines });
        ok('已提交'); dDlg.value = false; load();
      } catch (e) { err(e); } finally { saving.value = false; }
    };
    const showMoves = async (row) => {
      mTitle.value = row.name + ' 流水';
      try { moves.value = await api.get('/api/stock-moves', { location_id: loc.value, stock_item_id: row.stock_item_id, begin: range.value[0], end: range.value[1] }); mDlg.value = true; } catch (e) { err(e); }
    };
    const newWarehouse = async () => {
      let name; try { ({ value: name } = await ElMessageBox.prompt('仓库名称', '新增仓库')); } catch (e) { return; }
      try { await api.post('/api/warehouses', { name }); ok(); loadLocs(); } catch (e) { err(e); }
    };
    onMounted(async () => { try { await loadLocs(); load(); } catch (e) { err(e); } });
    return { outReasons, kindText, lineAmt, docAmt, diffOf, lDlg, docs, lq, loadDocs, openDocs, expDocs, expLedger, voidDoc, yuan,
      locations, loc, range, kw, rows, cols, load, summary, fmtN, sumOf, lowCount, onlyLow, alertCount, shownRows, dDlg, saving, doc, docTitle, openDoc, submitDoc, stockAt, mDlg, moves, mTitle, showMoves, newWarehouse };
  },
};

// ---------------- 订单（后台查看全部门店） ----------------
const OrderDetail = {
  props: ['order'],
  template: `
  <div v-if="order">
    <el-descriptions :column="3" border size="small">
      <el-descriptions-item label="单号">{{order.no}}</el-descriptions-item>
      <el-descriptions-item label="来源">{{order.source_text}}</el-descriptions-item>
      <el-descriptions-item label="门店">{{order.store_name}}</el-descriptions-item>
      <el-descriptions-item label="区域">{{order.area_name}} {{order.location_note}}</el-descriptions-item>
      <el-descriptions-item label="状态">{{order.status_text}} / {{order.pay_status_text}}</el-descriptions-item>
      <el-descriptions-item label="下单时间">{{order.created_at}}</el-descriptions-item>
      <el-descriptions-item label="商品金额">¥{{yuan(order.original_amount)}}</el-descriptions-item>
      <el-descriptions-item label="优惠">¥{{yuan(order.discount_amount)}}<span v-if="order.discount_rate">（{{order.discount_rate/10}} 折）</span></el-descriptions-item>
      <el-descriptions-item label="应收 / 已退">¥{{yuan(order.payable_amount)}} / ¥{{yuan(order.refunded_amount)}}</el-descriptions-item>
      <el-descriptions-item v-if="order.remark" label="备注" :span="3">{{order.remark}}</el-descriptions-item>
    </el-descriptions>
    <el-table :data="order.items" border size="small" style="margin-top:10px">
      <el-table-column prop="product_name" label="商品" />
      <el-table-column prop="sku_name" label="规格" width="100" />
      <el-table-column prop="qty" label="数量" width="70" />
      <el-table-column label="单价" width="80"><template #default="{row}">{{yuan(row.unit_price)}}</template></el-table-column>
      <el-table-column label="金额" width="80"><template #default="{row}">{{yuan(row.amount)}}</template></el-table-column>
      <el-table-column label="实收分摊" width="90"><template #default="{row}">{{yuan(row.paid_share)}}</template></el-table-column>
      <el-table-column prop="refunded_qty" label="已退" width="60" />
    </el-table>
    <el-table v-if="order.payments.length" :data="order.payments" border size="small" style="margin-top:10px">
      <el-table-column label="类型" width="70"><template #default="{row}">{{row.kind==='pay' ? '收款' : '退款'}}</template></el-table-column>
      <el-table-column prop="method_text" label="方式" width="80" />
      <el-table-column label="金额" width="90"><template #default="{row}">{{yuan(row.amount)}}</template></el-table-column>
      <el-table-column prop="created_at" label="时间" />
    </el-table>
    <el-timeline v-if="order.logs" style="margin-top:14px">
      <el-timeline-item v-for="(l,i) in order.logs" :key="i" :timestamp="l.created_at">{{l.action}} {{l.detail}}</el-timeline-item>
    </el-timeline>
  </div>`,
  setup() { return { yuan }; },
};

const Orders = {
  props: ['meta'],
  components: { OrderDetail },
  template: `
  <div class="panel">
    <div class="segs">
      <div v-for="t in tabs" :key="t[0]" class="seg" :class="{on: tab === t[0]}" @click="tab = t[0]; load(1)">
        {{t[1]}}<span class="n" :class="t[2]">{{counts[t[0]] || 0}}</span></div>
    </div>
    <div class="toolbar">
      <el-select v-model="q.store_id" placeholder="全部门店" clearable style="width:150px" @change="load(1)"><el-option v-for="s in meta.stores" :key="s.id" :label="s.name" :value="s.id" /></el-select>
      <el-select v-model="q.source" placeholder="全部来源" clearable style="width:120px" @change="load(1)"><el-option label="门店收银" value="pos" /><el-option label="扫码点单" value="online" /></el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width:250px" @change="load(1)" />
      <el-input v-model="q.keyword" placeholder="单号 / 床号 / 电话" clearable style="width:180px" @keyup.enter="load(1)" @clear="load(1)" />
      <el-button @click="load(1)">查询</el-button>
      <span class="grow"></span>
      <span class="muted">共 {{total}} 单，应收合计 <b class="money" style="color:var(--text)">¥{{yuan(sumPayable)}}</b></span>
    </div>
    <el-table :data="rows" @row-click="open" row-class-name="clickable">
      <el-table-column label="订单" min-width="210"><template #default="{row}">
        <div class="c-main mono">{{row.no}}</div><div class="c-sub">{{row.created_at.slice(5, 16)}} · {{row.store_name}}</div></template></el-table-column>
      <el-table-column label="来源" min-width="150"><template #default="{row}">
        <el-tag :type="row.source === 'online' ? 'primary' : 'info'" size="small">{{row.source === 'online' ? '扫码点单' : '门店收银'}}</el-tag>
        <div class="c-sub" v-if="row.area_name">{{row.area_name}} {{row.location_note}}</div></template></el-table-column>
      <el-table-column label="商品" min-width="240"><template #default="{row}">
        <div class="c-main ellipsis" :title="goods(row)">{{goods(row)}}</div><div class="c-sub">共 {{row.item_count}} 件</div></template></el-table-column>
      <el-table-column label="应收" width="130" align="right"><template #default="{row}">
        <div class="c-main money">¥{{yuan(row.payable_amount)}}</div>
        <div class="c-sub" v-if="row.refunded_amount" style="color:var(--danger)">退 ¥{{yuan(row.refunded_amount)}}</div>
        <div class="c-sub" v-else-if="row.discount_amount">优惠 ¥{{yuan(row.discount_amount)}}</div></template></el-table-column>
      <el-table-column label="状态" width="170"><template #default="{row}">
        <el-tag :type="statusType(row)" size="small">{{row.status_text}}</el-tag>
        <el-tag v-if="row.status !== 'cancelled'" :type="payType(row)" size="small" effect="plain" style="margin-left:4px">{{row.pay_status_text}}</el-tag></template></el-table-column>
      <el-table-column width="80" align="right"><template #default><span class="muted" style="white-space:nowrap">详情 ›</span></template></el-table-column>
    </el-table>
    <el-pagination style="margin-top:14px;justify-content:flex-end" layout="prev, pager, next" :total="total" :page-size="50" :current-page="page" @current-change="load" hide-on-single-page />
    <el-drawer v-model="drawer" title="订单详情" size="720px"><order-detail :order="cur" /></el-drawer>
  </div>`,
  setup() {
    const q = reactive({ store_id: null, source: null, keyword: '' }), range = ref([]), rows = ref([]), total = ref(0), page = ref(1);
    const drawer = ref(false), cur = ref(null), tab = ref('all'), counts = ref({}), sumPayable = ref(0);
    const tabs = [['all', '全部', ''], ['pending', '待接单', 'red'], ['unpaid', '待收款', 'amber'], ['completed', '已完成', ''], ['refund', '有退款', ''], ['cancelled', '已取消', '']];
    const filters = { all: {}, pending: { status: 'pending' }, unpaid: { status: 'accepted', pay_status: 'unpaid' }, completed: { status: 'completed' },
      refund: { pay_status: 'partial_refunded,refunded' }, cancelled: { status: 'cancelled' } };
    const goods = (row) => row.items.map(i => i.product_name + (i.sku_name !== '默认' ? '（' + i.sku_name + '）' : '') + ' ×' + i.qty).join('，');
    const statusType = (r) => ({ pending: 'danger', accepted: 'warning', completed: 'success', cancelled: 'info' }[r.status]);
    const payType = (r) => ({ unpaid: 'warning', paid: 'success', partial_refunded: 'danger', refunded: 'danger' }[r.pay_status]);
    const load = async (p) => {
      page.value = p || 1;
      try {
        const r = await api.get('/api/orders', { ...q, ...filters[tab.value], begin: (range.value || [])[0], end: (range.value || [])[1], page: page.value });
        rows.value = r.items; total.value = r.total; counts.value = r.counts || {}; sumPayable.value = r.sum_payable || 0;
      } catch (e) { err(e); }
    };
    const open = async (row) => { try { cur.value = await api.get('/api/orders/' + row.id); drawer.value = true; } catch (e) { err(e); } };
    onMounted(() => load(1));
    return { q, range, rows, total, page, load, open, drawer, cur, tab, tabs, counts, sumPayable, goods, statusType, payType, yuan };
  },
};

// ---------------- 营收报表 ----------------
const Revenue = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-radio-group v-model="group" @change="load"><el-radio-button value="day">日报</el-radio-button><el-radio-button value="week">周报</el-radio-button><el-radio-button value="month">月报</el-radio-button></el-radio-group>
      <el-select v-model="store" placeholder="全部门店" clearable style="width:140px" @change="load"><el-option v-for="s in meta.stores" :key="s.id" :label="s.name" :value="s.id" /></el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" style="width:260px" @change="load" />
      <el-button @click="load">查询</el-button>
      <span class="grow"></span>
      <el-button type="primary" @click="exp">导出 Excel</el-button>
    </div>
    <div class="stats" v-if="data.total">
      <div class="stat"><div class="k">实收</div><div class="v">¥{{yuan(data.total.net)}}</div><div class="s">收款 ¥{{yuan(data.total.received)}} − 退款 ¥{{yuan(data.total.refunded)}}</div></div>
      <div class="stat"><div class="k">单数</div><div class="v">{{data.total.orders}}</div><div class="s">门店收银 {{data.total.pos_orders}} · 扫码点单 {{data.total.online_orders}}</div></div>
      <div class="stat"><div class="k">优惠</div><div class="v">¥{{yuan(data.total.discount)}}</div><div class="s">商品原价 ¥{{yuan(data.total.original)}}</div></div>
      <div class="stat"><div class="k">毛利</div><div class="v">¥{{yuan(data.total.profit)}}</div><div class="s">成本 ¥{{yuan(data.total.cost)}}</div></div>
    </div>
    <div class="chips-row" v-if="data.total">
      <span v-for="m in methodList" :key="m[0]" class="chip">{{m[1]}} <b class="money">¥{{yuan(data.total.methods[m[0]])}}</b></span>
    </div>
    <el-table :data="rowsWithTotal" :row-class-name="({row}) => row.period === '合计' ? 'row-total' : ''">
      <el-table-column label="期间" min-width="150" fixed><template #default="{row}"><div class="c-main">{{row.period}}</div><div class="c-sub" v-if="row.store_name">{{row.store_name}}</div></template></el-table-column>
      <el-table-column prop="orders" label="单数" min-width="70" align="right" />
      <el-table-column label="商品原价" min-width="100" align="right"><template #default="{row}"><span class="money">{{yuan(row.original)}}</span></template></el-table-column>
      <el-table-column label="优惠" min-width="90" align="right"><template #default="{row}"><span class="money" :class="{zero: !row.discount}">{{row.discount ? '−' + yuan(row.discount) : '–'}}</span></template></el-table-column>
      <el-table-column label="退款" min-width="90" align="right"><template #default="{row}"><span class="money" :class="{zero: !row.refunded}" :style="row.refunded ? 'color:var(--danger)' : ''">{{row.refunded ? '−' + yuan(row.refunded) : '–'}}</span></template></el-table-column>
      <el-table-column label="实收" min-width="110" align="right"><template #default="{row}"><b class="money">{{yuan(row.net)}}</b></template></el-table-column>
      <el-table-column label="件数（退）" min-width="100" align="right"><template #default="{row}">{{row.qty}}<span v-if="row.refund_qty" class="muted">（{{row.refund_qty}}）</span></template></el-table-column>
      <el-table-column label="成本" min-width="90" align="right"><template #default="{row}"><span class="money">{{yuan(row.cost)}}</span></template></el-table-column>
      <el-table-column label="毛利" min-width="100" align="right"><template #default="{row}"><span class="money">{{yuan(row.profit)}}</span></template></el-table-column>
    </el-table>
    <div class="muted" style="margin-top:6px">收款按收款时间、退款按退款时间计入；实收 = 收款 − 退款。微信 / 支付宝目前是店员确认收款的记账，不是在线支付。</div>
  </div>`,
  setup() {
    const group = ref('day'), store = ref(null), range = ref([daysAgo(6), today()]), data = ref({ rows: [], total: null });
    const params = () => ({ group: group.value, store_id: store.value, begin: (range.value || [])[0], end: (range.value || [])[1] });
    const load = async () => { try { data.value = await api.get('/api/reports/revenue', params()); } catch (e) { err(e); } };
    const exp = async () => { try { await api.download('/api/reports/revenue', params()); } catch (e) { err(e); } };
    const rowsWithTotal = computed(() => data.value.total ? [...data.value.rows, { ...data.value.total, period: '合计', store_name: '' }] : []);
    onMounted(load);
    const methodList = [['cash', '现金'], ['wechat', '微信'], ['alipay', '支付宝'], ['other', '其他']];
    return { group, store, range, data, load, exp, rowsWithTotal, methodList, yuan };
  },
};

// ---------------- 商品销售核对 ----------------
const ProductSales = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="segs">
      <div class="seg" :class="{on: view === 'product'}" @click="view = 'product'; load()">按商品</div>
      <div class="seg" :class="{on: view === 'category'}" @click="view = 'category'; load()">按分类</div>
    </div>
    <div class="toolbar">
      <el-select v-model="store" placeholder="全部门店" clearable style="width:140px" @change="load"><el-option v-for="s in meta.stores" :key="s.id" :label="s.name" :value="s.id" /></el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" style="width:250px" @change="load" />
      <template v-if="view === 'product'">
        <el-select v-model="catId" placeholder="全部分类" clearable filterable style="width:170px" @change="load">
          <el-option v-for="c in catOptions" :key="c.id" :label="c.label" :value="c.id" /></el-select>
        <el-input v-model="kw" placeholder="商品名称" clearable style="width:150px" @keyup.enter="load" @clear="load" />
      </template>
      <el-button type="primary" @click="load">查询</el-button>
      <span class="grow"></span>
      <template v-if="view === 'product'">
        <el-button @click="exp('/api/reports/product-sales')">导出汇总</el-button>
        <el-button @click="exp('/api/reports/product-sales/detail')">导出全部明细</el-button>
      </template>
      <el-button v-else @click="exp('/api/reports/category-sales')">导出分类汇总</el-button>
    </div>

    <template v-if="view === 'category'">
      <div class="hint" style="margin:-6px 0 10px">大类包含它下面小类的商品；一个商品放在几个分类里，就在每个分类里各算一次。点一行查看这个分类里的商品。</div>
      <el-table :data="catRows" @row-click="openCat" row-class-name="clickable">
        <el-table-column label="分类" min-width="200"><template #default="{row}">
          <div class="c-main" :style="row.parent_id ? 'padding-left:18px;font-weight:400' : ''"><span v-if="row.parent_id" class="muted">└ </span>{{row.name}}</div></template></el-table-column>
        <el-table-column prop="product_count" label="卖出的商品" min-width="100" align="right" />
        <el-table-column label="净件数" min-width="120" align="right"><template #default="{row}"><b>{{row.net_qty}}</b><div class="c-sub">卖 {{row.sold_qty}}<span v-if="row.refund_qty" style="color:var(--danger)"> · 退 {{row.refund_qty}}</span></div></template></el-table-column>
        <el-table-column label="净收" min-width="120" align="right"><template #default="{row}"><b class="money">{{yuan(row.net)}}</b><div class="c-sub" v-if="row.refund" style="color:var(--danger)">退 {{yuan(row.refund)}}</div></template></el-table-column>
        <el-table-column prop="order_count" label="单数" min-width="70" align="right" />
        <el-table-column width="90" align="right"><template #default><span class="muted" style="white-space:nowrap">看商品 ›</span></template></el-table-column>
      </el-table>
    </template>

    <template v-else>
    <div class="hint" style="margin:-6px 0 10px">点一行，下面展开这个商品的逐单明细。<b v-if="catId">当前只看分类：{{(catOptions.find(c => c.id === catId) || {}).label}}</b></div>
    <el-table :data="rows" highlight-current-row @current-change="r => pick(r)" row-class-name="clickable">
      <el-table-column label="商品" min-width="200"><template #default="{row}"><div class="c-main">{{row.product_name}}</div><div class="c-sub" v-if="row.sku_name !== '默认'">{{row.sku_name}}</div></template></el-table-column>
      <el-table-column label="净件数" min-width="110" align="right"><template #default="{row}"><b>{{row.net_qty}}</b><div class="c-sub">卖 {{row.sold_qty}}<span v-if="row.refund_qty" style="color:var(--danger)"> · 退 {{row.refund_qty}}</span></div></template></el-table-column>
      <el-table-column label="原价金额" min-width="100" align="right"><template #default="{row}"><span class="money">{{yuan(row.amount)}}</span></template></el-table-column>
      <el-table-column label="优惠" min-width="90" align="right"><template #default="{row}"><span class="money" :class="{zero: !row.discount}">{{row.discount ? '−' + yuan(row.discount) : '–'}}</span></template></el-table-column>
      <el-table-column label="净收" min-width="110" align="right"><template #default="{row}"><b class="money">{{yuan(row.net)}}</b></template></el-table-column>
      <el-table-column prop="order_count" label="单数" min-width="70" align="right" />
    </el-table>
    <div v-if="cur" style="margin-top:22px;padding-top:18px;border-top:1px solid var(--border)">
      <div class="toolbar"><b>{{cur.product_name}}<span v-if="cur.sku_name !== '默认'">（{{cur.sku_name}}）</span>逐单明细</b><span class="grow"></span><el-button size="small" @click="expDetail">导出明细</el-button></div>
      <el-table :data="detail" size="small">
        <el-table-column label="单号" min-width="200"><template #default="{row}"><div class="c-main mono">{{row.order_no}}</div><div class="c-sub">{{row.time.slice(5, 16)}} · {{row.store_name}}{{row.area ? ' · ' + row.area : ''}}</div></template></el-table-column>
        <el-table-column label="类型" width="80"><template #default="{row}"><el-tag :type="row.type === 'refund' ? 'danger' : 'success'" size="small">{{row.type_text}}</el-tag></template></el-table-column>
        <el-table-column label="数量" width="80" align="right"><template #default="{row}"><b :style="row.qty < 0 ? 'color:var(--danger)' : ''">{{row.qty}}</b></template></el-table-column>
        <el-table-column label="单价" width="90" align="right"><template #default="{row}"><span class="money">{{yuan(row.unit_price)}}</span></template></el-table-column>
        <el-table-column label="原价金额" width="100" align="right"><template #default="{row}"><span class="money">{{yuan(row.amount)}}</span></template></el-table-column>
        <el-table-column label="优惠" width="90" align="right"><template #default="{row}"><span class="money" :class="{zero: !row.discount}">{{row.discount ? yuan(row.discount) : '–'}}</span></template></el-table-column>
        <el-table-column label="实收" width="100" align="right"><template #default="{row}"><b class="money">{{yuan(row.paid)}}</b></template></el-table-column>
      </el-table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <span class="muted">共 {{dTotal}} 条，合计 {{dSums.qty}} 件，实收 ¥{{yuan(dSums.paid)}}</span>
        <el-pagination layout="prev, pager, next" :total="dTotal" :page-size="100" :current-page="dPage" @current-change="p => pick(cur, p)" hide-on-single-page />
      </div>
    </div>
    </template>
  </div>`,
  setup(props) {
    const store = ref(null), range = ref([daysAgo(6), today()]), kw = ref(''), rows = ref([]), cur = ref(null), detail = ref([]);
    const dTotal = ref(0), dPage = ref(1), dSums = ref({ qty: 0, paid: 0 });
    const view = ref('product'), catId = ref(null), catRows = ref([]);
    const catOptions = computed(() => {
      const cs = props.meta.categories || [];
      return cs.filter(c => !c.parent_id).flatMap(p => [{ id: p.id, label: p.name }, ...cs.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: p.name + ' / ' + c.name }))]);
    });
    const params = () => ({ store_id: store.value, begin: (range.value || [])[0], end: (range.value || [])[1], keyword: kw.value, category_id: catId.value });
    const load = async () => {
      cur.value = null;
      try {
        if (view.value === 'category') catRows.value = (await api.get('/api/reports/category-sales', { store_id: store.value, begin: (range.value || [])[0], end: (range.value || [])[1] })).rows;
        else rows.value = (await api.get('/api/reports/product-sales', params())).rows;
      } catch (e) { err(e); }
    };
    const openCat = (row) => { if (!row.category_id) return; catId.value = row.category_id; kw.value = ''; view.value = 'product'; load(); };
    const pick = async (row, page = 1) => {
      if (!row) return; cur.value = row; dPage.value = page;
      try { const r = await api.get('/api/reports/product-sales/detail', { ...params(), keyword: '', sku_id: row.sku_id, page, size: 100 });
        detail.value = r.rows; dTotal.value = r.total; dSums.value = r.sums; } catch (e) { err(e); }
    };
    const exp = async (url) => { try { await api.download(url, params()); } catch (e) { err(e); } };
    const expDetail = async () => { try { await api.download('/api/reports/product-sales/detail', { ...params(), keyword: '', sku_id: cur.value.sku_id }); } catch (e) { err(e); } };
    onMounted(load);
    return { store, range, kw, rows, cur, detail, dTotal, dPage, dSums, view, catId, catRows, catOptions, openCat, load, pick, exp, expDetail, yuan };
  },
};

// ---------------- 小票设置 ----------------
const ReceiptSettings = {
  template: `
  <div class="panel" style="display:flex;gap:24px;flex-wrap:wrap">
    <el-form :model="f" label-width="120px" style="flex:1;min-width:360px">
      <el-form-item label="纸宽"><el-radio-group v-model="f.paper_width"><el-radio :value="58">58mm</el-radio><el-radio :value="80">80mm</el-radio></el-radio-group></el-form-item>
      <el-form-item label="标题"><el-input v-model="f.title" /></el-form-item>
      <el-form-item label="抬头文字"><el-input v-model="f.header" type="textarea" :rows="2" placeholder="可换行；可用 {门店}{单号}{时间}" /></el-form-item>
      <el-form-item label="底部文字"><el-input v-model="f.footer" type="textarea" :rows="2" placeholder="可用 {单号}{时间}{应收}{找零}" /></el-form-item>
      <el-form-item label="底部图片">
        <el-image v-if="f.footer_image" :src="f.footer_image" style="width:90px;height:90px;margin-right:10px" fit="contain" />
        <input type="file" accept="image/*" @change="upload" />
        <el-button v-if="f.footer_image" link @click="f.footer_image=''">移除</el-button>
        <div class="muted" style="width:100%">例如微信二维码，方便顾客添加微信</div>
      </el-form-item>
      <el-form-item label="打印字段">
        <el-checkbox v-for="(t,k) in toggles" :key="k" v-model="f[k]">{{t}}</el-checkbox>
      </el-form-item>
      <el-form-item label="商品详细资料"><el-switch v-model="f.show_medical" /></el-form-item>
      <el-form-item v-if="f.show_medical" label="打印哪些">
        <el-checkbox-group v-model="f.medical_fields">
          <el-checkbox value="reg_cert_no">注册证号</el-checkbox><el-checkbox value="production_license_no">生产许可证号</el-checkbox>
          <el-checkbox value="registrant">注册人</el-checkbox><el-checkbox value="production_address">生产地址</el-checkbox></el-checkbox-group>
      </el-form-item>
      <el-form-item label="打印份数"><el-input-number v-model="f.copies" :min="1" :max="3" /></el-form-item>
      <div class="form-section">排版<small>字号：正常 / 加高（字变高）/ 加大（宽高都放大，一行字数减半）</small></div>
      <el-table :data="parts" size="small" border style="margin-bottom:14px">
        <el-table-column prop="label" label="部分" width="120" />
        <el-table-column label="字号" width="230"><template #default="{row}">
          <el-radio-group v-model="f[row.k + '_size']" size="small"><el-radio-button value="s">正常</el-radio-button><el-radio-button value="m">加高</el-radio-button><el-radio-button value="l">加大</el-radio-button></el-radio-group></template></el-table-column>
        <el-table-column label="加粗" width="70"><template #default="{row}"><el-checkbox v-if="row.bold" v-model="f[row.k + '_bold']" /></template></el-table-column>
        <el-table-column label="对齐"><template #default="{row}">
          <el-radio-group v-if="row.align" v-model="f[row.align + '_align']" size="small"><el-radio-button value="left">左</el-radio-button><el-radio-button value="center">中</el-radio-button><el-radio-button value="right">右</el-radio-button></el-radio-group>
          <span v-else-if="row.alignNote" class="muted" style="font-size:12px">{{row.alignNote}}</span></template></el-table-column>
      </el-table>
      <el-form-item label="分隔线"><el-radio-group v-model="f.separator"><el-radio-button value="-">- - -</el-radio-button><el-radio-button value="=">= = =</el-radio-button><el-radio-button value="*">* * *</el-radio-button><el-radio-button value=".">· · ·</el-radio-button><el-radio-button value="_">——</el-radio-button><el-radio-button value=" ">空行</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="行距"><el-radio-group v-model="f.line_spacing"><el-radio-button value="compact">紧凑</el-radio-button><el-radio-button value="normal">正常</el-radio-button><el-radio-button value="loose">宽松</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="底部图片大小"><el-slider v-model="f.image_width" :min="20" :max="100" :step="5" style="width:260px" :format-tooltip="v => v + '% 纸宽'" /></el-form-item>
      <el-form-item label="顶部留白"><el-input-number v-model="f.top_blank" :min="0" :max="10" /> <span class="muted">&nbsp;行</span></el-form-item>
      <el-form-item label="底部走纸"><el-input-number v-model="f.bottom_blank" :min="0" :max="10" /> <span class="muted">&nbsp;行（方便撕纸）</span></el-form-item>
      <el-form-item><el-button type="primary" @click="save">保存</el-button><el-button @click="testPrint">打印测试页</el-button></el-form-item>
    </el-form>
    <div><div class="muted" style="margin-bottom:6px">预览（示例订单）</div><div class="receipt-preview"><iframe :srcdoc="html"></iframe></div></div>
  </div>`,
  setup() {
    const f = reactive({ medical_fields: [] }), html = ref(''), last = ref(null);
    const parts = [
      { k: 'title', label: '标题', bold: true, align: 'title' },
      { k: 'store', label: '门店名', bold: true, alignNote: '同标题' },
      { k: 'header', label: '抬头文字', align: 'header' },
      { k: 'info', label: '单号 / 时间等' },
      { k: 'item', label: '商品名称', bold: true },
      { k: 'medical', label: '医疗器械资料' },
      { k: 'total', label: '应收金额', bold: true },
      { k: 'footer', label: '底部文字', align: 'footer' },
    ];
    const toggles = { show_store: '门店名', show_order_no: '单号', show_time: '时间', show_area: '区域 / 位置', show_cashier: '操作员',
      show_sku: '规格', show_unit_price: '单价', show_discount: '优惠', show_payment: '收款方式', show_remark: '备注' };
    let timer = null;
    const preview = async () => { try { last.value = await api.post('/api/settings/receipt/preview', { ...f }); html.value = receiptHtml(last.value); } catch (e) { err(e); } };
    watch(f, () => { clearTimeout(timer); timer = setTimeout(preview, 300); }, { deep: true });
    const upload = async (ev) => { const file = ev.target.files[0]; if (!file) return; try { f.footer_image = (await api.upload(file)).url; } catch (e) { err(e); } ev.target.value = ''; };
    const save = async () => { try { await api.put('/api/settings/receipt', { ...f }); ok(); } catch (e) { err(e); } };
    const testPrint = () => last.value && Shouyin.printReceipt(last.value);
    onMounted(async () => { try { Object.assign(f, await api.get('/api/settings/receipt')); } catch (e) { err(e); } });
    return { f, html, toggles, parts, upload, save, testPrint };
  },
};

// ---------------- 账号与角色 ----------------
const Accounts = {
  props: ['meta'],
  template: `
  <div>
  <div class="panel">
    <div class="toolbar"><b>角色与权限</b><span class="grow"></span><el-button type="primary" @click="editRole()">新增角色</el-button></div>
    <el-table :data="roles" @row-click="editRole" row-class-name="clickable">
      <el-table-column label="角色" min-width="150"><template #default="{row}">
        <div class="c-main">{{row.name}}</div><div class="c-sub">{{row.is_admin ? '后台角色 · 可看所有门店和营收' : '门店角色'}}</div></template></el-table-column>
      <el-table-column label="权限" min-width="360"><template #default="{row}">
        <span v-for="p in row.permissions" :key="p" class="chip">{{permLabel(p)}}</span></template></el-table-column>
      <el-table-column label="优惠上限" min-width="150"><template #default="{row}">
        <div class="c-main" style="font-weight:400">{{row.min_discount_rate > 1 ? '最低 ' + row.min_discount_rate/10 + ' 折' : '折扣不限'}}</div>
        <div class="c-sub">{{row.max_adjust_amount == null ? '调低金额不限' : '单笔最多调低 ¥' + yuan(row.max_adjust_amount)}}</div></template></el-table-column>
      <el-table-column width="80" align="right"><template #default><span class="muted" style="white-space:nowrap">编辑 ›</span></template></el-table-column>
    </el-table>
  </div>
  <div class="panel">
    <div class="toolbar"><b>账号</b><span class="grow"></span><el-button type="primary" @click="editUser()">新增账号</el-button></div>
    <el-table :data="users" @row-click="editUser" row-class-name="clickable">
      <el-table-column label="账号" min-width="170"><template #default="{row}">
        <div style="display:flex;align-items:center;gap:10px"><span class="avatar">{{(row.display_name || row.username).slice(0,1)}}</span>
          <div><div class="c-main">{{row.display_name || row.username}}</div><div class="c-sub mono" style="font-size:12px">{{row.username}}</div></div></div></template></el-table-column>
      <el-table-column label="角色" min-width="110"><template #default="{row}"><span class="chip">{{row.role_name}}</span></template></el-table-column>
      <el-table-column label="门店" min-width="200"><template #default="{row}">
        <span v-if="row.is_admin" class="muted">全部门店</span>
        <template v-else><span v-for="s in row.stores" :key="s.id" class="chip">{{s.name}}</span><span v-if="!row.stores.length" style="color:var(--danger)">未分配门店</span></template></template></el-table-column>
      <el-table-column label="优惠上限" min-width="150"><template #default="{row}">
        <span v-if="row.min_discount_rate == null && row.max_adjust_amount == null" class="muted">跟随角色</span>
        <template v-else><div class="c-main" style="font-weight:400">{{row.min_discount_rate ? '最低 ' + row.min_discount_rate/10 + ' 折' : '折扣跟随角色'}}</div>
          <div class="c-sub">{{row.max_adjust_amount == null ? '调低跟随角色' : '最多调低 ¥' + yuan(row.max_adjust_amount)}}</div></template></template></el-table-column>
      <el-table-column label="状态" width="80"><template #default="{row}"><el-tag :type="row.active ? 'success' : 'info'" size="small">{{row.active ? '正常' : '停用'}}</el-tag></template></el-table-column>
      <el-table-column width="80" align="right"><template #default><span class="muted" style="white-space:nowrap">编辑 ›</span></template></el-table-column>
    </el-table>
  </div>
  <el-dialog v-model="rDlg" :title="rForm.id ? '编辑角色' : '新增角色'" width="620px">
    <el-form :model="rForm" label-width="120px">
      <el-form-item label="角色名称"><el-input v-model="rForm.name" /></el-form-item>
      <el-form-item label="类型"><el-radio-group v-model="rForm.is_admin"><el-radio :value="true">后台（可看所有门店、营收）</el-radio><el-radio :value="false">门店</el-radio></el-radio-group></el-form-item>
      <el-form-item label="权限"><el-checkbox-group v-model="rForm.permissions">
        <div v-for="p in perms" :key="p.key"><el-checkbox :value="p.key" :disabled="!rForm.is_admin && adminOnly.includes(p.key)">{{p.label}}</el-checkbox></div></el-checkbox-group></el-form-item>
      <el-form-item label="最低折扣"><el-input-number v-model="rForm.min_rate" :min="0.1" :max="10" :step="0.5" :precision="1" /> <span class="muted">&nbsp;折（10 = 不能优惠，0.1 = 不限）</span></el-form-item>
      <el-form-item label="单笔最多调低"><el-input v-model="rForm.max_adj" placeholder="留空不限" style="width:160px"><template #append>元</template></el-input></el-form-item>
    </el-form>
    <template #footer><el-button @click="rDlg=false">取消</el-button><el-button type="primary" @click="saveRole">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="uDlg" :title="uForm.id ? '编辑账号' : '新增账号'" width="560px">
    <el-form :model="uForm" label-width="120px">
      <el-form-item label="账号"><el-input v-model="uForm.username" /></el-form-item>
      <el-form-item label="姓名"><el-input v-model="uForm.display_name" /></el-form-item>
      <el-form-item :label="uForm.id ? '重置密码' : '密码'"><el-input v-model="uForm.password" type="password" show-password :placeholder="uForm.id ? '留空不修改' : '至少 6 位'" /></el-form-item>
      <el-form-item label="角色"><el-select v-model="uForm.role_id"><el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" /></el-select></el-form-item>
      <el-form-item label="可操作门店"><el-checkbox-group v-model="uForm.store_ids"><el-checkbox v-for="s in meta.stores" :key="s.id" :value="s.id">{{s.name}}</el-checkbox></el-checkbox-group></el-form-item>
      <el-form-item label="最低折扣"><el-input v-model="uForm.min_rate" placeholder="留空同角色" style="width:160px"><template #append>折</template></el-input></el-form-item>
      <el-form-item label="单笔最多调低"><el-input v-model="uForm.max_adj" placeholder="留空同角色" style="width:160px"><template #append>元</template></el-input></el-form-item>
      <el-form-item label="启用"><el-switch v-model="uForm.active" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="uDlg=false">取消</el-button><el-button type="primary" @click="saveUser">保存</el-button></template>
  </el-dialog>
  </div>`,
  setup() {
    const roles = ref([]), users = ref([]), perms = ref([]), rDlg = ref(false), uDlg = ref(false), rForm = reactive({}), uForm = reactive({});
    const adminOnly = ['catalog', 'inventory', 'stores', 'users', 'receipt_config', 'reports'];
    const permLabel = (k) => (perms.value.find(p => p.key === k) || { label: k }).label.split('：')[0].split('（')[0];
    const load = async () => { try { [roles.value, users.value, perms.value] = await Promise.all([api.get('/api/roles'), api.get('/api/users'), api.get('/api/permissions')]); } catch (e) { err(e); } };
    const editRole = (r) => {
      Object.keys(rForm).forEach(k => delete rForm[k]);
      Object.assign(rForm, r ? { ...r, permissions: [...r.permissions] } : { name: '', is_admin: false, permissions: [], min_discount_rate: 1, max_adjust_amount: null });
      rForm.min_rate = (rForm.min_discount_rate || 1) / 10; rForm.max_adj = rForm.max_adjust_amount == null ? '' : yuan(rForm.max_adjust_amount);
      rDlg.value = true;
    };
    const saveRole = async () => {
      if (!String(rForm.name || '').trim()) return ElMessage.warning('请填写角色名称');
      // 折扣和调低上限：填错不能悄悄变成“不限”
      const rate = Math.round(parseFloat(rForm.min_rate) * 10);
      if (!isFinite(rate) || rate < 1 || rate > 100) return ElMessage.warning('最低折扣请填 0.1 到 10 之间的数（0.1 表示不限）');
      const adj = blank(rForm.max_adj) ? null : money(rForm.max_adj);
      if (!blank(rForm.max_adj) && adj === null) return ElMessage.warning('单笔最多调低请填金额，或留空表示不限');
      const body = { name: rForm.name, is_admin: rForm.is_admin, permissions: rForm.is_admin ? rForm.permissions : rForm.permissions.filter(p => !adminOnly.includes(p)),
        min_discount_rate: rate, max_adjust_amount: adj };
      try { rForm.id ? await api.put('/api/roles/' + rForm.id, body) : await api.post('/api/roles', body); ok(); rDlg.value = false; load(); } catch (e) { err(e); }
    };
    const editUser = (u) => {
      Object.keys(uForm).forEach(k => delete uForm[k]);
      Object.assign(uForm, u ? { id: u.id, username: u.username, display_name: u.display_name, role_id: u.role_id, store_ids: u.stores.map(s => s.id), active: u.active,
        min_rate: u.min_discount_rate ? u.min_discount_rate / 10 : '', max_adj: u.max_adjust_amount == null ? '' : yuan(u.max_adjust_amount) }
        : { username: '', display_name: '', role_id: (roles.value.find(r => !r.is_admin) || {}).id, store_ids: [], active: true, min_rate: '', max_adj: '' });
      uForm.password = ''; uDlg.value = true;
    };
    const saveUser = async () => {
      if (!String(uForm.username || '').trim()) return ElMessage.warning('请填写账号');
      let rate = null, adj = null;
      if (!blank(uForm.min_rate)) {
        rate = Math.round(parseFloat(uForm.min_rate) * 10);
        if (!/^\d+(\.\d)?$/.test(String(uForm.min_rate).trim()) || rate < 1 || rate > 100) return ElMessage.warning('最低折扣请填 0.1 到 10 之间的数，或留空表示同角色');
      }
      if (!blank(uForm.max_adj)) { adj = money(uForm.max_adj); if (adj === null) return ElMessage.warning('单笔最多调低请填金额，或留空表示同角色'); }
      const body = { username: uForm.username, display_name: uForm.display_name, role_id: uForm.role_id, store_ids: uForm.store_ids, active: uForm.active,
        password: uForm.password || null, min_discount_rate: rate, max_adjust_amount: adj };
      try { uForm.id ? await api.put('/api/users/' + uForm.id, body) : await api.post('/api/users', body); ok(); uDlg.value = false; load(); } catch (e) { err(e); }
    };
    onMounted(load);
    return { roles, users, perms, rDlg, uDlg, rForm, uForm, adminOnly, permLabel, editRole, saveRole, editUser, saveUser, yuan };
  },
};

// ---------------- 业务规则 ----------------
const Rules = {
  template: `
  <div class="panel">
    <el-form :model="f" label-width="200px" style="max-width:640px">
      <el-form-item label="小程序订单扣库存时机"><el-radio-group v-model="f.online_deduct_on"><el-radio value="create">下单时</el-radio><el-radio value="accept">接单时</el-radio></el-radio-group></el-form-item>
      <el-form-item label="门店收银库存不够也能卖"><el-switch v-model="f.pos_allow_negative" /></el-form-item>
      <el-form-item label="小程序库存不够也能下单"><el-switch v-model="f.online_allow_negative" /></el-form-item>
      <el-form-item label="区域叫法"><el-input v-model="f.area_label" placeholder="如：病区、楼层" /></el-form-item>
      <el-form-item label="位置叫法"><el-input v-model="f.location_label" placeholder="如：床号、桌号" /></el-form-item>
      <el-form-item label="小程序下单必须填位置"><el-switch v-model="f.online_location_required" /></el-form-item>
      <el-form-item label="顾客访问网址"><el-input v-model="f.public_url" placeholder="如 https://shop.example.com，上线后填正式域名" />
        <div class="hint" style="margin-top:2px">区域二维码用这个网址生成。留空时用当前打开后台的地址，那样生成的码顾客在外面扫不开。</div></el-form-item>
      <el-form-item><el-button type="primary" @click="save">保存</el-button></el-form-item>
    </el-form>
  </div>`,
  setup() {
    const f = reactive({});
    onMounted(async () => { try { Object.assign(f, await api.get('/api/settings/rules')); } catch (e) { err(e); } });
    const save = async () => { try { await api.put('/api/settings/rules', { ...f }); ok(); } catch (e) { err(e); } };
    return { f, save };
  },
};

// ---------------- 经营概览 ----------------
const Dashboard = {
  props: ['meta', 'go'],
  template: `
  <div>
    <div class="stats">
      <div class="stat accent"><div class="k">今日实收</div><div class="v">¥{{yuan(t.net)}}</div><div class="s">收款 ¥{{yuan(t.received)}} · 退款 ¥{{yuan(t.refunded)}}</div></div>
      <div class="stat"><div class="k">今日单数</div><div class="v">{{t.orders || 0}}</div><div class="s">门店收银 {{t.pos_orders || 0}} · 小程序 {{t.online_orders || 0}}</div></div>
      <div class="stat"><div class="k">待接单</div><div class="v" :style="pending ? 'color:#dc2626' : ''">{{pending}}</div><div class="s">各门店小程序订单</div></div>
      <div class="stat"><div class="k">本月实收</div><div class="v">¥{{yuan(m.net)}}</div><div class="s">毛利 ¥{{yuan(m.profit)}}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px">
      <div class="panel">
        <div class="panel-title">今日各门店</div><div class="panel-desc">按收款时间统计，退款已扣除</div>
        <el-table :data="byStore" size="small">
          <el-table-column prop="store_name" label="门店" />
          <el-table-column prop="orders" label="单数" width="80" />
          <el-table-column label="优惠" width="100" class-name="right"><template #default="{row}">{{yuan(row.discount)}}</template></el-table-column>
          <el-table-column label="实收" width="110" class-name="right"><template #default="{row}"><b>{{yuan(row.net)}}</b></template></el-table-column>
        </el-table>
        <el-empty v-if="!byStore.length" :image-size="60" description="今天还没有收款" />
      </div>
      <div class="panel">
        <div class="panel-title">常用</div><div class="panel-desc">&nbsp;</div>
        <div class="quick">
          <div class="q" @click="go('products')"><b>新增商品</b><span>规格、库存品、扣减量</span></div>
          <div class="q" @click="go('inventory')"><b>调拨到门店</b><span>仓库每日出库</span></div>
          <div class="q" @click="go('revenue')"><b>营收报表</b><span>日报 / 周报 / 月报</span></div>
          <div class="q" @click="go('stores')"><b>区域二维码</b><span>打印贴到区域</span></div>
        </div>
      </div>
    </div>
    <div v-if="alerts !== null" class="panel" style="margin-top:16px">
      <div class="panel-title">库存预警 <span v-if="alerts.length" style="color:var(--danger)">{{alerts.length}}</span></div>
      <div class="panel-desc">库存小于等于预警量的库存品；预警量在“库存品”里设置</div>
      <el-table v-if="alerts.length" :data="alerts.slice(0, 20)" size="small">
        <el-table-column prop="location_name" label="仓库 / 门店" width="160" />
        <el-table-column prop="name" label="库存品" />
        <el-table-column label="现有" width="90" align="right"><template #default="{row}"><b style="color:var(--danger)">{{row.qty}}</b> {{row.unit}}</template></el-table-column>
        <el-table-column prop="alert_qty" label="预警量" width="80" align="right" />
      </el-table>
      <div v-if="alerts.length > 20" class="muted" style="margin-top:6px">还有 {{alerts.length - 20}} 条，到“仓库与库存”里查看</div>
      <el-empty v-if="!alerts.length" :image-size="50" description="没有低于预警量的库存品" />
    </div>
  </div>`,
  setup() {
    const t = ref({}), m = ref({}), pending = ref(0), byStore = ref([]), alerts = ref(null);
    onMounted(async () => {
      const d = today();
      try {
        const [a, b, p] = await Promise.all([api.get('/api/reports/revenue', { begin: d, end: d }),
          api.get('/api/reports/revenue', { begin: d.slice(0, 8) + '01', end: d, group: 'month' }), api.get('/api/orders', { status: 'pending', size: 1 })]);
        t.value = a.total; m.value = b.total; pending.value = p.total; byStore.value = a.rows;
      } catch (e) { err(e); }
      try { alerts.value = await api.get('/api/stock-alerts'); } catch (e) { alerts.value = null; }  // 没有库存权限的账号不显示
    });
    return { t, m, pending, byStore, alerts, yuan };
  },
};

// ---------------- 主框架 ----------------
// [键, 名称, 权限, 组件, 分组, 图标, 说明]
const MENU = [
  ['dashboard', '经营概览', 'reports', Dashboard, '经营', 'home', '今天和本月的营收、待处理订单'],
  ['orders', '订单', 'reports', Orders, '经营', 'receipt', '所有门店的收银单和小程序订单'],
  ['revenue', '营收报表', 'reports', Revenue, '经营', 'chart', '按门店、日 / 周 / 月统计，可导出'],
  ['productSales', '商品销售核对', 'reports', ProductSales, '经营', 'check', '按商品或按分类查卖了多少，展开看逐单明细'],
  ['products', '商品', 'catalog', Products, '商品资料', 'package', '名称、规格、售价、图片、医疗器械资料'],
  ['categories', '商品分类', 'catalog', Categories, '商品资料', 'tag', '大类、小类'],
  ['stockItems', '库存品', 'catalog', StockItems, '商品资料', 'layers', '实际占库存的东西，多个规格可共用'],
  ['suppliers', '供应商', 'catalog', Suppliers, '商品资料', 'truck', ''],
  ['inventory', '仓库与库存', 'inventory', Inventory, '库存', 'warehouse', '入库、出库、调拨到门店、盘点、台账'],
  ['stores', '门店与区域', 'stores', Stores, '门店', 'store', '门店设置、区域二维码、出票方式'],
  ['receipt', '小票设置', 'receipt_config', ReceiptSettings, '门店', 'printer', '小票文字、字段、排版、底部图片'],
  ['rules', '业务规则', 'stores', Rules, '门店', 'sliders', '扣库存时机、库存不够能否卖'],
  ['accounts', '账号与权限', 'users', Accounts, '系统', 'users', '角色权限、优惠上限、门店分配'],
];

const App = {
  components: Object.fromEntries(MENU.map(m => [m[0], m[3]])),
  template: `
  <div v-if="!user" class="login-wrap">
    <div class="login-hero">
      <div class="logo"><span class="mark">收</span>收银系统</div>
      <div><h2>多门店收银与库存<br>一套数据，各端共用</h2>
        <ul><li>商品规格共用库存，按扣减量自动扣</li><li>仓库每日调拨到门店，台账随时核对</li><li>扫区域二维码点单，门店自动出票</li><li>营收、优惠、退款一目了然</li></ul></div>
      <div class="foot">后台管理 · 仅限授权人员</div>
    </div>
    <div class="login-side"><div class="login-card">
      <h1>登录后台</h1><p>商品、库存、门店、账号和营收管理</p>
      <el-input v-model="lf.username" placeholder="账号" size="large" />
      <el-input v-model="lf.password" type="password" placeholder="密码" size="large" show-password @keyup.enter="login" />
      <el-button type="primary" size="large" style="width:100%;margin-top:6px" :loading="busy" @click="login">登录</el-button>
      <div class="switch">门店员工请使用 <a href="/web/store/">门店工作台</a></div>
    </div></div>
  </div>
  <div v-else-if="!menu.length" class="login-wrap"><div class="login-side" style="width:100%"><div class="login-card" style="text-align:center">
    <h1>这是门店账号</h1><p>{{user.display_name || user.username}} 没有后台权限，请到门店工作台收银和处理订单。</p>
    <el-button type="primary" size="large" @click="toStore">进入门店工作台</el-button>
    <div class="switch"><el-button link @click="logout">换个账号登录</el-button></div></div></div></div>
  <div v-else class="layout">
    <div class="aside">
      <div class="brand"><span class="mark">收</span><div>收银系统<small>后台管理</small></div></div>
      <div class="nav">
        <template v-for="g in groups" :key="g">
          <div class="group">{{g}}</div>
          <div v-for="m in menu.filter(x => x[4] === g)" :key="m[0]" class="item" :class="{on: tab === m[0]}" @click="tab = m[0]"><span class="ico" v-html="icon(m[5])"></span>{{m[1]}}</div>
        </template>
      </div>
    </div>
    <div class="main">
      <div class="topbar">
        <div class="title">{{cur[1]}}<small>{{cur[6]}}</small></div>
        <div class="who"><a class="pill" href="/web/store/"><span class="ico" v-html="icon('cart')"></span>门店工作台</a>
          <el-dropdown @command="c => c === 'pw' ? changePw() : logout()">
            <span style="display:flex;align-items:center;gap:8px;cursor:pointer"><span class="avatar">{{(user.display_name || user.username).slice(0,1)}}</span>{{user.display_name || user.username}}</span>
            <template #dropdown><el-dropdown-menu><el-dropdown-item disabled>{{user.role_name}}</el-dropdown-item><el-dropdown-item command="pw">修改密码</el-dropdown-item><el-dropdown-item command="out" divided>退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown></div>
      </div>
      <div class="content">
        <component v-if="ready" :is="tab" :meta="meta" v-bind="tab === 'dashboard' ? {go: k => tab = k} : {}" :key="tab" />
      </div>
    </div>
  </div>`,
  setup() {
    const user = ref(null), lf = reactive({ username: '', password: '' }), busy = ref(false), tab = ref('dashboard'), ready = ref(false);
    const meta = reactive({ categories: [], suppliers: [], stockItems: [], stores: [], areas: [] });
    const menu = computed(() => user.value ? MENU.filter(m => user.value.is_admin && user.value.permissions.includes(m[2])) : []);
    const groups = computed(() => [...new Set(menu.value.map(m => m[4]))]);
    const cur = computed(() => menu.value.find(m => m[0] === tab.value) || []);
    const toStore = () => { location.href = '/web/store/'; };
    const loadMeta = async () => {
      const p = user.value.permissions, safe = (f) => f.catch(() => []);
      [meta.categories, meta.suppliers, meta.stockItems, meta.stores, meta.areas] = await Promise.all([
        safe(api.get('/api/categories')), p.includes('catalog') ? safe(api.get('/api/suppliers')) : [],
        p.includes('catalog') || p.includes('inventory') ? safe(api.get('/api/stock-items')).then(r => r.filter(x => x.active)) : [], safe(api.get('/api/stores')),
        safe(api.get('/api/areas'))]);
      if (menu.value.length && !menu.value.find(m => m[0] === tab.value)) tab.value = menu.value[0][0];
      ready.value = true;
    };
    const login = async () => {
      busy.value = true;
      try { const r = await api.post('/api/auth/login', lf); api.setToken(r.token); user.value = r.user; await loadMeta(); } catch (e) { err(e); } finally { busy.value = false; }
    };
    const logout = () => { api.setToken(''); user.value = null; ready.value = false; };
    const changePw = async () => {
      let o, n;
      try { ({ value: o } = await ElMessageBox.prompt('原密码', '修改密码', { inputType: 'password' })); ({ value: n } = await ElMessageBox.prompt('新密码（至少 6 位）', '修改密码', { inputType: 'password' })); } catch (e) { return; }
      try { const r = await api.post('/api/auth/password', { old_password: o, new_password: n }); api.setToken(r.token); ok('密码已修改'); } catch (e) { err(e); }
    };
    window.onUnauthorized = () => { user.value = null; ready.value = false; };
    onMounted(async () => { if (api.token()) { try { user.value = await api.get('/api/auth/me'); await loadMeta(); } catch (e) {} } });
    return { user, lf, busy, tab, menu, groups, cur, meta, ready, login, logout, changePw, toStore, icon: Shouyin.icon };
  },
};

createApp(App).use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount('#app');
