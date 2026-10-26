<!-- 商品发布 - 销售设置：顾客端是否可见、供应商、起订量、买赠、医疗器械信息 -->
<template>
  <el-form ref="formRef" :model="formData" :rules="rules" label-width="120px" :disabled="isDetail">
    <el-form-item label="顾客端可见" prop="customerVisible">
      <el-switch v-model="formData.customerVisible" active-text="可见" inactive-text="仅门店售卖" />
      <div class="form-tip">关闭后病人在小程序里看不到这个商品，只能在门店收银台售卖</div>
    </el-form-item>
    <el-form-item label="供应商" prop="supplierId">
      <el-select
        v-model="formData.supplierId"
        placeholder="请选择供应商"
        clearable
        filterable
        class="w-80!"
      >
        <el-option v-for="item in supplierList" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <div class="form-tip">用于「供应商对账」每月按供应商统计销量和成本</div>
    </el-form-item>
    <el-form-item label="起订量" prop="minBuyCount">
      <el-input-number v-model="formData.minBuyCount" :min="0" :precision="0" class="w-80!" />
      <div class="form-tip">病人每单至少购买的件数，0 或 1 表示不限制；门店收银不受限制</div>
    </el-form-item>
    <el-form-item label="买赠">
      <span class="mr-8px">买</span>
      <el-input-number v-model="formData.giftBuyCount" :min="0" :precision="0" class="w-30!" />
      <span class="mx-8px">赠</span>
      <el-input-number v-model="formData.giftCount" :min="0" :precision="0" class="w-30!" />
      <div class="form-tip w-full">例如买 2 赠 1，买 10 件送 5 件；任一项为 0 表示不参与买赠</div>
    </el-form-item>
    <el-form-item v-if="giftEnabled" label="赠品扣减" prop="giftStockSource">
      <el-radio-group v-model="formData.giftStockSource">
        <el-radio :value="1">从总库存扣</el-radio>
        <el-radio :value="2">从赠品库扣</el-radio>
      </el-radio-group>
      <div class="form-tip w-full">
        “赠品库”是 ERP 中勾选了“赠品库”的仓库，选择它时需要先在「库存物料」里为商品绑定物料
      </div>
    </el-form-item>
    <el-divider content-position="left">医疗器械信息（可选，可打印在小票上）</el-divider>
    <el-form-item label="注册证号" prop="registrationNo">
      <el-input v-model="formData.registrationNo" placeholder="例如：苏械注准20262140001" maxlength="255" class="w-120!" />
    </el-form-item>
    <el-form-item label="生产许可证号" prop="productionLicenseNo">
      <el-input v-model="formData.productionLicenseNo" placeholder="例如：苏药监械生产许20160001号" maxlength="255" class="w-120!" />
    </el-form-item>
    <el-form-item label="注册人" prop="registrant">
      <el-input v-model="formData.registrant" placeholder="注册人/备案人名称" maxlength="255" class="w-120!" />
    </el-form-item>
    <el-form-item label="生产地址" prop="productionAddress">
      <el-input v-model="formData.productionAddress" placeholder="生产地址" maxlength="255" class="w-120!" />
      <div class="form-tip w-full">在「门店收银 → 小票设置」里打开“医疗器械信息”后，这些内容会打印在小票上</div>
    </el-form-item>
  </el-form>
</template>
<script lang="ts" setup>
import type { Spu } from '@/api/mall/product/spu'
import { PropType } from 'vue'
import { propTypes } from '@/utils/propTypes'
import { copyValueToTarget } from '@/utils'
import { SupplierApi, SupplierVO } from '@/api/erp/purchase/supplier'

defineOptions({ name: 'ProductSaleForm' })

const message = useMessage() // 消息弹窗

const props = defineProps({
  propFormData: {
    type: Object as PropType<Spu>,
    default: () => {}
  },
  isDetail: propTypes.bool.def(false) // 是否作为详情组件
})

const formRef = ref() // 表单 Ref
const formData = ref<Spu>({
  customerVisible: true, // 顾客端是否可见
  supplierId: undefined, // 供应商
  minBuyCount: 0, // 起订量
  giftBuyCount: 0, // 买 N
  giftCount: 0, // 赠 M
  giftStockSource: 1, // 赠品库存来源
  registrationNo: '', // 注册证号
  productionLicenseNo: '', // 生产许可证号
  registrant: '', // 注册人
  productionAddress: '' // 生产地址
})
const giftEnabled = computed(
  () => (formData.value.giftBuyCount || 0) > 0 && (formData.value.giftCount || 0) > 0
)
const rules = reactive({
  customerVisible: [required]
})

/** 将传进来的值赋值给 formData */
watch(
  () => props.propFormData,
  (data) => {
    if (!data) {
      return
    }
    copyValueToTarget(formData.value, data)
    // 老商品没有这些字段，补上默认值
    formData.value.customerVisible = formData.value.customerVisible ?? true
    formData.value.minBuyCount = formData.value.minBuyCount ?? 0
    formData.value.giftBuyCount = formData.value.giftBuyCount ?? 0
    formData.value.giftCount = formData.value.giftCount ?? 0
    formData.value.giftStockSource = formData.value.giftStockSource ?? 1
  },
  {
    immediate: true
  }
)

/** 表单校验 */
const emit = defineEmits(['update:activeName'])
const validate = async () => {
  if (!formRef) return
  try {
    await unref(formRef)?.validate()
    // 校验通过更新数据
    Object.assign(props.propFormData, formData.value)
  } catch (e) {
    message.error('【销售设置】不完善，请填写相关信息')
    emit('update:activeName', 'sale')
    throw e // 目的截断之后的校验
  }
}
defineExpose({ validate })

/** 初始化 */
const supplierList = ref<SupplierVO[]>([])
onMounted(async () => {
  supplierList.value = await SupplierApi.getSupplierSimpleList()
})
</script>
<style lang="scss" scoped>
.form-tip {
  width: 100%;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
}
</style>
