package cn.iocoder.yudao.module.trade.dal.mysql.pos;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.trade.controller.admin.pos.vo.TradePosOrderPageReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderDO;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TradePosOrderMapper extends BaseMapperX<TradePosOrderDO> {

    default PageResult<TradePosOrderDO> selectPage(TradePosOrderPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<TradePosOrderDO>()
                .likeIfPresent(TradePosOrderDO::getNo, reqVO.getNo())
                .eqIfPresent(TradePosOrderDO::getStatus, reqVO.getStatus())
                .eqIfPresent(TradePosOrderDO::getPayType, reqVO.getPayType())
                .eqIfPresent(TradePosOrderDO::getCashierId, reqVO.getCashierId())
                .betweenIfPresent(TradePosOrderDO::getCreateTime, reqVO.getCreateTime())
                .orderByDesc(TradePosOrderDO::getId));
    }

    default List<TradePosOrderDO> selectListByCreateTime(Long cashierId, LocalDateTime beginTime, LocalDateTime endTime) {
        return selectList(new LambdaQueryWrapperX<TradePosOrderDO>()
                .eqIfPresent(TradePosOrderDO::getCashierId, cashierId)
                .between(TradePosOrderDO::getCreateTime, beginTime, endTime));
    }

    default int updateByIdAndStatus(Long id, Integer status, TradePosOrderDO updateObj) {
        return update(updateObj, new LambdaQueryWrapperX<TradePosOrderDO>()
                .eq(TradePosOrderDO::getId, id)
                .eq(TradePosOrderDO::getStatus, status));
    }

}
