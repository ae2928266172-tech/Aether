<template>
  <doc-alert title="【交易】交易订单" url="https://doc.iocoder.cn/mall/trade-order/" />
  <doc-alert title="【交易】购物车" url="https://doc.iocoder.cn/mall/trade-cart/" />

  <ContentWrap>
    <el-form
      ref="formRef"
      v-loading="formLoading"
      :model="formData"
      :rules="formRules"
      label-width="120px"
    >
      <el-form-item v-show="false" label="hideId">
        <el-input v-model="formData.id" />
      </el-form-item>
      <el-tabs>
        <!-- 售后 -->
        <el-tab-pane label="售后">
          <el-form-item label="退款理由" prop="afterSaleRefundReasons">
            <el-select
              v-model="formData.afterSaleRefundReasons"
              allow-create
              filterable
              multiple
              placeholder="请直接输入退款理由"
            >
              <el-option
                v-for="reason in formData.afterSaleRefundReasons"
                :key="reason"
                :label="reason"
                :value="reason"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="退货理由" prop="afterSaleReturnReasons">
            <el-select
              v-model="formData.afterSaleReturnReasons"
              allow-create
              filterable
              multiple
              placeholder="请直接输入退货理由"
            >
              <el-option
                v-for="reason in formData.afterSaleReturnReasons"
                :key="reason"
                :label="reason"
                :value="reason"
              />
            </el-select>
          </el-form-item>
        </el-tab-pane>
        <!-- 配送 -->
        <el-tab-pane label="配送">
          <el-form-item label="启用包邮" prop="deliveryExpressFreeEnabled">
            <el-switch v-model="formData.deliveryExpressFreeEnabled" style="user-select: none" />
            <el-text class="w-full" size="small" type="info"> 商城是否启用全场包邮</el-text>
          </el-form-item>
          <el-form-item label="满额包邮" prop="deliveryExpressFreePrice">
            <el-input-number
              v-model="formData.deliveryExpressFreePrice"
              :min="0"
              :precision="2"
              class="!w-xs"
              placeholder="请输入满额包邮"
            />
            <el-text class="w-full" size="small" type="info">
              商城商品满多少金额即可包邮，单位：元
            </el-text>
          </el-form-item>
          <el-form-item label="启用门店自提" prop="deliveryPickUpEnabled">
            <el-switch v-model="formData.deliveryPickUpEnabled" style="user-select: none" />
          </el-form-item>
        </el-tab-pane>
        <!-- 扫码配送：顾客端的叫法 -->
        <el-tab-pane label="扫码配送">
          <el-alert
            type="info"
            :closable="false"
            class="mb-16px !w-640px"
            title="顾客扫区域二维码下单、工作人员送到指定位置。这里改的是顾客在小程序里看到的叫法，可以按你的场景改，例如“送到宿舍 / 楼栋 / 房间号”“送到桌边 / 区域 / 桌号”。"
          />
          <el-form-item label="配送方式名称" prop="wardDeliveryName">
            <el-input v-model="formData.wardDeliveryName" maxlength="16" class="!w-xs" placeholder="送到病房" />
          </el-form-item>
          <el-form-item label="区域叫法" prop="wardAreaLabel">
            <el-input v-model="formData.wardAreaLabel" maxlength="8" class="!w-xs" placeholder="病区" />
            <el-text class="w-full" size="small" type="info">
              每个区域一张二维码，在「配送管理 → 病区管理」里维护
            </el-text>
          </el-form-item>
          <el-form-item label="位置叫法" prop="wardSpotLabel">
            <el-input v-model="formData.wardSpotLabel" maxlength="8" class="!w-xs" placeholder="床号" />
            <el-text class="w-full" size="small" type="info">顾客下单时填写，配送员按它送达</el-text>
          </el-form-item>
          <el-form-item label="位置必填" prop="wardSpotRequired">
            <el-switch v-model="formData.wardSpotRequired" />
          </el-form-item>
          <el-form-item label="顾客端预览">
            <div class="ward-preview">
              <div class="ward-preview__title">{{ formData.wardDeliveryName || '送到病房' }}</div>
              <div class="ward-preview__row">
                <span>{{ formData.wardAreaLabel || '病区' }}</span>
                <span>内科一{{ formData.wardAreaLabel || '病区' }}</span>
              </div>
              <div class="ward-preview__row">
                <span>
                  <i v-if="formData.wardSpotRequired" class="text-[var(--el-color-danger)]">*</i>
                  {{ formData.wardSpotLabel || '床号' }}
                </span>
                <span class="text-[var(--el-text-color-placeholder)]">
                  {{ formData.wardSpotRequired ? '必填' : '选填' }}，请输入{{ formData.wardSpotLabel || '床号' }}
                </span>
              </div>
            </div>
          </el-form-item>
        </el-tab-pane>
        <!-- 分销 -->
        <el-tab-pane label="分销">
          <el-form-item label="分佣启用" prop="brokerageEnabled">
            <el-switch v-model="formData.brokerageEnabled" style="user-select: none" />
            <el-text class="w-full" size="small" type="info"> 商城是否开启分销模式</el-text>
          </el-form-item>
          <el-form-item label="分佣模式" prop="brokerageEnabledCondition">
            <el-radio-group v-model="formData.brokerageEnabledCondition">
              <el-radio
                v-for="dict in getIntDictOptions(DICT_TYPE.BROKERAGE_ENABLED_CONDITION)"
                :key="dict.value"
                :value="dict.value"
              >
                {{ dict.label }}
              </el-radio>
            </el-radio-group>
            <el-text class="w-full" size="small" type="info">
              人人分销：每个用户都可以成为推广员
            </el-text>
            <el-text class="w-full" size="small" type="info">
              指定分销：仅可在后台手动设置推广员
            </el-text>
          </el-form-item>
          <el-form-item label="分销关系绑定" prop="brokerageBindMode">
            <el-radio-group v-model="formData.brokerageBindMode">
              <el-radio
                v-for="dict in getIntDictOptions(DICT_TYPE.BROKERAGE_BIND_MODE)"
                :key="dict.value"
                :value="dict.value"
              >
                {{ dict.label }}
              </el-radio>
            </el-radio-group>
            <el-text class="w-full" size="small" type="info">
              首次绑定：只要用户没有推广人，随时都可以绑定推广关系
            </el-text>
            <el-text class="w-full" size="small" type="info">
              注册绑定：只有新用户注册时或首次进入系统时才可以绑定推广关系
            </el-text>
          </el-form-item>
          <el-form-item label="分销海报图">
            <UploadImgs v-model="formData.brokeragePosterUrls" height="125px" width="75px" />
            <el-text class="w-full" size="small" type="info">
              分销海报图片，按上传顺序从左往右依次为<strong>个人分享海报</strong>、<strong>商品推广海报</strong>和<strong
                >拼团推广海报</strong
              >
            </el-text>
          </el-form-item>
          <el-form-item label="一级返佣比例" prop="brokerageFirstPercent">
            <el-input-number
              v-model="formData.brokerageFirstPercent"
              :max="100"
              :min="0"
              class="!w-xs"
              placeholder="请输入一级返佣比例"
            />
            <el-text class="w-full" size="small" type="info">
              订单交易成功后给推广人返佣的百分比
            </el-text>
          </el-form-item>
          <el-form-item label="二级返佣比例" prop="brokerageSecondPercent">
            <el-input-number
              v-model="formData.brokerageSecondPercent"
              :max="100"
              :min="0"
              class="!w-xs"
              placeholder="请输入二级返佣比例"
            />
            <el-text class="w-full" size="small" type="info">
              订单交易成功后给推广人的推荐人返佣的百分比
            </el-text>
          </el-form-item>
          <el-form-item label="佣金冻结天数" prop="brokerageFrozenDays">
            <el-input-number
              v-model="formData.brokerageFrozenDays"
              :min="0"
              class="!w-xs"
              placeholder="请输入佣金冻结天数"
            />
            <el-text class="w-full" size="small" type="info">
              防止用户退款，佣金被提现了，所以需要设置佣金冻结时间，单位：天
            </el-text>
          </el-form-item>
          <el-form-item label="提现最低金额" prop="brokerageWithdrawMinPrice">
            <el-input-number
              v-model="formData.brokerageWithdrawMinPrice"
              :min="0"
              :precision="2"
              class="!w-xs"
              placeholder="请输入提现最低金额"
            />
            <el-text class="w-full" size="small" type="info">
              用户提现最低金额限制，单位：元
            </el-text>
          </el-form-item>
          <el-form-item label="提现手续费" prop="brokerageWithdrawFeePercent">
            <el-input-number
              v-model="formData.brokerageWithdrawFeePercent"
              :max="100"
              :min="0"
              class="!w-xs"
              placeholder="请输入提现手续费"
            />
            <el-text class="w-full" size="small" type="info">
              提现手续费百分比，范围 0-100，0 为无提现手续费。例：设置 10，即收取 10% 手续费，提现
              10 元，到账 9 元，1 元手续费
            </el-text>
          </el-form-item>
          <el-form-item label="提现方式" prop="brokerageWithdrawTypes">
            <el-checkbox-group v-model="formData.brokerageWithdrawTypes">
              <el-checkbox
                v-for="dict in getIntDictOptions(DICT_TYPE.BROKERAGE_WITHDRAW_TYPE)"
                :key="dict.value"
                :value="dict.value"
              >
                {{ dict.label }}
              </el-checkbox>
            </el-checkbox-group>
            <el-text class="w-full" size="small" type="info"> 商城开通提现的付款方式</el-text>
          </el-form-item>
        </el-tab-pane>
      </el-tabs>
      <!-- 保存 -->
      <el-form-item>
        <el-button :loading="formLoading" type="primary" @click="submitForm"> 保存</el-button>
      </el-form-item>
    </el-form>
  </ContentWrap>
</template>

<script lang="ts" setup>
import * as ConfigApi from '@/api/mall/trade/config'
import { DICT_TYPE, getIntDictOptions } from '@/utils/dict'
import { cloneDeep } from 'lodash-es'

defineOptions({ name: 'TradeConfig' })

const message = useMessage() // 消息弹窗

const formLoading = ref(false) // 表单的加载中：1）修改时的数据加载；2）提交的按钮禁用
const formRef = ref()
const formData = ref<ConfigApi.ConfigVO>({
  id: null,
  afterSaleRefundReasons: [],
  afterSaleReturnReasons: [],
  deliveryExpressFreeEnabled: false,
  deliveryExpressFreePrice: 0,
  deliveryPickUpEnabled: false,
  wardDeliveryName: '送到病房',
  wardAreaLabel: '病区',
  wardSpotLabel: '床号',
  wardSpotRequired: true,
  brokerageEnabled: false,
  brokerageEnabledCondition: undefined,
  brokerageBindMode: undefined,
  brokeragePosterUrls: [],
  brokerageFirstPercent: 0,
  brokerageSecondPercent: 0,
  brokerageWithdrawMinPrice: 0,
  brokerageWithdrawFeePercent: 0,
  brokerageFrozenDays: 0,
  brokerageWithdrawTypes: []
})
const formRules = reactive({
  deliveryExpressFreePrice: [{ required: true, message: '满额包邮不能为空', trigger: 'blur' }],
  brokerageEnabledCondition: [{ required: true, message: '分佣模式不能为空', trigger: 'blur' }],
  brokerageBindMode: [{ required: true, message: '分销关系绑定模式不能为空', trigger: 'blur' }],
  brokerageFirstPercent: [{ required: true, message: '一级返佣比例不能为空', trigger: 'blur' }],
  brokerageSecondPercent: [{ required: true, message: '二级返佣比例不能为空', trigger: 'blur' }],
  brokerageWithdrawMinPrice: [
    { required: true, message: '用户提现最低金额不能为空', trigger: 'blur' }
  ],
  brokerageWithdrawFeePercent: [{ required: true, message: '提现手续费不能为空', trigger: 'blur' }],
  brokerageFrozenDays: [{ required: true, message: '佣金冻结时间不能为空', trigger: 'blur' }],
  brokerageWithdrawTypes: [
    {
      required: true,
      message: '提现方式不能为空',
      trigger: 'change'
    }
  ]
})

const submitForm = async () => {
  if (formLoading.value) return
  // 校验表单
  if (!formRef) return
  const valid = await formRef.value.validate()
  if (!valid) return
  // 提交请求
  formLoading.value = true
  try {
    const data = cloneDeep(unref(formData.value)) as unknown as ConfigApi.ConfigVO
    // 金额放大
    data.deliveryExpressFreePrice = data.deliveryExpressFreePrice * 100
    data.brokerageWithdrawMinPrice = data.brokerageWithdrawMinPrice * 100
    await ConfigApi.saveTradeConfig(data)
    message.success('保存成功')
  } finally {
    formLoading.value = false
  }
}

/** 查询交易中心配置 */
const getConfig = async () => {
  formLoading.value = true
  try {
    const data = await ConfigApi.getTradeConfig()
    if (data != null) {
      formData.value = data
      // 金额缩小
      formData.value.deliveryExpressFreePrice = data.deliveryExpressFreePrice / 100
      formData.value.brokerageWithdrawMinPrice = data.brokerageWithdrawMinPrice / 100
    }
  } finally {
    formLoading.value = false
  }
}

/** 初始化 **/
onMounted(() => {
  getConfig()
})
</script>
<style lang="scss" scoped>
.ward-preview {
  width: 320px;
  padding: 12px 16px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;

  &__title {
    margin-bottom: 4px;
    font-weight: 600;
  }

  &__row {
    display: flex;
    padding: 6px 0;
    font-size: 13px;
    border-top: 1px solid var(--el-border-color-lighter);
    justify-content: space-between;

    i {
      margin-right: 2px;
      font-style: normal;
    }
  }
}
</style>
