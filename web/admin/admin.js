// 后台管理
const { createApp, ref, reactive, computed, onMounted, watch } = Vue;
const { api, yuan, toFen, rid, today, receiptHtml } = Shouyin;
const { ElMessage, ElMessageBox } = ElementPlus;

const money = Shouyin.parseMoney;  // 手填金额 → 分；不是合法数字返回 null
const blank = (v) => String(v == null ? '' : v).trim() === '';
const err = (e) => ElMessage.error(e.message || String(e));
const daysAgo = (n) => { const d = new Date(Date.now() - n * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const ok = (m) => ElMessage.success(m || '已保存');

// 图片框：从电脑里把图片拖进来、点一下选文件、或复制图片后在框上按 Ctrl+V，都能上传
const ImageDrop = {
  props: { modelValue: String, size: { type: Number, default: 96 }, hint: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template: `
  <div class="img-drop" :class="{over, has: !!modelValue, busy}" :style="{width: size + 'px', height: size + 'px'}" tabindex="0"
    :title="(modelValue ? '拖入新图片替换，' : '') + '可拖入图片、点击选择或 Ctrl+V 粘贴'"
    @click="pick" @dragenter.prevent="over = true" @dragover.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="drop" @paste="paste">
    <img v-if="modelValue" :src="modelValue">
    <div v-else class="tip"><b>＋</b><span v-if="size >= 80">{{hint || '拖入图片'}}<br>或点击选择</span></div>
    <div v-if="busy" class="mask">上传中…</div>
    <button v-if="modelValue && !busy" type="button" class="rm" title="移除图片" @click.stop="$emit('update:modelValue', '')">×</button>
    <input ref="file" type="file" accept="image/*" hidden @change="choose">
  </div>`,
  setup(props, { emit }) {
    const over = ref(false), busy = ref(false), file = ref(null);
    const send = async (f) => {
      over.value = false;
      if (!f) return;
      if (!/^image\//.test(f.type)) return ElMessage.warning('请拖入图片文件（jpg、png、gif、webp）');
      busy.value = true;
      try { emit('update:modelValue', (await api.upload(f)).url); } catch (e) { err(e); } finally { busy.value = false; }
    };
    const pick = () => { if (!busy.value) file.value.click(); };
    const choose = (ev) => { send(ev.target.files[0]); ev.target.value = ''; };
    const drop = (ev) => send(Array.from(ev.dataTransfer.files || []).find(f => /^image\//.test(f.type)) || (ev.dataTransfer.files || [])[0]);
    const paste = (ev) => { const it = Array.from(ev.clipboardData.items || []).find(i => i.type.startsWith('image/')); if (it) { ev.preventDefault(); send(it.getAsFile()); } };
    return { over, busy, file, pick, choose, drop, paste };
  },
};

// ---------------- 商品 ----------------
const Products = {
  props: ['meta'],
  components: { ImageDrop },
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-input v-model="kw" placeholder="名称 / 助记码 / 货号 / 条码" clearable style="width:220px" @keyup.enter="load" />
      <el-select v-model="cat" placeholder="全部分类" clearable style="width:160px" @change="load">
        <el-option v-for="c in meta.categories" :key="c.id" :label="catLabel(c)" :value="c.id" />
      </el-select>
      <el-checkbox v-model="showOff" @change="load">显示已下架</el-checkbox>
      <el-checkbox v-model="showDeduct">显示扣库存</el-checkbox>
      <el-button @click="load">查询</el-button>
      <el-button @click="exp">导出</el-button>
      <span class="grow"></span>
      <el-button type="primary" @click="edit()">＋ 新增商品</el-button>
    </div>
    <div class="muted" style="margin:-2px 0 12px">共 <b style="color:var(--text)">{{rows.length}}</b> 个商品 · 在售 {{rows.filter(r => r.active).length}} · 仅门店 {{rows.filter(r => r.active && !r.online_visible).length}}</div>
    <el-table :data="rows" @row-click="edit" row-class-name="clickable" class="prod-table">
      <el-table-column label="商品" min-width="220"><template #default="{row}">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="thumb"><img v-if="row.image" :src="thumb(row.image, 160)" loading="lazy"><span v-else>{{row.name.slice(0,1)}}</span></div>
          <div style="min-width:0"><div class="c-main">{{row.name}}</div>
            <div class="c-sub">{{[row.code && '货号 ' + row.code, row.mnemonic && '助记码 ' + row.mnemonic, row.supplier_name].filter(Boolean).join(' · ') || '—'}}</div></div>
        </div></template></el-table-column>
      <el-table-column label="分类" min-width="110"><template #default="{row}">
        <span v-for="n in (row.category_name || '').split('、').filter(Boolean)" :key="n" class="chip">{{n}}</span>
        <span v-if="!row.category_name" class="muted">未分类</span></template></el-table-column>
      <el-table-column label="规格与售价" min-width="340"><template #default="{row}">
        <div v-if="showDeduct" class="spec-lines"><div v-for="s in row.skus.filter(x => x.active)" :key="s.id">{{s.name === '默认' ? '' : s.name}} <b>¥{{yuan(s.price)}}</b>
          <span class="muted">{{ s.stock_item_name ? '扣 ' + s.stock_item_name + ' ×' + s.deduct_qty : '不扣库存' }}</span></div></div>
        <div v-else class="skus"><span v-for="s in row.skus.filter(x => x.active)" :key="s.id" class="sku-chip" :class="{nostock: !s.stock_item_id}"
          :title="s.stock_item_name ? '扣 ' + s.stock_item_name + ' −' + s.deduct_qty : '不扣库存'">{{s.name === '默认' ? '' : s.name + ' '}}<b>¥{{yuan(s.price)}}</b></span></div></template></el-table-column>
      <el-table-column label="扫码点单" min-width="100"><template #default="{row}">
        <el-tag v-if="!row.online_visible" type="info">不显示</el-tag>
        <template v-else>
          <el-tag>显示</el-tag>
          <div class="c-sub">{{qtyText(row)}}</div>
          <div class="c-sub" style="margin:0" v-if="row.area_limited">仅 {{row.area_ids.length}} 个区域</div></template></template></el-table-column>
      <el-table-column label="状态" width="76"><template #default="{row}">
        <el-tag v-if="!row.active" type="info" size="small">已下架</el-tag>
        <el-tag v-else-if="!row.online_visible" type="warning" size="small">仅门店</el-tag>
        <el-tag v-else type="success" size="small">在售</el-tag></template></el-table-column>
      <el-table-column width="64" align="right"><template #default><a style="white-space:nowrap">编辑 ›</a></template></el-table-column>
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
          <image-drop v-model="form.image" :size="110" hint="拖入商品图片" />
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>

        <div class="form-section">规格（每个规格可以绑定库存品和扣减量，不同商品可以绑定同一个库存品；图片可拖进格子，不传就用商品图片）</div>
        <el-table :data="form.skus" border size="small">
          <el-table-column label="图片" width="76"><template #default="{row}"><image-drop v-model="row.image" :size="52" style="margin:0 auto" /></template></el-table-column>
          <el-table-column label="规格名称" min-width="110"><template #default="{row}"><el-input v-model="row.name" size="small" /></template></el-table-column>
          <el-table-column label="条码" min-width="120"><template #default="{row}"><el-input v-model="row.barcode" size="small" /></template></el-table-column>
          <el-table-column label="售价（元）" width="96"><template #default="{row}"><el-input v-model="row.price_y" size="small" /></template></el-table-column>
          <el-table-column label="成本（元）" width="96"><template #default="{row}"><el-input v-model="row.cost_y" size="small" placeholder="按库存品" /></template></el-table-column>
          <el-table-column label="库存品" min-width="150"><template #default="{row}">
            <el-select v-model="row.stock_item_id" size="small" clearable filterable placeholder="不扣库存">
              <el-option v-for="i in meta.stockItems" :key="i.id" :label="i.name + '（' + i.unit + '）'" :value="i.id" /></el-select></template></el-table-column>
          <el-table-column label="扣减量" width="76"><template #default="{row}"><el-input v-model="row.deduct_qty" size="small" /></template></el-table-column>
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

        <div class="form-section">扫码点单</div>
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
    // 扣库存一栏默认收起（每个规格一行太占地方），勾选后在本机记住；规格标签悬停也能看到扣哪个库存品
    const showDeduct = ref((() => { try { return localStorage.getItem('admin.showDeduct') === '1'; } catch (e) { return false; } })());
    watch(showDeduct, v => { try { localStorage.setItem('admin.showDeduct', v ? '1' : '0'); } catch (e) {} });
    const form = reactive({});
    const catLabel = (c) => { const p = props.meta.categories.find(x => x.id === c.parent_id); return p ? p.name + ' / ' + c.name : c.name; };
    const load = async () => { try { rows.value = await api.get('/api/products', { keyword: kw.value, category_id: cat.value, include_inactive: showOff.value }); } catch (e) { err(e); } };
    const blankSku = () => ({ name: '默认', barcode: '', price_y: '', cost_y: '', stock_item_id: null, deduct_qty: 1, image: '', active: true });
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
        const d = /^\d+(\.\d{1,3})?$/.test(String(s.deduct_qty).trim()) ? parseFloat(s.deduct_qty) : NaN;  // "1abc"、"1e3" 这类不收
        if (!isFinite(d) || d <= 0) return ElMessage.warning(label + '的扣减量请填大于 0 的数字，最多三位小数');
      }
      const qtyOf = (v) => blank(v) ? null : (/^\d+$/.test(String(v).trim()) && +v >= 1 ? +v : NaN);
      const minQ = qtyOf(form.min_qty), maxQ = qtyOf(form.max_qty);
      if (Number.isNaN(minQ) || Number.isNaN(maxQ)) return ElMessage.warning('起订量、限购量请填正整数，或留空表示不限');
      if (minQ && maxQ && minQ > maxQ) return ElMessage.warning('起订量不能大于限购量');
      if (form.area_limited && !form.area_ids.length) return ElMessage.warning('选了“只在指定区域”，请至少选一个区域');
      if (zero) { try { await ElMessageBox.confirm('有规格的售价是 0 元，确定要保存吗？', '售价为 0', { type: 'warning' }); } catch (e) { return; } }
      const body = { ...form, min_qty: minQ, max_qty: maxQ, category_id: (form.category_ids || [])[0] || null, skus: form.skus.map((s, i) => ({ id: s.id, name: s.name, barcode: s.barcode || '', price: money(s.price_y),
        cost: blank(s.cost_y) ? null : money(s.cost_y), stock_item_id: s.stock_item_id || null,
        deduct_qty: parseFloat(s.deduct_qty), image: s.image || '', active: s.active, sort: i })) };
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
    return { exp, rows, kw, cat, showOff, showDeduct, dlg, form, saving, load, edit, addSku, save, catLabel, qtyText, yuan };
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
        fields.forEach(f => { form[f.prop] = row ? row[f.prop] : (f.default !== undefined ? f.default : (f.type === 'bool' ? true : '')); if (f.type === 'money' && row) form[f.prop] = row[f.prop] == null ? '' : yuan(row[f.prop]); if (f.type === 'qty' && form[f.prop] == null) form[f.prop] = ''; });
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
  title: '分类', url: '/api/categories',
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
  title: '库存品', url: '/api/stock-items',
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
    <div class="toolbar"><b>区域与二维码</b><span class="grow"></span><el-button type="primary" @click="editArea()">新增区域</el-button></div>
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
      <el-form-item label="不限数量"><el-switch v-model="aForm.no_qty_limit" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="aDlg=false">取消</el-button><el-button type="primary" @click="saveArea">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="rDlg" :title="rArea.store_name + ' · ' + rArea.name + ' 点单规则'" width="820px" top="5vh">
    <div class="hint" style="margin:0 0 12px">留空用商品自己的设置，填 0 不限。
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
// 同一块内容：独立菜单页里直接铺在页面上，其他地方弹窗打开
const DlgPage = {
  props: { modelValue: Boolean, inline: Boolean, title: String, width: String, top: String },
  emits: ['update:modelValue'],
  template: `
  <div v-if="inline" class="panel">
    <div v-if="title" class="panel-title" style="margin-bottom:14px">{{title}}</div>
    <slot />
    <div v-if="$slots.footer" class="page-foot"><slot name="footer" /></div>
  </div>
  <el-dialog v-else :model-value="modelValue" @update:model-value="v => $emit('update:modelValue', v)" :title="title" :width="width" :top="top">
    <slot /><template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </el-dialog>`,
};
// 库存相关的几个菜单页共用一个组件，view 决定显示哪一块
const Inventory = {
  props: { meta: Object, go: Function, view: { type: String, default: 'inventory' } },
  components: { DlgPage },
  template: `
  <div>
  <div v-if="view === 'inventory'" class="panel" style="padding-bottom:0">
    <div class="toolbar" style="margin-bottom:6px"><span class="muted">地点</span><span class="grow"></span>
      <el-button type="primary" @click="go('stockIn')">入库</el-button><el-button @click="go('stockIn', 'out')">出库</el-button>
      <el-button @click="go('stockCount')">盘点</el-button><el-button @click="go('requests')">调拨到门店<span v-if="reqPending" class="badge-n">{{reqPending}}</span></el-button></div>
    <div class="segs" style="margin-bottom:0;border-bottom:0">
      <div v-for="l in locations" :key="l.id" class="seg" :class="{on: loc === l.id}" @click="loc = l.id; load()">
        {{l.name}}<span class="n">{{l.kind_text}}</span></div>
      <span class="seg" style="color:var(--primary)" @click="newWarehouse">＋ 新增仓库</span>
    </div>
  </div>
  <template v-if="view === 'inventory'">
    <div class="stats">
      <div class="stat"><div class="k">库存品</div><div class="v">{{rows.length}}</div><div class="s">本地点有记录的</div></div>
      <div class="stat"><div class="k">期间入库 + 调入</div><div class="v">{{fmtN(sumOf('in') + sumOf('transfer_in'))}}</div></div>
      <div class="stat"><div class="k">期间销售</div><div class="v">{{fmtN(sumOf('sale') - sumOf('sale_return'))}}</div><div class="s">已扣除退货回补</div></div>
      <div class="stat"><div class="k">库存为 0 或负数</div><div class="v" :style="lowCount ? 'color:var(--danger)' : ''">{{lowCount}}</div><div class="s">需要补货或核对</div></div>
      <div class="stat clickable" @click="onlyLow = !onlyLow"><div class="k">低于预警量</div><div class="v" :style="alertCount ? 'color:var(--warn)' : ''">{{alertCount}}</div><div class="s">{{ onlyLow ? '只看预警中 · 点击看全部' : '在“库存品”里设预警量 · 点击只看这些' }}</div></div>
    </div>
    <div class="panel">
    <div class="toolbar">
      <el-input v-model="kw" placeholder="搜索名称或编码" clearable style="width:200px" />
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:250px" @change="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="expLedger">导出</el-button>
      <span class="grow"></span>
      <span class="link-more" @click="go('docs')">单据与台账 ›</span>
    </div>
    <el-table :data="shownRows" show-summary :summary-method="summary" :row-class-name="({row}) => row.current <= 0 || row.low ? 'row-low' : ''">
      <el-table-column label="库存品" min-width="150" fixed><template #default="{row}"><div class="c-main">{{row.name}}<el-tag v-if="row.low" type="danger" size="small" style="margin-left:6px">低于预警 {{row.alert_qty}}</el-tag><el-tag v-if="nearExp(row.earliest_expiry)" type="warning" size="small" style="margin-left:6px">{{ expText(row.earliest_expiry) }}</el-tag></div><div class="c-sub">{{row.unit}}<span v-if="row.earliest_expiry"> · 最早到期 {{row.earliest_expiry}}</span></div></template></el-table-column>
      <el-table-column v-for="c in cols" :key="c[0]" :label="c[1]" min-width="78" align="right">
        <template #default="{row}"><span v-if="!row[c[0]]" class="zero">–</span>
          <el-button v-else link :class="{strong: c[0] === 'closing'}" @click="showMoves(row)">{{fmtN(row[c[0]])}}</el-button></template></el-table-column>
      <el-table-column label="当前库存" min-width="96" align="right" fixed="right"><template #default="{row}">
        <b class="money" :style="row.current <= 0 ? 'color:var(--danger)' : ''">{{fmtN(row.current)}}</b></template></el-table-column>
    </el-table>
    <div class="muted" style="margin-top:10px;font-size:12px">期初 = 开始日之前的累计；结余 = 期初 + 入库 − 出库 + 调入 − 调出 − 销售 + 退货回补 ± 盘点。</div>
    </div>
  </template>

    <dlg-page v-model="dDlg" :inline="docInline" :title="docInline ? '' : docTitle" :width="doc.kind==='in' ? '1180px' : '720px'" top="4vh">
      <div v-if="view === 'stockIn'" class="toolbar"><div class="segs mini"><div class="seg" :class="{on: doc.kind === 'in'}" @click="openDoc('in')">入库</div><div class="seg" :class="{on: doc.kind === 'out'}" @click="openDoc('out')">出库</div></div></div>
      <el-form label-width="80px" inline>
        <el-form-item v-if="doc.kind==='out' || doc.kind==='transfer'" label="调出"><el-select v-model="doc.from" style="width:170px"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind!=='out'" :label="doc.kind==='transfer' ? '调入' : (doc.kind==='adjust' ? '盘点地点' : '入库到')"><el-select v-model="doc.to" style="width:170px"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind==='out'" label="出库原因"><el-select v-model="doc.reason" clearable placeholder="选填" style="width:170px"><el-option v-for="r in outReasons" :key="r" :label="r" :value="r" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind==='in' || (doc.kind==='out' && doc.reason==='退供应商')" label="供应商"><el-select v-model="doc.supplier_id" clearable filterable style="width:170px"><el-option v-for="s in meta.suppliers" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="doc.remark" style="width:170px" /></el-form-item>
      </el-form>
      <div class="muted" style="margin-bottom:6px">{{ doc.kind==='adjust' ? '留空表示不盘该项。' : '留空或 0 表示不处理。' }}</div>
      <div class="toolbar" style="margin-bottom:6px">
        <el-input ref="dqInput" v-model="dq" placeholder="搜索名称或编码，空格分隔多个词" clearable style="width:280px" @keyup.enter="dqEnter" />
        <el-checkbox v-model="dFilled">只看已填（{{ filledCount }}）</el-checkbox>
        <span class="grow"></span>
        <span class="muted">共 {{ docMatched.length }} 项</span>
      </div>
      <el-table ref="dTable" v-loading="dLoading" :data="docShown" border size="small" max-height="420" row-key="key">
        <el-table-column prop="name" label="库存品" />
        <el-table-column prop="unit" label="单位" width="60" />
        <el-table-column label="来源现有" width="90"><template #default="{row}">{{ stockAt(doc.kind==='in' || doc.kind==='adjust' ? doc.to : doc.from, row.id) }}</template></el-table-column>
        <el-table-column :label="doc.kind==='adjust' ? '实盘数' : '数量'" width="110"><template #default="{row}"><el-input v-model="row.qty" size="small" /></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" label="批号" width="110"><template #default="{row}"><el-input v-model="row.batch_no" size="small" /></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" label="生产日期" width="140"><template #default="{row}"><el-date-picker v-model="row.production_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:124px" placeholder="选填" /></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" label="有效期至" width="140"><template #default="{row}"><el-date-picker v-model="row.expiry_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:124px" placeholder="选填" /></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" width="64"><template #default="{row, $index}"><el-button link size="small" @click="splitLine(row)">+批次</el-button></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" label="进价（元）" width="110"><template #default="{row}"><el-input v-model="row.price" size="small" /></template></el-table-column>
        <el-table-column v-if="doc.kind==='in'" label="金额" width="90" align="right"><template #default="{row}">{{ lineAmt(row) == null ? '' : yuan(lineAmt(row)) }}</template></el-table-column>
        <el-table-column v-if="doc.kind==='adjust'" label="盈亏" width="80" align="right"><template #default="{row}"><span v-if="diffOf(row) != null" :style="{color: diffOf(row) < 0 ? 'var(--danger)' : (diffOf(row) > 0 ? 'var(--success, #16a34a)' : '')}">{{ diffOf(row) > 0 ? '+' : '' }}{{ diffOf(row) }}</span></template></el-table-column>
      </el-table>
      <el-pagination v-if="docMatched.length > dSize" v-model:current-page="dPage" :page-size="dSize" :total="docMatched.length" layout="prev, pager, next" background small style="margin-top:8px;justify-content:center" />
      <div v-if="doc.kind==='in' && docAmt" style="text-align:right;margin-top:8px">进货金额合计 <b class="money">¥{{yuan(docAmt)}}</b></div>
      <template #footer><el-button @click="docInline ? openDoc(doc.kind) : (dDlg = false)">{{ docInline ? '清空' : '取消' }}</el-button><el-button type="primary" :loading="saving" @click="submitDoc">提交</el-button></template>
    </dlg-page>
    <dlg-page v-model="rqDlg" :inline="view === 'requests'" title="门店要货申请" width="960px" top="5vh">
      <div class="toolbar">
        <el-radio-group v-model="rq.status" @change="loadReqs"><el-radio-button value="pending">待处理</el-radio-button><el-radio-button value="done">已调拨</el-radio-button><el-radio-button value="rejected">已驳回</el-radio-button><el-radio-button value="">全部</el-radio-button></el-radio-group>
        <span class="grow"></span><el-button v-if="view === 'requests'" type="primary" @click="openDoc('transfer')">新建调拨单</el-button></div>
      <el-table :data="reqs" :max-height="view === 'requests' ? undefined : 540">
        <el-table-column label="要货单" min-width="180"><template #default="{row}"><div class="c-main">{{row.store_name}}</div><div class="c-sub">{{row.no}} · {{row.created_at}} · {{row.created_by_name}}</div></template></el-table-column>
        <el-table-column label="要什么" min-width="260"><template #default="{row}">{{ row.lines.filter(l => +l.qty > 0).map(l => l.name + '×' + l.qty).join('、') }}<div v-if="row.remark" class="muted">备注：{{row.remark}}</div></template></el-table-column>
        <el-table-column label="状态" width="200"><template #default="{row}">
          <el-tag :type="{pending: 'warning', done: 'success', rejected: 'danger', cancelled: 'info'}[row.status]" size="small">{{row.status_text}}</el-tag>
          <div v-if="row.transfer_doc_no" class="muted">{{row.transfer_doc_no}}</div><div v-if="row.handle_note" class="muted">{{row.handle_note}}</div></template></el-table-column>
        <el-table-column width="130" align="right"><template #default="{row}"><template v-if="row.status === 'pending'">
          <el-button link type="primary" @click="openFulfill(row)">处理</el-button><el-button link type="danger" @click="rejectReq(row)">驳回</el-button></template></template></el-table-column>
      </el-table>
    </dlg-page>
    <el-dialog v-model="ffDlg" :title="'处理要货单：' + (ff.req ? ff.req.store_name : '')" width="680px" top="6vh">
      <el-form inline><el-form-item label="从"><el-select v-model="ff.from" style="width:160px" @change="fetchBal(ff.from)"><el-option v-for="l in locations.filter(l => l.kind === 'warehouse')" :key="l.id" :label="l.name" :value="l.id" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="ff.note" placeholder="选填，门店能看到" style="width:260px" /></el-form-item></el-form>
      <el-table :data="ff.lines" size="small" border>
        <el-table-column prop="name" label="库存品" /><el-table-column prop="unit" label="单位" width="60" />
        <el-table-column prop="asked" label="门店要" width="80" align="right" />
        <el-table-column label="仓库现有" width="90" align="right"><template #default="{row}">{{ stockAt(ff.from, row.stock_item_id) }}</template></el-table-column>
        <el-table-column label="实发" width="120"><template #default="{row}"><el-input v-model="row.qty" size="small" /></template></el-table-column>
      </el-table>
      <template #footer><el-button @click="ffDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="submitFulfill">确认调拨</el-button></template>
    </el-dialog>
    <dlg-page v-model="bDlg" :inline="view === 'batches'" title="批次 / 有效期" width="900px" top="6vh">
      <div class="toolbar">
        <el-select v-model="bq.location_id" placeholder="全部地点" clearable style="width:160px" @change="loadBatches"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select>
        <el-checkbox v-model="bq.onlyNear">只看 {{expiryDays}} 天内到期</el-checkbox>
      </div>
      <el-table :data="bq.onlyNear ? batches.filter(b => nearExp(b.expiry_date)) : batches" :max-height="view === 'batches' ? undefined : 520">
        <el-table-column prop="location_name" label="仓库 / 门店" width="140" />
        <el-table-column prop="name" label="库存品" min-width="150" />
        <el-table-column prop="batch_no" label="批号" width="110" />
        <el-table-column prop="production_date" label="生产日期" width="110" />
        <el-table-column label="有效期至" width="170"><template #default="{row}">{{row.expiry_date || '—'}}
          <el-tag v-if="nearExp(row.expiry_date)" :type="row.expired ? 'danger' : 'warning'" size="small" style="margin-left:4px">{{ expText(row.expiry_date) }}</el-tag></template></el-table-column>
        <el-table-column label="剩余" width="90" align="right"><template #default="{row}"><b>{{row.qty}}</b> {{row.unit}}</template></el-table-column>
      </el-table>
    </dlg-page>
    <dlg-page v-model="lDlg" :inline="view === 'docs'" title="出入库单据" width="980px" top="4vh">
      <div class="toolbar">
        <el-select v-model="lq.kind" placeholder="全部类型" clearable style="width:110px" @change="loadDocs"><el-option v-for="(t, k) in kindText" :key="k" :label="t" :value="k" /></el-select>
        <el-select v-model="lq.location_id" placeholder="全部地点" clearable style="width:140px" @change="loadDocs"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select>
        <el-date-picker v-model="lq.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:240px" @change="loadDocs" />
        <el-input v-model="lq.keyword" placeholder="单号 / 备注" clearable style="width:150px" @keyup.enter="loadDocs" @clear="loadDocs" />
        <el-button @click="loadDocs">查询</el-button><el-button @click="expDocs">导出</el-button>
      </div>
      <el-table :data="docs" :max-height="view === 'docs' ? undefined : 560" :row-class-name="({row}) => row.voided ? 'row-void' : ''">
        <el-table-column type="expand"><template #default="{row}">
          <div style="padding:4px 12px 10px 48px">
            <div class="muted" style="margin-bottom:6px">
              <span v-if="row.supplier_name">供应商：{{row.supplier_name}}　</span><span v-if="row.reason">原因：{{row.reason}}　</span>
              <span v-if="row.remark">备注：{{row.remark}}　</span><span>制单：{{row.created_by_name}}</span>
              <span v-if="row.voided" style="color:var(--danger)">　{{row.voided_at}} 由 {{row.voided_by_name}} 作废：{{row.void_reason}}</span></div>
            <el-table :data="row.lines" size="small" border>
              <el-table-column prop="name" label="库存品" /><el-table-column prop="unit" label="单位" width="60" />
              <el-table-column v-if="row.kind==='in' && row.lines.some(l => l.batch_no || l.expiry_date)" label="批号 / 有效期" width="190"><template #default="{row: l}">{{ [l.batch_no, l.production_date && '生产 ' + l.production_date, l.expiry_date && '至 ' + l.expiry_date].filter(Boolean).join(' · ') }}</template></el-table-column>
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
    </dlg-page>
    <el-dialog v-model="mDlg" :title="mTitle" width="640px">
      <el-table :data="moves" border size="small" max-height="460">
        <el-table-column prop="created_at" label="时间" width="160" />
        <el-table-column prop="kind_text" label="类型" width="90" />
        <el-table-column prop="qty" label="变动" width="80" />
        <el-table-column prop="balance_after" label="结存" width="80" />
        <el-table-column prop="ref" label="单据 / 订单" />
      </el-table>
    </el-dialog>
  </div>
  </div>`,
  setup(props) {
    const locations = ref([]), loc = ref(null), range = ref([today(), today()]), kw = ref(''), rows = ref([]);
    const cols = [['opening', '期初'], ['in', '入库'], ['out', '出库'], ['transfer_in', '调入'], ['transfer_out', '调出'], ['sale', '销售'], ['sale_return', '退货回补'], ['exchange_out', '换货出库'], ['exchange_in', '换货入库'], ['adjust', '盘点'], ['closing', '结余']];
    const dDlg = ref(false), saving = ref(false), doc = reactive({ kind: 'in', from: null, to: null, remark: '', reason: '', supplier_id: null, lines: [], rid: '' });
    const outReasons = ['领用', '报损', '退供应商', '其他'], kindText = { in: '入库', out: '出库', transfer: '调拨', adjust: '盘点' };
    const lineAmt = (r) => { const q = parseFloat(r.qty), p = money(r.price); return q > 0 && p !== null ? Math.round(q * p) : null; };
    const docAmt = computed(() => doc.kind === 'in' ? doc.lines.reduce((a, r) => a + (lineAmt(r) || 0), 0) : 0);
    const diffOf = (r) => { if (!balances[doc.to] || blank(r.qty) || !isFinite(parseFloat(r.qty))) return null; return +(parseFloat(r.qty) - (+stockAt(doc.to, r.id) || 0)).toFixed(3); };
    const expiryDays = ref(30), bDlg = ref(false), batches = ref([]), bq = reactive({ location_id: null, onlyNear: false });
    api.get('/api/settings/rules').then(r => { expiryDays.value = r.expiry_alert_days ?? 30; }).catch(() => {});
    const daysTo = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
    const nearExp = (d) => !!d && daysTo(d) <= expiryDays.value;
    const expText = (d) => { const n = daysTo(d); return n < 0 ? '已过期 ' + (-n) + ' 天' : (n === 0 ? '今天到期' : n + ' 天后到期'); };
    const loadBatches = async () => { try { batches.value = await api.get('/api/stock-batches', { location_id: bq.location_id || undefined }); } catch (e) { err(e); } };
    const openBatches = () => { bq.location_id = loc.value; bDlg.value = true; loadBatches(); };
    const splitLine = (r) => { const i = doc.lines.indexOf(r); doc.lines.splice(i + 1, 0, { ...r, key: r.key + '-' + (++lineSeq), qty: '', batch_no: '', production_date: null, expiry_date: null, split: true }); };
    // 单据弹窗只渲染一页（每行有输入框和日期框，800 多行一次全渲染会卡几十秒）；搜索、只看已填在全部行上筛选
    const dq = ref(''), dFilled = ref(false), dPage = ref(1), dSize = 50, dLoading = ref(false), dTable = ref(null), dqInput = ref(null);
    let lineSeq = 0;
    const filledOf = (l) => !blank(l.qty) || !blank(l.batch_no) || !!l.production_date || !!l.expiry_date;
    const filledCount = computed(() => doc.lines.filter(filledOf).length);
    const docMatched = computed(() => {
      const words = dq.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      return doc.lines.filter(l => (!dFilled.value || filledOf(l)) && words.every(w => l.search.includes(w)));
    });
    const docShown = computed(() => docMatched.value.slice((dPage.value - 1) * dSize, dPage.value * dSize));
    watch([dq, dFilled], () => { dPage.value = 1; });
    watch(dPage, () => { const el = dTable.value && dTable.value.$el.querySelector('.el-scrollbar__wrap'); if (el) el.scrollTop = 0; });
    // 搜索框回车（包括扫码枪）：只剩一项时直接跳到它的数量框
    const dqEnter = () => { if (docMatched.value.length !== 1) return; Vue.nextTick(() => { const i = dTable.value && dTable.value.$el.querySelector('.el-table__body tr input'); if (i) i.focus(); }); };
    const reqPending = ref(0), rqDlg = ref(false), reqs = ref([]), rq = reactive({ status: 'pending' }), ffDlg = ref(false), ff = reactive({ req: null, from: null, note: '', lines: [], rid: '' });
    const countReqs = async () => { try { reqPending.value = (await api.get('/api/requisitions', { status: 'pending', size: 1 })).total; } catch (e) {} };
    const loadReqs = async () => { try { reqs.value = (await api.get('/api/requisitions', { status: rq.status, size: 200 })).items; } catch (e) { err(e); } countReqs(); };
    const openReqs = () => { rqDlg.value = true; loadReqs(); };
    const openFulfill = (row) => {
      const wh = locations.value.find(l => l.kind === 'warehouse');
      Object.assign(ff, { req: row, from: wh ? wh.id : null, note: '', rid: rid(),
        lines: row.lines.map(l => ({ stock_item_id: l.stock_item_id, name: l.name, unit: l.unit, asked: l.qty, qty: String(l.qty) })) });
      Object.keys(balances).forEach(k => delete balances[k]); fetchBal(ff.from).catch(() => {});
      ffDlg.value = true;
    };
    const submitFulfill = async () => {
      if (saving.value) return;
      const bad = ff.lines.find(l => !/^\d+(\.\d{1,3})?$/.test(String(l.qty).trim()));
      if (bad) return ElMessage.warning(bad.name + ' 的实发数量请填数字（不发填 0）');
      // 实发超过申请量要再确认一次（仓库库存不够时服务器会直接拒绝，不会发成负数）
      const over = ff.lines.filter(l => parseFloat(l.qty) > l.asked);
      if (over.length) {
        try { await ElMessageBox.confirm(over.map(l => Shouyin.esc(l.name) + '：申请 ' + l.asked + '，实发 ' + parseFloat(l.qty)).join('<br>') + '<br>实发比申请多，确定这样发吗？', '实发超过申请量',
          { type: 'warning', dangerouslyUseHTMLString: true, confirmButtonText: '确定多发', cancelButtonText: '回去改' }); } catch (e) { return; }
      }
      saving.value = true;
      try { await api.post('/api/requisitions/' + ff.req.id + '/fulfill', { from_location_id: ff.from, note: ff.note, request_id: ff.rid,
          lines: ff.lines.map(l => ({ stock_item_id: l.stock_item_id, qty: parseFloat(l.qty) })) });
        ok('已调拨到 ' + ff.req.store_name); ffDlg.value = false; loadReqs(); load(); }
      catch (e) { err(e); } finally { saving.value = false; }
    };
    const rejectReq = async (row) => {
      let reason; try { ({ value: reason } = await ElMessageBox.prompt('驳回 ' + row.store_name + ' 的要货单，原因（门店能看到）：', '驳回', { inputValidator: v => !blank(v) || '请写原因' })); } catch (e) { return; }
      try { await api.post('/api/requisitions/' + row.id + '/reject', { reason }); ok('已驳回'); loadReqs(); } catch (e) { err(e); }
    };
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
      if (voiding.value) return;  // 防双击；服务器也只会冲回一次
      voiding.value = true;
      try { await api.post('/api/stock-docs/' + row.id + '/void', { reason }); ok('已作废，库存已冲回'); loadDocs(); load(); } catch (e) { err(e); } finally { voiding.value = false; }
    };
    const voiding = ref(false);
    const balances = reactive({});
    const mDlg = ref(false), moves = ref([]), mTitle = ref('');
    const loadLocs = async () => { locations.value = await api.get('/api/locations'); if (!loc.value && locations.value.length) loc.value = locations.value[0].id; };
    const load = async () => {
      if (!loc.value) return;
      try { rows.value = (await api.get('/api/stock-ledger', { location_id: loc.value, begin: (range.value || [])[0], end: (range.value || [])[1] }))
        .map(r => ({ ...r, search: (r.name + ' ' + (r.code || '')).toLowerCase() })); } catch (e) { err(e); }
    };
    const fmtN = (v) => +(+v || 0).toFixed(3);
    const sumOf = (k) => shownRows.value.reduce((a, r) => a + (+r[k] || 0), 0);
    const lowCount = computed(() => rows.value.filter(r => r.current <= 0).length);
    const onlyLow = ref(false);
    const alertCount = computed(() => rows.value.filter(r => r.low).length);
    // 搜索在本地即时筛选，不用再点查询
    const shownRows = computed(() => {
      const words = kw.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      return rows.value.filter(r => (!onlyLow.value || r.low) && words.every(w => r.search.includes(w)));
    });
    // 合计行：各列数量相加（不同单位相加只用于核对，和表格里点出来的流水对得上即可）
    const summary = ({ columns }) => columns.map((c, i) => {
      if (i === 0) return '合计';
      const key = i <= cols.length ? cols[i - 1][0] : 'current';
      return fmtN(sumOf(key)) || '–';
    });
    const docTitle = computed(() => ({ in: '入库', out: '出库', transfer: '调拨（仓库 → 门店）', adjust: '盘点' }[doc.kind]));
    const stockAt = (lid, sid) => { const m = balances[lid]; if (!m) return ''; return m.get(sid) ?? 0; };
    const fetchBal = async (lid) => { if (lid && !balances[lid]) balances[lid] = Vue.markRaw(new Map((await api.get('/api/stock', { location_id: lid })).map(x => [x.stock_item_id, x.qty]))); };
    watch(() => [doc.from, doc.to], ([a, b]) => { fetchBal(a).catch(() => {}); fetchBal(b).catch(() => {}); });
    const openDoc = async (kind) => {
      Object.keys(balances).forEach(k => delete balances[k]);
      const wh = locations.value.find(l => l.kind === 'warehouse'), st = locations.value.find(l => l.kind === 'store');
      Object.assign(doc, { kind, remark: '', reason: '', supplier_id: null, rid: rid(),
        from: kind === 'out' ? loc.value : (kind === 'transfer' ? (wh || {}).id : null),
        to: kind === 'transfer' ? (st || {}).id : (kind === 'out' ? null : loc.value) });
      // 地点没变时 watch 不会触发，这里主动取一次现有库存
      fetchBal(doc.from).catch(() => {}); fetchBal(doc.to).catch(() => {});
      // 先打开弹窗再取库存品；停用的也列出来（排在后面），方便把剩余库存出库或盘为 0
      dq.value = ''; dFilled.value = false; dPage.value = 1; doc.lines = []; dLoading.value = true; dDlg.value = true;
      Vue.nextTick(() => dqInput.value && dqInput.value.focus());
      let all = props.meta.stockItems;
      try { all = await api.get('/api/stock-items'); } catch (e) {}
      doc.lines = [...all.filter(i => i.active), ...all.filter(i => !i.active)]
        .map(i => ({ key: String(i.id), id: i.id, name: i.name + (i.active ? '' : '（已停用）'), unit: i.unit, search: (i.name + ' ' + (i.code || '')).toLowerCase(),
          qty: '', price: i.cost == null ? '' : yuan(i.cost), batch_no: '', production_date: null, expiry_date: null }));
      dLoading.value = false;
    };
    const submitDoc = async () => {
      const bad = doc.lines.find(l => String(l.qty).trim() !== '' && !(isFinite(parseFloat(l.qty)) && /^\d+(\.\d{1,3})?$/.test(String(l.qty).trim())));
      if (bad) return ElMessage.warning(bad.name + ' 的数量请填数字');
      const picked = doc.lines.filter(l => String(l.qty).trim() !== '' && (doc.kind === 'adjust' || parseFloat(l.qty) > 0));
      if (doc.kind === 'in') { const badP = picked.find(l => !blank(l.price) && money(l.price) === null); if (badP) return ElMessage.warning(badP.name + ' 的进价请填数字'); }
      if (doc.kind === 'in') { const badD = picked.find(l => l.production_date && l.expiry_date && l.expiry_date < l.production_date); if (badD) return ElMessage.warning(badD.name + '：有效期至不能早于生产日期'); }
      const lines = picked.map(l => ({ stock_item_id: l.id, qty: parseFloat(l.qty), unit_cost: doc.kind === 'in' && !blank(l.price) ? money(l.price) : null,
        ...(doc.kind === 'in' ? { batch_no: (l.batch_no || '').trim(), production_date: l.production_date || null, expiry_date: l.expiry_date || null } : {}) }));
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
        ok('已提交');
        if (docInline.value) openDoc(doc.kind); else { dDlg.value = false; load(); }
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
    const docInline = computed(() => props.view === 'stockIn' || props.view === 'stockCount');
    onMounted(async () => {
      try { await loadLocs(); } catch (e) { err(e); }
      countReqs();
      if (props.view === 'inventory') load();
      else if (props.view === 'stockIn') { let k = 'in'; try { if (sessionStorage.getItem('stockKind') === 'out') k = 'out'; } catch (e) {} openDoc(k); }
      else if (props.view === 'stockCount') openDoc('adjust');
      else if (props.view === 'requests') openReqs();
      else if (props.view === 'batches') openBatches();
      else if (props.view === 'docs') openDocs();
      try { sessionStorage.removeItem('stockKind'); } catch (e) {}
    });
    return { reqPending, rqDlg, reqs, rq, ffDlg, ff, loadReqs, openReqs, openFulfill, submitFulfill, rejectReq, fetchBal, expiryDays, bDlg, batches, bq, nearExp, expText, loadBatches, openBatches, splitLine, outReasons, kindText, lineAmt, docAmt, diffOf, lDlg, docs, lq, loadDocs, openDocs, expDocs, expLedger, voidDoc, yuan,
      docInline, locations, loc, range, kw, rows, cols, load, summary, fmtN, sumOf, lowCount, onlyLow, alertCount, shownRows, dDlg, saving, doc, docTitle, openDoc, submitDoc, stockAt, dq, dFilled, dPage, dSize, dLoading, dTable, dqInput, filledCount, docMatched, docShown, dqEnter, mDlg, moves, mTitle, showMoves, newWarehouse };
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
      <el-table-column label="商品"><template #default="{row}">{{row.product_name}}<el-tag v-if="row.added_at" size="small" type="info" style="margin-left:4px">换货</el-tag></template></el-table-column>
      <el-table-column prop="sku_name" label="规格" width="100" />
      <el-table-column prop="qty" label="数量" width="70" />
      <el-table-column label="单价" width="80"><template #default="{row}">{{yuan(row.unit_price)}}</template></el-table-column>
      <el-table-column label="金额" width="80"><template #default="{row}">{{yuan(row.amount)}}</template></el-table-column>
      <el-table-column label="实收分摊" width="90"><template #default="{row}">{{yuan(row.paid_share)}}</template></el-table-column>
      <el-table-column prop="refunded_qty" label="已退换" width="70" />
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

// ---------------- 图表（纯 HTML/SVG，不引第三方库） ----------------
const PAY_COLORS = { wechat: '#165dff', alipay: '#14c9c9', cash: '#f7ba1e', other: '#c9cdd4' };  // 按后台设计稿配色
const CHART_COLORS = ['#0071e3', '#34c759', '#ff9500', '#af52de', '#8e8e93', '#5ac8fa'];
const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
// 柱状图：items = [{ label, value, tip }]；悬停显示数值，最高的一根和悬停的一根用主色
const BarChart = {
  props: { items: Array, fmt: { type: Function, default: (v) => v }, height: { type: Number, default: 200 }, labels: Boolean },
  template: `
  <div class="bar-chart" :style="{height: height + 'px'}">
    <div class="axis"><div v-for="t in ticks" :key="t" class="tick"><span>{{short(t)}}</span></div></div>
    <div class="bars" @mouseleave="hover = -1">
      <div v-for="(it, i) in items" :key="it.label" class="bar-col" @mouseenter="hover = i">
        <div class="bar" :class="{on: i === hover || (hover < 0 && i === top)}" :style="{height: pct(it) + '%'}"></div>
        <div v-if="labels && it.value > 0 && i !== hover" class="bar-val" :style="{bottom: 'calc(' + pct(it) + '% + 4px)'}">{{short(it.value)}}</div>
        <div v-if="i === hover" class="bar-tip" :class="{left: i > items.length * .7}" :style="{bottom: 'calc(' + pct(it) + '% + 6px)'}"><b>{{fmt(it.value)}}</b><span>{{it.tip || it.label}}</span></div>
        <div class="bar-x" v-if="showLabel(i)">{{it.label}}</div>
      </div>
    </div>
  </div>`,
  setup(props) {
    const hover = ref(-1);
    const max = computed(() => niceMax(Math.max(0, ...props.items.map(i => i.value))));
    const ticks = computed(() => [max.value, max.value / 2, 0]);
    const top = computed(() => { let k = -1, v = 0; props.items.forEach((it, i) => { if (it.value > v) { v = it.value; k = i; } }); return k; });
    const step = computed(() => Math.ceil(props.items.length / 10));
    const showLabel = (i) => props.items.length <= 12 || i % step.value === 0 || i === props.items.length - 1;
    const short = (v) => v >= 10000 ? +(v / 10000).toFixed(1) + '万' : (v >= 1000 ? +(v / 1000).toFixed(1) + 'k' : +v.toFixed(2));
    const pct = (it) => it.value > 0 ? Math.max(1.5, it.value / max.value * 100) : 0;
    return { hover, max, ticks, top, showLabel, short, pct };
  },
};
// 环形图：parts = [{ label, value, color }]；粗圆环，中间显示合计
const DonutChart = {
  props: { parts: Array, fmt: { type: Function, default: (v) => v }, center: String, short: Function },
  template: `
  <div class="donut">
    <div class="donut-ring">
      <svg viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f2f3f5" stroke-width="6" />
        <circle v-for="(s, i) in segs" :key="i" cx="21" cy="21" r="15.915" fill="none" :stroke="s.color" stroke-width="6"
          :stroke-dasharray="s.len + ' ' + (100 - s.len)" :stroke-dashoffset="25 - s.off" />
      </svg>
      <div class="donut-c"><span>{{center}}</span><b>{{(short || fmt)(total)}}</b></div>
    </div>
    <div class="legend">
      <div v-for="(p, i) in parts" :key="p.label" class="lg"><i :style="{background: colorOf(p, i)}"></i>
        <span>{{p.label}}</span><em>{{fmt(p.value)}}</em><b>{{ total > 0 ? Math.round(Math.max(0, p.value) / total * 100) : 0 }}%</b></div>
    </div>
  </div>`,
  setup(props) {
    const colorOf = (p, i) => p.color || CHART_COLORS[i % CHART_COLORS.length];
    const total = computed(() => props.parts.reduce((a, p) => a + Math.max(0, p.value), 0));
    const segs = computed(() => { let off = 0;
      return props.parts.map((p, i) => ({ v: Math.max(0, p.value), color: colorOf(p, i) })).filter(p => p.v > 0)
        .map(p => { const len = p.v / total.value * 100; const s = { len, off, color: p.color }; off += len; return s; }); });
    return { total, segs, colorOf };
  },
};
// 折线面积图：items = [{ label, value, tip }]；悬停显示数值
const LineChart = {
  props: { items: Array, fmt: { type: Function, default: (v) => v }, height: { type: Number, default: 230 } },
  template: `
  <div class="line-chart" @mouseleave="hover = -1">
    <svg :viewBox="'0 0 640 ' + height" role="img" aria-label="走势图" @mousemove="move">
      <defs><linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#165DFF" stop-opacity=".2" /><stop offset="1" stop-color="#165DFF" stop-opacity="0" /></linearGradient></defs>
      <g stroke="#EEF0F3"><line v-for="t in ticks" :key="t.y" x1="44" :y1="t.y" x2="630" :y2="t.y" /></g>
      <g font-size="11" fill="#4E5969" text-anchor="end"><text v-for="t in ticks" :key="'t' + t.y" x="36" :y="t.y + 4">{{t.label}}</text></g>
      <path v-if="pts.length > 1" :d="area" fill="url(#lc-area)" />
      <path v-if="pts.length > 1" :d="line" fill="none" stroke="#165DFF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      <line v-if="hover >= 0" :x1="pts[hover].x" :x2="pts[hover].x" y1="20" :y2="base" stroke="#C9CDD4" stroke-dasharray="3 3" />
      <circle v-for="(p, i) in pts" :key="i" v-show="pts.length <= 31 || i === hover" :cx="p.x" :cy="p.y" :r="i === hover ? 4.5 : 3" fill="#fff" stroke="#165DFF" stroke-width="2" />
      <g font-size="10.5" fill="#4E5969" text-anchor="middle"><text v-for="(p, i) in pts" :key="'x' + i" v-show="showLabel(i)" :x="p.x" :y="base + 22">{{p.label}}</text></g>
    </svg>
    <div v-if="hover >= 0" class="lc-tip" :style="{left: pts[hover].x / 6.4 + '%', top: pts[hover].y / height * 100 + '%'}"><b>{{fmt(items[hover].value)}}</b><span>{{items[hover].tip || items[hover].label}}</span></div>
  </div>`,
  setup(props) {
    const hover = ref(-1);
    const base = computed(() => props.height - 40);
    const max = computed(() => niceMax(Math.max(0, ...props.items.map(i => i.value))));
    const short = (v) => v >= 10000 ? +(v / 10000).toFixed(1) + '万' : (v >= 1000 ? +(v / 1000).toFixed(1) + 'k' : +(+v).toFixed(2));
    const ticks = computed(() => [0, 1, 2, 3, 4].map(k => ({ y: base.value - (base.value - 30) * k / 4, label: short(max.value * k / 4) })));
    const pts = computed(() => { const n = props.items.length, w = 570;
      return props.items.map((it, i) => ({ x: n > 1 ? 56 + i * w / (n - 1) : 340, y: base.value - (base.value - 30) * Math.max(0, it.value) / max.value, label: it.label })); });
    const line = computed(() => pts.value.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' '));
    const area = computed(() => pts.value.length ? line.value + ` L${pts.value[pts.value.length - 1].x} ${base.value} L${pts.value[0].x} ${base.value} Z` : '');
    const step = computed(() => Math.ceil(props.items.length / 10));
    const showLabel = (i) => props.items.length <= 14 || i % step.value === 0 || i === props.items.length - 1;
    const move = (e) => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * 640;
      let k = -1, d = 1e9; pts.value.forEach((p, i) => { const dd = Math.abs(p.x - x); if (dd < d) { d = dd; k = i; } }); hover.value = k; };
    return { hover, base, ticks, pts, line, area, showLabel, move };
  },
};
// 热力图：heat[星期一..星期日][0..23]，只画有数据的营业时段（至少 8–20 点）
const HeatMap = {
  props: { heat: Array },
  template: `
  <div class="heat">
    <div class="heat-grid" :style="{gridTemplateColumns: '36px repeat(' + hours.length + ', 1fr)'}">
      <template v-for="(row, d) in heat" :key="d">
        <div class="hl">{{days[d]}}</div>
        <div v-for="h in hours" :key="h" class="hc" :style="{background: color(row[h])}" :title="days[d] + ' ' + h + ':00–' + (h + 1) + ':00　' + row[h] + ' 单'"></div>
      </template>
      <div></div><div v-for="h in hours" :key="'x' + h" class="hx">{{ h % 2 === 0 ? h : '' }}</div>
    </div>
    <div class="heat-lg"><span>少</span><i v-for="k in 5" :key="k" :style="{background: color(max * (k - .5) / 5)}"></i><span>多</span></div>
  </div>`,
  setup(props) {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const hours = computed(() => { let a = 8, b = 20; (props.heat || []).forEach(r => r.forEach((v, h) => { if (v) { a = Math.min(a, h); b = Math.max(b, h); } }));
      return Array.from({ length: b - a + 1 }, (_, i) => a + i); });
    const max = computed(() => Math.max(1, ...(props.heat || []).flat()));
    const color = (v) => !v ? '#f2f3f5' : `rgba(22, 93, 255, ${(.08 + .85 * Math.min(1, v / max.value)).toFixed(2)})`;
    return { days, hours, max, color };
  },
};
// 排行：rows = [{ name, value, sub }]，条形长度按最大值
const RankList = {
  props: { rows: Array, fmt: { type: Function, default: (v) => v }, empty: { type: String, default: '暂无数据' } },
  template: `
  <div class="rank">
    <div v-for="(r, i) in rows" :key="r.name + i" class="rk">
      <span class="no" :class="{top: i < 3}">{{i + 1}}</span>
      <div class="rk-main"><div class="rk-t"><span class="ellipsis">{{r.name}}</span><b>{{fmt(r.value)}}</b></div>
        <div class="rk-bar"><i :style="{width: (max ? Math.max(2, r.value / max * 100) : 0) + '%'}"></i></div>
        <div v-if="r.sub" class="c-sub">{{r.sub}}</div></div>
    </div>
    <div v-if="!rows.length" class="muted" style="padding:24px 0;text-align:center">{{empty}}</div>
  </div>`,
  setup(props) { return { max: computed(() => Math.max(0, ...props.rows.map(r => r.value))) }; },
};
// 把营收接口按（期间, 门店）分的行合并成每期一个数；按天时补齐没有数据的日子
const revenueSeries = (rows, begin, end, group, key = 'net') => {
  const m = {}; rows.forEach(r => { m[r.period] = (m[r.period] || 0) + (r[key] || 0); });
  if (group !== 'day') return Object.keys(m).sort().map(p => ({ label: group === 'week' ? p.slice(5, 10).replace('-', '/') : +p.slice(5) + '月', tip: group === 'week' ? p.replace('~', ' ~ ') + ' 当周' : p.replace('-', ' 年 ') + ' 月', value: m[p] }));
  const out = []; for (let d = new Date(begin + 'T00:00:00'); d <= new Date(end + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ label: k.slice(5).replace('-', '/'), tip: k + ' 周' + '日一二三四五六'[d.getDay()], value: m[k] || 0 });
  }
  return out;
};

// ---------------- 营收报表 ----------------
const Revenue = {
  props: ['meta'],
  template: `
  <div>
    <div class="panel toolbar" style="margin-bottom:16px">
      <el-radio-group v-model="group" @change="load"><el-radio-button value="day">日报</el-radio-button><el-radio-button value="week">周报</el-radio-button><el-radio-button value="month">月报</el-radio-button></el-radio-group>
      <el-select v-model="store" placeholder="全部门店" clearable style="width:150px" @change="load"><el-option v-for="s in meta.stores" :key="s.id" :label="s.name" :value="s.id" /></el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" style="width:260px" @change="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <span class="grow"></span>
      <el-button @click="exp">导出 Excel</el-button>
    </div>
    <div class="stats" v-if="data.total">
      <div class="stat"><div class="k">实收</div><div class="v">¥{{yuan(data.total.net)}}</div><div class="s">收款 ¥{{yuan(data.total.received)}} · 退款 ¥{{yuan(data.total.refunded)}}</div></div>
      <div class="stat"><div class="k">单数</div><div class="v">{{data.total.orders}}</div><div class="s">门店收银 {{data.total.pos_orders}} · 扫码点单 {{data.total.online_orders}}</div></div>
      <div class="stat"><div class="k">优惠</div><div class="v">¥{{yuan(data.total.discount)}}</div><div class="s">商品原价 ¥{{yuan(data.total.original)}}</div></div>
      <div class="stat"><div class="k">毛利</div><div class="v" style="color:var(--success)">¥{{yuan(data.total.profit)}}</div><div class="s">成本 ¥{{yuan(data.total.cost)}}<template v-if="data.total.net > 0"> · 毛利率 {{(data.total.profit / data.total.net * 100).toFixed(1)}}%</template></div></div>
    </div>
    <div class="dash-row" v-if="data.total">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">实收走势</div></div>
        <div style="height:16px"></div>
        <bar-chart :items="series" :fmt="v => '¥' + yuan(v * 100)" :height="210" :labels="series.length <= 14" />
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">收款方式</div></div>
        <div style="height:16px"></div>
        <div class="hbars">
          <div v-for="m in methodRows" :key="m.k" class="hbar"><div class="t"><span>{{m.label}}</span><b>¥{{yuan(m.v)}}</b></div><div class="b"><i :style="{width: m.pct + '%'}"></i></div></div>
        </div>
      </div>
    </div>
    <div class="dash-row even" v-if="ins">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">下单时段</div></div>
        <div style="height:16px"></div>
        <bar-chart class="cyan" :items="hourItems" :fmt="v => v + ' 单'" :height="170" />
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">扫码点单区域排行</div></div>
        <div style="height:12px"></div>
        <el-table v-if="ins.areas.length" :data="ins.areas.slice(0, 8)">
          <el-table-column prop="name" label="区域" min-width="120" />
          <el-table-column label="单数" width="90" align="right"><template #default="{row}">{{row.orders}} 单</template></el-table-column>
          <el-table-column label="金额" width="120" align="right"><template #default="{row}">¥{{yuan(row.amount)}}</template></el-table-column>
        </el-table>
        <el-empty v-else :image-size="50" description="这段时间没有扫码点单" />
      </div>
    </div>
    <div class="panel">
    <div class="panel-title" style="margin-bottom:12px">明细</div>
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
    </div>
  </div>`,
  setup() {
    const group = ref('day'), store = ref(null), range = ref([daysAgo(6), today()]), data = ref({ rows: [], total: null });
    const params = () => ({ group: group.value, store_id: store.value, begin: (range.value || [])[0], end: (range.value || [])[1] });
    const ins = ref(null);
    const load = async () => { try { [data.value, ins.value] = await Promise.all([api.get('/api/reports/revenue', params()),
      api.get('/api/reports/insights', { store_id: store.value, begin: (range.value || [])[0], end: (range.value || [])[1] })]); } catch (e) { err(e); } };
    const methodRows = computed(() => { const t = data.value.total; if (!t) return [];
      const rows = methodList.map(([k, n]) => ({ k, label: n, v: t.methods[k] || 0 })).filter(r => r.v || r.k !== 'other');
      const mx = Math.max(1, ...rows.map(r => r.v)); return rows.sort((a, b) => b.v - a.v).map(r => ({ ...r, pct: Math.max(0, r.v) / mx * 100 })); });
    const hourItems = computed(() => { if (!ins.value) return []; const hs = Array(24).fill(0); ins.value.heat.forEach(r => r.forEach((v, h) => { hs[h] += v; }));
      let a = 8, b = 20; hs.forEach((v, h) => { if (v) { a = Math.min(a, h); b = Math.max(b, h); } });
      return hs.slice(a, b + 1).map((v, i) => ({ label: String(a + i), tip: (a + i) + ':00–' + (a + i + 1) + ':00', value: v })); });
    const series = computed(() => data.value.total ? revenueSeries(data.value.rows, data.value.begin, data.value.end, data.value.group).map(x => ({ ...x, value: x.value / 100 })) : []);
    const exp = async () => { try { await api.download('/api/reports/revenue', params()); } catch (e) { err(e); } };
    const rowsWithTotal = computed(() => data.value.total ? [...data.value.rows, { ...data.value.total, period: '合计', store_name: '' }] : []);
    onMounted(load);
    const methodList = [['cash', '现金'], ['wechat', '微信'], ['alipay', '支付宝'], ['other', '其他']];
    return { PAY_COLORS, methodRows, hourItems, group, store, range, data, ins, series, load, exp, rowsWithTotal, methodList, yuan };
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
    <div v-if="catId" class="hint" style="margin:-6px 0 10px"><b>当前只看分类：{{(catOptions.find(c => c.id === catId) || {}).label}}</b></div>
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
      <div class="form-section">排版</div>
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
      <el-form-item label="底部走纸"><el-input-number v-model="f.bottom_blank" :min="0" :max="10" /> <span class="muted">&nbsp;行</span></el-form-item>
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
      { k: 'area', label: '区域 / 位置', bold: true },
      { k: 'item', label: '商品名称', bold: true },
      { k: 'medical', label: '医疗器械资料' },
      { k: 'total', label: '应收金额', bold: true },
      { k: 'footer', label: '底部文字', align: 'footer' },
    ];
    const toggles = { show_store: '门店名', show_order_no: '单号', show_time: '时间', show_area: '区域 / 位置', show_phone: '顾客电话', show_cashier: '操作员',
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
      <el-form-item label="最低折扣"><el-input-number v-model="rForm.min_rate" :min="0.1" :max="10" :step="0.5" :precision="1" /> <span class="muted">&nbsp;折（10 不能优惠，0.1 不限）</span></el-form-item>
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
      <el-form-item label="扫码点单自动接单"><el-switch v-model="f.online_auto_accept" /></el-form-item>
      <el-form-item label="小程序订单扣库存时机"><el-radio-group v-model="f.online_deduct_on"><el-radio value="create">下单时</el-radio><el-radio value="accept">接单时</el-radio></el-radio-group></el-form-item>
      <el-form-item label="门店收银库存不够也能卖"><el-switch v-model="f.pos_allow_negative" /></el-form-item>
      <el-form-item label="小程序库存不够也能下单"><el-switch v-model="f.online_allow_negative" /></el-form-item>
      <el-form-item label="区域叫法"><el-input v-model="f.area_label" placeholder="如：病区、楼层" /></el-form-item>
      <el-form-item label="位置叫法"><el-input v-model="f.location_label" placeholder="如：床号、桌号" /></el-form-item>
      <el-form-item label="小程序下单必须填位置"><el-switch v-model="f.online_location_required" /></el-form-item>
      <el-form-item label="退款期限">收款后 <el-input-number v-model="f.refund_days" :min="0" :max="3650" style="margin:0 8px" /> 天内门店可以退货退款<span class="muted" style="margin-left:8px">0 表示不限；管理员不受此限制</span></el-form-item>
      <el-form-item label="临期提醒"><el-input-number v-model="f.expiry_alert_days" :min="0" :max="3650" /><span style="margin-left:8px">天内到期</span></el-form-item>
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

// ---------------- 交班记录 ----------------
const Shifts = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-select v-model="q.store_id" placeholder="全部门店" clearable style="width:160px" @change="load"><el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" /></el-select>
      <el-date-picker v-model="q.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:250px" @change="load" />
      <el-button @click="load">查询</el-button><el-button @click="exp">导出</el-button>
      <span class="grow"></span>
    </div>
    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><div class="k">班次</div><div class="v">{{rows.length}}</div><div class="s">当班中 {{rows.filter(r => r.status === 'open').length}}</div></div>
      <div class="stat"><div class="k">合计净收</div><div class="v">¥{{yuan(rows.reduce((a, r) => a + r.net, 0))}}</div></div>
      <div class="stat"><div class="k">有差额的班次</div><div class="v" :style="diffRows.length ? 'color:var(--danger)' : ''">{{diffRows.length}}</div><div class="s">{{ diffSum === 0 ? '长短款相抵为 0' : (diffSum > 0 ? '合计长款 ¥' + yuan(diffSum) : '合计短款 ¥' + yuan(-diffSum)) }}</div></div>
    </div>
    <el-table :data="rows" size="small">
      <el-table-column type="expand"><template #default="{row}"><div style="padding:4px 16px 10px 48px">
        <el-table :data="Object.values(row.methods)" size="small" border>
          <el-table-column prop="method_text" label="方式" /><el-table-column prop="pay_count" label="收款笔数" width="90" />
          <el-table-column label="收款" width="110"><template #default="{row: m}">{{yuan(m.pay)}}</template></el-table-column>
          <el-table-column label="退款" width="110"><template #default="{row: m}">{{yuan(m.refund)}}</template></el-table-column>
          <el-table-column label="净额" width="110"><template #default="{row: m}"><b>{{yuan(m.pay - m.refund)}}</b></template></el-table-column>
        </el-table><div v-if="row.remark" class="muted" style="margin-top:6px">备注：{{row.remark}}</div></div></template></el-table-column>
      <el-table-column label="收银员" min-width="150"><template #default="{row}"><div class="c-main">{{row.cashier}}</div><div class="c-sub">{{row.store_name}}</div></template></el-table-column>
      <el-table-column label="时间" min-width="180"><template #default="{row}">{{row.started_at}}<div class="c-sub">{{row.ended_at || '当班中'}}</div></template></el-table-column>
      <el-table-column prop="orders" label="单数" width="70" align="right" />
      <el-table-column label="净收" width="100" align="right"><template #default="{row}">{{yuan(row.net)}}</template></el-table-column>
      <el-table-column label="备用金" width="90" align="right"><template #default="{row}">{{yuan(row.opening_cash)}}</template></el-table-column>
      <el-table-column label="应有现金" width="100" align="right"><template #default="{row}">{{yuan(row.expected_cash)}}</template></el-table-column>
      <el-table-column label="实点现金" width="100" align="right"><template #default="{row}">{{row.counted_cash == null ? '—' : yuan(row.counted_cash)}}</template></el-table-column>
      <el-table-column label="差额" width="100" align="right"><template #default="{row}">
        <el-tag v-if="row.status === 'open'" size="small" type="warning">当班中</el-tag>
        <b v-else :style="{color: row.cash_diff ? 'var(--danger)' : 'var(--success)'}">{{ row.cash_diff > 0 ? '+' : '' }}{{yuan(row.cash_diff)}}</b></template></el-table-column>
    </el-table>
  </div>`,
  setup() {
    const q = reactive({ store_id: null, range: [daysAgo(6), today()] }), rows = ref([]), stores = ref([]);
    const params = () => ({ store_id: q.store_id || undefined, begin: (q.range || [])[0], end: (q.range || [])[1] });
    const load = async () => { try { rows.value = await api.get('/api/shifts', params()); } catch (e) { err(e); } };
    const exp = async () => { try { await api.download('/api/shifts', params()); } catch (e) { err(e); } };
    const diffRows = computed(() => rows.value.filter(r => r.status === 'closed' && r.cash_diff));
    const diffSum = computed(() => diffRows.value.reduce((a, r) => a + r.cash_diff, 0));
    onMounted(async () => { try { stores.value = await api.get('/api/stores'); } catch (e) {} load(); });
    return { q, rows, stores, diffRows, diffSum, load, exp, yuan };
  },
};

// ---------------- 操作日志 ----------------
const AUDIT_LABEL = { name: '名称', code: '编码', unit: '单位', online_visible: '小程序可见', active: '启用', min_qty: '起订量', max_qty: '限购量',
  area_limited: '限定区域', reg_cert_no: '注册证号', registrant: '注册人', supplier_id: '供应商', barcode: '条码', price: '售价', cost: '成本',
  stock_item_id: '扣减库存品', deduct_qty: '扣减量', username: '账号', display_name: '姓名', role_id: '角色编号', min_discount_rate: '最低折扣',
  max_adjust_amount: '最多可调低', is_admin: '后台角色', permissions: '权限', address: '地址', phone: '电话', staff_can_view_stock: '店员可看库存',
  staff_can_edit_stock: '店员可改库存', accept_online_orders: '接小程序订单', print_mode: '出票方式', auto_print_online: '小程序单自动出票',
  auto_print_pos: '收银自动出票', alert_qty: '预警数量', pos_allow_negative: '收银库存不够也能卖', online_allow_negative: '小程序库存不够也能下单',
  online_deduct_on: '小程序扣库存时机', online_auto_accept: '扫码点单自动接单', expiry_alert_days: '临期提醒天数', refund_days: '退款期限天数' };
const AUDIT_MONEY = new Set(['price', 'cost', 'max_adjust_amount']);
const Audit = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-date-picker v-model="q.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:250px" @change="search" />
      <el-select v-model="q.action" placeholder="全部操作" clearable style="width:140px" @change="search"><el-option v-for="a in actions" :key="a" :label="a" :value="a" /></el-select>
      <el-input v-model="q.keyword" placeholder="商品、单号、账号、操作人" clearable style="width:220px" @keyup.enter="search" @clear="search" />
      <el-button @click="search">查询</el-button>
      <span class="grow"></span>
    </div>
    <el-table :data="rows" size="small" v-loading="loading">
      <el-table-column type="expand"><template #default="{row}"><div style="padding:4px 16px 10px 48px">
        <div v-if="row.summary" style="margin-bottom:6px">{{row.summary}}</div>
        <el-table v-if="Object.keys(row.changes).length" :data="fmt(row.changes)" size="small" border>
          <el-table-column prop="k" label="项目" width="200" /><el-table-column prop="b" label="改前" /><el-table-column prop="a" label="改后" />
        </el-table></div></template></el-table-column>
      <el-table-column prop="at" label="时间" width="170" />
      <el-table-column prop="user_name" label="操作人" width="110" />
      <el-table-column label="操作" width="100"><template #default="{row}"><el-tag size="small" :type="tagType(row.action)">{{row.action}}</el-tag></template></el-table-column>
      <el-table-column prop="target" label="对象" min-width="140" />
      <el-table-column label="内容" min-width="300"><template #default="{row}">{{row.summary || (Object.keys(row.changes).length + ' 项改动，展开查看')}}</template></el-table-column>
    </el-table>
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><el-pagination layout="total, prev, pager, next" :total="total" :page-size="50" v-model:current-page="page" @current-change="load" /></div>
  </div>`,
  setup() {
    const q = reactive({ range: [daysAgo(29), today()], action: '', keyword: '' }), rows = ref([]), total = ref(0), page = ref(1), actions = ref([]), loading = ref(false);
    const load = async () => {
      loading.value = true;
      try {
        const r = await api.get('/api/audit-logs', { begin: (q.range || [])[0], end: (q.range || [])[1], action: q.action || undefined, keyword: q.keyword || undefined, page: page.value });
        rows.value = r.rows; total.value = r.total; actions.value = r.actions;
      } catch (e) { err(e); } finally { loading.value = false; }
    };
    const search = () => { page.value = 1; load(); };
    const show = (k, v) => {
      if (v === null || v === undefined || v === '') return '—';
      if (typeof v === 'boolean') return v ? '是' : '否';
      if (AUDIT_MONEY.has(k) && typeof v === 'number') return '¥' + yuan(v);
      if (Array.isArray(v)) return v.length ? v.join('、') : '（无）';
      return String(v);
    };
    const fmt = (ch) => Object.entries(ch).map(([key, [b, a]]) => {
      const m = /^(规格.+)\.(\w+)$/.exec(key), f = m ? m[2] : key;
      return { k: (m ? m[1] + ' ' : '') + (AUDIT_LABEL[f] || f), b: show(f, b), a: show(f, a) };
    });
    const tagType = (a) => ({ '改价': 'warning', '退款': 'danger', '单据作废': 'danger', '角色权限': 'warning', '账号': 'info' }[a] || '');
    onMounted(load);
    return { q, rows, total, page, actions, loading, load, search, fmt, tagType };
  },
};

// ---------------- 经营概览 ----------------
const Dashboard = {
  props: ['meta', 'go'],
  template: `
  <div>
    <div class="stats tint">
      <div class="stat t-blue"><div class="k">今日实收</div><div class="v">¥{{yuan(t.net)}}</div>
        <div class="s">昨日 ¥{{yuan(y.net)}}<template v-if="cmp(t.net, y.net)"> · <span :class="cmp(t.net, y.net).cls + '-t'">{{cmp(t.net, y.net).text}}</span></template></div></div>
      <div class="stat t-cyan"><div class="k">今日单数</div><div class="v">{{t.orders || 0}} <small>单</small></div>
        <div class="s">门店收银 {{t.pos_orders || 0}} · 扫码点单 {{t.online_orders || 0}}</div></div>
      <div class="stat t-red clickable" @click="go('orders')"><div class="k">待接单</div><div class="v" :style="pending ? 'color:var(--danger)' : ''">{{pending}}</div>
        <div class="s">各门店扫码点单 · 点击查看 ›</div></div>
      <div class="stat t-purple"><div class="k">本月实收</div><div class="v">¥{{yuan(m.net)}}</div>
        <div class="s">毛利 ¥{{yuan(m.profit)}}<template v-if="m.net > 0"> · 毛利率 {{(m.profit / m.net * 100).toFixed(1)}}%</template></div></div>
    </div>
    <div class="dash-row">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">营收趋势</div>
          <div class="toolbar" style="margin:0">
            <div class="segs mini"><div v-for="x in [['net', '实收'], ['orders', '单数'], ['avg', '客单价'], ['margin', '毛利率']]" :key="x[0]" class="seg" :class="{on: metric === x[0]}" @click="metric = x[0]">{{x[1]}}</div></div>
            <div class="segs mini"><div v-for="n in [14, 30, 90]" :key="n" class="seg" :class="{on: days === n}" @click="days = n; loadTrend()">近 {{n}} 天</div></div>
          </div></div>
        <line-chart :items="trendItems" :fmt="trendFmt" :height="240" />
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">收款方式</div><span class="muted" style="font-size:12px">近 {{days}} 天净收</span></div>
        <div style="height:12px"></div>
        <donut-chart :parts="methodParts" :fmt="v => '¥' + yuan(v)" :short="v => '¥' + wan(v)" center="净收" />
        <div class="mini-stats"><div><span>门店收银</span><b>{{pt.pos_orders || 0}} 单</b></div><div><span>扫码点单</span><b>{{pt.online_orders || 0}} 单</b></div></div>
      </div>
    </div>
    <div class="dash-row">
      <div class="panel">
        <div class="panel-title">下单时段</div>
        <heat-map v-if="heat" :heat="heat" />
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">热销商品</div><span class="link-more" @click="go('productSales')">商品销售核对 ›</span></div>
        <div style="height:12px"></div>
        <rank-list :rows="hot" :fmt="v => v + ' 件'" empty="这段时间还没有销售" />
      </div>
    </div>
    <div class="dash-row">
      <div class="panel">
        <div class="panel-title">今日各门店</div>
        <el-table v-if="byStore.length" :data="byStore">
          <el-table-column prop="store_name" label="门店" min-width="160" />
          <el-table-column prop="orders" label="单数" width="80" align="right" />
          <el-table-column label="实收" width="120" align="right"><template #default="{row}"><b>¥{{yuan(row.net)}}</b></template></el-table-column>
          <el-table-column label="优惠" width="110" align="right"><template #default="{row}">¥{{yuan(row.discount)}}</template></el-table-column>
          <el-table-column label="退款" width="110" align="right"><template #default="{row}">¥{{yuan(row.refunded)}}</template></el-table-column>
        </el-table>
        <el-empty v-if="!byStore.length" :image-size="60" description="今天还没有收款" />
      </div>
      <div class="panel">
        <div class="panel-title" style="margin-bottom:12px">常用</div>
        <div class="quick">
          <div class="q" @click="go('products')"><b>新增商品</b><span>规格、库存品、扣减量</span></div>
          <div class="q" @click="go('requests')"><b>调拨到门店<span v-if="reqPending" class="badge-n">{{reqPending}}</span></b><span>{{ reqPending ? reqPending + ' 张要货申请待处理' : '处理门店要货' }}</span></div>
          <div class="q" @click="go('revenue')"><b>营收报表</b><span>日报 / 周报 / 月报</span></div>
          <div class="q" @click="go('stores')"><b>区域二维码</b><span>打印贴到区域</span></div>
        </div>
      </div>
    </div>
    <div class="dash-row even" v-if="alerts !== null || expiring !== null">
      <div v-if="alerts !== null" class="panel">
        <div class="panel-head"><div><div class="panel-title">库存预警 <span v-if="alerts.length" style="color:var(--danger)">{{alerts.length}}</span></div></div><span class="link-more" @click="go('inventory')">库存总览 ›</span></div>
        <el-table v-if="alerts.length" :data="alerts.slice(0, 8)">
          <el-table-column prop="location_name" label="仓库 / 门店" min-width="110" />
          <el-table-column prop="name" label="库存品" min-width="150" />
          <el-table-column label="现有" width="90" align="right"><template #default="{row}"><el-tag :type="row.qty <= 0 ? 'danger' : 'warning'">{{row.qty}}</el-tag></template></el-table-column>
          <el-table-column prop="alert_qty" label="预警量" width="80" align="right" />
        </el-table>
        <div v-if="alerts.length > 8" class="muted" style="margin-top:8px;font-size:12px">还有 {{alerts.length - 8}} 条，到“库存总览”里查看</div>
        <el-empty v-if="!alerts.length" :image-size="50" description="没有低于预警量的库存品" />
      </div>
      <div v-if="expiring !== null" class="panel">
        <div class="panel-head"><div><div class="panel-title">临期提醒 <span v-if="expiring.length" style="color:var(--danger)">{{expiring.length}}</span></div></div><span class="link-more" @click="go('batches')">批次 / 有效期 ›</span></div>
        <el-table v-if="expiring.length" :data="expiring.slice(0, 8)">
          <el-table-column prop="name" label="库存品" min-width="150" />
          <el-table-column prop="batch_no" label="批号" width="100" />
          <el-table-column label="有效期至" min-width="150"><template #default="{row}"><el-tag :type="row.expired ? 'danger' : 'warning'">{{row.expiry_date}}{{ row.expired ? ' 已过期' : '' }}</el-tag></template></el-table-column>
          <el-table-column label="剩余" width="80" align="right"><template #default="{row}">{{row.qty}}</template></el-table-column>
        </el-table>
        <div v-if="expiring.length > 8" class="muted" style="margin-top:8px;font-size:12px">还有 {{expiring.length - 8}} 条，到“批次 / 有效期”里查看</div>
        <el-empty v-if="!expiring.length" :image-size="50" description="没有临期的批次" />
      </div>
    </div>
  </div>`,
  setup() {
    const days = ref(14), metric = ref('net'), trend = ref([]), pt = ref({}), heat = ref(null), hot = ref([]);
    // 营收趋势可切换：实收 / 单数 / 客单价 / 毛利率（按天）
    const trendItems = computed(() => trend.value.map(d => ({ label: d.label, tip: d.tip,
      value: metric.value === 'net' ? d.net / 100 : metric.value === 'orders' ? d.orders : metric.value === 'avg' ? (d.orders ? d.net / d.orders / 100 : 0) : (d.net > 0 ? d.profit / d.net * 100 : 0) })));
    const trendFmt = (v) => metric.value === 'orders' ? v + ' 单' : metric.value === 'margin' ? v.toFixed(1) + '%' : '¥' + yuan(Math.round(v * 100));
    const wan = (fen) => fen >= 1000000 ? +(fen / 1000000).toFixed(1) + '万' : yuan(fen);
    const methodParts = computed(() => [['wechat', '微信'], ['alipay', '支付宝'], ['cash', '现金'], ['other', '其他']]
      .map(([k, n]) => ({ label: n, value: ((pt.value.methods || {})[k]) || 0, color: PAY_COLORS[k] })));
    const loadTrend = async () => {
      const b = daysAgo(days.value - 1), e = today();
      try {
        const [r, ins, ps] = await Promise.all([api.get('/api/reports/revenue', { begin: b, end: e }), api.get('/api/reports/insights', { begin: b, end: e }),
          api.get('/api/reports/product-sales', { begin: b, end: e })]);
        pt.value = r.total;
        const net = revenueSeries(r.rows, b, e, 'day'), ord = revenueSeries(r.rows, b, e, 'day', 'orders'), pro = revenueSeries(r.rows, b, e, 'day', 'profit');
        trend.value = net.map((x, i) => ({ label: i === net.length - 1 ? '今日' : x.label, tip: x.tip, net: x.value, orders: ord[i].value, profit: pro[i].value }));
        heat.value = ins.heat;
        hot.value = ps.rows.filter(x => x.net_qty > 0).sort((a, c) => c.net_qty - a.net_qty).slice(0, 6)
          .map(x => ({ name: x.product_name + (x.sku_name && x.sku_name !== '默认' ? ' · ' + x.sku_name : ''), value: x.net_qty }));
      } catch (e) {}
    };
    const t = ref({}), m = ref({}), y = ref({}), pending = ref(0), byStore = ref([]), alerts = ref(null), expiring = ref(null), reqPending = ref(0);
    onMounted(async () => {
      loadTrend();
      const d = today();
      try {
        const yd = daysAgo(1);
        const [a, b, p, c] = await Promise.all([api.get('/api/reports/revenue', { begin: d, end: d }),
          api.get('/api/reports/revenue', { begin: d.slice(0, 8) + '01', end: d, group: 'month' }), api.get('/api/orders', { status: 'pending', size: 1 }),
          api.get('/api/reports/revenue', { begin: yd, end: yd })]);
        t.value = a.total; m.value = b.total; pending.value = p.total; byStore.value = a.rows; y.value = c.total || {};
      } catch (e) { err(e); }
      try { alerts.value = await api.get('/api/stock-alerts'); expiring.value = await api.get('/api/expiry-alerts');
        reqPending.value = (await api.get('/api/requisitions', { status: 'pending', size: 1 })).total; } catch (e) { alerts.value = null; }  // 没有库存权限的账号不显示
    });
    // 和昨日比：今天或昨日为 0 时不显示百分比（早上还没开单时不显示“↓100%”）
    const cmp = (a, b) => { a = +a || 0; b = +b || 0; if (!a || !b) return null; const r = Math.round((a - b) / b * 100);
      return { cls: r >= 0 ? 'up' : 'down', text: (r >= 0 ? '↑ ' : '↓ ') + Math.abs(r) + '%' }; };
    return { days, metric, trendItems, trendFmt, wan, trend, pt, heat, hot, methodParts, loadTrend, t, m, y, cmp, pending, byStore, alerts, expiring, reqPending, yuan, icon: Shouyin.icon };
  },
};

// ---------------- 主框架 ----------------
// [键, 名称, 权限, 组件, 分组, 图标, 说明]
const MENU = [
  ['products', '商品档案', 'catalog', Products, '商品资料', 'package', '名称、规格、售价、图片、医疗器械资料'],
  ['categories', '商品分类', 'catalog', Categories, '商品资料', 'tag', '大类、小类'],
  ['stockItems', '库存品', 'catalog', StockItems, '商品资料', 'layers', '实际占库存的东西，多个规格可共用'],
  ['suppliers', '供应商', 'catalog', Suppliers, '商品资料', 'truck', '供货单位和联系方式'],
  ['dashboard', '经营概览', 'reports', Dashboard, '经营', 'home', '今天和本月的营收、待处理订单'],
  ['orders', '订单', 'reports', Orders, '经营', 'receipt', '所有门店的收银单和小程序订单'],
  ['revenue', '营收报表', 'reports', Revenue, '经营', 'chart', '按门店、日 / 周 / 月统计，可导出'],
  ['shifts', '交班记录', 'reports', Shifts, '经营', 'clock', '每个收银员每一班的收款、备用金、现金差额'],
  ['productSales', '商品销售核对', 'reports', ProductSales, '经营', 'check', '按商品或按分类查卖了多少，展开看逐单明细'],
  ['inventory', '库存总览', 'inventory', Inventory, '库存', 'warehouse', '仓库和各门店的库存、期间进出与预警'],
  ['stockIn', '入库 / 出库', 'inventory', Inventory, '库存', 'box', '采购到货登记入库；出库用于报损、领用等'],
  ['stockCount', '盘点', 'inventory', Inventory, '库存', 'scan', '按实点数量调整库存，差额记入台账'],
  ['requests', '要货与调拨', 'inventory', Inventory, '库存', 'refresh', '处理门店要货申请，仓库调拨到门店'],
  ['batches', '批次 / 有效期', 'inventory', Inventory, '库存', 'clock', '按批次查看生产日期、有效期和剩余数量'],
  ['docs', '单据与台账', 'inventory', Inventory, '库存', 'inbox', '入库、出库、盘点、调拨单据和库存流水'],
  ['stores', '门店与区域', 'stores', Stores, '门店', 'store', '门店设置、区域二维码、出票方式'],
  ['receipt', '小票设置', 'receipt_config', ReceiptSettings, '门店', 'printer', '小票文字、字段、排版、底部图片'],
  ['rules', '业务规则', 'stores', Rules, '门店', 'sliders', '扣库存时机、库存不够能否卖'],
  ['accounts', '账号与权限', 'users', Accounts, '系统', 'users', '角色权限、优惠上限、门店分配'],
  ['audit', '操作日志', 'users', Audit, '系统', 'list', '谁在什么时候改了价格、权限、库存，作废了什么单、退了什么款'],
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
      <div class="brand"><span class="mark">AW</span><div>{{shop.name || '收银系统'}}<small>收银系统 · 后台管理</small></div></div>
      <label class="nav-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input ref="navQ" v-model="navKw" placeholder="搜索菜单" @keyup.enter="navGo"><kbd>Ctrl K</kbd></label>
      <div class="nav">
        <template v-for="g in navGroups" :key="g">
          <div class="group">{{g}}</div>
          <div v-for="m in navMenu.filter(x => x[4] === g)" :key="m[0]" class="item" :class="{on: tab === m[0]}" @click="tab = m[0]"><span class="ico" v-html="icon(m[5])"></span>{{m[1]}}</div>
        </template>
        <div v-if="shop.address" class="shop">{{shop.address}}<template v-if="shop.phone"><br>电话 {{shop.phone}}</template></div>
      </div>
    </div>
    <div class="main">
      <div class="topbar">
        <div v-if="tab === 'dashboard'" class="title hello">{{greet}}，{{user.display_name || user.username}}<small>{{dateText}}</small></div>
        <div v-else class="title">{{cur[1]}}</div>
        <div class="who"><a class="pill" href="/web/store/"><span class="ico" v-html="icon('cart')"></span>门店工作台</a>
          <el-dropdown @command="c => c === 'pw' ? changePw() : logout()">
            <span class="me"><span class="avatar">{{(user.display_name || user.username).slice(0,1)}}</span><span><small>{{user.role_name}}</small>{{user.display_name || user.username}}</span></span>
            <template #dropdown><el-dropdown-menu><el-dropdown-item disabled>{{user.role_name}}</el-dropdown-item><el-dropdown-item command="pw">修改密码</el-dropdown-item><el-dropdown-item command="out" divided>退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown></div>
      </div>
      <div class="content" ref="contentEl" @scroll.passive="onScroll">
        <component v-if="ready" :is="tab" :meta="meta" v-bind="viewProps" :key="tab" />
      </div>
      <transition name="totop"><button v-if="showTop" class="totop" aria-label="回到顶部" title="回到顶部" @click="toTop"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></transition>
    </div>
  </div>`,
  setup() {
    const user = ref(null), lf = reactive({ username: '', password: '' }), busy = ref(false), tab = ref('dashboard'), ready = ref(false);
    const meta = reactive({ categories: [], suppliers: [], stockItems: [], stores: [], areas: [] });
    const menu = computed(() => user.value ? MENU.filter(m => user.value.is_admin && user.value.permissions.includes(m[2])) : []);
    const groups = computed(() => [...new Set(menu.value.map(m => m[4]))]);
    const cur = computed(() => menu.value.find(m => m[0] === tab.value) || []);
    // 页面间跳转；kind 给入库/出库页指定打开哪种单据
    const go = (k, kind) => { try { kind ? sessionStorage.setItem('stockKind', kind) : sessionStorage.removeItem('stockKind'); } catch (e) {} tab.value = k; };
    const viewProps = computed(() => cur.value[3] === Inventory ? { go, view: tab.value } : (tab.value === 'dashboard' ? { go } : {}));
    // 侧栏品牌块和底部信息：只有一家门店时显示它的名称、地址
    const shop = computed(() => meta.stores.length === 1 ? meta.stores[0] : {});
    // 侧栏搜索：按名称和说明筛菜单，回车进第一个；Ctrl+K 聚焦
    const navKw = ref(''), navQ = ref(null);
    const navMenu = computed(() => { const k = navKw.value.trim(); return k ? menu.value.filter(m => (m[1] + m[6]).includes(k)) : menu.value; });
    const navGroups = computed(() => [...new Set(navMenu.value.map(m => m[4]))]);
    const navGo = () => { if (navMenu.value.length) { tab.value = navMenu.value[0][0]; navKw.value = ''; navQ.value && navQ.value.blur(); } };
    window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && navQ.value) { e.preventDefault(); navQ.value.focus(); } });
    const hour = new Date().getHours(), greet = hour < 11 ? '早上好' : (hour < 13 ? '中午好' : (hour < 18 ? '下午好' : '晚上好'));
    const dateText = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    const toStore = () => { location.href = '/web/store/'; };
    // 滚过一屏出现“回到顶部”，平滑回顶，到顶后自动隐藏
    const contentEl = ref(null), showTop = ref(false);
    const onScroll = () => { const el = contentEl.value; showTop.value = !!el && el.scrollTop > el.clientHeight; };
    const toTop = () => contentEl.value && contentEl.value.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
      let weak = false;
      try { const r = await api.post('/api/auth/login', lf); api.setToken(r.token); user.value = r.user; weak = r.weak_password; await loadMeta(); } catch (e) { err(e); } finally { busy.value = false; }
      if (weak) {
        try { await ElMessageBox.confirm('这个账号还在用默认或过于简单的密码，正式使用前请先修改。', '请修改密码', { confirmButtonText: '现在修改', cancelButtonText: '稍后', type: 'warning' }); changePw(); } catch (e) {}
      }
    };
    const logout = () => { api.setToken(''); user.value = null; ready.value = false; };
    const changePw = async () => {
      let o, n;
      try { ({ value: o } = await ElMessageBox.prompt('原密码', '修改密码', { inputType: 'password' })); ({ value: n } = await ElMessageBox.prompt('新密码（至少 6 位）', '修改密码', { inputType: 'password' })); } catch (e) { return; }
      try { const r = await api.post('/api/auth/password', { old_password: o, new_password: n }); api.setToken(r.token); ok('密码已修改'); } catch (e) { err(e); }
    };
    window.onUnauthorized = () => { user.value = null; ready.value = false; };
    onMounted(async () => { if (api.token()) { try { user.value = await api.get('/api/auth/me'); await loadMeta(); } catch (e) {} } });
    return { user, lf, busy, tab, menu, groups, cur, shop, navKw, navQ, navMenu, navGroups, navGo, greet, dateText, meta, ready, login, logout, changePw, toStore, contentEl, showTop, onScroll, toTop, viewProps, icon: Shouyin.icon };
  },
};

const app = createApp(App); app.config.globalProperties.thumb = Shouyin.thumb;
app.component('bar-chart', BarChart); app.component('line-chart', LineChart); app.component('donut-chart', DonutChart); app.component('heat-map', HeatMap); app.component('rank-list', RankList);
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount('#app');
