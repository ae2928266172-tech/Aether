<!-- 营收报表：日报/周报/月报（线上订单 + 门店收银），以及按商品查询某段时间卖了多少、每一单的明细 -->
<template>
  <ContentWrap>
    <el-tabs v-model="activeTab" class="-mb-15px">
      <el-tab-pane label="营收报表" name="revenue" />
      <el-tab-pane label="商品销售查询" name="product" />
    </el-tabs>
  </ContentWrap>

  <!-- 营收报表 -->
  <template v-if="activeTab === 'revenue'">
    <ContentWrap>
      <el-form class="-mb-15px" :inline="true" label-width="68px">
        <el-form-item label="报表类型">
          <el-radio-group v-model="revenueQuery.period" @change="handlePeriodChange">
            <el-radio-button value="day">日报</el-radio-button>
            <el-radio-button value="week">周报</el-radio-button>
            <el-radio-button value="month">月报</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="revenueRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            :clearable="false"
            :shortcuts="dateShortcuts"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            class="!w-260px"
            @change="getRevenue"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="getRevenue"><Icon icon="ep:refresh" class="mr-5px" /> 刷新</el-button>
          <el-button
            :loading="exportLoading"
            @click="handleExportRevenue"
            v-hasPermi="['trade:report:export']"
          >
            <Icon icon="ep:download" class="mr-5px" /> 导出{{ periodName }}
          </el-button>
        </el-form-item>
      </el-form>
    </ContentWrap>

    <div class="report-kpis">
      <div v-for="item in kpis" :key="item.label" class="report-kpi" :style="{ '--kpi-color': item.color }">
        <div class="report-kpi__icon"><Icon :icon="item.icon" :size="22" /></div>
        <div>
          <div class="report-kpi__label">{{ item.label }}</div>
          <div class="report-kpi__value">{{ item.value }}</div>
          <div class="report-kpi__sub">{{ item.sub }}</div>
        </div>
      </div>
    </div>

    <ContentWrap>
      <el-table v-loading="revenueLoading" :data="revenueList" :row-class-name="revenueRowClass">
        <el-table-column :label="periodLabel" prop="period" min-width="190" fixed />
        <el-table-column label="线上订单" align="center">
          <el-table-column label="单数" prop="onlineOrderCount" width="80" align="right" />
          <el-table-column label="实收" width="120" align="right">
            <template #default="{ row }">¥{{ fenToYuan(row.onlinePrice) }}</template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="门店收银" align="center">
          <el-table-column label="单数" prop="posOrderCount" width="80" align="right" />
          <el-table-column label="实收" width="120" align="right">
            <template #default="{ row }">¥{{ fenToYuan(row.posPrice) }}</template>
          </el-table-column>
          <el-table-column label="优惠" width="100" align="right">
            <template #default="{ row }">
              <span :class="{ 'text-[var(--el-color-warning)]': row.discountPrice }">
                ¥{{ fenToYuan(row.discountPrice) }}
              </span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="合计" align="center">
          <el-table-column label="单数" prop="orderCount" width="80" align="right" />
          <el-table-column label="实收" width="130" align="right">
            <template #default="{ row }">
              <b>¥{{ fenToYuan(row.totalPrice) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="件数" prop="productCount" width="80" align="right" />
          <el-table-column label="赠送" prop="giftCount" width="70" align="right" />
          <el-table-column label="成本" width="120" align="right">
            <template #default="{ row }">¥{{ fenToYuan(row.costPrice) }}</template>
          </el-table-column>
          <el-table-column label="毛利" width="120" align="right">
            <template #default="{ row }">
              <span :class="row.profitPrice < 0 ? 'text-[var(--el-color-danger)]' : 'text-[var(--el-color-success)]'">
                ¥{{ fenToYuan(row.profitPrice) }}
              </span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.period !== '合计'" link type="primary" @click="viewProducts(row)">
              看商品明细
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="mt-10px text-12px leading-20px text-[var(--el-text-color-secondary)]">
        线上订单按支付时间统计（不含已取消，已扣除退款），门店收银按收银时间统计（不含作废）。成本 = 规格成本价 × 件数（含赠送）。
      </div>
    </ContentWrap>
  </template>

  <!-- 商品销售查询 -->
  <template v-else>
    <ContentWrap>
      <el-form class="-mb-15px" :model="salesQuery" :inline="true" label-width="68px">
        <el-form-item label="时间">
          <el-date-picker
            v-model="salesQuery.time"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm:ss"
            :default-time="[new Date('1 00:00:00'), new Date('1 23:59:59')]"
            :clearable="false"
            :shortcuts="dateTimeShortcuts"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            class="!w-360px"
          />
        </el-form-item>
        <el-form-item label="商品">
          <el-input
            v-model="salesQuery.keyword"
            placeholder="商品名称或规格"
            clearable
            class="!w-200px"
            @keyup.enter="handleSalesQuery"
          />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="salesQuery.source" placeholder="全部" clearable class="!w-140px">
            <el-option v-for="item in Object.values(ReportSourceEnum)" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSalesQuery"><Icon icon="ep:search" class="mr-5px" /> 查询</el-button>
          <el-button @click="resetSalesQuery"><Icon icon="ep:refresh" class="mr-5px" /> 重置</el-button>
          <el-button
            :loading="exportLoading"
            @click="handleExportSales"
            v-hasPermi="['trade:report:export']"
          >
            <Icon icon="ep:download" class="mr-5px" /> 导出明细
          </el-button>
        </el-form-item>
      </el-form>
    </ContentWrap>

    <ContentWrap>
      <div class="report-section-title">
        商品汇总
        <span>共 {{ summaryList.length }} 个规格，售出 {{ summaryTotal.count }} 件，赠送 {{ summaryTotal.giftCount }} 件，销售额 ¥{{ fenToYuan(summaryTotal.price) }}；点击一行只看这个规格的明细</span>
      </div>
      <el-table
        v-loading="summaryLoading"
        :data="summaryList"
        max-height="360"
        highlight-current-row
        @row-click="selectSku"
      >
        <el-table-column label="商品" prop="spuName" min-width="200" />
        <el-table-column label="规格" prop="skuName" min-width="140" />
        <el-table-column label="线上订单" prop="onlineCount" width="100" align="right" />
        <el-table-column label="门店收银" prop="posCount" width="100" align="right" />
        <el-table-column label="合计件数" prop="count" width="100" align="right">
          <template #default="{ row }"><b>{{ row.count }}</b></template>
        </el-table-column>
        <el-table-column label="赠送" prop="giftCount" width="80" align="right" />
        <el-table-column label="单数" prop="orderCount" width="80" align="right" />
        <el-table-column label="销售额" width="120" align="right">
          <template #default="{ row }">¥{{ fenToYuan(row.price) }}</template>
        </el-table-column>
      </el-table>
    </ContentWrap>

    <ContentWrap>
      <div class="report-section-title">
        销售明细
        <el-tag v-if="selectedSku" closable class="ml-8px" @close="clearSku">
          {{ selectedSku.spuName }}{{ selectedSku.skuName && selectedSku.skuName !== selectedSku.spuName ? ' / ' + selectedSku.skuName : '' }}
        </el-tag>
      </div>
      <el-table v-loading="detailLoading" :data="detailList">
        <el-table-column label="时间" prop="time" width="170" :formatter="dateFormatter" />
        <el-table-column label="单号" prop="orderNo" min-width="190">
          <template #default="{ row }">
            <el-link v-if="row.source === 1" type="primary" :underline="false" @click="openOnlineOrder(row)">
              {{ row.orderNo }}
            </el-link>
            <span v-else>{{ row.orderNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag :type="row.source === 1 ? 'primary' : 'success'" effect="light">
              {{ row.source === 1 ? ReportSourceEnum.ONLINE.label : ReportSourceEnum.POS.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="商品" prop="spuName" min-width="180" />
        <el-table-column label="规格" prop="skuName" min-width="120" />
        <el-table-column label="数量" prop="count" width="80" align="right" />
        <el-table-column label="赠送" prop="giftCount" width="70" align="right">
          <template #default="{ row }">{{ row.giftCount || '' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">¥{{ fenToYuan(row.price) }}</template>
        </el-table-column>
        <el-table-column label="配送地址 / 收银员" prop="place" min-width="180" show-overflow-tooltip />
      </el-table>
      <Pagination
        :total="detailTotal"
        v-model:page="salesQuery.pageNo"
        v-model:limit="salesQuery.pageSize"
        @pagination="getDetail"
      />
    </ContentWrap>
  </template>
</template>
<script lang="ts" setup>
import dayjs from 'dayjs'
import { fenToYuan } from '@/utils'
import { dateFormatter } from '@/utils/formatTime'
import download from '@/utils/download'
import {
  ProductSalesSummaryVO,
  ProductSalesVO,
  ReportApi,
  ReportSourceEnum,
  RevenueReportVO
} from '@/api/mall/trade/report'

defineOptions({ name: 'TradeReport' })

const message = useMessage()
const { push } = useRouter()

const activeTab = ref('revenue')
const exportLoading = ref(false)

const DAY = 'YYYY-MM-DD'
const PERIOD_NAMES: Record<string, string> = { day: '日报', week: '周报', month: '月报' }

/** 每种报表的默认范围：日报看本月，周报看最近 8 周，月报看今年 */
const defaultRange = (period: string): [string, string] => {
  const today = dayjs()
  if (period === 'week') return [today.startOf('week').add(1, 'day').subtract(7, 'week').format(DAY), today.format(DAY)]
  if (period === 'month') return [today.startOf('year').format(DAY), today.format(DAY)]
  return [today.startOf('month').format(DAY), today.format(DAY)]
}

const dateShortcuts = [
  { text: '今天', value: () => [dayjs().toDate(), dayjs().toDate()] },
  { text: '昨天', value: () => [dayjs().subtract(1, 'day').toDate(), dayjs().subtract(1, 'day').toDate()] },
  { text: '最近 7 天', value: () => [dayjs().subtract(6, 'day').toDate(), dayjs().toDate()] },
  { text: '本月', value: () => [dayjs().startOf('month').toDate(), dayjs().toDate()] },
  {
    text: '上个月',
    value: () => [dayjs().subtract(1, 'month').startOf('month').toDate(), dayjs().subtract(1, 'month').endOf('month').toDate()]
  },
  { text: '今年', value: () => [dayjs().startOf('year').toDate(), dayjs().toDate()] }
]
const dateTimeShortcuts = dateShortcuts.map((item) => ({
  text: item.text,
  value: () => {
    const [begin, end] = item.value()
    return [dayjs(begin).startOf('day').toDate(), dayjs(end).endOf('day').toDate()]
  }
}))

// ========== 营收报表 ==========
const revenueQuery = reactive({ period: 'day' })
const revenueRange = ref<[string, string]>(defaultRange('day'))
const revenueLoading = ref(false)
const revenueList = ref<RevenueReportVO[]>([])
const periodName = computed(() => PERIOD_NAMES[revenueQuery.period])
const periodLabel = computed(() => ({ day: '日期', week: '周（周一至周日）', month: '月份' })[revenueQuery.period])

const revenueParams = () => ({
  beginDate: revenueRange.value[0],
  endDate: revenueRange.value[1],
  period: revenueQuery.period
})

const getRevenue = async () => {
  revenueLoading.value = true
  try {
    revenueList.value = await ReportApi.getRevenue(revenueParams())
  } finally {
    revenueLoading.value = false
  }
}

const handlePeriodChange = (period: string) => {
  revenueRange.value = defaultRange(period)
  getRevenue()
}

const revenueRowClass = ({ row }: { row: RevenueReportVO }) => {
  if (row.period === '合计') return 'report-total-row'
  return row.orderCount ? '' : 'report-empty-row'
}

const kpis = computed(() => {
  const total = revenueList.value.find((row) => row.period === '合计')
  const t = total || ({} as RevenueReportVO)
  const avg = t.orderCount ? Math.round(t.totalPrice / t.orderCount) : 0
  return [
    {
      label: '实收合计',
      value: '¥' + fenToYuan(t.totalPrice || 0),
      sub: `线上 ¥${fenToYuan(t.onlinePrice || 0)} · 门店 ¥${fenToYuan(t.posPrice || 0)}`,
      icon: 'ep:money',
      color: '#0f8f86'
    },
    {
      label: '订单数',
      value: String(t.orderCount || 0),
      sub: `客单价 ¥${fenToYuan(avg)}`,
      icon: 'ep:tickets',
      color: '#3b82f6'
    },
    {
      label: '售出件数',
      value: String(t.productCount || 0),
      sub: `另赠送 ${t.giftCount || 0} 件`,
      icon: 'ep:goods',
      color: '#f59e0b'
    },
    {
      label: '毛利',
      value: '¥' + fenToYuan(t.profitPrice || 0),
      sub: `成本 ¥${fenToYuan(t.costPrice || 0)} · 门店优惠 ¥${fenToYuan(t.discountPrice || 0)}`,
      icon: 'ep:trend-charts',
      color: '#8b5cf6'
    }
  ]
})

const handleExportRevenue = async () => {
  try {
    await message.exportConfirm()
    exportLoading.value = true
    const data = await ReportApi.exportRevenue(revenueParams())
    download.excel(data, `${periodName.value}-${revenueRange.value[0]}至${revenueRange.value[1]}.xls`)
  } catch {
  } finally {
    exportLoading.value = false
  }
}

/** 从营收报表跳到这段时间的商品销售 */
const viewProducts = (row: RevenueReportVO) => {
  salesQuery.time = [row.beginDate + ' 00:00:00', row.endDate + ' 23:59:59']
  salesQuery.keyword = undefined
  salesQuery.source = undefined
  activeTab.value = 'product'
}

// ========== 商品销售查询 ==========
const todayRange = () => [dayjs().startOf('month').format(DAY) + ' 00:00:00', dayjs().format(DAY) + ' 23:59:59']
const salesQuery = reactive<{
  pageNo: number
  pageSize: number
  time: string[]
  keyword?: string
  source?: number
  skuId?: number
}>({
  pageNo: 1,
  pageSize: 20,
  time: todayRange(),
  keyword: undefined,
  source: undefined,
  skuId: undefined
})
const summaryLoading = ref(false)
const summaryList = ref<ProductSalesSummaryVO[]>([])
const detailLoading = ref(false)
const detailList = ref<ProductSalesVO[]>([])
const detailTotal = ref(0)
const selectedSku = ref<ProductSalesSummaryVO>()

const summaryTotal = computed(() =>
  summaryList.value.reduce(
    (acc, row) => ({
      count: acc.count + (row.count || 0),
      giftCount: acc.giftCount + (row.giftCount || 0),
      price: acc.price + (row.price || 0)
    }),
    { count: 0, giftCount: 0, price: 0 }
  )
)

const filterParams = () => ({
  time: salesQuery.time,
  keyword: salesQuery.keyword || undefined,
  source: salesQuery.source
})

const getSummary = async () => {
  summaryLoading.value = true
  try {
    summaryList.value = await ReportApi.getProductSalesSummary(filterParams())
  } finally {
    summaryLoading.value = false
  }
}

const getDetail = async () => {
  detailLoading.value = true
  try {
    const data = await ReportApi.getProductSalesPage({
      ...filterParams(),
      skuId: salesQuery.skuId,
      pageNo: salesQuery.pageNo,
      pageSize: salesQuery.pageSize
    })
    detailList.value = data.list
    detailTotal.value = data.total
  } finally {
    detailLoading.value = false
  }
}

const handleSalesQuery = () => {
  salesQuery.pageNo = 1
  salesQuery.skuId = undefined
  selectedSku.value = undefined
  getSummary()
  getDetail()
}

const resetSalesQuery = () => {
  salesQuery.time = todayRange()
  salesQuery.keyword = undefined
  salesQuery.source = undefined
  handleSalesQuery()
}

const selectSku = (row: ProductSalesSummaryVO) => {
  selectedSku.value = row
  salesQuery.skuId = row.skuId
  salesQuery.pageNo = 1
  getDetail()
}

const clearSku = () => {
  selectedSku.value = undefined
  salesQuery.skuId = undefined
  salesQuery.pageNo = 1
  getDetail()
}

const handleExportSales = async () => {
  try {
    await message.exportConfirm()
    exportLoading.value = true
    const data = await ReportApi.exportProductSales({ ...filterParams(), skuId: salesQuery.skuId })
    const range = `${salesQuery.time[0].slice(0, 10)}至${salesQuery.time[1].slice(0, 10)}`
    download.excel(data, `商品销售明细-${range}.xls`)
  } catch {
  } finally {
    exportLoading.value = false
  }
}

const openOnlineOrder = (row: ProductSalesVO) => {
  push({ name: 'TradeOrderDetail', params: { id: row.orderId } })
}

watch(activeTab, (tab) => {
  if (tab === 'product') handleSalesQuery()
  else getRevenue()
})

onMounted(() => {
  getRevenue()
})
</script>
<style lang="scss" scoped>
.report-kpis {
  display: grid;
  margin-bottom: 15px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 15px;

  @media (width <= 1200px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.report-kpi {
  display: flex;
  padding: 18px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--app-line);
  border-radius: 12px;
  gap: 14px;
  align-items: center;

  &__icon {
    display: flex;
    width: 40px;
    height: 40px;
    color: var(--el-text-color-regular);
    border: 1px solid var(--app-line);
    border-radius: 10px;
    flex: none;
    align-items: center;
    justify-content: center;
  }

  &__label {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  &__value {
    margin: 2px 0;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.3px;
    color: var(--el-text-color-primary);
    font-variant-numeric: tabular-nums;
  }

  &__sub {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.report-section-title {
  display: flex;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  align-items: center;

  span {
    margin-left: 10px;
    font-size: 12px;
    font-weight: 400;
    color: var(--el-text-color-secondary);
  }
}

:deep(.report-empty-row) {
  color: var(--el-text-color-placeholder);
}

:deep(.report-total-row) {
  font-weight: 600;
  background: var(--el-fill-color-light);
}
</style>
