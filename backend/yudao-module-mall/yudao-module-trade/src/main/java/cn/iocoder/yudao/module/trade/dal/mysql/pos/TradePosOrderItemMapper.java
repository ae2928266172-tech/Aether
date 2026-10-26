package cn.iocoder.yudao.module.trade.dal.mysql.pos;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderItemDO;
import org.apache.ibatis.annotations.Mapper;

import java.util.Collection;
import java.util.List;

@Mapper
public interface TradePosOrderItemMapper extends BaseMapperX<TradePosOrderItemDO> {

    default List<TradePosOrderItemDO> selectListByOrderId(Long orderId) {
        return selectList(TradePosOrderItemDO::getOrderId, orderId);
    }

    default List<TradePosOrderItemDO> selectListByOrderIds(Collection<Long> orderIds) {
        return selectList(TradePosOrderItemDO::getOrderId, orderIds);
    }

}
