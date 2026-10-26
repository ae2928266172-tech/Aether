<!-- 门店收银：今日汇总、打开触屏收银台、收银记录（可作废） -->
<template>
  <ContentWrap>
    <div class="flex flex-wrap items-center gap-16px">
      <el-button
        type="primary"
        size="large"
        @click="openTerminal"
        v-hasPermi="['trade:pos:create']"
      >
        <Icon icon="ep:monitor" class="mr-5px" /> 打开收银台
      </el-button>
      <div class="flex flex-wrap gap-12px">
        <div class="summary-card">
          <span>今日收款</span>
          <strong>¥{{ fenToYuan(summary.totalPrice || 0) }}</strong>
        </div>
        <div class="summary-card">
          <span>今日笔数</span>
          <strong>{{ summary.orderCount || 0 }}</strong>
        </div>
        <div v-for="item in summary.payTypes || []" :key="item.payType" class="summary-card">
          <span><dict-tag :type="DICT_TYPE.TRADE_POS_PAY_TYPE" :value="item.payType" /></span>
          <strong>¥{{ fenToYuan(item.totalPrice) }}</strong>
        </div>
        <div class="summary-card">
          <span>作废</span>
          <strong>{{ summary.cancelCount || 0 }}</strong>
        </div>
      </div>
    </div>
    <div class="mt-8px text-12px text-[var(--el-text-color-secondary)]">
      今日汇总为所有收银员的合计；收银台右上角「交班汇总」只统计当前收银员。
    </div>
  </ContentWrap>

  <ContentWrap>
    <el-form class="-mb-15px" :model="queryParams" ref="queryFormRef" :inline="true" label-width="68px">
      <el-form-item label="单号" prop="no">
        <el-input
          v-model="queryParams.no"
          placeholder="请输入收银单号"
          clearable
          @keyup.enter="handleQuery"
          class="!w-200px"
        />
      </el-form-item>
      <el-form-item label="收款方式" prop="payType">
        <el-select v-model="queryParams.payType" clearable placeholder="全部" class="!w-160px">
          <el-option
            v-for="dict in getIntDictOptions(DICT_TYPE.TRADE_POS_PAY_TYPE)"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-select v-model="queryParams.status" clearable placeholder="全部" class="!w-160px">
          <el-option
            v-for="dict in getIntDictOptions(DICT_TYPE.TRADE_POS_ORDER_STATUS)"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="收银时间" prop="createTime">
        <el-date-picker
          v-model="queryParams.createTime"
          value-format="YYYY-MM-DD HH:mm:ss"
          type="daterange"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :default-time="[new Date('1 00:00:00'), new Date('1 23:59:59')]"
          :shortcuts="defaultShortcuts"
          class="!w-260px"
        />
      </el-form-item>
      <el-form-item>
        <el-button @click="handleQuery"><Icon icon="ep:search" class="mr-5px" /> 搜索</el-button>
        <el-button @click="resetQuery"><Icon icon="ep:refresh" class="mr-5px" /> 重置</el-button>
      </el-form-item>
    </el-form>
  </ContentWrap>

  <ContentWrap>
    <el-table v-loading="loading" :data="list" row-key="id">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.items" size="small" class="ml-48px !w-[calc(100%-48px)]">
            <el-table-column label="商品" prop="spuName" min-width="200">
              <template #default="{ row: item }">
                {{ item.spuName }}
                <span v-if="item.skuName && item.skuName !== item.spuName" class="text-[var(--el-text-color-secondary)]">
                  （{{ item.skuName }}）
                </span>
              </template>
            </el-table-column>
            <el-table-column label="单价" width="100">
              <template #default="{ row: item }">¥{{ fenToYuan(item.price) }}</template>
            </el-table-column>
            <el-table-column label="数量" width="120">
              <template #default="{ row: item }">
                {{ item.count }}
                <el-tag v-if="item.giftCount" type="success" size="small" class="ml-4px">
                  赠 {{ item.giftCount }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="小计" width="110">
              <template #default="{ row: item }">¥{{ fenToYuan(item.totalPrice) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column label="单号" prop="no" min-width="180" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <dict-tag :type="DICT_TYPE.TRADE_POS_ORDER_STATUS" :value="row.status" />
          <el-tooltip v-if="row.cancelReason" :content="row.cancelReason">
            <Icon icon="ep:info-filled" class="ml-4px cursor-pointer" />
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="收银时间" prop="createTime" :formatter="dateFormatter" width="180" />
      <el-table-column label="件数" prop="productCount" width="80" align="center" />
      <el-table-column label="金额" width="110" align="right">
        <template #default="{ row }">¥{{ fenToYuan(row.totalPrice) }}</template>
      </el-table-column>
      <el-table-column label="收款方式" width="100" align="center">
        <template #default="{ row }">
          <dict-tag :type="DICT_TYPE.TRADE_POS_PAY_TYPE" :value="row.payType" />
        </template>
      </el-table-column>
      <el-table-column label="实收 / 找零" width="150" align="right">
        <template #default="{ row }">
          ¥{{ fenToYuan(row.receivedPrice) }} / ¥{{ fenToYuan(row.changePrice) }}
        </template>
      </el-table-column>
      <el-table-column label="收银员" prop="cashierName" width="110" />
      <el-table-column label="操作" width="100" fixed="right" align="center">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 10"
            link
            type="danger"
            @click="handleCancel(row)"
            v-hasPermi="['trade:pos:cancel']"
          >
            作废
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <Pagination
      :total="total"
      v-model:page="queryParams.pageNo"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
  </ContentWrap>
</template>
<script lang="ts" setup>
import { ElMessageBox } from 'element-plus'
import { fenToYuan } from '@/utils'
import { DICT_TYPE, getIntDictOptions } from '@/utils/dict'
import { dateFormatter, defaultShortcuts } from '@/utils/formatTime'
import { PosApi, PosOrderVO, PosSummaryVO } from '@/api/mall/trade/pos'

defineOptions({ name: 'TradePos' })

const message = useMessage()
const router = useRouter()

const summary = ref<Partial<PosSummaryVO>>({})
const loading = ref(true)
const list = ref<PosOrderVO[]>([])
const total = ref(0)
const queryFormRef = ref()
const queryParams = reactive({
  pageNo: 1,
  pageSize: 10,
  no: undefined,
  payType: undefined,
  status: undefined,
  createTime: []
})

const getList = async () => {
  loading.value = true
  try {
    const data = await PosApi.getOrderPage(queryParams)
    list.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}
const getSummary = async () => {
  summary.value = await PosApi.getSummary({ all: true })
}

const handleQuery = () => {
  queryParams.pageNo = 1
  getList()
}
const resetQuery = () => {
  queryFormRef.value.resetFields()
  handleQuery()
}

const openTerminal = () => {
  router.push({ name: 'TradePosTerminal' })
}

/** 作废：退款给顾客后操作，商品退回库存 */
const handleCancel = async (row: PosOrderVO) => {
  const { value } = await ElMessageBox.prompt(
    `作废后商品退回库存，请确认已把 ¥${fenToYuan(row.totalPrice)} 退还给顾客。`,
    `作废收银单 ${row.no}`,
    { inputPlaceholder: '作废原因（选填）', confirmButtonText: '作废', cancelButtonText: '取消', type: 'warning' }
  )
  await PosApi.cancelOrder({ id: row.id, reason: value })
  message.success('已作废')
  await Promise.all([getList(), getSummary()])
}

onMounted(() => {
  getList()
  getSummary()
})
</script>
<style lang="scss" scoped>
.summary-card {
  display: flex;
  min-width: 120px;
  padding: 8px 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  flex-direction: column;

  span {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  strong {
    font-size: 20px;
  }
}
</style>
