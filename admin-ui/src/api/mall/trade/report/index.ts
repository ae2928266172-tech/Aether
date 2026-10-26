import request from '@/config/axios'

// 营收报表的一行：一天、一周或一个月，最后一行是“合计”
export interface RevenueReportVO {
  period: string // 2026-10-26、2026-10-20 ~ 2026-10-26、2026-10 或“合计”
  beginDate: string
  endDate: string
  onlineOrderCount: number
  onlinePrice: number // 线上订单实收，单位：分
  posOrderCount: number
  posPrice: number // 门店收银实收，单位：分
  orderCount: number
  totalPrice: number // 实收合计
  discountPrice: number // 门店收银优惠
  productCount: number // 售出件数（不含赠送）
  giftCount: number
  costPrice: number
  profitPrice: number // 毛利 = 实收 - 成本
}

export interface ProductSalesSummaryVO {
  spuId: number
  spuName: string
  skuId: number
  skuName: string
  onlineCount: number
  posCount: number
  count: number
  giftCount: number
  orderCount: number
  price: number // 销售额，单位：分
}

export interface ProductSalesVO {
  source: number // 1 线上订单，2 门店收银
  orderId: number
  orderNo: string
  time: string
  spuId: number
  spuName: string
  skuId: number
  skuName: string
  count: number
  giftCount: number
  price: number // 金额，单位：分
  place: string // 线上订单为配送地址/床号，门店收银为收银员
}

export const ReportSourceEnum = {
  ONLINE: { value: 1, label: '线上订单' },
  POS: { value: 2, label: '门店收银' }
}

// 营收报表 API
export const ReportApi = {
  getRevenue: async (params: { beginDate: string; endDate: string; period: string }): Promise<RevenueReportVO[]> => {
    return await request.get({ url: `/trade/report/revenue`, params })
  },
  exportRevenue: async (params: { beginDate: string; endDate: string; period: string }) => {
    return await request.download({ url: `/trade/report/revenue/export-excel`, params })
  },
  getProductSalesSummary: async (params: any): Promise<ProductSalesSummaryVO[]> => {
    return await request.get({ url: `/trade/report/product-sales/summary`, params })
  },
  getProductSalesPage: async (params: any) => {
    return await request.get({ url: `/trade/report/product-sales/page`, params })
  },
  exportProductSales: async (params: any) => {
    return await request.download({ url: `/trade/report/product-sales/export-excel`, params })
  }
}
