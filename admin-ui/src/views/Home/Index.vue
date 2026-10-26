<!-- 首页：经营看板（今日数据、待配送订单、快捷入口），按权限显示 -->
<template>
  <div class="home">
    <div class="home-hero">
      <div>
        <div class="home-hero__sub">{{ today }}</div>
        <div class="home-hero__title">{{ greeting }}，{{ nickname }}</div>
      </div>
      <el-button
        v-if="checkPermi(['trade:pos:create'])"
        type="primary"
        size="large"
        class="home-hero__btn"
        @click="go('TradePosTerminal')"
      >
        <Icon icon="ep:monitor" class="mr-6px" /> 打开收银台
      </el-button>
    </div>

    <div v-if="stats.length" class="home-stats">
      <div
        v-for="item in stats"
        :key="item.key"
        class="home-stat"
        :class="{ 'is-link': item.route }"
        @click="item.route && go(item.route)"
      >
        <div class="home-stat__label">
          <Icon :icon="item.icon" :size="14" />
          {{ item.label }}
          <Icon v-if="item.route" icon="ep:arrow-right" :size="12" class="home-stat__arrow" />
        </div>
        <div class="home-stat__value">{{ item.value }}</div>
        <div class="home-stat__hint">{{ item.hint }}</div>
      </div>
    </div>

    <div class="home-grid">
      <el-card v-if="checkPermi(['trade:order:query'])" shadow="never">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-600">待配送订单</span>
            <el-button link type="primary" @click="go('TradeOrder')">全部订单</el-button>
          </div>
        </template>
        <div v-loading="orderLoading">
          <div v-for="order in orders" :key="order.id" class="home-order">
            <div class="min-w-0 flex-1">
              <div class="home-order__place">
                {{ order.wardName || order.receiverDetailAddress || '—' }}
                <el-tag v-if="order.bedNo" size="small" type="warning" class="ml-6px">
                  {{ order.bedNo }}
                </el-tag>
              </div>
              <div class="home-order__items">
                {{ (order.items || []).map((i) => `${i.spuName}×${i.count}`).join('、') }}
              </div>
              <div class="home-order__time">{{ formatDate(order.createTime) }}</div>
            </div>
            <div class="home-order__price">¥{{ fenToYuan(order.payPrice || 0) }}</div>
            <el-button
              type="primary"
              plain
              size="small"
              @click="router.push({ name: 'TradeOrderDetail', params: { id: order.id } })"
            >
              处理
            </el-button>
          </div>
          <el-empty v-if="!orderLoading && !orders.length" description="暂无待配送订单" :image-size="80" />
        </div>
      </el-card>

      <el-card v-if="shortcuts.length" shadow="never">
        <template #header><span class="font-600">快捷入口</span></template>
        <div class="home-shortcuts">
          <div v-for="item in shortcuts" :key="item.route" class="home-shortcut" @click="go(item.route)">
            <div class="home-shortcut__icon">
              <Icon :icon="item.icon" :size="22" />
            </div>
            <span>{{ item.title }}</span>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { fenToYuan } from '@/utils'
import { formatDate } from '@/utils/formatTime'
import { checkPermi } from '@/utils/permission'
import { useAppStore } from '@/store/modules/app'
import { useUserStore } from '@/store/modules/user'
import * as TradeStatisticsApi from '@/api/mall/statistics/trade'
import * as TradeOrderApi from '@/api/mall/trade/order'
import * as ProductSpuApi from '@/api/mall/product/spu'
import { PosApi } from '@/api/mall/trade/pos'

defineOptions({ name: 'Home' })

const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()

const nickname = computed(() => userStore.getUser.nickname || '你好')
const greeting = (() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})()
const today = `${formatDate(new Date(), 'YYYY年MM月DD日')} 星期${'日一二三四五六'[new Date().getDay()]}`

/** 跳转菜单页面，菜单被隐藏或无权限时忽略 */
const go = (name: string) => {
  if (router.hasRoute(name)) router.push({ name })
}

interface StatItem {
  key: string
  label: string
  value: string | number
  hint: string
  icon: string
  color: string
  bg: string
  route?: string
}
const stats = ref<StatItem[]>([])

const orders = ref<TradeOrderApi.OrderVO[]>([])
const orderLoading = ref(false)

const shortcuts = [
  { route: 'TradePos', title: '门店收银', icon: 'ep:money', color: '#0d9488', bg: '#ccfbf1', perm: 'trade:pos:query' },
  { route: 'TradeOrder', title: '订单管理', icon: 'ep:list', color: '#2563eb', bg: '#dbeafe', perm: 'trade:order:query' },
  { route: 'ProductSpu', title: '商品管理', icon: 'ep:goods', color: '#7c3aed', bg: '#ede9fe', perm: 'product:spu:query' },
  { route: 'DeliveryWard', title: '区域二维码', icon: 'ep:first-aid-kit', color: '#db2777', bg: '#fce7f3', perm: 'trade:delivery:ward:query' },
  { route: 'ErpPurchaseIn', title: '采购入库', icon: 'ep:sold-out', color: '#ea580c', bg: '#ffedd5', perm: 'erp:purchase-in:query' },
  { route: 'ErpStock', title: '库存查询', icon: 'ep:box', color: '#0891b2', bg: '#cffafe', perm: 'erp:stock:query' },
  { route: 'TradeSupplierSettlement', title: '供应商对账', icon: 'ep:document-checked', color: '#65a30d', bg: '#ecfccb', perm: 'trade:supplier-settlement:query' }
].filter((item) => checkPermi([item.perm]) && router.hasRoute(item.route))

const loadStats = async () => {
  const tasks: Promise<StatItem | undefined>[] = []
  if (checkPermi(['statistics:trade:query'])) {
    tasks.push(
      TradeStatisticsApi.getOrderComparison().then((data) => ({
        key: 'online',
        label: '今日线上订单',
        value: `¥${fenToYuan(data.value?.orderPayPrice || 0)}`,
        hint: `${data.value?.orderPayCount || 0} 件商品，昨日 ¥${fenToYuan(data.reference?.orderPayPrice || 0)}`,
        icon: 'ep:iphone',
        color: '#2563eb',
        bg: '#dbeafe'
      }))
    )
  }
  if (checkPermi(['trade:order:query'])) {
    orderLoading.value = true
    tasks.push(
      TradeOrderApi.getOrderPage({ pageNo: 1, pageSize: 6, status: 10, deliveryType: 3 })
        .then((data) => {
          orders.value = data.list
          return {
            key: 'pending',
            label: '待配送',
            value: data.total,
            hint: '顾客已付款，等待配送',
            icon: 'ep:van',
            color: '#ea580c',
            bg: '#ffedd5',
            route: 'TradeOrder'
          }
        })
        .finally(() => (orderLoading.value = false))
    )
  }
  if (checkPermi(['trade:pos:query'])) {
    tasks.push(
      PosApi.getSummary({ all: true }).then((data) => ({
        key: 'pos',
        label: '今日门店收款',
        value: `¥${fenToYuan(data.totalPrice || 0)}`,
        hint: `${data.orderCount || 0} 笔收银`,
        icon: 'ep:money',
        color: '#0d9488',
        bg: '#ccfbf1',
        route: 'TradePos'
      }))
    )
  }
  if (checkPermi(['product:spu:stock'])) {
    tasks.push(
      ProductSpuApi.getTabsCount().then((data) => ({
        key: 'stock',
        label: '库存预警',
        value: data?.[3] || 0,
        hint: '个商品库存不足',
        icon: 'ep:warning',
        color: '#dc2626',
        bg: '#fee2e2',
        route: 'ProductSpu'
      }))
    )
  }
  const results = await Promise.allSettled(tasks)
  stats.value = results
    .filter((r): r is PromiseFulfilledResult<StatItem> => r.status === 'fulfilled' && !!r.value)
    .map((r) => r.value)
}

onMounted(loadStats)
</script>
<style lang="scss" scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.home-hero {
  display: flex;
  padding: 4px 2px 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;

  &__sub {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  &__title {
    margin-top: 4px;
    font-size: 26px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    letter-spacing: -0.3px;
  }

  &__btn {
    height: 42px;
    padding: 0 20px;
    font-weight: 500;
    border-radius: 10px !important;
  }
}

/* 指标：一整块细线面板，竖线分隔 */
.home-stats {
  display: grid;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--app-line);
  border-radius: 12px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.home-stat {
  position: relative;
  padding: 20px 24px;
  border-left: 1px solid var(--app-line);
  margin-left: -1px;
  transition: background 0.15s;

  &.is-link {
    cursor: pointer;

    &:hover {
      background: var(--el-fill-color-lighter);

      .home-stat__arrow {
        opacity: 1;
        transform: translateX(0);
      }
    }
  }

  &__label {
    display: flex;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    align-items: center;
    gap: 6px;
  }

  &__arrow {
    margin-left: auto;
    opacity: 0;
    transform: translateX(-4px);
    transition: all 0.15s;
  }

  &__value {
    margin-top: 10px;
    font-size: 30px;
    font-weight: 600;
    line-height: 1.1;
    color: var(--el-text-color-primary);
    letter-spacing: -0.5px;
    font-variant-numeric: tabular-nums;
  }

  &__hint {
    margin-top: 6px;
    overflow: hidden;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.home-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 20px;
  align-items: start;

  @media (width <= 1100px) {
    grid-template-columns: 1fr;
  }
}

.home-order {
  display: flex;
  padding: 14px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  align-items: center;
  gap: 14px;

  &:last-child {
    border-bottom: none;
  }

  &__place {
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  &__items {
    margin-top: 4px;
    overflow: hidden;
    font-size: 13px;
    color: var(--el-text-color-regular);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__time {
    margin-top: 2px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__price {
    font-weight: 600;
    color: var(--el-text-color-primary);
    font-variant-numeric: tabular-nums;
  }
}

.home-shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.home-shortcut {
  display: flex;
  padding: 16px 6px 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  border-radius: 10px;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  transition: background 0.15s;

  &:hover {
    background: var(--el-fill-color-light);

    .home-shortcut__icon {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary-light-7);
    }
  }

  &__icon {
    display: flex;
    width: 44px;
    height: 44px;
    color: var(--el-text-color-regular);
    border: 1px solid var(--app-line);
    border-radius: 12px;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
}
</style>
