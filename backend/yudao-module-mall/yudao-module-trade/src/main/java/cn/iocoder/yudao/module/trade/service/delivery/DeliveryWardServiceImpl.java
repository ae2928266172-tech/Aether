package cn.iocoder.yudao.module.trade.service.delivery;

import cn.hutool.core.codec.Base64;
import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.system.api.social.SocialClientApi;
import cn.iocoder.yudao.module.system.api.social.dto.SocialWxQrcodeReqDTO;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardPageReqVO;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardSaveReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.delivery.DeliveryWardDO;
import cn.iocoder.yudao.module.trade.dal.mysql.delivery.DeliveryWardMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

import java.util.List;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.module.trade.enums.ErrorCodeConstants.DELIVERY_WARD_DISABLED;
import static cn.iocoder.yudao.module.trade.enums.ErrorCodeConstants.DELIVERY_WARD_NOT_EXISTS;

/**
 * 病区 Service 实现类
 *
 * @author Aether
 */
@Service
@Validated
@Slf4j
public class DeliveryWardServiceImpl implements DeliveryWardService {

    /**
     * 小程序码打开的页面，和 mall-uniapp 的首页保持一致
     */
    private static final String WXA_QRCODE_PATH = "pages/index/index";
    /**
     * 小程序码的 scene 参数前缀，首页解析为 options.wardId
     */
    private static final String WXA_QRCODE_SCENE_PREFIX = "wardId=";

    @Resource
    private DeliveryWardMapper wardMapper;

    @Resource
    private SocialClientApi socialClientApi;

    @Override
    public Long createWard(DeliveryWardSaveReqVO createReqVO) {
        DeliveryWardDO ward = BeanUtils.toBean(createReqVO, DeliveryWardDO.class);
        wardMapper.insert(ward);
        return ward.getId();
    }

    @Override
    public void updateWard(DeliveryWardSaveReqVO updateReqVO) {
        validateWardExists(updateReqVO.getId());
        wardMapper.updateById(BeanUtils.toBean(updateReqVO, DeliveryWardDO.class));
    }

    @Override
    public void deleteWard(Long id) {
        validateWardExists(id);
        wardMapper.deleteById(id);
    }

    private DeliveryWardDO validateWardExists(Long id) {
        DeliveryWardDO ward = wardMapper.selectById(id);
        if (ward == null) {
            throw exception(DELIVERY_WARD_NOT_EXISTS);
        }
        return ward;
    }

    @Override
    public DeliveryWardDO getWard(Long id) {
        return wardMapper.selectById(id);
    }

    @Override
    public DeliveryWardDO validateWardEnabled(Long id) {
        DeliveryWardDO ward = validateWardExists(id);
        if (CommonStatusEnum.isDisable(ward.getStatus())) {
            throw exception(DELIVERY_WARD_DISABLED);
        }
        return ward;
    }

    @Override
    public PageResult<DeliveryWardDO> getWardPage(DeliveryWardPageReqVO pageReqVO) {
        return wardMapper.selectPage(pageReqVO);
    }

    @Override
    public List<DeliveryWardDO> getWardListByStatus(Integer status) {
        return wardMapper.selectListByStatus(status);
    }

    @Override
    public String getWardWxaQrcode(Long id) {
        validateWardExists(id);
        SocialWxQrcodeReqDTO reqDTO = new SocialWxQrcodeReqDTO()
                .setScene(WXA_QRCODE_SCENE_PREFIX + id).setPath(WXA_QRCODE_PATH)
                .setCheckPath(false).setHyaline(false);
        try {
            byte[] image = socialClientApi.getWxaQrcode(reqDTO);
            return "data:image/png;base64," + Base64.encode(image);
        } catch (Exception e) {
            // 未配置微信小程序、或小程序未发布时会失败，管理后台改用 H5 二维码
            log.warn("[getWardWxaQrcode][病区({}) 生成小程序码失败：{}]", id, e.getMessage());
            return null;
        }
    }

}
