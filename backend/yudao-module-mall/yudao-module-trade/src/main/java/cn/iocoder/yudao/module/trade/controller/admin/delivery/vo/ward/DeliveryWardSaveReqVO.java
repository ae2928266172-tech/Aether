package cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward;

import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.common.validation.InEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Schema(description = "管理后台 - 病区新增/修改 Request VO")
@Data
public class DeliveryWardSaveReqVO {

    @Schema(description = "编号", example = "1024")
    private Long id;

    @Schema(description = "病区名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "内科一病区")
    @NotEmpty(message = "病区名称不能为空")
    private String name;

    @Schema(description = "位置", example = "住院部 A 栋 5 楼")
    private String location;

    @Schema(description = "排序", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @NotNull(message = "排序不能为空")
    private Integer sort;

    @Schema(description = "状态", requiredMode = Schema.RequiredMode.REQUIRED, example = "0")
    @NotNull(message = "状态不能为空")
    @InEnum(CommonStatusEnum.class)
    private Integer status;

    @Schema(description = "备注", example = "夜间 22 点后不配送")
    private String remark;

}
