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
  payPrice?: number // 分摊整单优惠后的金额
  giftCount?: number
  // 医疗器械信息（取商品当前设置），可以打印在小票上
  registrationNo?: string
  productionLicenseNo?: string
  registrant?: string
  productionAddress?: string
}

export interface PosOrderVO {
  id: number
  no: string
  status: number // 10 已完成，20 已作废
  productCount: number
  totalPrice: number // 商品金额（未打折）
  discountRate?: number // 整单折扣，90 表示 9 折
  priceAdjusted?: boolean // 是否手动改了收款金额
  discountPrice?: number // 优惠金额
  payPrice: number // 应收（打折、改价后）
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
  totalPrice: number // 实收合计
  discountPrice: number // 优惠合计
  cancelCount: number
  payTypes: { payType: number; orderCount: number; totalPrice: number }[]
}

// 小票设置
export interface PosReceiptConfigVO {
  title?: string // 小票标题（店名）
  headerText?: string // 标题下方文字，支持变量
  footerText?: string // 底部文字，支持变量
  paperWidth: number // 58 或 80（mm）
  autoPrint: boolean // 收款后自动打印
  copies: number // 打印份数
  voice: boolean // 收款成功语音播报
  showSkuName: boolean
  showPrice: boolean
  showCashier: boolean
  showPayment: boolean
  showDeviceInfo: boolean // 打印医疗器械信息
  deviceFields: string[] // registrationNo、productionLicenseNo、registrant、productionAddress
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
    discountRate?: number // 整单折扣，需要打折权限
    payPrice?: number // 本单收款金额，需要改价权限
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
  },
  getReceiptConfig: async (): Promise<PosReceiptConfigVO> => {
    return await request.get({ url: `/trade/pos/receipt-config` })
  },
  saveReceiptConfig: async (data: PosReceiptConfigVO) => {
    return await request.put({ url: `/trade/pos/receipt-config`, data })
  }
}
