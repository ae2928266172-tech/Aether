package cn.iocoder.yudao.module.trade.controller.app.delivery.vo.ward;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Schema(description = "用户 App - 病区 Response VO")
@Data
public class AppDeliveryWardRespVO {

    @Schema(description = "编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1024")
    private Long id;

    @Schema(description = "病区名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "内科一病区")
    private String name;

    @Schema(description = "位置", example = "住院部 A 栋 5 楼")
    private String location;

}
