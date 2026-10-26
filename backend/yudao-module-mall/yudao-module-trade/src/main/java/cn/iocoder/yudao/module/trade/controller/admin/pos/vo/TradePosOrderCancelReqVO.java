package cn.iocoder.yudao.module.trade.controller.admin.pos.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Schema(description = "管理后台 - 门店收银单作废 Request VO")
@Data
public class TradePosOrderCancelReqVO {

    @Schema(description = "收银单编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @NotNull(message = "收银单编号不能为空")
    private Long id;

    @Schema(description = "作废原因", example = "收错了")
    @Size(max = 255, message = "作废原因不能超过 255 个字")
    private String reason;

}
