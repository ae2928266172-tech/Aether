package cn.iocoder.yudao.module.trade.controller.app.delivery;

import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.trade.controller.app.delivery.vo.ward.AppDeliveryWardRespVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.delivery.DeliveryWardDO;
import cn.iocoder.yudao.module.trade.service.delivery.DeliveryWardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.annotation.security.PermitAll;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "用户 App - 病区")
@RestController
@RequestMapping("/trade/delivery/ward")
@Validated
public class AppDeliveryWardController {

    @Resource
    private DeliveryWardService wardService;

    @GetMapping("/get")
    @Operation(summary = "获得病区", description = "扫病区二维码进入时调用，病区停用时返回空")
    @Parameter(name = "id", description = "编号", required = true, example = "1024")
    @PermitAll
    public CommonResult<AppDeliveryWardRespVO> getWard(@RequestParam("id") Long id) {
        DeliveryWardDO ward = wardService.getWard(id);
        if (ward == null || CommonStatusEnum.isDisable(ward.getStatus())) {
            return success(null);
        }
        return success(BeanUtils.toBean(ward, AppDeliveryWardRespVO.class));
    }

    @GetMapping("/list")
    @Operation(summary = "获得启用的病区列表", description = "没有扫码时，供病人手动选择病区")
    @PermitAll
    public CommonResult<List<AppDeliveryWardRespVO>> getWardList() {
        List<DeliveryWardDO> list = wardService.getWardListByStatus(CommonStatusEnum.ENABLE.getStatus());
        return success(BeanUtils.toBean(list, AppDeliveryWardRespVO.class));
    }

}
