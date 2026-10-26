package cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

@Schema(description = "管理后台 - 病区分页 Request VO")
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class DeliveryWardPageReqVO extends PageParam {

    @Schema(description = "病区名称", example = "内科一病区")
    private String name;

    @Schema(description = "状态", example = "0")
    private Integer status;

}
