package cn.iocoder.yudao.module.trade.dal.mysql.delivery;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardPageReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.delivery.DeliveryWardDO;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface DeliveryWardMapper extends BaseMapperX<DeliveryWardDO> {

    default PageResult<DeliveryWardDO> selectPage(DeliveryWardPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<DeliveryWardDO>()
                .likeIfPresent(DeliveryWardDO::getName, reqVO.getName())
                .eqIfPresent(DeliveryWardDO::getStatus, reqVO.getStatus())
                .orderByAsc(DeliveryWardDO::getSort)
                .orderByDesc(DeliveryWardDO::getId));
    }

    default List<DeliveryWardDO> selectListByStatus(Integer status) {
        return selectList(new LambdaQueryWrapperX<DeliveryWardDO>()
                .eq(DeliveryWardDO::getStatus, status)
                .orderByAsc(DeliveryWardDO::getSort));
    }

}
