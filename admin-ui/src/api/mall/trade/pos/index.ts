import request from '@/config/axios'

// 收银台商品 VO（不含库存数量，门店看不到库存）
export interface PosProductVO {
  id: number
  name: string
  picUrl: string
  categoryId: number
  price: number // 最低价，单位：分
  specType: boolean
  customerVisible: boolean
  giftBuyCount?: number // 买赠：买 N
  giftCount?: number // 买赠：赠 M
  skus: PosSkuVO[]
}

export interface PosSkuVO {
  id: number
  name: string // 规格名称，例如“大包 / 小包”
  price: number // 单位：分
  picUrl?: string
  barCode?: string
  soldOut: boolean // 是否售罄
}

export interface PosCategoryVO {
  id: number
  parentId: number // 0 表示大类
  name: string
  picUrl?: string
}

export interface PosOrderItemVO {
  id?: number
  spuId: number
  spuName: string
  skuId: number
  skuName: string
  picUrl?: string
  price: number
  count: number
  totalPrice: number
  giftCount?: number
}

export interface PosOrderVO {
  id: number
  no: string
  status: number // 10 已完成，20 已作废
  productCount: number
  totalPrice: number
  payType: number
  receivedPrice: number
  changePrice: number
  cashierId: number
  cashierName: string
  remark?: string
  cancelTime?: string
  cancelReason?: string
  createTime: string
  items: PosOrderItemVO[]
}

export interface PosSummaryVO {
  orderCount: number
  totalPrice: number
  cancelCount: number
  payTypes: { payType: number; orderCount: number; totalPrice: number }[]
}

// 收款方式
export const PosPayTypeEnum = {
  CASH: { value: 1, label: '现金' },
  WECHAT: { value: 2, label: '微信' },
  ALIPAY: { value: 3, label: '支付宝' },
  OTHER: { value: 9, label: '其他' }
}

// 门店收银 API
export const PosApi = {
  getProductList: async (): Promise<PosProductVO[]> => {
    return await request.get({ url: `/trade/pos/product-list` })
  },
  getCategoryList: async (): Promise<PosCategoryVO[]> => {
    return await request.get({ url: `/trade/pos/category-list` })
  },
  createOrder: async (data: {
    items: { skuId: number; count: number }[]
    payType: number
    receivedPrice?: number
    remark?: string
  }): Promise<PosOrderVO> => {
    return await request.post({ url: `/trade/pos/create`, data })
  },
  cancelOrder: async (data: { id: number; reason?: string }) => {
    return await request.put({ url: `/trade/pos/cancel`, data })
  },
  getOrder: async (id: number): Promise<PosOrderVO> => {
    return await request.get({ url: `/trade/pos/get?id=` + id })
  },
  getOrderPage: async (params: any) => {
    return await request.get({ url: `/trade/pos/page`, params })
  },
  getSummary: async (params?: { date?: string; all?: boolean }): Promise<PosSummaryVO> => {
    return await request.get({ url: `/trade/pos/summary`, params })
  }
}
