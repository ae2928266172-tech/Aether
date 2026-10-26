package cn.iocoder.yudao.module.trade.controller.admin.delivery;

import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardPageReqVO;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardRespVO;
import cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward.DeliveryWardSaveReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.delivery.DeliveryWardDO;
import cn.iocoder.yudao.module.trade.service.delivery.DeliveryWardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - 病区")
@RestController
@RequestMapping("/trade/delivery/ward")
@Validated
public class DeliveryWardController {

    @Resource
    private DeliveryWardService wardService;

    @PostMapping("/create")
    @Operation(summary = "创建病区")
    @PreAuthorize("@ss.hasPermission('trade:delivery:ward:create')")
    public CommonResult<Long> createWard(@Valid @RequestBody DeliveryWardSaveReqVO createReqVO) {
        return success(wardService.createWard(createReqVO));
    }

    @PutMapping("/update")
    @Operation(summary = "更新病区")
    @PreAuthorize("@ss.hasPermission('trade:delivery:ward:update')")
    public CommonResult<Boolean> updateWard(@Valid @RequestBody DeliveryWardSaveReqVO updateReqVO) {
        wardService.updateWard(updateReqVO);
        return success(true);
    }

    @DeleteMapping("/delete")
    @Operation(summary = "删除病区")
    @Parameter(name = "id", description = "编号", required = true)
    @PreAuthorize("@ss.hasPermission('trade:delivery:ward:delete')")
    public CommonResult<Boolean> deleteWard(@RequestParam("id") Long id) {
        wardService.deleteWard(id);
        return success(true);
    }

    @GetMapping("/get")
    @Operation(summary = "获得病区")
    @Parameter(name = "id", description = "编号", required = true, example = "1024")
    @PreAuthorize("@ss.hasPermission('trade:delivery:ward:query')")
    public CommonResult<DeliveryWardRespVO> getWard(@RequestParam("id") Long id) {
        return success(BeanUtils.toBean(wardService.getWard(id), DeliveryWardRespVO.class));
    }

    @GetMapping("/page")
    @Operation(summary = "获得病区分页")
    @PreAuthorize("@ss.hasPermission('trade:delivery:ward:query')")
    public CommonResult<PageResult<DeliveryWardRespVO>> getWardPage(@Valid DeliveryWardPageReqVO pageReqVO) {
        PageResult<DeliveryWardDO> pageResult = wardService.getWardPage(pageReqVO);
        return success(BeanUtils.toBean(pageResult, DeliveryWardRespVO.class));
    }

    @GetMapping("/simple-list")
    @Operation(summary = "获得启用的病区精简列表", description = "用于订单列表的病区筛选")
    public CommonResult<List<DeliveryWardRespVO>> getSimpleWardList() {
        List<DeliveryWardDO> list = wardService.getWardListByStatus(CommonStatusEnum.ENABLE.getStatus());
        return success(BeanUtils.toBean(list, DeliveryWardRespVO.class));
    }

    @GetMapping("/wxa-qrcode")
    @Operation(summary = "获得病区的微信小程序码", description = "需要先在【系统管理 - 三方登录 - 三方应用】配置会员端的微信小程序")
    @Parameter(name = "id", description = "编号", required = true, example = "1024")
    @PreAuthorize("@ss.hasPermission('trade:delivery:ward:query')")
    public CommonResult<String> getWardWxaQrcode(@RequestParam("id") Long id) {
        return success(wardService.getWardWxaQrcode(id));
    }

}
