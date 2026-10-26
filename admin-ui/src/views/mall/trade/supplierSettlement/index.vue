<!-- 供应商对账：按月统计每个供应商的商品销量（病房订单 + 门店收银）、销售额、成本 -->
<template>
  <ContentWrap>
    <el-form class="-mb-15px" :inline="true" label-width="68px">
      <el-form-item label="对账月份">
        <el-date-picker
          v-model="month"
          type="month"
          value-format="YYYY-MM"
          :clearable="false"
          class="!w-200px"
          @change="getList"
        />
      </el-form-item>
      <el-form-item>
        <el-button @click="getList"><Icon icon="ep:refresh" class="mr-5px" /> 刷新</el-button>
        <el-button
          type="success"
          plain
          :loading="exportLoading"
          @click="handleExport"
          v-hasPermi="['trade:supplier-settlement:export']"
        >
          <Icon icon="ep:download" class="mr-5px" /> 导出 Excel
        </el-button>
      </el-form-item>
    </el-form>
    <div class="mt-12px text-12px leading-20px text-[var(--el-text-color-secondary)]">
      病房订单按支付时间统计（不含已取消、已退款），门店收银按收银时间统计（不含作废）。成本 = 下单时商品规格的成本价 × 数量，赠品成本单独列出。
    </div>
  </ContentWrap>

  <ContentWrap>
    <el-table v-loading="loading" :data="list" row-key="supplierName" show-summary :summary-method="getSummaries">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.products" size="small" class="ml-48px !w-[calc(100%-48px)]">
            <el-table-column label="商品" prop="spuName" min-width="200" />
            <el-table-column label="病房订单" prop="onlineCount" width="100" align="right" />
            <el-table-column label="门店收银" prop="posCount" width="100" align="right" />
            <el-table-column label="合计销量" prop="count" width="100" align="right" />
            <el-table-column label="赠送" prop="giftCount" width="80" align="right" />
            <el-table-column label="销售额" width="120" align="right">
              <template #default="{ row: p }">¥{{ fenToYuan(p.totalPrice) }}</template>
            </el-table-column>
            <el-table-column label="成本" width="120" align="right">
              <template #default="{ row: p }">¥{{ fenToYuan(p.costPrice) }}</template>
            </el-table-column>
            <el-table-column label="赠品成本" width="120" align="right">
              <template #default="{ row: p }">¥{{ fenToYuan(p.giftCostPrice) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column label="供应商" prop="supplierName" min-width="180">
        <template #default="{ row }">
          <span :class="{ 'text-[var(--el-color-warning)]': !row.supplierId }">{{ row.supplierName }}</span>
        </template>
      </el-table-column>
      <el-table-column label="病房订单" prop="onlineCount" width="100" align="right" />
      <el-table-column label="门店收银" prop="posCount" width="100" align="right" />
      <el-table-column label="合计销量" prop="count" width="100" align="right" />
      <el-table-column label="赠送" prop="giftCount" width="80" align="right" />
      <el-table-column label="销售额" prop="totalPrice" width="130" align="right">
        <template #default="{ row }">¥{{ fenToYuan(row.totalPrice) }}</template>
      </el-table-column>
      <el-table-column label="成本" prop="costPrice" width="130" align="right">
        <template #default="{ row }">¥{{ fenToYuan(row.costPrice) }}</template>
      </el-table-column>
      <el-table-column label="赠品成本" prop="giftCostPrice" width="130" align="right">
        <template #default="{ row }">¥{{ fenToYuan(row.giftCostPrice) }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !list.length" description="这个月没有销售记录" />
  </ContentWrap>
</template>
<script lang="ts" setup>
import dayjs from 'dayjs'
import { fenToYuan } from '@/utils'
import download from '@/utils/download'
import { SupplierSettlementApi, SupplierSettlementVO } from '@/api/mall/trade/supplierSettlement'

defineOptions({ name: 'TradeSupplierSettlement' })

const message = useMessage()

// 默认上个月：月初对上月的账
const month = ref(dayjs().subtract(1, 'month').format('YYYY-MM'))
const loading = ref(false)
const exportLoading = ref(false)
const list = ref<SupplierSettlementVO[]>([])

const getList = async () => {
  loading.value = true
  try {
    list.value = await SupplierSettlementApi.getList(month.value)
  } finally {
    loading.value = false
  }
}

const PRICE_FIELDS = ['totalPrice', 'costPrice', 'giftCostPrice']
const getSummaries = ({ columns }: { columns: any[] }) =>
  columns.map((column, index) => {
    if (index === 1) return '合计'
    const field = column.property
    if (!field || field === 'supplierName') return ''
    const sum = list.value.reduce((acc, row) => acc + (Number(row[field]) || 0), 0)
    return PRICE_FIELDS.includes(field) ? '¥' + fenToYuan(sum) : String(sum)
  })

const handleExport = async () => {
  try {
    await message.exportConfirm()
    exportLoading.value = true
    const data = await SupplierSettlementApi.exportExcel(month.value)
    download.excel(data, `供应商对账-${month.value}.xls`)
  } catch {
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => {
  getList()
})
</script>
