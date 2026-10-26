package cn.iocoder.yudao.module.trade.dal.mysql.material;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.module.trade.dal.dataobject.material.TradeSkuMaterialDO;
import org.apache.ibatis.annotations.Mapper;

import java.util.Collection;
import java.util.List;

@Mapper
public interface TradeSkuMaterialMapper extends BaseMapperX<TradeSkuMaterialDO> {

    default List<TradeSkuMaterialDO> selectListBySpuId(Long spuId) {
        return selectList(TradeSkuMaterialDO::getSpuId, spuId);
    }

    default List<TradeSkuMaterialDO> selectListBySkuIds(Collection<Long> skuIds) {
        return selectList(TradeSkuMaterialDO::getSkuId, skuIds);
    }

    default List<TradeSkuMaterialDO> selectListByErpProductIds(Collection<Long> erpProductIds) {
        return selectList(TradeSkuMaterialDO::getErpProductId, erpProductIds);
    }

    default int deleteBySpuId(Long spuId) {
        return delete(TradeSkuMaterialDO::getSpuId, spuId);
    }

}
