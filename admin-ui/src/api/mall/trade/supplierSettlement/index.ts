import request from '@/config/axios'

export interface SupplierSettlementProductVO {
  spuId: number
  spuName: string
  onlineCount: number // 病房订单销量
  posCount: number // 门店收银销量
  count: number // 合计销量（不含赠送）
  giftCount: number // 赠送件数
  totalPrice: number // 销售额，单位：分
  costPrice: number // 销售成本，单位：分
  giftCostPrice: number // 赠品成本，单位：分
}

export interface SupplierSettlementVO {
  supplierId?: number
  supplierName: string
  onlineCount: number
  onlinePrice: number // 病房订单销售额，单位：分
  posCount: number
  posPrice: number // 门店收银销售额，单位：分
  count: number
  giftCount: number
  totalPrice: number
  costPrice: number
  giftCostPrice: number
  products: SupplierSettlementProductVO[]
}

// 供应商对账 API
export const SupplierSettlementApi = {
  getList: async (month: string): Promise<SupplierSettlementVO[]> => {
    return await request.get({ url: `/trade/supplier-settlement/list`, params: { month } })
  },
  exportExcel: async (month: string) => {
    return await request.download({ url: `/trade/supplier-settlement/export-excel`, params: { month } })
  }
}
