<!-- 仓库台账 - 入库 / 出库 / 出库到门店：像表格一样在“数量”列填数，提交后立即生成已审核的单据 -->
<template>
  <Dialog v-model="visible" :title="TITLES[form.type]" width="1000px" :scroll="false">
    <el-form ref="formRef" :model="form" :inline="true" label-width="80px" class="operate-form">
      <el-form-item :label="form.type === 'move' ? '调出仓库' : '仓库'">
        <el-select v-model="form.warehouseId" class="!w-180px" @change="loadRows">
          <el-option v-for="item in warehouseList" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.type === 'move'" label="调入仓库">
        <el-select v-model="form.toWarehouseId" class="!w-180px" @change="loadRows">
          <el-option
            v-for="item in warehouseList"
            :key="item.id"
            :label="item.name"
            :value="item.id"
            :disabled="item.id === form.warehouseId"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.type === 'in'" label="供应商">
        <el-select v-model="form.supplierId" placeholder="可不选" clearable filterable class="!w-180px">
          <el-option v-for="item in supplierList" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" maxlength="255" class="!w-260px" />
      </el-form-item>
    </el-form>

    <div class="operate-toolbar">
      <el-input v-model="keyword" placeholder="搜索产品名称 / 条码 / 规格" clearable class="!w-260px">
        <template #prefix><Icon icon="ep:search" /></template>
      </el-input>
      <el-checkbox v-model="onlyFilled" class="ml-12px">只看已填写</el-checkbox>
      <el-button v-if="form.type === 'move'" link type="primary" class="ml-12px" @click="fillToTarget">
        按目标数量补齐…
      </el-button>
      <div class="flex-1"></div>
      <el-button link @click="clearAll">清空数量</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="visibleRows"
      height="440"
      border
      size="small"
      class="operate-table"
      :row-class-name="({ row }) => (row.count ? 'is-filled' : '')"
    >
      <el-table-column label="产品" prop="productName" min-width="200" show-overflow-tooltip />
      <el-table-column label="规格" prop="standard" width="110" show-overflow-tooltip />
      <el-table-column label="单位" prop="unitName" width="60" align="center" />
      <el-table-column :label="(warehouseName(form.warehouseId) || '仓库') + '现有'" width="110" align="right">
        <template #default="{ row }">
          <span :class="{ 'text-[var(--el-color-danger)]': row.currentCount <= 0 }">{{ row.currentCount }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="form.type === 'move'" :label="(warehouseName(form.toWarehouseId) || '调入仓库') + '现有'" width="110" align="right">
        <template #default="{ row }">{{ row.targetCount }}</template>
      </el-table-column>
      <el-table-column :label="COUNT_LABELS[form.type]" width="150" align="center" class-name="operate-count-col">
        <template #default="{ row }">
          <el-input-number
            v-model="row.count"
            :min="0"
            :precision="2"
            :controls="false"
            size="small"
            placeholder="0"
            class="!w-full"
            @keyup.enter="focusNext($event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作后" width="100" align="right">
        <template #default="{ row }">
          <span v-if="row.count" :class="{ 'text-[var(--el-color-danger)]': afterCount(row) < 0 }">
            {{ afterCount(row) }}
          </span>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <div class="operate-footer">
        <span>
          已填写 <b>{{ filledRows.length }}</b> 种，共 <b>{{ filledTotal }}</b>
          <span v-if="hasNegative" class="ml-12px text-[var(--el-color-danger)]">有产品数量超过现有库存</span>
        </span>
        <div>
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" :loading="saving" :disabled="!filledRows.length" @click="submit">
            确认{{ TITLES[form.type] }}
          </el-button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
<script lang="ts" setup>
import dayjs from 'dayjs'
import { StockLedgerApi, StockQuickOperateVO } from '@/api/erp/stock/ledger'
import { SupplierApi, SupplierVO } from '@/api/erp/purchase/supplier'
import { ElMessageBox } from 'element-plus'

defineOptions({ name: 'ErpStockOperateDialog' })

type OperateType = StockQuickOperateVO['type']

interface OperateRow {
  productId: number
  productName: string
  barCode?: string
  standard?: string
  unitName?: string
  currentCount: number
  targetCount: number
  count?: number
}

const props = defineProps<{ warehouseList: { id: number; name: string; defaultStatus?: boolean }[] }>()
const emit = defineEmits(['success'])
const message = useMessage()

const TITLES: Record<OperateType, string> = { in: '入库', out: '出库', move: '出库到门店' }
const COUNT_LABELS: Record<OperateType, string> = { in: '入库数量', out: '出库数量', move: '调拨数量' }

const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const onlyFilled = ref(false)
const supplierList = ref<SupplierVO[]>([])
const rows = ref<OperateRow[]>([])
const form = ref<{ type: OperateType; warehouseId?: number; toWarehouseId?: number; supplierId?: number; remark?: string }>({
  type: 'in'
})

const warehouseName = (id?: number) => props.warehouseList.find((item) => item.id === id)?.name

const visibleRows = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (onlyFilled.value && !row.count) return false
    if (!text) return true
    return [row.productName, row.barCode, row.standard].some((v) => v && v.toLowerCase().includes(text))
  })
})
const filledRows = computed(() => rows.value.filter((row) => row.count && row.count > 0))
const filledTotal = computed(() => {
  const total = filledRows.value.reduce((acc, row) => acc + (row.count || 0), 0)
  return Number(total.toFixed(2))
})
const afterCount = (row: OperateRow) => {
  const count = row.count || 0
  return Number((form.value.type === 'in' ? row.currentCount + count : row.currentCount - count).toFixed(2))
}
const hasNegative = computed(() => form.value.type !== 'in' && filledRows.value.some((row) => afterCount(row) < 0))

/** 打开弹窗：type 操作类型，warehouseId 当前仓库 */
const open = async (type: OperateType, warehouseId?: number) => {
  const store = props.warehouseList.find((item) => item.defaultStatus)
  const today = dayjs().format('M 月 D 日')
  form.value = {
    type,
    warehouseId: type === 'move' && warehouseId === store?.id ? undefined : warehouseId,
    toWarehouseId: type === 'move' ? store?.id : undefined,
    remark: type === 'move' ? `${today}出库到门店` : `${today}${TITLES[type]}`
  }
  if (type === 'move' && !form.value.warehouseId) {
    form.value.warehouseId = props.warehouseList.find((item) => item.id !== store?.id)?.id
  }
  keyword.value = ''
  onlyFilled.value = false
  rows.value = []
  visible.value = true
  if (type === 'in' && !supplierList.value.length) {
    SupplierApi.getSupplierSimpleList().then((list) => (supplierList.value = list))
  }
  await loadRows()
}
defineExpose({ open })

/** 加载产品和现有库存；切换仓库时保留已经填写的数量 */
const loadRows = async () => {
  if (!form.value.warehouseId) return
  const filled = new Map(rows.value.filter((row) => row.count).map((row) => [row.productId, row.count]))
  const today = dayjs().format('YYYY-MM-DD')
  loading.value = true
  try {
    const [source, target] = await Promise.all([
      StockLedgerApi.getLedger({ warehouseId: form.value.warehouseId, beginDate: today, endDate: today }),
      form.value.type === 'move' && form.value.toWarehouseId
        ? StockLedgerApi.getLedger({ warehouseId: form.value.toWarehouseId, beginDate: today, endDate: today })
        : Promise.resolve([])
    ])
    const targetMap = new Map(target.map((row) => [row.productId, Number(row.currentCount)]))
    rows.value = source.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      barCode: row.barCode,
      standard: row.standard,
      unitName: row.unitName,
      currentCount: Number(row.currentCount),
      targetCount: targetMap.get(row.productId) ?? 0,
      count: filled.get(row.productId)
    }))
  } finally {
    loading.value = false
  }
}

const clearAll = () => rows.value.forEach((row) => (row.count = undefined))

/** 出库到门店：把门店每个产品补到同一个数量，例如每样补到 20 */
const fillToTarget = async () => {
  try {
    const { value } = await ElMessageBox.prompt('把调入仓库里每个产品补到多少？（已经够的不补）', '按目标数量补齐', {
      inputPattern: /^\d+(\.\d{1,2})?$/,
      inputErrorMessage: '请输入数量',
      inputPlaceholder: '例如：20'
    })
    const target = Number(value)
    rows.value.forEach((row) => {
      const need = Number((target - row.targetCount).toFixed(2))
      row.count = need > 0 ? Math.min(need, Math.max(row.currentCount, 0)) || undefined : undefined
    })
    onlyFilled.value = true
  } catch {}
}

/** 回车跳到下一行的数量输入框，像表格一样连续录入 */
const focusNext = (event: KeyboardEvent) => {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.operate-count-col input'))
  const index = inputs.indexOf(event.target as HTMLInputElement)
  inputs[index + 1]?.focus()
  inputs[index + 1]?.select()
}

const submit = async () => {
  if (form.value.type === 'move' && !form.value.toWarehouseId) {
    message.warning('请选择调入仓库')
    return
  }
  if (hasNegative.value) {
    await message.confirm('有产品的数量超过现有库存，确定继续吗？')
  }
  saving.value = true
  try {
    await StockLedgerApi.quickOperate({
      type: form.value.type,
      warehouseId: form.value.warehouseId!,
      toWarehouseId: form.value.type === 'move' ? form.value.toWarehouseId : undefined,
      supplierId: form.value.type === 'in' ? form.value.supplierId : undefined,
      remark: form.value.remark,
      items: filledRows.value.map((row) => ({ productId: row.productId, count: row.count! }))
    })
    message.success(`${TITLES[form.value.type]}成功，共 ${filledRows.value.length} 种 ${filledTotal.value}`)
    visible.value = false
    emit('success')
  } finally {
    saving.value = false
  }
}

</script>
<style lang="scss" scoped>
.operate-form {
  margin-bottom: -6px;
}

.operate-toolbar {
  display: flex;
  margin-bottom: 10px;
  align-items: center;
}

.operate-table {
  :deep(.is-filled td) {
    background: var(--el-color-primary-light-9) !important;
  }

  :deep(.operate-count-col .el-input__inner) {
    font-weight: 600;
    text-align: right;
  }
}

.operate-footer {
  display: flex;
  font-size: 13px;
  color: var(--el-text-color-regular);
  align-items: center;
  justify-content: space-between;
}
</style>
