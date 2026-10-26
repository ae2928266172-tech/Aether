package cn.iocoder.yudao.module.trade.controller.admin.delivery.vo.ward;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Schema(description = "管理后台 - 病区 Response VO")
@Data
public class DeliveryWardRespVO {

    @Schema(description = "编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1024")
    private Long id;

    @Schema(description = "病区名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "内科一病区")
    private String name;

    @Schema(description = "位置", example = "住院部 A 栋 5 楼")
    private String location;

    @Schema(description = "排序", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Integer sort;

    @Schema(description = "状态", requiredMode = Schema.RequiredMode.REQUIRED, example = "0")
    private Integer status;

    @Schema(description = "备注", example = "夜间 22 点后不配送")
    private String remark;

    @Schema(description = "创建时间", requiredMode = Schema.RequiredMode.REQUIRED)
    private LocalDateTime createTime;

}
