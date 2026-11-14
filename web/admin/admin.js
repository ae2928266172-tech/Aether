// 后台管理
const { createApp, ref, reactive, computed, onMounted, watch } = Vue;
const { api, yuan, toFen, rid, today, receiptHtml } = Shouyin;
const { ElMessage, ElMessageBox } = ElementPlus;

const err = (e) => ElMessage.error(e.message || String(e));
const ok = (m) => ElMessage.success(m || '已保存');

// ---------------- 商品 ----------------
const Products = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-input v-model="kw" placeholder="名称 / 货号 / 条码" clearable style="width:220px" @keyup.enter="load" />
      <el-select v-model="cat" placeholder="全部分类" clearable style="width:160px" @change="load">
        <el-option v-for="c in meta.categories" :key="c.id" :label="catLabel(c)" :value="c.id" />
      </el-select>
      <el-checkbox v-model="showOff" @change="load">显示已下架</el-checkbox>
      <el-button @click="load">查询</el-button>
      <span class="grow"></span>
      <el-button type="primary" @click="edit()">新增商品</el-button>
    </div>
    <el-table :data="rows" border stripe>
      <el-table-column label="" width="66"><template #default="{row}"><div class="thumb"><img v-if="row.image" :src="row.image"><span v-else>{{row.name.slice(0,1)}}</span></div></template></el-table-column>
      <el-table-column prop="name" label="商品名称" min-width="140" />
      <el-table-column prop="code" label="货号" width="100" />
      <el-table-column prop="category_name" label="分类" width="100" />
      <el-table-column label="规格 / 售价 / 库存品 × 扣减量" min-width="300">
        <template #default="{row}">
          <div v-for="s in row.skus.filter(x=>x.active)" :key="s.id">
            {{s.name}}　¥{{yuan(s.price)}}　<span class="muted">{{s.stock_item_name ? s.stock_item_name + ' × ' + s.deduct_qty : '不扣库存'}}{{s.barcode ? '　条码 ' + s.barcode : ''}}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="supplier_name" label="供应商" width="120" />
      <el-table-column label="状态" width="110"><template #default="{row}">
        <el-tag v-if="!row.active" type="info">已下架</el-tag>
        <el-tag v-else-if="!row.online_visible" type="warning">仅门店</el-tag>
        <el-tag v-else type="success">在售</el-tag></template></el-table-column>
      <el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click="edit(row)">编辑</el-button></template></el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="form.id ? '编辑商品' : '新增商品'" width="900px" top="4vh">
      <el-form :model="form" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="商品名称" required><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="货号"><el-input v-model="form.code" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="分类">
            <el-select v-model="form.category_id" clearable filterable style="width:100%">
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
        name: '', code: '', category_id: null, unit: '件', image: '', description: '', online_visible: true, active: true,
        reg_cert_no: '', production_license_no: '', registrant: '', production_address: '', supplier_id: null, skus: [] });
      form.skus = row ? form.skus.map(s => ({ ...s, price_y: yuan(s.price), cost_y: s.cost == null ? '' : yuan(s.cost) })) : [blankSku()];
      dlg.value = true;
    };
    const addSku = () => form.skus.push({ ...blankSku(), name: '' });
    const upload = async (ev) => { const f = ev.target.files[0]; if (!f) return; try { form.image = (await api.upload(f)).url; } catch (e) { err(e); } ev.target.value = ''; };
    const save = async () => {
      if (!form.skus.length) return ElMessage.warning('至少一个规格');
      const body = { ...form, skus: form.skus.map((s, i) => ({ id: s.id, name: s.name, barcode: s.barcode || '', price: toFen(s.price_y),
        cost: s.cost_y === '' || s.cost_y == null ? null : toFen(s.cost_y), stock_item_id: s.stock_item_id || null,
        deduct_qty: s.deduct_qty || 1, active: s.active, sort: i })) };
      saving.value = true;
      try { form.id ? await api.put('/api/products/' + form.id, body) : await api.post('/api/products', body); ok(); dlg.value = false; load(); }
      catch (e) { err(e); } finally { saving.value = false; }
    };
    onMounted(load);
    return { rows, kw, cat, showOff, dlg, form, saving, load, edit, addSku, upload, save, catLabel, yuan };
  },
};

// ---------------- 通用简单资料表（分类、供应商、库存品） ----------------
function simpleCrud({ title, url, fields, columns, after }) {
  return {
    props: ['meta'],
    template: `
    <div class="panel">
      <div class="toolbar"><b>${title}</b><span class="grow"></span><el-button type="primary" @click="edit()">新增</el-button></div>
      <el-table :data="rows" border stripe>
        <el-table-column v-for="c in columns" :key="c.prop" :prop="c.prop" :label="c.label" :width="c.width">
          <template #default="{row}">{{ c.fmt ? c.fmt(row, meta) : row[c.prop] }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click="edit(row)">编辑</el-button></template></el-table-column>
      </el-table>
      <el-dialog v-model="dlg" :title="form.id ? '编辑' : '新增'" width="480px">
        <el-form :model="form" label-width="90px">
          <el-form-item v-for="f in fields" :key="f.prop" :label="f.label">
            <el-switch v-if="f.type==='bool'" v-model="form[f.prop]" />
            <el-select v-else-if="f.type==='select'" v-model="form[f.prop]" clearable filterable style="width:100%">
              <el-option v-for="o in f.options(meta, form)" :key="o.id" :label="o.name" :value="o.id" /></el-select>
            <el-input v-else-if="f.type==='money'" v-model="form[f.prop]"><template #append>元</template></el-input>
            <el-input-number v-else-if="f.type==='int'" v-model="form[f.prop]" />
            <el-input v-else v-model="form[f.prop]" />
          </el-form-item>
        </el-form>
        <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
      </el-dialog>
    </div>`,
    setup(props) {
      const rows = ref([]), dlg = ref(false), form = reactive({});
      const load = async () => { try { rows.value = await api.get(url); if (after) after(props.meta, rows.value); } catch (e) { err(e); } };
      const edit = (row) => {
        Object.keys(form).forEach(k => delete form[k]);
        fields.forEach(f => { form[f.prop] = row ? row[f.prop] : (f.default !== undefined ? f.default : (f.type === 'bool' ? true : '')); if (f.type === 'money' && row) form[f.prop] = yuan(row[f.prop]); });
        if (row) form.id = row.id;
        dlg.value = true;
      };
      const save = async () => {
        const body = {};
        fields.forEach(f => { let v = form[f.prop]; if (f.type === 'money') v = toFen(v); if (f.type === 'select' && v === '') v = null; body[f.prop] = v; });
        try { form.id ? await api.put(url + '/' + form.id, body) : await api.post(url, body); ok(); dlg.value = false; load(); } catch (e) { err(e); }
      };
      onMounted(load);
      return { rows, dlg, form, edit, save, fields, columns };
    },
  };
}

const Categories = simpleCrud({
  title: '商品分类（先建大类，再在大类下建小类）', url: '/api/categories',
  fields: [{ prop: 'name', label: '名称' }, { prop: 'parent_id', label: '上级大类', type: 'select', default: null,
    options: (m, f) => m.categories.filter(c => !c.parent_id && c.id !== f.id) }, { prop: 'sort', label: '排序', type: 'int', default: 0 }, { prop: 'active', label: '启用', type: 'bool' }],
  columns: [{ prop: 'name', label: '名称' }, { prop: 'parent_id', label: '上级大类', fmt: (r, m) => (m.categories.find(c => c.id === r.parent_id) || {}).name || '—' },
    { prop: 'sort', label: '排序', width: 80 }, { prop: 'active', label: '状态', width: 80, fmt: r => r.active ? '启用' : '停用' }],
  after: (m, rows) => { m.categories = rows; },
});
const Suppliers = simpleCrud({
  title: '供应商', url: '/api/suppliers',
  fields: [{ prop: 'name', label: '名称' }, { prop: 'contact', label: '联系人' }, { prop: 'phone', label: '电话' }, { prop: 'remark', label: '备注' }, { prop: 'active', label: '启用', type: 'bool' }],
  columns: [{ prop: 'name', label: '名称' }, { prop: 'contact', label: '联系人' }, { prop: 'phone', label: '电话' }, { prop: 'remark', label: '备注' }],
  after: (m, rows) => { m.suppliers = rows; },
});
const StockItems = simpleCrud({
  title: '库存品（实际占库存的东西；多个商品规格可以共用一个库存品）', url: '/api/stock-items',
  fields: [{ prop: 'name', label: '名称' }, { prop: 'code', label: '编码' }, { prop: 'unit', label: '单位', default: '份' }, { prop: 'cost', label: '单位成本', type: 'money', default: '0' },
    { prop: 'supplier_id', label: '供应商', type: 'select', default: null, options: m => m.suppliers }, { prop: 'active', label: '启用', type: 'bool' }],
  columns: [{ prop: 'name', label: '名称' }, { prop: 'code', label: '编码' }, { prop: 'unit', label: '单位', width: 80 },
    { prop: 'cost', label: '单位成本', width: 100, fmt: r => '¥' + yuan(r.cost) }, { prop: 'supplier_id', label: '供应商', fmt: (r, m) => (m.suppliers.find(s => s.id === r.supplier_id) || {}).name || '' },
    { prop: 'active', label: '状态', width: 80, fmt: r => r.active ? '启用' : '停用' }],
  after: (m, rows) => { m.stockItems = rows.filter(r => r.active); },
});

// ---------------- 门店与区域二维码 ----------------
const Stores = {
  props: ['meta'],
  template: `
  <div>
  <div class="panel">
    <div class="toolbar"><b>门店</b><span class="grow"></span><el-button type="primary" @click="editStore()">新增门店</el-button></div>
    <el-table :data="meta.stores" border>
      <el-table-column prop="name" label="门店" />
      <el-table-column prop="address" label="地址" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column label="门店看库存" width="100"><template #default="{row}">{{row.staff_can_view_stock ? '允许' : '不允许'}}</template></el-table-column>
      <el-table-column label="门店改库存" width="100"><template #default="{row}">{{row.staff_can_edit_stock ? '允许' : '不允许'}}</template></el-table-column>
      <el-table-column label="小程序接单" width="100"><template #default="{row}">{{row.accept_online_orders ? '接单' : '暂停'}}</template></el-table-column>
      <el-table-column label="出票" width="110"><template #default="{row}">{{row.print_mode === 'agent' ? '打印小助手' : '本机浏览器'}}</template></el-table-column>
      <el-table-column label="状态" width="80"><template #default="{row}">{{row.active ? '营业' : '停用'}}</template></el-table-column>
      <el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click="editStore(row)">编辑</el-button></template></el-table-column>
    </el-table>
  </div>
  <div class="panel">
    <div class="toolbar"><b>区域与二维码</b><span class="muted">顾客扫区域二维码点单，订单自动带上门店和区域</span><span class="grow"></span><el-button type="primary" @click="editArea()">新增区域</el-button></div>
    <el-table :data="areas" border>
      <el-table-column prop="store_name" label="门店" width="140" />
      <el-table-column prop="name" label="区域" />
      <el-table-column prop="sort" label="排序" width="80" />
      <el-table-column label="状态" width="80"><template #default="{row}">{{row.active ? '启用' : '停用'}}</template></el-table-column>
      <el-table-column label="操作" width="220"><template #default="{row}">
        <el-button link type="primary" @click="showQr(row)">二维码</el-button>
        <el-button link type="primary" @click="editArea(row)">编辑</el-button>
        <el-button link type="danger" @click="resetCode(row)">作废旧码</el-button></template></el-table-column>
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
    </el-form>
    <template #footer><el-button @click="aDlg=false">取消</el-button><el-button type="primary" @click="saveArea">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="qDlg" title="区域二维码" width="380px">
    <div class="qr-box">
      <div style="font-weight:600;margin-bottom:6px">{{qArea.store_name}} · {{qArea.name}}</div>
      <img :src="qImg" />
      <div class="muted" style="font-size:12px;word-break:break-all;margin-top:6px">{{qUrl}}</div>
      <div class="muted" style="font-size:12px;margin-top:6px">小程序上线前先用网页版点单；小程序发布后这里改为小程序码。</div>
      <el-button type="primary" style="margin-top:10px" @click="downloadQr">下载图片</el-button>
    </div>
  </el-dialog>
  </div>`,
  setup(props, { emit }) {
    const areas = ref([]), sDlg = ref(false), aDlg = ref(false), qDlg = ref(false);
    const sForm = reactive({}), aForm = reactive({}), qArea = ref({}), qImg = ref(''), qUrl = ref('');
    const loadAreas = async () => { try { areas.value = await api.get('/api/areas'); } catch (e) { err(e); } };
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
      try { if (sForm.print_mode === 'agent') await api.put('/api/stores/' + sForm.id, sForm); printer.value = await api.post('/api/stores/' + sForm.id + '/printer/key'); } catch (e) { err(e); }
    };
    const testPrint = async () => {
      try { await api.put('/api/stores/' + sForm.id, sForm); printer.value = { ...printer.value, ...(await api.post('/api/stores/' + sForm.id + '/printer/test')) }; ok('测试页已发送，打印小助手在线时几秒内出纸'); } catch (e) { err(e); }
    };
    const editArea = (r) => { Object.assign(aForm, r ? { ...r } : { id: null, store_id: (props.meta.stores[0] || {}).id, name: '', sort: 0, active: true }); aDlg.value = true; };
    const saveArea = async () => { try { aForm.id ? await api.put('/api/areas/' + aForm.id, aForm) : await api.post('/api/areas', aForm); ok(); aDlg.value = false; loadAreas(); } catch (e) { err(e); } };
    const resetCode = async (r) => {
      try { await ElMessageBox.confirm('作废后，已经贴出去的旧二维码将无法点单，需要重新打印。确定吗？', '作废旧码', { type: 'warning' }); } catch (e) { return; }
      try { await api.post('/api/areas/' + r.id + '/reset-code'); ok('已生成新二维码'); loadAreas(); } catch (e) { err(e); }
    };
    const showQr = (r) => {
      qArea.value = r; qUrl.value = location.origin + '/web/h5/?area=' + r.code;
      const q = qrcode(0, 'M'); q.addData(qUrl.value); q.make(); qImg.value = q.createDataURL(8, 16); qDlg.value = true;
    };
    const downloadQr = () => { const a = document.createElement('a'); a.href = qImg.value; a.download = qArea.value.store_name + '_' + qArea.value.name + '.gif'; a.click(); };
    onMounted(loadAreas);
    return { areas, sDlg, aDlg, qDlg, sForm, aForm, qArea, qImg, qUrl, editStore, saveStore, printer, origin, agentUrl, resetKey, testPrint, editArea, saveArea, resetCode, showQr, downloadQr };
  },
};

// ---------------- 仓库与库存 ----------------
const Inventory = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-select v-model="loc" style="width:180px" @change="load">
        <el-option v-for="l in locations" :key="l.id" :label="l.kind_text + '：' + l.name" :value="l.id" /></el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:260px" @change="load" />
      <el-input v-model="kw" placeholder="库存品" clearable style="width:150px" @keyup.enter="load" />
      <el-button @click="load">查询</el-button>
      <span class="grow"></span>
      <el-button @click="openDoc('in')">入库</el-button>
      <el-button @click="openDoc('out')">出库</el-button>
      <el-button type="primary" @click="openDoc('transfer')">调拨到门店</el-button>
      <el-button @click="openDoc('adjust')">盘点</el-button>
      <el-button @click="newWarehouse">新增仓库</el-button>
    </div>
    <el-table :data="rows" border stripe show-summary :summary-method="summary">
      <el-table-column prop="name" label="库存品" min-width="140" />
      <el-table-column prop="unit" label="单位" width="60" />
      <el-table-column v-for="c in cols" :key="c[0]" :label="c[1]" width="86" class-name="right">
        <template #default="{row}"><el-button link @click="showMoves(row)">{{row[c[0]]}}</el-button></template></el-table-column>
      <el-table-column prop="current" label="当前库存" width="90" class-name="right" />
    </el-table>
    <div class="muted" style="margin-top:6px">期初 = 开始日之前的累计；结余 = 期初 + 入库 − 出库 + 调入 − 调出 − 销售 + 退货回补 ± 盘点。点数字查看流水。</div>

    <el-dialog v-model="dDlg" :title="docTitle" width="720px" top="4vh">
      <el-form label-width="80px" inline>
        <el-form-item v-if="doc.kind==='out' || doc.kind==='transfer'" label="调出"><el-select v-model="doc.from" style="width:170px"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind!=='out'" :label="doc.kind==='transfer' ? '调入' : (doc.kind==='adjust' ? '盘点地点' : '入库到')"><el-select v-model="doc.to" style="width:170px"><el-option v-for="l in locations" :key="l.id" :label="l.name" :value="l.id" /></el-select></el-form-item>
        <el-form-item v-if="doc.kind==='in'" label="供应商"><el-select v-model="doc.supplier_id" clearable style="width:170px"><el-option v-for="s in meta.suppliers" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="doc.remark" style="width:170px" /></el-form-item>
      </el-form>
      <div class="muted" style="margin-bottom:6px">{{ doc.kind==='adjust' ? '填写实际盘点数量，留空表示不盘该项。' : '在数量列直接填数，留空或 0 表示不处理。' }}</div>
      <el-table :data="doc.lines" border size="small" max-height="420">
        <el-table-column prop="name" label="库存品" />
        <el-table-column prop="unit" label="单位" width="60" />
        <el-table-column label="来源现有" width="90"><template #default="{row}">{{ stockAt(doc.kind==='in' || doc.kind==='adjust' ? doc.to : doc.from, row.id) }}</template></el-table-column>
        <el-table-column label="数量" width="120"><template #default="{row}"><el-input v-model="row.qty" size="small" /></template></el-table-column>
      </el-table>
      <template #footer><el-button @click="dDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="submitDoc">提交</el-button></template>
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
    const dDlg = ref(false), saving = ref(false), doc = reactive({ kind: 'in', from: null, to: null, remark: '', supplier_id: null, lines: [], rid: '' });
    const balances = reactive({});
    const mDlg = ref(false), moves = ref([]), mTitle = ref('');
    const loadLocs = async () => { locations.value = await api.get('/api/locations'); if (!loc.value && locations.value.length) loc.value = locations.value[0].id; };
    const load = async () => {
      if (!loc.value) return;
      try { rows.value = await api.get('/api/stock-ledger', { location_id: loc.value, begin: (range.value || [])[0], end: (range.value || [])[1], keyword: kw.value }); } catch (e) { err(e); }
    };
    const summary = ({ columns, data }) => columns.map((c, i) => i === 0 ? '合计' : '');
    const docTitle = computed(() => ({ in: '入库', out: '出库', transfer: '调拨（仓库 → 门店）', adjust: '盘点' }[doc.kind]));
    const stockAt = (lid, sid) => { const m = balances[lid]; if (!m) return ''; const r = m.find(x => x.stock_item_id === sid); return r ? r.qty : 0; };
    const fetchBal = async (lid) => { if (lid && !balances[lid]) balances[lid] = await api.get('/api/stock', { location_id: lid }); };
    watch(() => [doc.from, doc.to], ([a, b]) => { fetchBal(a).catch(() => {}); fetchBal(b).catch(() => {}); });
    const openDoc = async (kind) => {
      Object.keys(balances).forEach(k => delete balances[k]);
      const wh = locations.value.find(l => l.kind === 'warehouse'), st = locations.value.find(l => l.kind === 'store');
      Object.assign(doc, { kind, remark: '', supplier_id: null, rid: rid(),
        from: kind === 'out' ? loc.value : (kind === 'transfer' ? (wh || {}).id : null),
        to: kind === 'transfer' ? (st || {}).id : (kind === 'out' ? null : loc.value) });
      doc.lines = props.meta.stockItems.map(i => ({ id: i.id, name: i.name, unit: i.unit, qty: '' }));
      dDlg.value = true;
    };
    const submitDoc = async () => {
      const lines = doc.lines.filter(l => l.qty !== '' && l.qty !== null && (doc.kind === 'adjust' || parseFloat(l.qty) > 0)).map(l => ({ stock_item_id: l.id, qty: parseFloat(l.qty) }));
      if (!lines.length) return ElMessage.warning('请填写数量');
      saving.value = true;
      try {
        await api.post('/api/stock-docs', { kind: doc.kind, from_location_id: doc.kind === 'out' || doc.kind === 'transfer' ? doc.from : null,
          to_location_id: doc.kind === 'out' ? null : doc.to, supplier_id: doc.supplier_id, remark: doc.remark, request_id: doc.rid, lines });
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
    return { locations, loc, range, kw, rows, cols, load, summary, dDlg, saving, doc, docTitle, openDoc, submitDoc, stockAt, mDlg, moves, mTitle, showMoves, newWarehouse };
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
    <div class="toolbar">
      <el-select v-model="q.store_id" placeholder="全部门店" clearable style="width:140px"><el-option v-for="s in meta.stores" :key="s.id" :label="s.name" :value="s.id" /></el-select>
      <el-select v-model="q.source" placeholder="全部来源" clearable style="width:120px"><el-option label="门店收银" value="pos" /><el-option label="小程序" value="online" /></el-select>
      <el-select v-model="q.status" placeholder="全部状态" clearable style="width:120px"><el-option v-for="(t,k) in st" :key="k" :label="t" :value="k" /></el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" style="width:260px" />
      <el-input v-model="q.keyword" placeholder="单号 / 床号 / 电话" clearable style="width:170px" @keyup.enter="load(1)" />
      <el-button type="primary" @click="load(1)">查询</el-button>
    </div>
    <el-table :data="rows" border stripe @row-click="open">
      <el-table-column prop="no" label="单号" width="190" />
      <el-table-column prop="created_at" label="时间" width="160" />
      <el-table-column prop="store_name" label="门店" width="100" />
      <el-table-column prop="source_text" label="来源" width="80" />
      <el-table-column label="区域" width="140"><template #default="{row}">{{row.area_name}} {{row.location_note}}</template></el-table-column>
      <el-table-column label="商品" min-width="200"><template #default="{row}">{{row.items.map(i => i.product_name + (i.sku_name !== '默认' ? '(' + i.sku_name + ')' : '') + '×' + i.qty).join('，')}}</template></el-table-column>
      <el-table-column label="应收" width="90" class-name="right"><template #default="{row}">{{yuan(row.payable_amount)}}</template></el-table-column>
      <el-table-column label="状态" width="130"><template #default="{row}">{{row.status_text}} / {{row.pay_status_text}}</template></el-table-column>
    </el-table>
    <el-pagination style="margin-top:10px" layout="total, prev, pager, next" :total="total" :page-size="50" :current-page="page" @current-change="load" />
    <el-drawer v-model="drawer" title="订单详情" size="720px"><order-detail :order="cur" /></el-drawer>
  </div>`,
  setup() {
    const q = reactive({ store_id: null, source: null, status: null, keyword: '' }), range = ref([]), rows = ref([]), total = ref(0), page = ref(1);
    const drawer = ref(false), cur = ref(null);
    const st = { pending: '待接单', accepted: '已接单', completed: '已完成', cancelled: '已取消' };
    const load = async (p) => {
      page.value = p || 1;
      try { const r = await api.get('/api/orders', { ...q, begin: (range.value || [])[0], end: (range.value || [])[1], page: page.value }); rows.value = r.items; total.value = r.total; } catch (e) { err(e); }
    };
    const open = async (row) => { try { cur.value = await api.get('/api/orders/' + row.id); drawer.value = true; } catch (e) { err(e); } };
    onMounted(() => load(1));
    return { q, range, rows, total, page, load, open, drawer, cur, st, yuan };
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
    <el-table :data="rowsWithTotal" border stripe>
      <el-table-column prop="period" label="期间" width="150" fixed />
      <el-table-column prop="store_name" label="门店" width="100" />
      <el-table-column prop="orders" label="单数" width="70" />
      <el-table-column label="商品原价" width="100" class-name="right"><template #default="{row}">{{yuan(row.original)}}</template></el-table-column>
      <el-table-column label="优惠" width="90" class-name="right"><template #default="{row}">{{yuan(row.discount)}}</template></el-table-column>
      <el-table-column label="收款" width="100" class-name="right"><template #default="{row}">{{yuan(row.received)}}</template></el-table-column>
      <el-table-column label="退款" width="90" class-name="right"><template #default="{row}">{{yuan(row.refunded)}}</template></el-table-column>
      <el-table-column label="实收" width="100" class-name="right"><template #default="{row}"><b>{{yuan(row.net)}}</b></template></el-table-column>
      <el-table-column prop="qty" label="销售件数" width="90" />
      <el-table-column prop="refund_qty" label="退货件数" width="90" />
      <el-table-column label="成本" width="90" class-name="right"><template #default="{row}">{{yuan(row.cost)}}</template></el-table-column>
      <el-table-column label="毛利" width="90" class-name="right"><template #default="{row}">{{yuan(row.profit)}}</template></el-table-column>
      <el-table-column label="现金 / 微信 / 支付宝 / 其他" min-width="220"><template #default="{row}">{{['cash','wechat','alipay','other'].map(m => yuan(row.methods[m])).join(' / ')}}</template></el-table-column>
    </el-table>
    <div class="muted" style="margin-top:6px">收款按收款时间、退款按退款时间计入；实收 = 收款 − 退款。微信 / 支付宝目前是店员确认收款的记账，不是在线支付。</div>
  </div>`,
  setup() {
    const group = ref('day'), store = ref(null), range = ref([today(), today()]), data = ref({ rows: [], total: null });
    const params = () => ({ group: group.value, store_id: store.value, begin: (range.value || [])[0], end: (range.value || [])[1] });
    const load = async () => { try { data.value = await api.get('/api/reports/revenue', params()); } catch (e) { err(e); } };
    const exp = async () => { try { await api.download('/api/reports/revenue', params()); } catch (e) { err(e); } };
    const rowsWithTotal = computed(() => data.value.total ? [...data.value.rows, { ...data.value.total, period: '合计', store_name: '' }] : []);
    onMounted(load);
    return { group, store, range, load, exp, rowsWithTotal, yuan };
  },
};

// ---------------- 商品销售核对 ----------------
const ProductSales = {
  props: ['meta'],
  template: `
  <div class="panel">
    <div class="toolbar">
      <el-select v-model="store" placeholder="全部门店" clearable style="width:140px"><el-option v-for="s in meta.stores" :key="s.id" :label="s.name" :value="s.id" /></el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" style="width:260px" />
      <el-input v-model="kw" placeholder="商品名称" clearable style="width:160px" @keyup.enter="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <span class="grow"></span>
      <el-button @click="exp('/api/reports/product-sales')">导出汇总</el-button>
      <el-button @click="exp('/api/reports/product-sales/detail')">导出全部明细</el-button>
    </div>
    <el-table :data="rows" border stripe highlight-current-row @current-change="pick">
      <el-table-column prop="product_name" label="商品" />
      <el-table-column prop="sku_name" label="规格" width="100" />
      <el-table-column prop="sold_qty" label="销售件数" width="90" />
      <el-table-column prop="refund_qty" label="退货件数" width="90" />
      <el-table-column prop="net_qty" label="净件数" width="80" />
      <el-table-column label="原价金额" width="100"><template #default="{row}">{{yuan(row.amount)}}</template></el-table-column>
      <el-table-column label="优惠" width="80"><template #default="{row}">{{yuan(row.discount)}}</template></el-table-column>
      <el-table-column label="净收" width="100"><template #default="{row}"><b>{{yuan(row.net)}}</b></template></el-table-column>
      <el-table-column prop="order_count" label="单数" width="70" />
    </el-table>
    <div v-if="cur" style="margin-top:16px">
      <div class="toolbar"><b>{{cur.product_name}}（{{cur.sku_name}}）逐单明细</b><span class="grow"></span><el-button size="small" @click="expDetail">导出明细</el-button></div>
      <el-table :data="detail" border size="small">
        <el-table-column prop="time" label="时间" width="160" />
        <el-table-column prop="type_text" label="类型" width="60" />
        <el-table-column prop="order_no" label="单号" width="190" />
        <el-table-column prop="store_name" label="门店" width="100" />
        <el-table-column prop="area" label="区域 / 位置" />
        <el-table-column prop="qty" label="数量" width="70" />
        <el-table-column label="单价" width="80"><template #default="{row}">{{yuan(row.unit_price)}}</template></el-table-column>
        <el-table-column label="原价金额" width="90"><template #default="{row}">{{yuan(row.amount)}}</template></el-table-column>
        <el-table-column label="优惠" width="80"><template #default="{row}">{{yuan(row.discount)}}</template></el-table-column>
        <el-table-column label="实收" width="90"><template #default="{row}">{{yuan(row.paid)}}</template></el-table-column>
      </el-table>
    </div>
  </div>`,
  setup() {
    const store = ref(null), range = ref([today(), today()]), kw = ref(''), rows = ref([]), cur = ref(null), detail = ref([]);
    const params = () => ({ store_id: store.value, begin: (range.value || [])[0], end: (range.value || [])[1], keyword: kw.value });
    const load = async () => { cur.value = null; try { rows.value = (await api.get('/api/reports/product-sales', params())).rows; } catch (e) { err(e); } };
    const pick = async (row) => { if (!row) return; cur.value = row; try { detail.value = (await api.get('/api/reports/product-sales/detail', { ...params(), keyword: '', sku_id: row.sku_id })).rows; } catch (e) { err(e); } };
    const exp = async (url) => { try { await api.download(url, params()); } catch (e) { err(e); } };
    const expDetail = async () => { try { await api.download('/api/reports/product-sales/detail', { ...params(), keyword: '', sku_id: cur.value.sku_id }); } catch (e) { err(e); } };
    onMounted(load);
    return { store, range, kw, rows, cur, detail, load, pick, exp, expDetail, yuan };
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
      <el-form-item><el-button type="primary" @click="save">保存</el-button><el-button @click="testPrint">打印测试页</el-button></el-form-item>
    </el-form>
    <div><div class="muted" style="margin-bottom:6px">预览（示例订单）</div><div class="receipt-preview"><iframe :srcdoc="html"></iframe></div></div>
  </div>`,
  setup() {
    const f = reactive({ medical_fields: [] }), html = ref(''), last = ref(null);
    const toggles = { show_store: '门店名', show_order_no: '单号', show_time: '时间', show_area: '区域 / 位置', show_cashier: '操作员',
      show_sku: '规格', show_unit_price: '单价', show_discount: '优惠', show_payment: '收款方式', show_remark: '备注' };
    let timer = null;
    const preview = async () => { try { last.value = await api.post('/api/settings/receipt/preview', { ...f }); html.value = receiptHtml(last.value); } catch (e) { err(e); } };
    watch(f, () => { clearTimeout(timer); timer = setTimeout(preview, 300); }, { deep: true });
    const upload = async (ev) => { const file = ev.target.files[0]; if (!file) return; try { f.footer_image = (await api.upload(file)).url; } catch (e) { err(e); } ev.target.value = ''; };
    const save = async () => { try { await api.put('/api/settings/receipt', { ...f }); ok(); } catch (e) { err(e); } };
    const testPrint = () => last.value && Shouyin.printReceipt(last.value);
    onMounted(async () => { try { Object.assign(f, await api.get('/api/settings/receipt')); } catch (e) { err(e); } });
    return { f, html, toggles, upload, save, testPrint };
  },
};

// ---------------- 账号与角色 ----------------
const Accounts = {
  props: ['meta'],
  template: `
  <div>
  <div class="panel">
    <div class="toolbar"><b>角色与权限</b><span class="grow"></span><el-button type="primary" @click="editRole()">新增角色</el-button></div>
    <el-table :data="roles" border>
      <el-table-column prop="name" label="角色" width="140" />
      <el-table-column label="类型" width="90"><template #default="{row}">{{row.is_admin ? '后台' : '门店'}}</template></el-table-column>
      <el-table-column label="权限"><template #default="{row}">{{row.permissions.map(p => permLabel(p)).join('、')}}</template></el-table-column>
      <el-table-column label="最低折扣" width="90"><template #default="{row}">{{row.min_discount_rate > 1 ? row.min_discount_rate/10 + ' 折' : '不限'}}</template></el-table-column>
      <el-table-column label="单笔最多调低" width="110"><template #default="{row}">{{row.max_adjust_amount == null ? '不限' : '¥' + yuan(row.max_adjust_amount)}}</template></el-table-column>
      <el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click="editRole(row)">编辑</el-button></template></el-table-column>
    </el-table>
  </div>
  <div class="panel">
    <div class="toolbar"><b>账号</b><span class="grow"></span><el-button type="primary" @click="editUser()">新增账号</el-button></div>
    <el-table :data="users" border>
      <el-table-column prop="username" label="账号" width="120" />
      <el-table-column prop="display_name" label="姓名" width="120" />
      <el-table-column prop="role_name" label="角色" width="120" />
      <el-table-column label="门店"><template #default="{row}">{{row.is_admin ? '全部门店' : row.stores.map(s => s.name).join('、')}}</template></el-table-column>
      <el-table-column label="优惠上限（账号单独）" width="170"><template #default="{row}">{{row.min_discount_rate ? row.min_discount_rate/10 + ' 折' : '同角色'}} / {{row.max_adjust_amount == null ? '同角色' : '¥' + yuan(row.max_adjust_amount)}}</template></el-table-column>
      <el-table-column label="状态" width="80"><template #default="{row}">{{row.active ? '正常' : '停用'}}</template></el-table-column>
      <el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click="editUser(row)">编辑</el-button></template></el-table-column>
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
      const body = { name: rForm.name, is_admin: rForm.is_admin, permissions: rForm.is_admin ? rForm.permissions : rForm.permissions.filter(p => !adminOnly.includes(p)),
        min_discount_rate: Math.max(1, Math.round(rForm.min_rate * 10)), max_adjust_amount: rForm.max_adj === '' ? null : toFen(rForm.max_adj) };
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
      const body = { username: uForm.username, display_name: uForm.display_name, role_id: uForm.role_id, store_ids: uForm.store_ids, active: uForm.active,
        password: uForm.password || null, min_discount_rate: uForm.min_rate === '' ? null : Math.round(parseFloat(uForm.min_rate) * 10),
        max_adjust_amount: uForm.max_adj === '' ? null : toFen(uForm.max_adj) };
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
  </div>`,
  setup() {
    const t = ref({}), m = ref({}), pending = ref(0), byStore = ref([]);
    onMounted(async () => {
      const d = today();
      try {
        const [a, b, p] = await Promise.all([api.get('/api/reports/revenue', { begin: d, end: d }),
          api.get('/api/reports/revenue', { begin: d.slice(0, 8) + '01', end: d, group: 'month' }), api.get('/api/orders', { status: 'pending', size: 1 })]);
        t.value = a.total; m.value = b.total; pending.value = p.total; byStore.value = a.rows;
      } catch (e) { err(e); }
    });
    return { t, m, pending, byStore, yuan };
  },
};

// ---------------- 主框架 ----------------
// [键, 名称, 权限, 组件, 分组, 图标, 说明]
const MENU = [
  ['dashboard', '经营概览', 'reports', Dashboard, '经营', '◎', '今天和本月的营收、待处理订单'],
  ['orders', '订单', 'reports', Orders, '经营', '☰', '所有门店的收银单和小程序订单'],
  ['revenue', '营收报表', 'reports', Revenue, '经营', '↗', '按门店、日 / 周 / 月统计，可导出'],
  ['productSales', '商品销售核对', 'reports', ProductSales, '经营', '✓', '某商品卖了多少件，展开看逐单明细'],
  ['products', '商品', 'catalog', Products, '商品资料', '▦', '名称、规格、售价、图片、医疗器械资料'],
  ['categories', '商品分类', 'catalog', Categories, '商品资料', '◫', '大类、小类'],
  ['stockItems', '库存品', 'catalog', StockItems, '商品资料', '◆', '实际占库存的东西，多个规格可共用'],
  ['suppliers', '供应商', 'catalog', Suppliers, '商品资料', '⌂', ''],
  ['inventory', '仓库与库存', 'inventory', Inventory, '库存', '▤', '入库、出库、调拨到门店、盘点、台账'],
  ['stores', '门店与区域', 'stores', Stores, '门店', '⌖', '门店设置、区域二维码'],
  ['receipt', '小票设置', 'receipt_config', ReceiptSettings, '门店', '▭', '小票文字、字段、底部图片'],
  ['rules', '业务规则', 'stores', Rules, '门店', '⚙', '扣库存时机、库存不够能否卖'],
  ['accounts', '账号与权限', 'users', Accounts, '系统', '☺', '角色权限、优惠上限、门店分配'],
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
          <div v-for="m in menu.filter(x => x[4] === g)" :key="m[0]" class="item" :class="{on: tab === m[0]}" @click="tab = m[0]"><span class="ico">{{m[5]}}</span>{{m[1]}}</div>
        </template>
      </div>
    </div>
    <div class="main">
      <div class="topbar">
        <div class="title">{{cur[1]}}<small>{{cur[6]}}</small></div>
        <div class="who"><a href="/web/store/">门店工作台 →</a>
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
    const meta = reactive({ categories: [], suppliers: [], stockItems: [], stores: [] });
    const menu = computed(() => user.value ? MENU.filter(m => user.value.is_admin && user.value.permissions.includes(m[2])) : []);
    const groups = computed(() => [...new Set(menu.value.map(m => m[4]))]);
    const cur = computed(() => menu.value.find(m => m[0] === tab.value) || []);
    const toStore = () => { location.href = '/web/store/'; };
    const loadMeta = async () => {
      const p = user.value.permissions, safe = (f) => f.catch(() => []);
      [meta.categories, meta.suppliers, meta.stockItems, meta.stores] = await Promise.all([
        safe(api.get('/api/categories')), p.includes('catalog') ? safe(api.get('/api/suppliers')) : [],
        p.includes('catalog') || p.includes('inventory') ? safe(api.get('/api/stock-items')).then(r => r.filter(x => x.active)) : [], safe(api.get('/api/stores'))]);
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
    return { user, lf, busy, tab, menu, groups, cur, meta, ready, login, logout, changePw, toStore };
  },
};

createApp(App).use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount('#app');
