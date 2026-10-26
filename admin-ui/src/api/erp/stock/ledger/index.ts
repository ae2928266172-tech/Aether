import request from '@/config/axios'

// 仓库台账的一行：一个产品在某个仓库、某段时间的期初、入库、出库、结存
export interface StockLedgerVO {
  productId: number
  productName: string
  barCode?: string
  standard?: string
  categoryName?: string
  unitName?: string
  openingCount: number // 期初
  inCount: number // 入库（含调入）
  outCount: number // 出库（含调出、销售）
  closingCount: number // 结存（期末）
  currentCount: number // 当前库存
}

export interface StockLedgerQuery {
  warehouseId: number
  beginDate: string
  endDate: string
  keyword?: string
}

// 快速出入库：一步生成单据并审核
export interface StockQuickOperateVO {
  type: 'in' | 'out' | 'move'
  warehouseId: number
  toWarehouseId?: number // 调拨时的调入仓库
  supplierId?: number
  remark?: string
  items: { productId: number; count: number; remark?: string }[]
}

// 仓库台账 API
export const StockLedgerApi = {
  getLedger: async (params: StockLedgerQuery): Promise<StockLedgerVO[]> => {
    return await request.get({ url: `/erp/stock-ledger/list`, params })
  },
  exportLedger: async (params: StockLedgerQuery) => {
    return await request.download({ url: `/erp/stock-ledger/export-excel`, params })
  },
  quickOperate: async (data: StockQuickOperateVO): Promise<number> => {
    return await request.post({ url: `/erp/stock-ledger/quick-operate`, data })
  }
}
