<!-- 共享库存物料：多个规格 / 不同名称的商品，共用同一个库存物料（ERP 产品），按扣减数量扣库存 -->
<template>
  <Dialog :title="`库存物料 - ${spu?.name ?? ''}`" v-model="dialogVisible" width="900px">
    <el-alert
      class="mb-15px"
      type="info"
      :closable="false"
      title="给规格选择库存物料后，卖出 1 件扣减对应数量的物料库存（例如：单片扣 1、两片装扣 2）；不同名称的商品选同一个物料，即共用一份库存。配置了物料的规格，库存会按物料库存自动换算。物料库存在【ERP 进销存】中入库、盘点，商城订单从默认仓库扣减。"
    />
    <el-table v-loading="formLoading" :data="rows" border>
      <el-table-column label="规格" min-width="160">
        <template #default="{ row }">
          {{ formatSkuName(row.sku) }}
        </template>
      </el-table-column>
      <el-table-column label="库存物料" min-width="240">
        <template #default="{ row }">
          <el-select
            v-model="row.erpProductId"
            clearable
            filterable
            placeholder="不使用共享库存"
            class="!w-1/1"
            :disabled="!canUpdate"
          >
            <el-option
              v-for="product in productList"
              :key="product.id"
              :label="product.name + (product.unitName ? `（${product.unitName}）` : '')"
              :value="product.id"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="每件扣减数量" width="180">
        <template #default="{ row }">
          <el-input-number
            v-model="row.quantity"
            :min="0.0001"
            :precision="4"
            :step="1"
            controls-position="right"
            class="!w-1/1"
            :disabled="!canUpdate || !row.erpProductId"
          />
        </template>
      </el-table-column>
      <el-table-column label="物料库存" width="110" align="center">
        <template #default="{ row }">
          {{ row.stockCount ?? '-' }}
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button v-if="canUpdate" @click="submitForm" type="primary" :disabled="formLoading">
        确 定
      </el-button>
      <el-button @click="dialogVisible = false">取 消</el-button>
    </template>
  </Dialog>
</template>
<script setup lang="ts">
import * as ProductSpuApi from '@/api/mall/product/spu'
import { SkuMaterialApi } from '@/api/mall/trade/skuMaterial'
import { ProductApi, ProductVO } from '@/api/erp/product/product'
import { checkPermi } from '@/utils/permission'

/** 共享库存物料配置 */
defineOptions({ name: 'SkuMaterialForm' })

const message = useMessage() // 消息弹窗

interface Row {
  sku: ProductSpuApi.Sku
  erpProductId?: number
  quantity: number
  stockCount?: number
}

const dialogVisible = ref(false) // 弹窗的是否展示
const formLoading = ref(false) // 表单的加载中
const spu = ref<ProductSpuApi.Spu>() // 当前商品
const rows = ref<Row[]>([]) // 每个规格一行
const productList = ref<ProductVO[]>([]) // ERP 产品（库存物料）列表
const canUpdate = checkPermi(['trade:sku-material:update']) // 是否可以修改

/** 规格名称：多规格时拼接属性值 */
const formatSkuName = (sku: ProductSpuApi.Sku) => {
  if (sku.properties?.length) {
    return sku.properties.map((p) => p.valueName).join(' / ')
  }
  return sku.name || '默认规格'
}

/** 打开弹窗 */
const open = async (row: ProductSpuApi.Spu) => {
  dialogVisible.value = true
  spu.value = row
  rows.value = []
  formLoading.value = true
  try {
    const [detail, materials, products] = await Promise.all([
      ProductSpuApi.getSpu(row.id!),
      SkuMaterialApi.getSkuMaterialListBySpuId(row.id!),
      ProductApi.getProductSimpleList()
    ])
    productList.value = products
    rows.value = (detail.skus || []).map((sku: ProductSpuApi.Sku) => {
      const material = materials.find((m) => m.skuId === sku.id)
      return {
        sku,
        erpProductId: material?.erpProductId,
        quantity: material?.quantity ?? 1,
        stockCount: material?.stockCount
      }
    })
  } finally {
    formLoading.value = false
  }
}
defineExpose({ open }) // 提供 open 方法，用于打开弹窗

/** 提交 */
const emit = defineEmits(['success']) // 定义 success 事件，用于操作成功后的回调
const submitForm = async () => {
  formLoading.value = true
  try {
    await SkuMaterialApi.saveSkuMaterials({
      spuId: spu.value!.id!,
      items: rows.value
        .filter((row) => row.erpProductId)
        .map((row) => ({
          skuId: row.sku.id!,
          erpProductId: row.erpProductId!,
          quantity: row.quantity
        }))
    })
    message.success('保存成功，规格库存已按物料库存重新换算')
    dialogVisible.value = false
    emit('success')
  } finally {
    formLoading.value = false
  }
}
</script>
