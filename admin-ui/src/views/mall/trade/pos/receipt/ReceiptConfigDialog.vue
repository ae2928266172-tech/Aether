<!-- 小票设置：打印内容、自动打印、语音播报，右侧实时预览 -->
<template>
  <Dialog v-model="visible" title="小票设置" width="980px">
    <div v-loading="loading" class="receipt-config">
      <el-form ref="formRef" :model="form" label-width="110px" class="receipt-config__form">
        <el-form-item label="小票标题">
          <el-input v-model="form.title" :placeholder="defaultTitle" maxlength="32" show-word-limit />
        </el-form-item>
        <el-form-item label="抬头文字">
          <el-input
            v-model="form.headerText"
            type="textarea"
            :rows="2"
            placeholder="例如：住院部一楼 · 电话 0000-0000000"
          />
        </el-form-item>
        <el-form-item label="底部文字">
          <el-input v-model="form.footerText" type="textarea" :rows="3" />
          <div class="receipt-config__vars">
            点击插入变量：
            <el-tag
              v-for="item in RECEIPT_VARIABLES"
              :key="item"
              size="small"
              effect="plain"
              class="cursor-pointer"
              @click="form.footerText = (form.footerText || '') + item"
            >
              {{ item }}
            </el-tag>
          </div>
        </el-form-item>
        <el-form-item label="打印内容">
          <el-checkbox v-model="form.showSkuName">规格</el-checkbox>
          <el-checkbox v-model="form.showPrice">单价</el-checkbox>
          <el-checkbox v-model="form.showCashier">收银员</el-checkbox>
          <el-checkbox v-model="form.showPayment">收款方式、找零</el-checkbox>
        </el-form-item>
        <el-form-item label="医疗器械信息">
          <div>
            <el-switch v-model="form.showDeviceInfo" active-text="打印" inactive-text="不打印" />
            <el-checkbox-group v-if="form.showDeviceInfo" v-model="form.deviceFields" class="mt-6px">
              <el-checkbox v-for="item in DEVICE_FIELDS" :key="item.value" :value="item.value">
                {{ item.label }}
              </el-checkbox>
            </el-checkbox-group>
            <div class="receipt-config__hint">在「商品编辑 → 销售设置」里填写；商品没有填写的项不打印</div>
          </div>
        </el-form-item>
        <el-form-item label="纸张">
          <el-radio-group v-model="form.paperWidth">
            <el-radio-button :value="58">58mm</el-radio-button>
            <el-radio-button :value="80">80mm</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="收款后">
          <div>
            <el-checkbox v-model="form.autoPrint">自动打印</el-checkbox>
            <el-input-number v-model="form.copies" :min="1" :max="3" size="small" class="!w-100px mx-8px" />
            份
            <el-checkbox v-model="form.voice" class="ml-16px">语音播报收款金额</el-checkbox>
            <div class="receipt-config__hint">
              想不弹打印对话框直接出票：Chrome 快捷方式加上 <code>--kiosk-printing</code>，并把小票机设为默认打印机
            </div>
          </div>
        </el-form-item>
      </el-form>
      <div class="receipt-config__preview">
        <div class="receipt-config__preview-title">预览（示例订单）</div>
        <div class="receipt-config__paper">
          <component :is="'style'">{{ receiptStyle(form.paperWidth) }}</component>
          <div class="receipt" v-html="previewHtml"></div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button @click="printSample">打印测试页</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </Dialog>
</template>
<script lang="ts" setup>
import { PosApi, PosOrderVO, PosReceiptConfigVO } from '@/api/mall/trade/pos'
import { useAppStore } from '@/store/modules/app'
import {
  DEVICE_FIELDS,
  RECEIPT_VARIABLES,
  buildReceiptBody,
  printReceipt,
  receiptStyle
} from './receipt'

defineOptions({ name: 'PosReceiptConfigDialog' })

const emit = defineEmits(['success'])
const message = useMessage()
const appStore = useAppStore()
const defaultTitle = computed(() => appStore.getTitle)

const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const form = ref<PosReceiptConfigVO>({
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

/** 示例订单：两件商品、买赠、整单 9 折、现金找零 */
const sampleOrder: PosOrderVO = {
  id: 0,
  no: 'P202610260001',
  status: 10,
  productCount: 12,
  totalPrice: 3300,
  discountRate: 90,
  discountPrice: 330,
  payPrice: 2970,
  payType: 1,
  receivedPrice: 5000,
  changePrice: 2030,
  cashierId: 0,
  cashierName: '门店店员',
  createTime: new Date().toISOString(),
  items: [
    {
      spuId: 1,
      spuName: '医用纱布块',
      skuId: 1,
      skuName: '10×10cm',
      price: 280,
      count: 10,
      totalPrice: 2800,
      giftCount: 5,
      registrationNo: '苏械备20260001号',
      productionLicenseNo: '苏食药监械生产备20160001号',
      registrant: '某某医疗用品有限公司',
      productionAddress: '江苏省某某市某某路 1 号'
    },
    { spuId: 2, spuName: '一次性中单', skuId: 2, skuName: '一次性中单', price: 250, count: 2, totalPrice: 500 }
  ]
}
const previewHtml = computed(() => buildReceiptBody(sampleOrder, form.value, defaultTitle.value))

const open = async () => {
  visible.value = true
  loading.value = true
  try {
    form.value = await PosApi.getReceiptConfig()
  } finally {
    loading.value = false
  }
}
defineExpose({ open })

const printSample = () => printReceipt(sampleOrder, form.value, defaultTitle.value)

const submit = async () => {
  saving.value = true
  try {
    await PosApi.saveReceiptConfig(form.value)
    message.success('小票设置已保存，收银台刷新后生效')
    visible.value = false
    emit('success')
  } finally {
    saving.value = false
  }
}
</script>
<style lang="scss" scoped>
.receipt-config {
  display: flex;
  gap: 20px;

  &__form {
    flex: 1;
    min-width: 0;
  }

  &__vars {
    display: flex;
    margin-top: 6px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  &__hint {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
  }

  &__preview {
    display: flex;
    width: 300px;
    padding: 12px;
    background: var(--el-fill-color-light);
    border-radius: 10px;
    flex: none;
    flex-direction: column;
    align-items: center;
  }

  &__preview-title {
    margin-bottom: 10px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  &__paper {
    max-height: 560px;
    padding: 14px 10px 18px;
    overflow-y: auto;
    background: #fff;
    box-shadow: 0 2px 10px rgb(0 0 0 / 10%);
  }
}
</style>
