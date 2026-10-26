import request from '@/config/axios'

// 病区 VO
export interface DeliveryWardVO {
  id?: number // 编号
  name: string // 病区名称
  location?: string // 位置
  sort: number // 排序
  status: number // 状态
  remark?: string // 备注
  createTime?: Date // 创建时间
}

// 病区 API
export const DeliveryWardApi = {
  // 查询病区分页
  getWardPage: async (params: any) => {
    return await request.get({ url: `/trade/delivery/ward/page`, params })
  },

  // 查询启用的病区精简列表
  getSimpleWardList: async (): Promise<DeliveryWardVO[]> => {
    return await request.get({ url: `/trade/delivery/ward/simple-list` })
  },

  // 查询病区详情
  getWard: async (id: number) => {
    return await request.get({ url: `/trade/delivery/ward/get?id=` + id })
  },

  // 新增病区
  createWard: async (data: DeliveryWardVO) => {
    return await request.post({ url: `/trade/delivery/ward/create`, data })
  },

  // 修改病区
  updateWard: async (data: DeliveryWardVO) => {
    return await request.put({ url: `/trade/delivery/ward/update`, data })
  },

  // 删除病区
  deleteWard: async (id: number) => {
    return await request.delete({ url: `/trade/delivery/ward/delete?id=` + id })
  },

  // 获得病区的微信小程序码（Base64 图片）
  getWardWxaQrcode: async (id: number): Promise<string> => {
    return await request.get({ url: `/trade/delivery/ward/wxa-qrcode?id=` + id })
  }
}
