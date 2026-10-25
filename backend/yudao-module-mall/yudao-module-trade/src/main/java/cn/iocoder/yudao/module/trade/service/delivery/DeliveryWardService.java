package cn.iocoder.yudao.module.trade.service.delivery;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardPageReqVO;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardSaveReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.delivery.DeliveryWardDO;
import jakarta.validation.Valid;

import java.util.List;

/**
 * 病区 Service 接口
 *
 * @author Aether
 */
public interface DeliveryWardService {

    Long createWard(@Valid DeliveryWardSaveReqVO createReqVO);

    void updateWard(@Valid DeliveryWardSaveReqVO updateReqVO);

    void deleteWard(Long id);

    DeliveryWardDO getWard(Long id);

    /**
     * 校验病区存在且启用，下单时使用
     *
     * @param id 病区编号
     * @return 病区
     */
    DeliveryWardDO validateWardEnabled(Long id);

    PageResult<DeliveryWardDO> getWardPage(DeliveryWardPageReqVO pageReqVO);

    List<DeliveryWardDO> getWardListByStatus(Integer status);

    /**
     * 生成病区的微信小程序码，病人扫码后进入小程序首页，并带上病区编号
     *
     * @param id 病区编号
     * @return 图片的 Base64 Data URL；未配置微信小程序时返回 null
     */
    String getWardWxaQrcode(Long id);

}
