import request from '@/sheep/request';

const DeliveryApi = {
  // 获得快递公司列表
  getDeliveryExpressList: () => {
    return request({
      url: `/trade/delivery/express/list`,
      method: 'get',
    });
  },
  // 获得自提门店列表
  getDeliveryPickUpStoreList: (params) => {
    return request({
      url: `/trade/delivery/pick-up-store/list`,
      method: 'GET',
      params,
    });
  },
  // 获得自提门店
  getDeliveryPickUpStore: (id) => {
    return request({
      url: `/trade/delivery/pick-up-store/get`,
      method: 'GET',
      params: {
        id,
      },
    });
  },
  // 获得病区（扫病区二维码进入时）
  getDeliveryWard: (id) => {
    return request({
      url: `/trade/delivery/ward/get`,
      method: 'GET',
      params: {
        id,
      },
      custom: {
        showLoading: false,
      },
    });
  },
  // 获得启用的病区列表（没有扫码时手动选择）
  getDeliveryWardList: () => {
    return request({
      url: `/trade/delivery/ward/list`,
      method: 'GET',
    });
  },
};

export default DeliveryApi;
