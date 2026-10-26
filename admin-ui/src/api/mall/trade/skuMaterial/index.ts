import request from '@/config/axios'

// 商品规格库存物料 VO
export interface SkuMaterialVO {
  skuId: number // 商品 SKU 编号
  erpProductId: number // 库存物料（ERP 产品）编号
  erpProductName?: string // 库存物料名称
  erpProductUnitName?: string // 库存物料单位
  quantity: number // 每件扣减数量
  stockCount?: number // 物料在默认仓库的库存
}

// 商品规格库存物料 API
export const SkuMaterialApi = {
  // 获得商品的规格物料配置
  getSkuMaterialListBySpuId: async (spuId: number): Promise<SkuMaterialVO[]> => {
    return await request.get({ url: `/trade/sku-material/list-by-spu-id?spuId=` + spuId })
  },

  // 保存商品的规格物料配置（整体覆盖）
  saveSkuMaterials: async (data: { spuId: number; items: SkuMaterialVO[] }) => {
    return await request.put({ url: `/trade/sku-material/save`, data })
  }
}
