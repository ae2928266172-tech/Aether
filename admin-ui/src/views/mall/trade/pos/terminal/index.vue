<!-- 门店收银台：全屏触屏界面，支持扫码枪、整单打折 / 改收款金额、收款后自动打印小票和语音播报 -->
<template>
  <div class="pos" v-loading="loading">
    <!-- 顶栏 -->
    <header class="pos-header">
      <div class="pos-header__brand">
        <img src="@/assets/imgs/logo.png" alt="" class="pos-header__logo" />
        <div>
          <div class="pos-header__title">门店收银台</div>
          <div class="pos-header__store">{{ storeTitle }}</div>
        </div>
      </div>
      <div class="pos-header__stats">
        <div class="pos-stat">
          <span>今日收款</span>
          <strong>¥{{ fenToYuan(summary.totalPrice || 0) }}</strong>
        </div>
        <div class="pos-stat">
          <span>笔数</span>
          <strong>{{ summary.orderCount || 0 }}</strong>
        </div>
        <div class="pos-stat pos-stat--clock">
          <span>{{ today }}</span>
          <strong>{{ clock }}</strong>
        </div>
      </div>
      <div class="pos-header__actions">
        <button class="pos-hbtn" @click="openRecent">
          <Icon icon="ep:tickets" :size="18" /> 最近订单
        </button>
        <button class="pos-hbtn" @click="openSummary">
          <Icon icon="ep:data-analysis" :size="18" /> 交班汇总
        </button>
        <button class="pos-hbtn" @click="toggleFullscreen">
          <Icon :icon="isFullscreen ? 'ep:close' : 'ep:full-screen'" :size="18" />
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </button>
        <button class="pos-hbtn" @click="goBack">
          <Icon icon="ep:back" :size="18" /> 后台
        </button>
        <div class="pos-cashier">
          <span class="pos-cashier__avatar">{{ cashierName?.slice(0, 1) }}</span>
          <span class="pos-cashier__name">{{ cashierName }}</span>
        </div>
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
            placeholder="输入商品名称搜索，或直接用扫码枪扫条码"
            @keydown.enter.prevent="handleScan"
          />
          <button v-if="keyword" class="pos-search__clear" @click="clearKeyword">
            <Icon icon="ep:circle-close-filled" :size="20" />
          </button>
          <span v-else class="pos-search__badge"><Icon icon="ep:aim" :size="14" /> 扫码枪就绪</span>
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
            <span class="pos-cat__count">{{ countOfRoot(cat.id) }}</span>
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
            :class="['pos-card', { 'is-soldout': isSoldOut(spu), 'is-picked': countInCart(spu) > 0 }]"
            :disabled="isSoldOut(spu)"
            @click="handleProductClick(spu)"
          >
            <div class="pos-card__img">
              <img v-if="spu.picUrl" :src="spu.picUrl" loading="lazy" alt="" />
              <Icon v-else icon="ep:goods" :size="36" />
              <span v-if="isSoldOut(spu)" class="pos-card__mask">已售罄</span>
              <span v-if="hasGift(spu)" class="pos-card__ribbon">
                买{{ spu.giftBuyCount }}赠{{ spu.giftCount }}
              </span>
              <span v-if="countInCart(spu)" class="pos-card__badge">{{ countInCart(spu) }}</span>
            </div>
            <div class="pos-card__body">
              <div class="pos-card__name">{{ spu.name }}</div>
              <div class="pos-card__foot">
                <span class="pos-card__price">
                  <small>¥</small>{{ fenToYuan(spu.price) }}<small v-if="spu.specType">起</small>
                </span>
                <span v-if="spu.customerVisible === false" class="pos-tag">门店专售</span>
                <span v-else-if="spu.specType" class="pos-tag">多规格</span>
              </div>
            </div>
          </button>
          <div v-if="!visibleProducts.length" class="pos-empty">
            <Icon icon="ep:search" :size="40" />
            <p>{{ keyword ? '没有找到“' + keyword + '”' : '这个分类下还没有商品' }}</p>
          </div>
        </div>
      </section>

      <!-- 右侧：购物车 -->
      <aside class="pos-cart">
        <div class="pos-cart__head">
          <span>当前订单</span>
          <span v-if="cart.length" class="pos-cart__count">{{ cartCount }} 件</span>
          <button v-if="cart.length" class="pos-link" @click="clearCart">
            <Icon icon="ep:delete" /> 清空
          </button>
        </div>
        <div class="pos-cart__list">
          <TransitionGroup name="pos-line">
            <div v-for="item in cart" :key="item.skuId" class="pos-line">
              <div class="pos-line__thumb">
                <img v-if="item.picUrl" :src="item.picUrl" alt="" />
              </div>
              <div class="pos-line__info">
                <div class="pos-line__name">{{ item.spuName }}</div>
                <div class="pos-line__meta">
                  <span v-if="item.skuName && item.skuName !== item.spuName">{{ item.skuName }}</span>
                  <span>¥{{ fenToYuan(item.price) }}</span>
                  <span v-if="giftOf(item) > 0" class="pos-tag pos-tag--gift">赠 {{ giftOf(item) }}</span>
                </div>
                <div class="pos-line__bottom">
                  <div class="pos-stepper">
                    <button class="pos-stepper__btn" @click="changeCount(item, -1)">
                      <Icon :icon="item.count === 1 ? 'ep:delete' : 'ep:minus'" />
                    </button>
                    <span class="pos-stepper__num">{{ item.count }}</span>
                    <button class="pos-stepper__btn pos-stepper__btn--plus" @click="changeCount(item, 1)">
                      <Icon icon="ep:plus" />
                    </button>
                  </div>
                  <div class="pos-line__total">¥{{ fenToYuan(item.price * item.count) }}</div>
                </div>
              </div>
            </div>
          </TransitionGroup>
          <div v-if="!cart.length" class="pos-cart__empty">
            <div class="pos-cart__empty-icon"><Icon icon="ep:shopping-cart" :size="44" /></div>
            <p>点击左侧商品，或用扫码枪扫条码</p>
          </div>
        </div>
        <div class="pos-cart__foot">
          <div class="pos-bill">
            <div class="pos-bill__row">
              <span>商品金额<template v-if="cartGiftCount">（另赠 {{ cartGiftCount }} 件）</template></span>
              <span>¥{{ fenToYuan(cartTotal) }}</span>
            </div>
            <div v-if="discountFen > 0" class="pos-bill__row pos-bill__row--discount">
              <span>
                {{ discountLabel }}
                <button class="pos-bill__clear" @click="clearDiscount">取消</button>
              </span>
              <span>-¥{{ fenToYuan(discountFen) }}</span>
            </div>
            <div class="pos-bill__due">
              <span>应收</span>
              <strong>¥{{ fenToYuan(dueFen) }}</strong>
            </div>
          </div>
          <div class="pos-cart__buttons">
            <button
              v-if="canDiscount || canAdjustPrice"
              class="pos-btn pos-btn--soft pos-btn--xl pos-cart__discount"
              :disabled="!cart.length"
              @click="openDiscount"
            >
              <Icon icon="ep:discount" :size="20" /> 优惠
            </button>
            <button class="pos-btn pos-btn--primary pos-btn--xl" :disabled="!cart.length" @click="openPay">
              收款 <small v-if="cart.length">¥{{ fenToYuan(dueFen) }}</small>
            </button>
          </div>
        </div>
      </aside>
    </main>

    <!-- 选择规格 -->
    <el-dialog v-model="specVisible" :title="specSpu?.name" width="600px" class="pos-dialog" append-to-body>
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

    <!-- 整单优惠：打折、改收款金额 -->
    <el-dialog v-model="discountVisible" title="整单优惠" width="620px" class="pos-dialog" append-to-body>
      <div class="pos-tabs">
        <button
          v-if="canDiscount"
          :class="['pos-tab', { 'is-active': discountMode === 'rate' }]"
          @click="switchDiscountMode('rate')"
        >
          整单打折
        </button>
        <button
          v-if="canAdjustPrice"
          :class="['pos-tab', { 'is-active': discountMode === 'price' }]"
          @click="switchDiscountMode('price')"
        >
          修改收款金额
        </button>
      </div>
      <div class="pos-discount">
        <div class="pos-discount__left">
          <div class="pos-discount__preview">
            <div><span>商品金额</span><span>¥{{ fenToYuan(cartTotal) }}</span></div>
            <div class="pos-discount__due">
              <span>{{ discountMode === 'rate' ? '打折后应收' : '本单收款' }}</span>
              <strong>¥{{ fenToYuan(draftDueFen) }}</strong>
            </div>
            <div v-if="draftError" class="pos-discount__error">{{ draftError }}</div>
          </div>
          <template v-if="discountMode === 'rate'">
            <div class="pos-discount__input">
              <span>折扣</span>
              <strong>{{ draftText || '—' }}</strong>
              <span>折</span>
            </div>
            <div class="pos-chips">
              <button
                v-for="rate in quickRates"
                :key="rate"
                :class="['pos-chip', { 'is-active': draftText === String(rate / 10) }]"
                @click="draftText = String(rate / 10)"
              >
                {{ rate / 10 }} 折
              </button>
            </div>
          </template>
          <template v-else>
            <div class="pos-discount__input">
              <span>¥</span>
              <strong>{{ draftText || '0' }}</strong>
            </div>
            <div class="pos-chips">
              <button class="pos-chip" @click="draftText = String(Math.floor(cartTotal / 100))">抹零（去角分）</button>
              <button class="pos-chip" @click="draftText = String(Math.floor(cartTotal / 1000) * 10)">抹到十元</button>
            </div>
            <p class="pos-discount__tip">只改这一单收多少钱，商品价格不变，库存照常扣减。</p>
          </template>
        </div>
        <div class="pos-keypad">
          <button v-for="key in keypadKeys" :key="key" class="pos-key" @click="pressDraftKey(key)">
            <Icon v-if="key === 'del'" icon="ep:back" />
            <template v-else>{{ key }}</template>
          </button>
        </div>
      </div>
      <template #footer>
        <button class="pos-btn pos-btn--ghost pos-btn--lg" @click="discountVisible = false">取消</button>
        <button class="pos-btn pos-btn--primary pos-btn--lg" :disabled="!!draftError || !draftText" @click="applyDiscount">
          确定
        </button>
      </template>
    </el-dialog>

    <!-- 收款 -->
    <el-dialog
      v-model="payVisible"
      title="收款"
      width="800px"
      class="pos-dialog"
      append-to-body
      :close-on-click-modal="false"
    >
      <div class="pos-pay">
        <div class="pos-pay__left">
          <div class="pos-pay__due">
            <div>
              <span>应收</span>
              <small v-if="discountFen > 0">原价 ¥{{ fenToYuan(cartTotal) }} · {{ discountLabel }}</small>
            </div>
            <strong>¥{{ fenToYuan(dueFen) }}</strong>
          </div>
          <div class="pos-pay__types">
            <button
              v-for="type in payTypes"
              :key="type.value"
              :class="['pos-paytype', `pos-paytype--${type.key}`, { 'is-active': payType === type.value }]"
              @click="payType = type.value"
            >
              <Icon :icon="type.icon" :size="26" />
              {{ type.label }}
            </button>
          </div>
          <template v-if="payType === PosPayTypeEnum.CASH.value">
            <div class="pos-pay__cash">
              <div class="pos-pay__row">
                <span>顾客付款</span>
                <strong class="pos-pay__received">¥{{ receivedText || '0' }}</strong>
              </div>
              <div class="pos-pay__row">
                <span>找零</span>
                <strong :class="['pos-pay__change', { 'is-error': changeFen < 0 }]">
                  {{ changeFen < 0 ? '还差 ¥' + fenToYuan(-changeFen) : '¥' + fenToYuan(changeFen) }}
                </strong>
              </div>
            </div>
            <div class="pos-pay__quick">
              <button v-for="amount in quickAmounts" :key="amount" class="pos-key" @click="receivedText = String(amount)">
                ¥{{ amount }}
              </button>
            </div>
          </template>
          <div v-else class="pos-pay__tip">
            <Icon icon="ep:info-filled" :size="20" />
            请顾客用{{ payTypeLabel(payType) }}付款 ¥{{ fenToYuan(dueFen) }}，确认到账后点「确认收款」
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
          class="pos-btn pos-btn--primary pos-btn--lg pos-btn--wide"
          :disabled="paying || (payType === PosPayTypeEnum.CASH.value && changeFen < 0)"
          @click="submitPay"
        >
          {{ paying ? '提交中…' : '确认收款' }}
        </button>
      </template>
    </el-dialog>

    <!-- 收款成功 -->
    <el-dialog v-model="doneVisible" width="480px" class="pos-dialog" append-to-body :show-close="false">
      <div v-if="lastOrder" class="pos-done">
        <div class="pos-done__icon"><Icon icon="ep:check" :size="44" /></div>
        <h3>收款成功</h3>
        <div class="pos-done__amount">¥{{ fenToYuan(orderPayPrice(lastOrder)) }}</div>
        <div v-if="lastOrder.payType === PosPayTypeEnum.CASH.value" class="pos-done__change">
          收 ¥{{ fenToYuan(lastOrder.receivedPrice) }}，找零
          <strong>¥{{ fenToYuan(lastOrder.changePrice) }}</strong>
        </div>
        <div class="pos-done__meta">
          <span>单号 {{ lastOrder.no }}</span>
          <span v-if="receiptConfig.autoPrint" class="pos-done__printed">
            <Icon icon="ep:printer" /> 已发送打印
          </span>
        </div>
      </div>
      <template #footer>
        <button class="pos-btn pos-btn--ghost pos-btn--lg" @click="reprint(lastOrder!)">
          <Icon icon="ep:printer" /> {{ receiptConfig.autoPrint ? '补打小票' : '打印小票' }}
        </button>
        <button class="pos-btn pos-btn--primary pos-btn--lg pos-btn--wide" @click="finishOrder">
          继续收银
        </button>
      </template>
    </el-dialog>

    <!-- 最近订单：补打小票 -->
    <el-drawer v-model="recentVisible" title="今日收银记录" size="460px" class="pos-dialog" append-to-body>
      <div v-loading="recentLoading" class="pos-recent">
        <div v-for="order in recentOrders" :key="order.id" class="pos-recent__item">
          <div class="pos-recent__main">
            <div class="pos-recent__top">
              <strong>¥{{ fenToYuan(orderPayPrice(order)) }}</strong>
              <span class="pos-tag">{{ payTypeLabel(order.payType) }}</span>
              <span v-if="order.discountPrice" class="pos-tag pos-tag--gift">
                {{ order.priceAdjusted ? '改价' : order.discountRate! / 10 + '折' }}
              </span>
              <span v-if="order.status !== 10" class="pos-tag pos-tag--danger">已作废</span>
            </div>
            <div class="pos-recent__items">
              {{ order.items.map((i) => `${i.spuName}×${i.count}`).join('、') }}
            </div>
            <div class="pos-recent__meta">{{ formatDate(order.createTime as any, 'HH:mm:ss') }} · {{ order.no }} · {{ order.cashierName }}</div>
          </div>
          <button class="pos-btn pos-btn--ghost" @click="reprint(order)">
            <Icon icon="ep:printer" /> 补打
          </button>
        </div>
        <div v-if="!recentLoading && !recentOrders.length" class="pos-cart__empty">今天还没有收银记录</div>
      </div>
    </el-drawer>

    <!-- 交班汇总 -->
    <el-dialog v-model="summaryVisible" title="今日交班汇总" width="540px" class="pos-dialog" append-to-body>
      <div class="pos-summary">
        <div class="pos-summary__big">
          <div>
            <span>收款金额</span><strong>¥{{ fenToYuan(summary.totalPrice || 0) }}</strong>
          </div>
          <div>
            <span>收款笔数</span><strong>{{ summary.orderCount || 0 }}</strong>
          </div>
          <div>
            <span>优惠</span><strong>¥{{ fenToYuan(summary.discountPrice || 0) }}</strong>
          </div>
        </div>
        <div v-for="item in summary.payTypes || []" :key="item.payType" class="pos-summary__row">
          <span>{{ payTypeLabel(item.payType) }}</span>
          <span>{{ item.orderCount }} 笔</span>
          <strong>¥{{ fenToYuan(item.totalPrice) }}</strong>
        </div>
        <p class="pos-summary__tip">
          只统计当前收银员今天的收款，作废 {{ summary.cancelCount || 0 }} 单不计入。
        </p>
      </div>
    </el-dialog>
  </div>
</template>
<script lang="ts" setup>
import { fenToYuan, yuanToFen } from '@/utils'
import { formatDate } from '@/utils/formatTime'
import { checkPermi } from '@/utils/permission'
import { useUserStore } from '@/store/modules/user'
import { useAppStore } from '@/store/modules/app'
import {
  PosApi,
  PosCategoryVO,
  PosOrderVO,
  PosPayTypeEnum,
  PosProductVO,
  PosReceiptConfigVO,
  PosSkuVO,
  PosSummaryVO
} from '@/api/mall/trade/pos'
import { announcePaid, orderPayPrice, payTypeLabel, printReceipt } from '../receipt/receipt'

defineOptions({ name: 'TradePosTerminal' })

interface CartItem {
  skuId: number
  spuId: number
  spuName: string
  skuName: string
  picUrl?: string
  price: number
  count: number
  giftBuyCount?: number
  giftCount?: number
}

const message = useMessage()
const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()
const cashierName = computed(() => userStore.getUser.nickname)
const storeTitle = computed(() => receiptConfig.value.title || appStore.getTitle)
const canDiscount = checkPermi(['trade:pos:discount'])
const canAdjustPrice = checkPermi(['trade:pos:update-price'])

const loading = ref(false)
const products = ref<PosProductVO[]>([])
const categories = ref<PosCategoryVO[]>([])
const summary = ref<Partial<PosSummaryVO>>({})
const receiptConfig = ref<PosReceiptConfigVO>({
  paperWidth: 58,
  autoPrint: true,
  copies: 1,
  voice: true,
  showSkuName: true,
  showPrice: true,
  showCashier: true,
  showPayment: true,
  showDeviceInfo: false,
  deviceFields: []
})

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
const countOfRoot = (rootId: number) => {
  if (!rootId) return products.value.length
  const subIds = new Set(categories.value.filter((c) => c.parentId === rootId).map((c) => c.id))
  return products.value.filter((spu) => subIds.has(spu.categoryId)).length
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
const countInCart = (spu: PosProductVO) =>
  cart.value.filter((item) => item.spuId === spu.id).reduce((sum, item) => sum + item.count, 0)
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
      picUrl: sku.picUrl || spu.picUrl,
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
  clearDiscount()
  focusSearch()
}
const giftOf = (item: CartItem) =>
  item.giftBuyCount && item.giftCount
    ? Math.floor(item.count / item.giftBuyCount) * item.giftCount
    : 0
const cartCount = computed(() => cart.value.reduce((sum, item) => sum + item.count, 0))
const cartGiftCount = computed(() => cart.value.reduce((sum, item) => sum + giftOf(item), 0))
const cartTotal = computed(() => cart.value.reduce((sum, item) => sum + item.price * item.count, 0))

/** 整单优惠：打折（百分比）或直接改本单收款金额（分），二选一 */
const discountRate = ref<number>()
const adjustedPrice = ref<number>()
const dueFen = computed(() => {
  if (adjustedPrice.value !== undefined) return adjustedPrice.value
  if (discountRate.value) return Math.round((cartTotal.value * discountRate.value) / 100)
  return cartTotal.value
})
const discountFen = computed(() => cartTotal.value - dueFen.value)
const discountLabel = computed(() =>
  adjustedPrice.value !== undefined ? '改价优惠' : discountRate.value ? `整单 ${discountRate.value / 10} 折` : ''
)
const clearDiscount = () => {
  discountRate.value = undefined
  adjustedPrice.value = undefined
}
// 改了商品后，原来改的收款金额不再适用
watch(cartTotal, () => {
  if (adjustedPrice.value !== undefined) {
    adjustedPrice.value = undefined
    if (cart.value.length) message.info('商品有变化，已取消改价，请重新设置')
  }
})

const discountVisible = ref(false)
const discountMode = ref<'rate' | 'price'>('rate')
const draftText = ref('')
const quickRates = [95, 90, 88, 85, 80, 75, 70, 50]
const openDiscount = () => {
  discountMode.value = canDiscount ? 'rate' : 'price'
  draftText.value = discountMode.value === 'rate'
    ? discountRate.value ? String(discountRate.value / 10) : ''
    : adjustedPrice.value !== undefined ? fenToYuan(adjustedPrice.value) : ''
  discountVisible.value = true
}
const switchDiscountMode = (mode: 'rate' | 'price') => {
  discountMode.value = mode
  draftText.value = ''
}
/** 折扣输入“8.5”表示 85%，收款金额输入元 */
const draftRate = computed(() => Math.round(Number(draftText.value) * 10))
const draftDueFen = computed(() => {
  if (!draftText.value) return cartTotal.value
  return discountMode.value === 'rate'
    ? Math.round((cartTotal.value * draftRate.value) / 100)
    : yuanToFen(draftText.value)
})
const draftError = computed(() => {
  if (!draftText.value) return ''
  if (discountMode.value === 'rate') {
    return draftRate.value >= 1 && draftRate.value <= 99 ? '' : '折扣要在 0.1 到 9.9 折之间'
  }
  return draftDueFen.value > cartTotal.value ? '收款金额不能高于商品金额' : ''
})
const pressDraftKey = (key: string) => {
  draftText.value = inputKey(draftText.value, key, discountMode.value === 'rate' ? 1 : 2)
}
const applyDiscount = () => {
  if (discountMode.value === 'rate') {
    discountRate.value = draftRate.value
    adjustedPrice.value = undefined
  } else {
    adjustedPrice.value = draftDueFen.value
    discountRate.value = undefined
  }
  discountVisible.value = false
}

/** 数字键盘输入，decimals 为最多几位小数 */
const keypadKeys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del']
const inputKey = (text: string, key: string, decimals = 2) => {
  if (key === 'del') return text.slice(0, -1)
  if (key === '.' && (text.includes('.') || decimals === 0)) return text
  if (text.includes('.') && text.split('.')[1].length >= decimals) return text
  if (text.length >= 8) return text
  return text === '0' && key !== '.' ? key : (text || (key === '.' ? '0' : '')) + key
}

/** 收款 */
const payTypes = [
  { ...PosPayTypeEnum.CASH, icon: 'ep:money', key: 'cash' },
  { ...PosPayTypeEnum.WECHAT, icon: 'ep:chat-dot-round', key: 'wechat' },
  { ...PosPayTypeEnum.ALIPAY, icon: 'ep:wallet', key: 'alipay' },
  { ...PosPayTypeEnum.OTHER, icon: 'ep:more', key: 'other' }
]
const payVisible = ref(false)
const paying = ref(false)
const payType = ref(PosPayTypeEnum.CASH.value)
const receivedText = ref('')
const receivedFen = computed(() => yuanToFen(receivedText.value || 0))
const changeFen = computed(() => receivedFen.value - dueFen.value)
/** 快捷金额：刚好、凑整到 10 / 50 / 100 */
const quickAmounts = computed(() => {
  const due = dueFen.value / 100
  const list = [due, Math.ceil(due / 10) * 10, Math.ceil(due / 50) * 50, Math.ceil(due / 100) * 100]
  return [...new Set(list.map((n) => Number(n.toFixed(2))))]
})
const openPay = () => {
  payType.value = PosPayTypeEnum.CASH.value
  receivedText.value = ''
  payVisible.value = true
}
const pressKey = (key: string) => {
  receivedText.value = inputKey(receivedText.value, key)
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
      receivedPrice: isCash ? receivedFen.value : dueFen.value,
      discountRate: adjustedPrice.value === undefined ? discountRate.value : undefined,
      payPrice: adjustedPrice.value
    })
    payVisible.value = false
    doneVisible.value = true
    cart.value = []
    clearDiscount()
    // 收款成功：提示音 + 语音播报，按设置自动打印小票
    announcePaid(lastOrder.value, receiptConfig.value.voice)
    if (receiptConfig.value.autoPrint) {
      printReceipt(lastOrder.value, receiptConfig.value, appStore.getTitle)
    }
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
/** 补打：只打一份 */
const reprint = (order: PosOrderVO) => {
  printReceipt(order, { ...receiptConfig.value, copies: 1 }, appStore.getTitle)
}

/** 最近订单 */
const recentVisible = ref(false)
const recentLoading = ref(false)
const recentOrders = ref<PosOrderVO[]>([])
const openRecent = async () => {
  recentVisible.value = true
  recentLoading.value = true
  try {
    const day = formatDate(new Date(), 'YYYY-MM-DD')
    const data = await PosApi.getOrderPage({
      pageNo: 1,
      pageSize: 30,
      createTime: [`${day} 00:00:00`, `${day} 23:59:59`]
    })
    recentOrders.value = data.list
  } finally {
    recentLoading.value = false
  }
}

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
const today = ref('')
let clockTimer: ReturnType<typeof setInterval> | undefined
const updateClock = () => {
  const now = new Date()
  clock.value = formatDate(now, 'HH:mm')
  today.value = `${formatDate(now, 'MM月DD日')} 星期${'日一二三四五六'[now.getDay()]}`
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

/** 扫码枪在页面任意位置输入时，把焦点拉回搜索框；收款成功后按回车继续收银 */
const onKeydown = (e: KeyboardEvent) => {
  if (doneVisible.value && e.key === 'Enter') {
    e.preventDefault()
    finishOrder()
    return
  }
  const target = e.target as HTMLElement
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
  if (payVisible.value || specVisible.value || summaryVisible.value || discountVisible.value) return
  if (e.key.length === 1 && /[0-9a-zA-Z]/.test(e.key)) {
    focusSearch()
  }
}

const loadProducts = async () => {
  products.value = await PosApi.getProductList()
}
onMounted(async () => {
  updateClock()
  clockTimer = setInterval(updateClock, 15 * 1000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('keydown', onKeydown)
  loading.value = true
  try {
    const [cats, config] = await Promise.all([
      PosApi.getCategoryList(),
      PosApi.getReceiptConfig(),
      loadProducts(),
      loadSummary()
    ])
    categories.value = cats
    receiptConfig.value = config
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

/* 顶栏 */
.pos-header {
  display: flex;
  height: 68px;
  padding: 0 16px;
  color: #fff;
  background: linear-gradient(100deg, #0f766e 0%, var(--pos-primary) 55%, #14b8a6 100%);
  box-shadow: 0 2px 12px rgb(15 118 110 / 25%);
  align-items: center;
  gap: 20px;
  flex: none;

  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__logo {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    box-shadow: 0 0 0 2px rgb(255 255 255 / 35%);
  }

  &__title {
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  &__store {
    max-width: 200px;
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.8;
  }

  &__stats {
    display: flex;
    flex: 1;
    gap: 10px;
    justify-content: center;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.pos-stat {
  display: flex;
  min-width: 96px;
  padding: 5px 14px;
  background: rgb(255 255 255 / 14%);
  border-radius: 10px;
  flex-direction: column;
  line-height: 1.25;

  span {
    font-size: 12px;
    opacity: 0.8;
  }

  strong {
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
}

.pos-hbtn {
  display: inline-flex;
  height: 40px;
  padding: 0 12px;
  font-size: 14px;
  color: #fff !important;
  background: rgb(255 255 255 / 14%) !important;
  border-radius: 10px;
  align-items: center;
  gap: 5px;

  &:active {
    background: rgb(255 255 255 / 26%) !important;
  }
}

.pos-cashier {
  display: flex;
  height: 40px;
  padding: 0 12px 0 4px;
  margin-left: 4px;
  background: rgb(0 0 0 / 14%);
  border-radius: 20px;
  align-items: center;
  gap: 8px;

  &__avatar {
    display: flex;
    width: 32px;
    height: 32px;
    font-weight: 700;
    color: var(--pos-primary);
    background: #fff;
    border-radius: 50%;
    align-items: center;
    justify-content: center;
  }

  &__name {
    font-size: 14px;
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
    left: 18px;
    color: var(--pos-sub);
  }

  &__input {
    width: 100%;
    height: 54px;
    padding: 0 150px 0 50px;
    font-size: 17px;
    color: var(--pos-text);
    background: var(--pos-card);
    border: 2px solid transparent;
    border-radius: 14px;
    outline: none;
    box-shadow: var(--pos-shadow);
    transition: border-color 0.15s;

    &:focus {
      border-color: var(--pos-primary);
    }
  }

  &__clear {
    position: absolute;
    right: 10px;
    display: flex;
    width: 40px;
    height: 40px;
    color: var(--pos-sub);
    align-items: center;
    justify-content: center;
  }

  &__badge {
    position: absolute;
    right: 14px;
    display: inline-flex;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--pos-primary);
    background: var(--el-color-primary-light-9);
    border-radius: 12px;
    align-items: center;
    gap: 4px;
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
  display: inline-flex;
  min-width: 96px;
  height: 50px;
  padding: 0 18px;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  background: var(--pos-card);
  border-radius: 12px;
  box-shadow: var(--pos-shadow);
  align-items: center;
  justify-content: center;
  gap: 8px;

  &__count {
    min-width: 22px;
    padding: 0 6px;
    font-size: 12px;
    line-height: 20px;
    color: var(--pos-sub);
    background: var(--pos-page);
    border-radius: 10px;
  }

  &.is-active {
    color: #fff !important;
    background: var(--pos-primary);
    box-shadow: 0 4px 12px rgb(13 148 136 / 30%);

    .pos-cat__count {
      color: var(--pos-primary);
      background: #fff;
    }
  }
}

.pos-subcat {
  height: 38px;
  padding: 0 16px;
  font-size: 15px;
  white-space: nowrap;
  background: var(--pos-card);
  border-radius: 19px;

  &.is-active {
    font-weight: 600;
    color: var(--pos-primary) !important;
    background: var(--el-color-primary-light-9);
    box-shadow: inset 0 0 0 1.5px var(--pos-primary);
  }
}

.pos-grid {
  display: grid;
  min-height: 0;
  padding: 2px 2px 8px;
  overflow-y: auto;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  grid-auto-rows: max-content;
  gap: 12px;
  align-content: start;
  flex: 1;
}

.pos-card {
  position: relative;
  display: flex;
  padding: 0;
  overflow: hidden;
  text-align: left;
  background: var(--pos-card);
  border-radius: 14px;
  box-shadow: var(--pos-shadow);
  transition: transform 0.08s, box-shadow 0.15s;
  flex-direction: column;

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &.is-picked {
    box-shadow: 0 0 0 2px var(--pos-primary), 0 6px 16px rgb(13 148 136 / 18%);
  }

  &.is-soldout {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &__img {
    position: relative;
    display: flex;
    overflow: hidden;
    color: var(--pos-sub);
    background: var(--pos-page);
    aspect-ratio: 16 / 10;
    flex: none;
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
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    background: rgb(0 0 0 / 50%);
    align-items: center;
    justify-content: center;
  }

  &__ribbon {
    position: absolute;
    top: 8px;
    left: 0;
    padding: 2px 10px 2px 8px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: #f97316;
    border-radius: 0 10px 10px 0;
  }

  &__badge {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    background: var(--pos-primary);
    border: 2px solid #fff;
    border-radius: 14px;
    align-items: center;
    justify-content: center;
  }

  &__body {
    display: flex;
    padding: 10px 12px 12px;
    flex-direction: column;
    gap: 8px;
  }

  &__name {
    display: -webkit-box;
    min-height: 2.6em;
    overflow: hidden;
    font-size: 15px;
    font-weight: 500;
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
    font-size: 20px;
    font-weight: 700;
    color: #e11d48;
    font-variant-numeric: tabular-nums;

    small {
      margin: 0 1px;
      font-size: 12px;
      font-weight: 500;
    }
  }
}

.pos-tag {
  padding: 1px 7px;
  font-size: 12px;
  line-height: 18px;
  color: var(--pos-sub);
  white-space: nowrap;
  background: var(--pos-page);
  border-radius: 6px;

  &--gift {
    color: #c2410c;
    background: #ffedd5;
  }

  &--danger {
    color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
  }
}

.pos-empty {
  padding: 80px 0;
  color: var(--pos-sub);
  text-align: center;
  grid-column: 1 / -1;
}

/* 右侧购物车 */
.pos-cart {
  display: flex;
  width: 420px;
  overflow: hidden;
  background: var(--pos-card);
  border-radius: 16px;
  box-shadow: var(--pos-shadow);
  flex: none;
  flex-direction: column;

  &__head {
    display: flex;
    padding: 16px 18px;
    font-size: 19px;
    font-weight: 700;
    border-bottom: 1px solid var(--pos-border);
    align-items: center;
    gap: 10px;
  }

  &__count {
    padding: 0 10px;
    font-size: 13px;
    font-weight: 600;
    line-height: 24px;
    color: var(--pos-primary);
    background: var(--el-color-primary-light-9);
    border-radius: 12px;
  }

  &__list {
    overflow-y: auto;
    flex: 1;
  }

  &__empty {
    padding: 90px 0;
    color: var(--pos-sub);
    text-align: center;
  }

  &__empty-icon {
    display: inline-flex;
    width: 88px;
    height: 88px;
    margin-bottom: 8px;
    color: var(--el-color-primary-light-3);
    background: var(--el-color-primary-light-9);
    border-radius: 50%;
    align-items: center;
    justify-content: center;
  }

  &__foot {
    padding: 14px 18px 18px;
    background: linear-gradient(180deg, var(--pos-card), var(--pos-page));
    border-top: 1px solid var(--pos-border);
  }

  &__buttons {
    display: flex;
    gap: 10px;
  }

  &__discount {
    width: 120px !important;
    flex: none;
    letter-spacing: 0 !important;
  }
}

.pos-link {
  display: inline-flex;
  margin-left: auto;
  font-size: 15px;
  font-weight: 400;
  color: var(--el-color-danger) !important;
  align-items: center;
  gap: 4px;
}

.pos-line {
  display: flex;
  padding: 12px 18px;
  border-bottom: 1px solid var(--pos-border);
  gap: 12px;

  &__thumb {
    width: 56px;
    height: 56px;
    overflow: hidden;
    background: var(--pos-page);
    border-radius: 10px;
    flex: none;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__info {
    min-width: 0;
    flex: 1;
  }

  &__name {
    overflow: hidden;
    font-size: 16px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    margin-top: 2px;
    font-size: 13px;
    color: var(--pos-sub);
    align-items: center;
    gap: 6px;
  }

  &__bottom {
    display: flex;
    margin-top: 6px;
    align-items: center;
    justify-content: space-between;
  }

  &__total {
    font-size: 17px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.pos-line-enter-from {
  background: var(--el-color-primary-light-9);
  opacity: 0;
  transform: translateX(20px);
}

.pos-line-enter-active {
  transition: all 0.2s ease;
}

.pos-stepper {
  display: flex;
  background: var(--pos-page);
  border-radius: 10px;
  align-items: center;

  &__btn {
    display: flex;
    width: 40px;
    height: 38px;
    font-size: 16px;
    border-radius: 10px;
    align-items: center;
    justify-content: center;

    &--plus {
      color: #fff !important;
      background: var(--pos-primary) !important;
    }
  }

  &__num {
    min-width: 36px;
    font-size: 17px;
    font-weight: 700;
    text-align: center;
  }
}

.pos-bill {
  margin-bottom: 14px;

  &__row {
    display: flex;
    padding: 2px 0;
    font-size: 14px;
    color: var(--pos-sub);
    justify-content: space-between;

    &--discount {
      color: #c2410c;
    }
  }

  &__clear {
    margin-left: 6px;
    font-size: 13px;
    color: var(--pos-sub) !important;
    text-decoration: underline;
  }

  &__due {
    display: flex;
    margin-top: 4px;
    font-size: 16px;
    align-items: baseline;
    justify-content: space-between;

    strong {
      font-size: 34px;
      font-weight: 800;
      color: #e11d48;
      font-variant-numeric: tabular-nums;
    }
  }
}

/* 最近订单 */
.pos-recent {
  &__item {
    display: flex;
    padding: 14px 4px;
    border-bottom: 1px solid var(--pos-border);
    align-items: center;
    gap: 12px;
  }

  &__main {
    min-width: 0;
    flex: 1;
  }

  &__top {
    display: flex;
    align-items: center;
    gap: 6px;

    strong {
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }
  }

  &__items {
    margin-top: 4px;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    margin-top: 2px;
    font-size: 12px;
    color: var(--pos-sub);
  }
}

@media (width <= 1180px) {
  .pos-cart {
    width: 340px;
  }

  .pos-header__stats .pos-stat--clock,
  .pos-cashier__name {
    display: none;
  }
}
</style>
<style lang="scss">
/* 收银台和它的弹窗共用：弹窗挂在 body 下，所以变量和按钮样式不能放在 scoped 里 */
.pos,
.pos-dialog {
  --pos-gap: 14px;
  --pos-radius: 12px;
  --pos-primary: var(--el-color-primary);
  --pos-card: var(--el-bg-color);
  --pos-page: #eef3f4;
  --pos-border: var(--el-border-color-lighter);
  --pos-text: var(--el-text-color-primary);
  --pos-sub: var(--el-text-color-secondary);
  --pos-shadow: 0 1px 3px rgb(15 23 42 / 6%), 0 1px 2px rgb(15 23 42 / 4%);
}

/* 按钮重置：用 :where 把优先级降到最低，不覆盖 .pos-key、.pos-chip 等样式 */
:where(.pos, .pos-dialog) button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: none;
  border: none;
  touch-action: manipulation;
}

html.dark .pos,
html.dark .pos-dialog {
  --pos-page: var(--el-bg-color-page);
}

.pos-dialog {
  font-size: 16px;
  border-radius: 16px;

  .el-dialog__title,
  .el-drawer__title {
    font-size: 20px;
    font-weight: 700;
    color: var(--pos-text);
  }

  .el-dialog__footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

}

.pos .pos-btn,
.pos-dialog .pos-btn {
  display: inline-flex;
  height: 40px;
  padding: 0 14px;
  font-size: 15px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &--ghost {
    background: var(--pos-page);
  }

  &--soft {
    color: #c2410c !important;
    background: #ffedd5;
  }

  &--primary {
    color: #fff !important;
    background: linear-gradient(135deg, var(--pos-primary), #14b8a6);
    box-shadow: 0 6px 16px rgb(13 148 136 / 28%);
  }

  &--lg {
    height: 58px;
    min-width: 140px;
    font-size: 18px;
    border-radius: 12px;
  }

  &--wide {
    min-width: 220px;
    font-weight: 700;
  }

  &--xl {
    width: 100%;
    height: 66px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 2px;
    border-radius: 14px;

    small {
      margin-left: 6px;
      font-size: 17px;
      letter-spacing: 0;
      opacity: 0.9;
    }
  }

  &:disabled {
    cursor: not-allowed;
    box-shadow: none;
    opacity: 0.45;
  }
}

/* 规格 */
.pos-specs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.pos-spec {
  display: flex;
  height: 78px;
  padding: 0 18px;
  background: var(--pos-page);
  border: 2px solid transparent !important;
  border-radius: var(--pos-radius);
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;

  &:active:not(:disabled) {
    border-color: var(--pos-primary) !important;
  }

  &__name {
    font-size: 17px;
    font-weight: 600;
  }

  &__price {
    font-size: 16px;
    font-weight: 700;
    color: #e11d48;
  }

  &:disabled {
    opacity: 0.45;
  }
}

/* 优惠 */
.pos-tabs {
  display: flex;
  padding: 4px;
  margin-bottom: 16px;
  background: var(--pos-page);
  border-radius: 12px;
  gap: 4px;
}

.pos-tab {
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  color: var(--pos-sub) !important;
  border-radius: 10px;
  flex: 1;

  &.is-active {
    color: var(--pos-primary) !important;
    background: var(--pos-card) !important;
    box-shadow: var(--pos-shadow);
  }
}

.pos-discount {
  display: flex;
  gap: 18px;

  &__left {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 12px;
  }

  &__preview {
    padding: 12px 16px;
    background: var(--pos-page);
    border-radius: var(--pos-radius);

    > div {
      display: flex;
      color: var(--pos-sub);
      justify-content: space-between;
      align-items: baseline;
    }
  }

  &__due {
    margin-top: 4px;
    color: var(--pos-text) !important;

    strong {
      font-size: 30px;
      color: #e11d48;
    }
  }

  &__error {
    margin-top: 4px;
    font-size: 14px;
    color: var(--el-color-danger) !important;
  }

  &__input {
    display: flex;
    height: 60px;
    padding: 0 16px;
    font-size: 18px;
    border: 2px solid var(--pos-primary);
    border-radius: var(--pos-radius);
    align-items: center;
    gap: 8px;

    strong {
      font-size: 30px;
      flex: 1;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  }

  &__tip {
    margin: 0;
    font-size: 13px;
    color: var(--pos-sub);
  }
}

.pos-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pos-chip {
  height: 44px;
  padding: 0 14px;
  font-size: 16px;
  background: var(--pos-page);
  border-radius: 10px;

  &.is-active {
    color: #fff !important;
    background: var(--pos-primary) !important;
  }
}

/* 收款 */
.pos-pay {
  display: flex;
  gap: 20px;

  &__left {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 14px;
  }

  &__due {
    display: flex;
    padding: 16px 18px;
    font-size: 18px;
    color: #fff;
    background: linear-gradient(120deg, #0f766e, var(--pos-primary));
    border-radius: 14px;
    justify-content: space-between;
    align-items: center;

    small {
      display: block;
      font-size: 13px;
      opacity: 0.85;
    }

    strong {
      font-size: 38px;
      font-variant-numeric: tabular-nums;
    }
  }

  &__types {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  &__cash {
    padding: 8px 16px;
    background: var(--pos-page);
    border-radius: var(--pos-radius);
  }

  &__row {
    display: flex;
    padding: 4px 0;
    font-size: 17px;
    justify-content: space-between;
    align-items: baseline;

    strong {
      font-size: 28px;
      font-variant-numeric: tabular-nums;
    }
  }

  &__change {
    color: var(--el-color-success);

    &.is-error {
      font-size: 20px !important;
      color: var(--el-color-danger);
    }
  }

  &__quick {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  &__tip {
    display: flex;
    padding: 24px 18px;
    font-size: 17px;
    line-height: 1.6;
    color: var(--pos-sub);
    background: var(--pos-page);
    border-radius: var(--pos-radius);
    gap: 10px;
  }
}

.pos-paytype {
  display: flex;
  height: 78px;
  font-size: 16px;
  font-weight: 600;
  background: var(--pos-page);
  border: 2px solid transparent !important;
  border-radius: var(--pos-radius);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;

  &--cash { color: #b45309 !important; }
  &--wechat { color: #16a34a !important; }
  &--alipay { color: #2563eb !important; }

  &.is-active {
    background: var(--pos-card) !important;
    border-color: currentcolor !important;
    box-shadow: 0 4px 12px rgb(15 23 42 / 10%);
  }
}

.pos-keypad {
  display: grid;
  width: 270px;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  align-content: start;
  flex: none;
}

.pos-key {
  display: flex;
  height: 62px;
  font-size: 24px;
  font-weight: 600;
  background: var(--pos-page);
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;

  &:active {
    background: var(--el-color-primary-light-8) !important;
  }
}

.pos-pay__quick .pos-key {
  height: 50px;
  font-size: 17px;
}

/* 成功 */
.pos-done {
  color: var(--pos-text);
  text-align: center;

  &__icon {
    display: inline-flex;
    width: 84px;
    height: 84px;
    color: #fff;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    border-radius: 50%;
    box-shadow: 0 10px 24px rgb(22 163 74 / 30%);
    align-items: center;
    justify-content: center;
    animation: pos-pop 0.35s ease;
  }

  h3 {
    margin: 12px 0 4px;
    font-size: 22px;
  }

  &__amount {
    font-size: 40px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  &__change {
    margin-top: 6px;
    font-size: 18px;

    strong {
      font-size: 28px;
      color: var(--el-color-success);
    }
  }

  &__meta {
    display: flex;
    margin-top: 12px;
    font-size: 14px;
    color: var(--pos-sub);
    justify-content: center;
    gap: 12px;
  }

  &__printed {
    display: inline-flex;
    color: var(--pos-primary);
    align-items: center;
    gap: 4px;
  }
}

@keyframes pos-pop {
  0% { transform: scale(0.4); opacity: 0; }
  80% { transform: scale(1.08); }
  100% { transform: scale(1); opacity: 1; }
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
      background: var(--pos-page);
      border-radius: var(--pos-radius);
      flex-direction: column;
      gap: 4px;
    }

    span {
      color: var(--pos-sub);
    }

    strong {
      font-size: 22px;
      font-variant-numeric: tabular-nums;
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
</style>
