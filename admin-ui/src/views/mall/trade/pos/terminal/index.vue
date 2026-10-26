<!-- 门店收银台：全屏触屏界面，支持扫码枪 -->
<template>
  <div class="pos" v-loading="loading">
    <!-- 顶栏 -->
    <header class="pos-header">
      <div class="pos-header__title">
        <Icon icon="ep:shop" :size="22" />
        <span>门店收银台</span>
      </div>
      <div class="pos-header__info">
        <span>收银员：{{ cashierName }}</span>
        <span>今日 {{ summary.orderCount || 0 }} 单 · ¥{{ fenToYuan(summary.totalPrice || 0) }}</span>
        <span class="pos-header__clock">{{ clock }}</span>
      </div>
      <div class="pos-header__actions">
        <button class="pos-btn pos-btn--ghost" @click="openSummary">
          <Icon icon="ep:data-analysis" /> 交班汇总
        </button>
        <button class="pos-btn pos-btn--ghost" @click="toggleFullscreen">
          <Icon :icon="isFullscreen ? 'ep:close' : 'ep:full-screen'" />
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </button>
        <button class="pos-btn pos-btn--ghost" @click="goBack">
          <Icon icon="ep:back" /> 返回后台
        </button>
      </div>
    </header>

    <main class="pos-main">
      <!-- 左侧：商品 -->
      <section class="pos-goods">
        <div class="pos-search">
          <Icon icon="ep:search" :size="20" class="pos-search__icon" />
          <input
            ref="searchRef"
            v-model="keyword"
            class="pos-search__input"
            placeholder="扫码枪扫条码，或输入商品名称搜索"
            @keydown.enter.prevent="handleScan"
          />
          <button v-if="keyword" class="pos-search__clear" @click="clearKeyword">
            <Icon icon="ep:circle-close-filled" :size="20" />
          </button>
        </div>

        <!-- 大类 -->
        <div class="pos-cats">
          <button
            v-for="cat in rootCategories"
            :key="cat.id"
            :class="['pos-cat', { 'is-active': activeRootId === cat.id }]"
            @click="selectRoot(cat.id)"
          >
            {{ cat.name }}
          </button>
        </div>
        <!-- 小类 -->
        <div v-if="subCategories.length > 1" class="pos-subcats">
          <button
            :class="['pos-subcat', { 'is-active': activeSubId === 0 }]"
            @click="activeSubId = 0"
          >
            全部
          </button>
          <button
            v-for="cat in subCategories"
            :key="cat.id"
            :class="['pos-subcat', { 'is-active': activeSubId === cat.id }]"
            @click="activeSubId = cat.id"
          >
            {{ cat.name }}
          </button>
        </div>

        <div class="pos-grid">
          <button
            v-for="spu in visibleProducts"
            :key="spu.id"
            :class="['pos-card', { 'is-soldout': isSoldOut(spu) }]"
            :disabled="isSoldOut(spu)"
            @click="handleProductClick(spu)"
          >
            <div class="pos-card__img">
              <img v-if="spu.picUrl" :src="spu.picUrl" loading="lazy" alt="" />
              <Icon v-else icon="ep:goods" :size="36" />
              <span v-if="isSoldOut(spu)" class="pos-card__mask">已售罄</span>
            </div>
            <div class="pos-card__name">{{ spu.name }}</div>
            <div class="pos-card__foot">
              <span class="pos-card__price">
                ¥{{ fenToYuan(spu.price) }}<small v-if="spu.specType">起</small>
              </span>
              <span v-if="hasGift(spu)" class="pos-tag pos-tag--gift">
                买{{ spu.giftBuyCount }}赠{{ spu.giftCount }}
              </span>
              <span v-else-if="spu.customerVisible === false" class="pos-tag">门店</span>
            </div>
          </button>
          <div v-if="!visibleProducts.length" class="pos-empty">
            {{ keyword ? '没有找到“' + keyword + '”' : '这个分类下还没有商品' }}
          </div>
        </div>
      </section>

      <!-- 右侧：购物车 -->
      <aside class="pos-cart">
        <div class="pos-cart__head">
          <span>当前订单</span>
          <button v-if="cart.length" class="pos-link" @click="clearCart">清空</button>
        </div>
        <div class="pos-cart__list">
          <div v-for="item in cart" :key="item.skuId" class="pos-line">
            <div class="pos-line__info">
              <div class="pos-line__name">{{ item.spuName }}</div>
              <div class="pos-line__meta">
                <span v-if="item.skuName && item.skuName !== item.spuName">{{ item.skuName }} · </span>
                ¥{{ fenToYuan(item.price) }}
                <span v-if="giftOf(item) > 0" class="pos-tag pos-tag--gift">赠 {{ giftOf(item) }}</span>
              </div>
            </div>
            <div class="pos-stepper">
              <button class="pos-stepper__btn" @click="changeCount(item, -1)">
                <Icon icon="ep:minus" />
              </button>
              <span class="pos-stepper__num">{{ item.count }}</span>
              <button class="pos-stepper__btn" @click="changeCount(item, 1)">
                <Icon icon="ep:plus" />
              </button>
            </div>
            <div class="pos-line__total">¥{{ fenToYuan(item.price * item.count) }}</div>
          </div>
          <div v-if="!cart.length" class="pos-cart__empty">
            <Icon icon="ep:shopping-cart" :size="48" />
            <p>点击左侧商品或扫码添加</p>
          </div>
        </div>
        <div class="pos-cart__foot">
          <div class="pos-cart__sum">
            <span>共 {{ cartCount }} 件<template v-if="cartGiftCount">，另赠 {{ cartGiftCount }} 件</template></span>
            <span class="pos-cart__total">¥{{ fenToYuan(cartTotal) }}</span>
          </div>
          <button class="pos-btn pos-btn--primary pos-btn--xl" :disabled="!cart.length" @click="openPay">
            收款
          </button>
        </div>
      </aside>
    </main>

    <!-- 选择规格 -->
    <el-dialog v-model="specVisible" :title="specSpu?.name" width="560px" class="pos-dialog" append-to-body>
      <div class="pos-specs">
        <button
          v-for="sku in specSpu?.skus || []"
          :key="sku.id"
          class="pos-spec"
          :disabled="sku.soldOut"
          @click="addSku(specSpu!, sku); specVisible = false"
        >
          <span class="pos-spec__name">{{ sku.name }}</span>
          <span class="pos-spec__price">{{ sku.soldOut ? '已售罄' : '¥' + fenToYuan(sku.price) }}</span>
        </button>
      </div>
    </el-dialog>

    <!-- 收款 -->
    <el-dialog
      v-model="payVisible"
      title="收款"
      width="760px"
      class="pos-dialog"
      append-to-body
      :close-on-click-modal="false"
    >
      <div class="pos-pay">
        <div class="pos-pay__left">
          <div class="pos-pay__due">
            <span>应收</span>
            <strong>¥{{ fenToYuan(cartTotal) }}</strong>
          </div>
          <div class="pos-pay__types">
            <button
              v-for="type in payTypes"
              :key="type.value"
              :class="['pos-paytype', { 'is-active': payType === type.value }]"
              @click="selectPayType(type.value)"
            >
              <Icon :icon="type.icon" :size="24" />
              {{ type.label }}
            </button>
          </div>
          <template v-if="payType === PosPayTypeEnum.CASH.value">
            <div class="pos-pay__row">
              <span>实收</span>
              <strong class="pos-pay__received">¥{{ receivedText || '0' }}</strong>
            </div>
            <div class="pos-pay__row">
              <span>找零</span>
              <strong :class="['pos-pay__change', { 'is-error': changeFen < 0 }]">
                {{ changeFen < 0 ? '实收不足' : '¥' + fenToYuan(changeFen) }}
              </strong>
            </div>
            <div class="pos-pay__quick">
              <button v-for="amount in quickAmounts" :key="amount" class="pos-key" @click="setReceived(amount)">
                ¥{{ amount }}
              </button>
            </div>
          </template>
          <div v-else class="pos-pay__tip">
            请顾客用{{ payTypeLabel(payType) }}扫码付款 ¥{{ fenToYuan(cartTotal) }}，确认到账后点「确认收款」
          </div>
        </div>
        <div v-if="payType === PosPayTypeEnum.CASH.value" class="pos-keypad">
          <button v-for="key in keypadKeys" :key="key" class="pos-key" @click="pressKey(key)">
            <Icon v-if="key === 'del'" icon="ep:back" />
            <template v-else>{{ key }}</template>
          </button>
        </div>
      </div>
      <template #footer>
        <button class="pos-btn pos-btn--ghost pos-btn--lg" @click="payVisible = false">取消</button>
        <button
          class="pos-btn pos-btn--primary pos-btn--lg"
          :disabled="paying || (payType === PosPayTypeEnum.CASH.value && changeFen < 0)"
          @click="submitPay"
        >
          {{ paying ? '提交中…' : '确认收款' }}
        </button>
      </template>
    </el-dialog>

    <!-- 收款成功 -->
    <el-dialog v-model="doneVisible" width="460px" class="pos-dialog" append-to-body :show-close="false">
      <div v-if="lastOrder" class="pos-done">
        <Icon icon="ep:circle-check-filled" :size="64" class="pos-done__icon" />
        <h3>收款成功</h3>
        <div class="pos-done__amount">¥{{ fenToYuan(lastOrder.totalPrice) }}</div>
        <div v-if="lastOrder.payType === PosPayTypeEnum.CASH.value" class="pos-done__change">
          实收 ¥{{ fenToYuan(lastOrder.receivedPrice) }}，找零
          <strong>¥{{ fenToYuan(lastOrder.changePrice) }}</strong>
        </div>
        <div class="pos-done__no">单号 {{ lastOrder.no }}</div>
      </div>
      <template #footer>
        <button class="pos-btn pos-btn--ghost pos-btn--lg" @click="printReceipt">
          <Icon icon="ep:printer" /> 打印小票
        </button>
        <button class="pos-btn pos-btn--primary pos-btn--lg" @click="finishOrder">继续收银</button>
      </template>
    </el-dialog>

    <!-- 交班汇总 -->
    <el-dialog v-model="summaryVisible" title="今日交班汇总" width="520px" class="pos-dialog" append-to-body>
      <div class="pos-summary">
        <div class="pos-summary__big">
          <div>
            <span>收款笔数</span><strong>{{ summary.orderCount || 0 }}</strong>
          </div>
          <div>
            <span>收款金额</span><strong>¥{{ fenToYuan(summary.totalPrice || 0) }}</strong>
          </div>
          <div>
            <span>作废</span><strong>{{ summary.cancelCount || 0 }}</strong>
          </div>
        </div>
        <div v-for="item in summary.payTypes || []" :key="item.payType" class="pos-summary__row">
          <span>{{ payTypeLabel(item.payType) }}</span>
          <span>{{ item.orderCount }} 笔</span>
          <strong>¥{{ fenToYuan(item.totalPrice) }}</strong>
        </div>
        <p class="pos-summary__tip">只统计当前收银员今天的收款，作废单不计入。</p>
      </div>
    </el-dialog>

    <!-- 小票：只在打印时显示 -->
    <div v-if="lastOrder" class="pos-receipt">
      <h4>住院用品门店</h4>
      <p>单号：{{ lastOrder.no }}</p>
      <p>时间：{{ formatDate(lastOrder.createTime) }}</p>
      <p>收银员：{{ lastOrder.cashierName }}</p>
      <hr />
      <div v-for="item in lastOrder.items" :key="item.id" class="pos-receipt__item">
        <div>{{ item.spuName }}<template v-if="item.skuName !== item.spuName"> {{ item.skuName }}</template></div>
        <div class="pos-receipt__line">
          <span>{{ fenToYuan(item.price) }} × {{ item.count }}</span>
          <span>{{ fenToYuan(item.totalPrice) }}</span>
        </div>
        <div v-if="item.giftCount" class="pos-receipt__line"><span>赠送 × {{ item.giftCount }}</span><span>0.00</span></div>
      </div>
      <hr />
      <div class="pos-receipt__line"><span>合计</span><span>¥{{ fenToYuan(lastOrder.totalPrice) }}</span></div>
      <div class="pos-receipt__line"><span>{{ payTypeLabel(lastOrder.payType) }}</span><span>¥{{ fenToYuan(lastOrder.receivedPrice) }}</span></div>
      <div v-if="lastOrder.changePrice" class="pos-receipt__line"><span>找零</span><span>¥{{ fenToYuan(lastOrder.changePrice) }}</span></div>
      <p class="pos-receipt__thanks">谢谢惠顾，祝早日康复</p>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { fenToYuan, yuanToFen } from '@/utils'
import { formatDate } from '@/utils/formatTime'
import { useUserStore } from '@/store/modules/user'
import {
  PosApi,
  PosCategoryVO,
  PosOrderVO,
  PosPayTypeEnum,
  PosProductVO,
  PosSkuVO,
  PosSummaryVO
} from '@/api/mall/trade/pos'

defineOptions({ name: 'TradePosTerminal' })

interface CartItem {
  skuId: number
  spuId: number
  spuName: string
  skuName: string
  price: number
  count: number
  giftBuyCount?: number
  giftCount?: number
}

const message = useMessage()
const router = useRouter()
const userStore = useUserStore()
const cashierName = computed(() => userStore.getUser.nickname)

const loading = ref(false)
const products = ref<PosProductVO[]>([])
const categories = ref<PosCategoryVO[]>([])
const summary = ref<Partial<PosSummaryVO>>({})

/** 分类：大类 + 小类 */
const activeRootId = ref(0)
const activeSubId = ref(0)
const rootCategories = computed(() => [
  { id: 0, parentId: 0, name: '全部' } as PosCategoryVO,
  ...categories.value.filter((c) => c.parentId === 0)
])
const subCategories = computed(() =>
  activeRootId.value ? categories.value.filter((c) => c.parentId === activeRootId.value) : []
)
const selectRoot = (id: number) => {
  activeRootId.value = id
  activeSubId.value = 0
}

/** 搜索 + 扫码 */
const keyword = ref('')
const searchRef = ref<HTMLInputElement>()
const focusSearch = () => nextTick(() => searchRef.value?.focus())
const clearKeyword = () => {
  keyword.value = ''
  focusSearch()
}
const visibleProducts = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    return products.value.filter(
      (spu) => spu.name.toLowerCase().includes(kw) || spu.skus.some((sku) => sku.barCode === kw)
    )
  }
  if (activeSubId.value) {
    return products.value.filter((spu) => spu.categoryId === activeSubId.value)
  }
  if (activeRootId.value) {
    const subIds = new Set(subCategories.value.map((c) => c.id))
    return products.value.filter((spu) => subIds.has(spu.categoryId))
  }
  return products.value
})
const handleScan = () => {
  const code = keyword.value.trim()
  if (!code) return
  for (const spu of products.value) {
    const sku = spu.skus.find((s) => s.barCode === code)
    if (sku) {
      if (sku.soldOut) {
        message.warning(`${spu.name} 已售罄`)
      } else {
        addSku(spu, sku)
      }
      keyword.value = ''
      return
    }
  }
  // 不是条码：按名称只有一个结果时直接加入
  if (visibleProducts.value.length === 1) {
    handleProductClick(visibleProducts.value[0])
    keyword.value = ''
  } else if (!visibleProducts.value.length) {
    message.warning(`没有找到条码或名称为“${code}”的商品`)
  }
}

/** 商品 */
const isSoldOut = (spu: PosProductVO) => spu.skus.every((sku) => sku.soldOut)
const hasGift = (spu: PosProductVO) => (spu.giftBuyCount || 0) > 0 && (spu.giftCount || 0) > 0
const specVisible = ref(false)
const specSpu = ref<PosProductVO>()
const handleProductClick = (spu: PosProductVO) => {
  const available = spu.skus.filter((sku) => !sku.soldOut)
  if (available.length === 1 && spu.skus.length === 1) {
    addSku(spu, available[0])
    return
  }
  specSpu.value = spu
  specVisible.value = true
}

/** 购物车 */
const cart = ref<CartItem[]>([])
const addSku = (spu: PosProductVO, sku: PosSkuVO) => {
  const exists = cart.value.find((item) => item.skuId === sku.id)
  if (exists) {
    exists.count++
  } else {
    cart.value.push({
      skuId: sku.id,
      spuId: spu.id,
      spuName: spu.name,
      skuName: sku.name,
      price: sku.price,
      count: 1,
      giftBuyCount: spu.giftBuyCount,
      giftCount: spu.giftCount
    })
  }
  focusSearch()
}
const changeCount = (item: CartItem, delta: number) => {
  item.count += delta
  if (item.count <= 0) {
    cart.value = cart.value.filter((i) => i.skuId !== item.skuId)
  }
}
const clearCart = async () => {
  await message.confirm('确认清空当前订单？')
  cart.value = []
  focusSearch()
}
const giftOf = (item: CartItem) =>
  item.giftBuyCount && item.giftCount
    ? Math.floor(item.count / item.giftBuyCount) * item.giftCount
    : 0
const cartCount = computed(() => cart.value.reduce((sum, item) => sum + item.count, 0))
const cartGiftCount = computed(() => cart.value.reduce((sum, item) => sum + giftOf(item), 0))
const cartTotal = computed(() => cart.value.reduce((sum, item) => sum + item.price * item.count, 0))

/** 收款 */
const payTypes = [
  { ...PosPayTypeEnum.CASH, icon: 'ep:money' },
  { ...PosPayTypeEnum.WECHAT, icon: 'ep:chat-dot-round' },
  { ...PosPayTypeEnum.ALIPAY, icon: 'ep:wallet' },
  { ...PosPayTypeEnum.OTHER, icon: 'ep:more' }
]
const payTypeLabel = (value?: number) =>
  Object.values(PosPayTypeEnum).find((t) => t.value === value)?.label || '其他'
const payVisible = ref(false)
const paying = ref(false)
const payType = ref(PosPayTypeEnum.CASH.value)
const receivedText = ref('')
const receivedFen = computed(() => yuanToFen(receivedText.value || 0))
const changeFen = computed(() => receivedFen.value - cartTotal.value)
const keypadKeys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del']
/** 快捷金额：刚好、凑整到 10 / 50 / 100 */
const quickAmounts = computed(() => {
  const due = cartTotal.value / 100
  const list = [due, Math.ceil(due / 10) * 10, Math.ceil(due / 50) * 50, Math.ceil(due / 100) * 100]
  return [...new Set(list.map((n) => Number(n.toFixed(2))))]
})
const openPay = () => {
  payType.value = PosPayTypeEnum.CASH.value
  receivedText.value = ''
  payVisible.value = true
}
const selectPayType = (value: number) => {
  payType.value = value
}
const setReceived = (amount: number) => {
  receivedText.value = String(amount)
}
const pressKey = (key: string) => {
  const text = receivedText.value
  if (key === 'del') {
    receivedText.value = text.slice(0, -1)
    return
  }
  if (key === '.' && text.includes('.')) return
  if (text.includes('.') && text.split('.')[1].length >= 2) return
  if (text.length >= 8) return
  receivedText.value = text === '0' && key !== '.' ? key : (text || (key === '.' ? '0' : '')) + key
}
const lastOrder = ref<PosOrderVO>()
const doneVisible = ref(false)
const submitPay = async () => {
  paying.value = true
  try {
    const isCash = payType.value === PosPayTypeEnum.CASH.value
    lastOrder.value = await PosApi.createOrder({
      items: cart.value.map((item) => ({ skuId: item.skuId, count: item.count })),
      payType: payType.value,
      receivedPrice: isCash ? receivedFen.value : cartTotal.value
    })
    payVisible.value = false
    doneVisible.value = true
    cart.value = []
    loadSummary()
    loadProducts() // 刷新售罄状态
  } finally {
    paying.value = false
  }
}
const finishOrder = () => {
  doneVisible.value = false
  focusSearch()
}
const printReceipt = () => window.print()

/** 交班汇总 */
const summaryVisible = ref(false)
const loadSummary = async () => {
  summary.value = await PosApi.getSummary()
}
const openSummary = async () => {
  await loadSummary()
  summaryVisible.value = true
}

/** 顶栏 */
const clock = ref('')
let clockTimer: ReturnType<typeof setInterval> | undefined
const updateClock = () => {
  clock.value = formatDate(new Date(), 'MM-DD HH:mm')
}
const isFullscreen = ref(false)
const toggleFullscreen = async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
  } else {
    await document.documentElement.requestFullscreen()
  }
}
const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}
const goBack = () => {
  router.push({ name: 'TradePos' }).catch(() => router.push('/'))
}

/** 扫码枪在页面任意位置输入时，把焦点拉回搜索框 */
const onKeydown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
  if (payVisible.value || specVisible.value || summaryVisible.value) return
  if (e.key.length === 1 && /[0-9a-zA-Z]/.test(e.key)) {
    focusSearch()
  }
}

const loadProducts = async () => {
  products.value = await PosApi.getProductList()
}
onMounted(async () => {
  updateClock()
  clockTimer = setInterval(updateClock, 30 * 1000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('keydown', onKeydown)
  loading.value = true
  try {
    const [cats] = await Promise.all([PosApi.getCategoryList(), loadProducts(), loadSummary()])
    categories.value = cats
  } finally {
    loading.value = false
  }
  focusSearch()
})
onBeforeUnmount(() => {
  clearInterval(clockTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('keydown', onKeydown)
})
</script>
<style lang="scss" scoped>
.pos {
  display: flex;
  height: 100vh;
  overflow: hidden;
  font-size: 16px;
  color: var(--pos-text);
  user-select: none;
  background: var(--pos-page);
  flex-direction: column;
}

.pos-header {
  display: flex;
  height: 60px;
  padding: 0 16px;
  color: #fff;
  background: var(--pos-primary);
  align-items: center;
  gap: 24px;
  flex: none;

  &__title {
    display: flex;
    font-size: 20px;
    font-weight: 600;
    align-items: center;
    gap: 8px;
  }

  &__info {
    display: flex;
    font-size: 15px;
    opacity: 0.92;
    flex: 1;
    gap: 20px;
  }

  &__clock {
    font-variant-numeric: tabular-nums;
  }

  &__actions {
    display: flex;
    gap: 8px;

    .pos-btn--ghost {
      color: #fff;
      background: rgb(255 255 255 / 16%);
    }
  }
}

.pos-main {
  display: flex;
  min-height: 0;
  padding: var(--pos-gap);
  flex: 1;
  gap: var(--pos-gap);
}

/* 左侧商品区 */
.pos-goods {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
}

.pos-search {
  position: relative;
  display: flex;
  align-items: center;

  &__icon {
    position: absolute;
    left: 16px;
    color: var(--pos-sub);
  }

  &__input {
    width: 100%;
    height: 52px;
    padding: 0 48px;
    font-size: 17px;
    color: var(--pos-text);
    background: var(--pos-card);
    border: 1px solid var(--pos-border);
    border-radius: var(--pos-radius);
    outline: none;

    &:focus {
      border-color: var(--pos-primary);
    }
  }

  &__clear {
    position: absolute;
    right: 8px;
    display: flex;
    width: 40px;
    height: 40px;
    color: var(--pos-sub);
    background: transparent;
    align-items: center;
    justify-content: center;
  }
}

.pos-cats,
.pos-subcats {
  display: flex;
  overflow-x: auto;
  gap: 8px;
  flex: none;
  scrollbar-width: none;
}

.pos-cat {
  min-width: 96px;
  height: 52px;
  padding: 0 20px;
  font-size: 17px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--pos-card);
  border: 1px solid var(--pos-border) !important;
  border-radius: var(--pos-radius);

  &.is-active {
    color: #fff;
    background: var(--pos-primary);
    border-color: var(--pos-primary) !important;
  }
}

.pos-subcat {
  height: 40px;
  padding: 0 16px;
  font-size: 15px;
  white-space: nowrap;
  background: var(--pos-card);
  border-radius: 20px;

  &.is-active {
    color: var(--pos-primary);
    background: var(--el-color-primary-light-9);
    box-shadow: inset 0 0 0 1px var(--pos-primary);
  }
}

.pos-grid {
  display: grid;
  min-height: 0;
  padding-bottom: 8px;
  overflow-y: auto;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  align-content: start;
  flex: 1;
}

.pos-card {
  display: flex;
  padding: 8px;
  text-align: left;
  background: var(--pos-card);
  border-radius: var(--pos-radius);
  transition: transform 0.08s;
  flex-direction: column;
  gap: 6px;

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &.is-soldout {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &__img {
    position: relative;
    display: flex;
    overflow: hidden;
    color: var(--pos-sub);
    background: var(--pos-page);
    border-radius: 6px;
    aspect-ratio: 4 / 3;
    align-items: center;
    justify-content: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__mask {
    position: absolute;
    inset: 0;
    display: flex;
    font-weight: 600;
    color: #fff;
    background: rgb(0 0 0 / 45%);
    align-items: center;
    justify-content: center;
  }

  &__name {
    display: -webkit-box;
    min-height: 2.6em;
    overflow: hidden;
    font-size: 15px;
    line-height: 1.3;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  &__price {
    font-size: 18px;
    font-weight: 600;
    color: var(--el-color-danger);

    small {
      margin-left: 2px;
      font-size: 12px;
      font-weight: 400;
    }
  }
}

.pos-tag {
  padding: 1px 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--pos-sub);
  white-space: nowrap;
  background: var(--pos-page);
  border-radius: 4px;

  &--gift {
    color: var(--el-color-success);
    background: var(--el-color-success-light-9);
  }
}

.pos-empty {
  padding: 60px 0;
  color: var(--pos-sub);
  text-align: center;
  grid-column: 1 / -1;
}

/* 右侧购物车 */
.pos-cart {
  display: flex;
  width: 400px;
  overflow: hidden;
  background: var(--pos-card);
  border-radius: var(--pos-radius);
  flex: none;
  flex-direction: column;

  &__head {
    display: flex;
    padding: 14px 16px;
    font-size: 18px;
    font-weight: 600;
    border-bottom: 1px solid var(--pos-border);
    justify-content: space-between;
    align-items: center;
  }

  &__list {
    overflow-y: auto;
    flex: 1;
  }

  &__empty {
    padding: 80px 0;
    color: var(--pos-sub);
    text-align: center;
  }

  &__foot {
    padding: 14px 16px 16px;
    border-top: 1px solid var(--pos-border);
  }

  &__sum {
    display: flex;
    margin-bottom: 12px;
    color: var(--pos-sub);
    align-items: baseline;
    justify-content: space-between;
  }

  &__total {
    font-size: 30px;
    font-weight: 700;
    color: var(--el-color-danger);
    font-variant-numeric: tabular-nums;
  }
}

.pos-line {
  display: grid;
  padding: 12px 16px;
  border-bottom: 1px solid var(--pos-border);
  grid-template-columns: 1fr auto 76px;
  gap: 10px;
  align-items: center;

  &__name {
    font-size: 16px;
    font-weight: 500;
  }

  &__meta {
    display: flex;
    margin-top: 2px;
    font-size: 13px;
    color: var(--pos-sub);
    align-items: center;
    gap: 6px;
  }

  &__total {
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
}

.pos-stepper {
  display: flex;
  align-items: center;
  gap: 4px;

  &__btn {
    display: flex;
    width: 42px;
    height: 42px;
    font-size: 18px;
    background: var(--pos-page);
    border-radius: 8px;
    align-items: center;
    justify-content: center;
  }

  &__num {
    min-width: 30px;
    font-size: 18px;
    font-weight: 600;
    text-align: center;
  }
}

/* 通用按钮 */
.pos-btn {
  display: inline-flex;
  height: 40px;
  padding: 0 14px;
  font-size: 15px;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &--ghost {
    background: var(--pos-page);
  }

  &--primary {
    color: #fff !important;
    background: var(--pos-primary);
  }

  &--lg {
    height: 56px;
    min-width: 140px;
    font-size: 18px;
  }

  &--xl {
    width: 100%;
    height: 64px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 4px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.pos-link {
  font-size: 15px;
  color: var(--el-color-danger) !important;
  background: transparent;
}

/* 规格 */
.pos-specs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.pos-spec {
  display: flex;
  height: 72px;
  padding: 0 16px;
  background: var(--el-fill-color-light);
  border-radius: var(--pos-radius);
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;

  &__name {
    font-size: 17px;
  }

  &__price {
    font-size: 16px;
    font-weight: 600;
    color: var(--el-color-danger);
  }

  &:disabled {
    opacity: 0.45;
  }
}

/* 收款 */
.pos-pay {
  display: flex;
  gap: 20px;

  &__left {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 14px;
  }

  &__due {
    display: flex;
    padding: 14px 16px;
    font-size: 18px;
    background: var(--el-fill-color-light);
    border-radius: var(--pos-radius);
    justify-content: space-between;
    align-items: baseline;

    strong {
      font-size: 34px;
      color: var(--el-color-danger);
    }
  }

  &__types {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  &__row {
    display: flex;
    padding: 0 4px;
    font-size: 18px;
    justify-content: space-between;
    align-items: baseline;

    strong {
      font-size: 26px;
      font-variant-numeric: tabular-nums;
    }
  }

  &__change {
    color: var(--el-color-success);

    &.is-error {
      font-size: 18px !important;
      color: var(--el-color-danger);
    }
  }

  &__quick {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  &__tip {
    padding: 24px 16px;
    font-size: 17px;
    line-height: 1.6;
    color: var(--pos-sub);
    background: var(--el-fill-color-light);
    border-radius: var(--pos-radius);
  }
}

.pos-paytype {
  display: flex;
  height: 72px;
  font-size: 16px;
  background: var(--el-fill-color-light);
  border-radius: var(--pos-radius);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;

  &.is-active {
    color: #fff !important;
    background: var(--pos-primary);
  }
}

.pos-keypad {
  display: grid;
  width: 260px;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.pos-key {
  display: flex;
  height: 60px;
  font-size: 22px;
  font-weight: 500;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  align-items: center;
  justify-content: center;

  &:active {
    background: var(--el-fill-color-dark);
  }
}

.pos-pay__quick .pos-key {
  height: 48px;
  font-size: 17px;
}

/* 成功 */
.pos-done {
  text-align: center;

  &__icon {
    color: var(--el-color-success);
  }

  h3 {
    margin: 8px 0;
    font-size: 22px;
  }

  &__amount {
    font-size: 36px;
    font-weight: 700;
  }

  &__change {
    margin-top: 8px;
    font-size: 18px;

    strong {
      font-size: 24px;
      color: var(--el-color-success);
    }
  }

  &__no {
    margin-top: 10px;
    color: var(--pos-sub);
  }
}

/* 交班 */
.pos-summary {
  &__big {
    display: grid;
    margin-bottom: 16px;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;

    div {
      display: flex;
      padding: 14px;
      background: var(--el-fill-color-light);
      border-radius: var(--pos-radius);
      flex-direction: column;
      gap: 4px;
    }

    span {
      color: var(--pos-sub);
    }

    strong {
      font-size: 24px;
    }
  }

  &__row {
    display: grid;
    padding: 10px 4px;
    font-size: 16px;
    border-bottom: 1px solid var(--pos-border);
    grid-template-columns: 1fr 1fr auto;
  }

  &__tip {
    margin-top: 12px;
    font-size: 13px;
    color: var(--pos-sub);
  }
}

.pos-receipt {
  display: none;
}

@media (width <= 1100px) {
  .pos-cart {
    width: 320px;
  }

  .pos-header__info span:first-child {
    display: none;
  }
}
</style>
<style lang="scss">
/* 收银台和它的弹窗共用：弹窗挂在 body 下，所以变量和按钮样式不能放在 scoped 里 */
.pos,
.pos-dialog {
  --pos-gap: 12px;
  --pos-radius: 10px;
  --pos-primary: var(--el-color-primary);
  --pos-card: var(--el-bg-color);
  --pos-page: var(--el-bg-color-page);
  --pos-border: var(--el-border-color-lighter);
  --pos-text: var(--el-text-color-primary);
  --pos-sub: var(--el-text-color-secondary);

  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
    background: none;
    border: none;
    touch-action: manipulation;
  }
}

.pos-dialog {
  font-size: 16px;
  border-radius: 12px;

  .el-dialog__title {
    font-size: 20px;
    font-weight: 600;
  }

  .el-dialog__footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
}

/* 打印小票：只打印 .pos-receipt，适配 58mm 热敏纸 */
@media print {
  body * {
    visibility: hidden;
  }

  .pos-receipt,
  .pos-receipt * {
    visibility: visible;
  }

  .pos-receipt {
    position: absolute;
    top: 0;
    left: 0;
    display: block !important;
    width: 58mm;
    padding: 2mm;
    font-size: 12px;
    line-height: 1.5;
    color: #000;

    h4 {
      margin: 0 0 4px;
      font-size: 15px;
      text-align: center;
    }

    p {
      margin: 0;
    }

    hr {
      margin: 4px 0;
      border: none;
      border-top: 1px dashed #000;
    }
  }

  .pos-receipt__line {
    display: flex;
    justify-content: space-between;
  }

  .pos-receipt__thanks {
    margin-top: 6px !important;
    text-align: center;
  }
}
</style>
