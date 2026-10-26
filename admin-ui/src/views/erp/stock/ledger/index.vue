<!-- 仓库台账：按仓库看每个产品的期初、入库、出库、结存，并在这里直接入库、出库、出库到门店 -->
<template>
  <ContentWrap>
    <div class="ledger-head">
      <div class="ledger-warehouses">
        <div
          v-for="item in warehouseList"
          :key="item.id"
          class="ledger-warehouse"
          :class="{ 'is-active': item.id === queryParams.warehouseId }"
          @click="selectWarehouse(item.id)"
        >
          <Icon :icon="item.defaultStatus ? 'ep:shop' : 'ep:box'" :size="18" />
          <span>{{ item.name }}</span>
          <el-tag v-if="item.defaultStatus" size="small" effect="plain" round>门店售卖</el-tag>
        </div>
      </div>
      <div class="ledger-actions" v-hasPermi="['erp:stock-ledger:operate']">
        <el-button @click="openOperate('in')"><Icon icon="ep:download" class="mr-5px" /> 入库</el-button>
        <el-button @click="openOperate('out')"><Icon icon="ep:upload" class="mr-5px" /> 出库</el-button>
        <el-button type="primary" @click="openOperate('move')">
          <Icon icon="ep:right" class="mr-5px" /> 出库到门店
        </el-button>
      </div>
    </div>

    <el-form class="-mb-15px mt-14px" :inline="true" label-width="68px" @submit.prevent>
      <el-form-item label="日期">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          :clearable="false"
          :shortcuts="dateShortcuts"
          class="!w-260px"
          @change="getList"
        />
      </el-form-item>
      <el-form-item label="产品">
        <el-input
          v-model="queryParams.keyword"
          placeholder="名称 / 条码 / 规格"
          clearable
          class="!w-200px"
          @keyup.enter="getList"
          @clear="getList"
        />
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="onlyMoved">只看有出入库的</el-checkbox>
        <el-checkbox v-model="onlyShort" class="ml-8px">只看库存不足（≤ {{ warnCount }}）</el-checkbox>
      </el-form-item>
      <el-form-item>
        <el-button @click="getList"><Icon icon="ep:search" class="mr-5px" /> 查询</el-button>
        <el-button
          :loading="exportLoading"
          @click="handleExport"
          v-hasPermi="['erp:stock-ledger:query']"
        >
          <Icon icon="ep:download" class="mr-5px" /> 导出
        </el-button>
      </el-form-item>
    </el-form>
  </ContentWrap>

  <ContentWrap>
    <el-table
      v-loading="loading"
      :data="visibleList"
      border
      stripe
      size="small"
      show-summary
      :summary-method="getSummaries"
      :max-height="tableHeight"
      class="ledger-table"
    >
      <el-table-column type="index" label="#" width="50" align="center" fixed />
      <el-table-column label="产品" prop="productName" min-width="170" fixed show-overflow-tooltip />
      <el-table-column label="条码" prop="barCode" width="110" show-overflow-tooltip />
      <el-table-column label="规格" prop="standard" min-width="90" show-overflow-tooltip />
      <el-table-column label="分类" prop="categoryName" width="90" show-overflow-tooltip />
      <el-table-column label="单位" prop="unitName" width="60" align="center" />
      <el-table-column label="期初" prop="openingCount" width="80" align="right" />
      <el-table-column label="入库" prop="inCount" width="80" align="right">
        <template #default="{ row }">
          <el-link v-if="row.inCount" type="success" :underline="false" @click="openRecords(row)">
            +{{ row.inCount }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column label="出库" prop="outCount" width="80" align="right">
        <template #default="{ row }">
          <el-link v-if="row.outCount" type="warning" :underline="false" @click="openRecords(row)">
            -{{ row.outCount }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column label="结存" prop="closingCount" width="80" align="right">
        <template #default="{ row }"><b>{{ row.closingCount }}</b></template>
      </el-table-column>
      <el-table-column label="当前库存" prop="currentCount" width="90" align="right">
        <template #default="{ row }">
          <span :class="stockClass(row.currentCount)">{{ row.currentCount }}</span>
        </template>
      </el-table-column>
      <el-table-column label="明细" width="70" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openRecords(row)">流水</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="mt-10px text-12px leading-20px text-[var(--el-text-color-secondary)]">
      期初 = 开始日期 0 点的库存，结存 = 结束日期 24 点的库存；入库含采购入库、其它入库、调入，出库含病房订单、门店收银、其它出库、调出。
      病房订单和门店收银只从「门店」扣库存，所以每天从中心仓库「出库到门店」补货即可。
    </div>
  </ContentWrap>

  <!-- 出入库流水 -->
  <el-drawer v-model="recordVisible" :title="recordTitle" size="760px">
    <el-table v-loading="recordLoading" :data="recordList" size="small" border>
      <el-table-column label="时间" prop="createTime" width="160" :formatter="dateFormatter" />
      <el-table-column label="类型" prop="bizType" width="110">
        <template #default="{ row }">
          <dict-tag :type="DICT_TYPE.ERP_STOCK_RECORD_BIZ_TYPE" :value="row.bizType" />
        </template>
      </el-table-column>
      <el-table-column label="单号" prop="bizNo" min-width="170" show-overflow-tooltip />
      <el-table-column label="数量" prop="count" width="80" align="right">
        <template #default="{ row }">
          <span :class="row.count > 0 ? 'text-[var(--el-color-success)]' : 'text-[var(--el-color-warning)]'">
            {{ row.count > 0 ? '+' : '' }}{{ row.count }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="结存" prop="totalCount" width="80" align="right" />
      <el-table-column label="操作人" prop="creatorName" width="90" />
    </el-table>
    <Pagination
      :total="recordTotal"
      v-model:page="recordQuery.pageNo"
      v-model:limit="recordQuery.pageSize"
      @pagination="getRecords"
    />
  </el-drawer>

  <StockOperateDialog ref="operateRef" :warehouse-list="warehouseList" @success="getList" />
</template>
<script lang="ts" setup>
import dayjs from 'dayjs'
import { dateFormatter } from '@/utils/formatTime'
import { DICT_TYPE } from '@/utils/dict'
import download from '@/utils/download'
import { StockLedgerApi, StockLedgerVO } from '@/api/erp/stock/ledger'
import { WarehouseApi } from '@/api/erp/stock/warehouse'
import { StockRecordApi, StockRecordVO } from '@/api/erp/stock/record'
import StockOperateDialog from './StockOperateDialog.vue'

defineOptions({ name: 'ErpStockLedger' })

const message = useMessage()

const DAY = 'YYYY-MM-DD'
const warnCount = 10 // 库存不足提醒线

const warehouseList = ref<{ id: number; name: string; defaultStatus?: boolean }[]>([])
const loading = ref(false)
const exportLoading = ref(false)
const list = ref<StockLedgerVO[]>([])
const dateRange = ref<[string, string]>([dayjs().format(DAY), dayjs().format(DAY)])
const queryParams = reactive<{ warehouseId?: number; keyword?: string }>({ warehouseId: undefined, keyword: undefined })
const onlyMoved = ref(false)
const onlyShort = ref(false)
const tableHeight = computed(() => Math.max(window.innerHeight - 330, 360))

const dateShortcuts = [
  { text: '今天', value: () => [dayjs().toDate(), dayjs().toDate()] },
  { text: '昨天', value: () => [dayjs().subtract(1, 'day').toDate(), dayjs().subtract(1, 'day').toDate()] },
  { text: '最近 7 天', value: () => [dayjs().subtract(6, 'day').toDate(), dayjs().toDate()] },
  { text: '本月', value: () => [dayjs().startOf('month').toDate(), dayjs().toDate()] },
  {
    text: '上个月',
    value: () => [dayjs().subtract(1, 'month').startOf('month').toDate(), dayjs().subtract(1, 'month').endOf('month').toDate()]
  }
]

const visibleList = computed(() =>
  list.value.filter((row) => {
    if (onlyMoved.value && !Number(row.inCount) && !Number(row.outCount)) return false
    if (onlyShort.value && Number(row.currentCount) > warnCount) return false
    return true
  })
)

const stockClass = (count: number) => {
  const value = Number(count)
  if (value <= 0) return 'text-[var(--el-color-danger)] font-bold'
  if (value <= warnCount) return 'text-[var(--el-color-warning)] font-bold'
  return ''
}

const ledgerParams = () => ({
  warehouseId: queryParams.warehouseId!,
  beginDate: dateRange.value[0],
  endDate: dateRange.value[1],
  keyword: queryParams.keyword || undefined
})

const getList = async () => {
  if (!queryParams.warehouseId) return
  loading.value = true
  try {
    list.value = await StockLedgerApi.getLedger(ledgerParams())
  } finally {
    loading.value = false
  }
}

const selectWarehouse = (id: number) => {
  queryParams.warehouseId = id
  getList()
}

const SUM_FIELDS = ['openingCount', 'inCount', 'outCount', 'closingCount', 'currentCount']
const getSummaries = ({ columns }: { columns: any[] }) =>
  columns.map((column, index) => {
    if (index === 1) return `合计 ${visibleList.value.length} 种`
    if (!SUM_FIELDS.includes(column.property)) return ''
    const sum = visibleList.value.reduce((acc, row) => acc + (Number(row[column.property]) || 0), 0)
    return String(Number(sum.toFixed(2)))
  })

const handleExport = async () => {
  try {
    await message.exportConfirm()
    exportLoading.value = true
    const data = await StockLedgerApi.exportLedger(ledgerParams())
    const name = warehouseList.value.find((item) => item.id === queryParams.warehouseId)?.name || '仓库'
    download.excel(data, `${name}台账-${dateRange.value[0]}至${dateRange.value[1]}.xls`)
  } catch {
  } finally {
    exportLoading.value = false
  }
}

// ========== 入库 / 出库 / 出库到门店 ==========
const operateRef = ref()
const openOperate = (type: 'in' | 'out' | 'move') => operateRef.value.open(type, queryParams.warehouseId)

// ========== 流水 ==========
const recordVisible = ref(false)
const recordLoading = ref(false)
const recordTitle = ref('')
const recordList = ref<StockRecordVO[]>([])
const recordTotal = ref(0)
const recordQuery = reactive({ pageNo: 1, pageSize: 20, productId: undefined as number | undefined })

const openRecords = (row: StockLedgerVO) => {
  recordTitle.value = `${row.productName} 出入库流水（${dateRange.value[0]} 至 ${dateRange.value[1]}）`
  recordQuery.productId = row.productId
  recordQuery.pageNo = 1
  recordVisible.value = true
  getRecords()
}

const getRecords = async () => {
  recordLoading.value = true
  try {
    const data = await StockRecordApi.getStockRecordPage({
      ...recordQuery,
      warehouseId: queryParams.warehouseId,
      createTime: [dateRange.value[0] + ' 00:00:00', dateRange.value[1] + ' 23:59:59']
    })
    recordList.value = data.list
    recordTotal.value = data.total
  } finally {
    recordLoading.value = false
  }
}

onMounted(async () => {
  warehouseList.value = await WarehouseApi.getWarehouseSimpleList()
  // 默认看中心仓库（非门店的第一个仓库）
  const center = warehouseList.value.find((item) => item.name.includes('中心')) ||
    warehouseList.value.find((item) => !item.defaultStatus) ||
    warehouseList.value[0]
  queryParams.warehouseId = center?.id
  await getList()
})
</script>
<style lang="scss" scoped>
.ledger-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.ledger-warehouses {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ledger-warehouse {
  display: flex;
  padding: 9px 16px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  transition: all 0.15s;
  gap: 8px;
  align-items: center;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
  }

  &.is-active {
    font-weight: 600;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
  }
}

.ledger-table {
  :deep(.el-table__footer td) {
    font-weight: 600;
  }
}
</style>
