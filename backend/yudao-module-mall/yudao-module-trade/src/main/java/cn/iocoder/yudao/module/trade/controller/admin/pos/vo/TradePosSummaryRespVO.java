package cn.iocoder.yudao.module.trade.controller.admin.pos.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Schema(description = "管理后台 - 门店收银汇总（交班对账）Response VO")
@Data
public class TradePosSummaryRespVO {

    @Schema(description = "已完成单数", requiredMode = Schema.RequiredMode.REQUIRED, example = "12")
    private Integer orderCount;

    @Schema(description = "收款合计，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "35600")
    private Integer totalPrice;

    @Schema(description = "优惠合计（打折、改价），单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "200")
    private Integer discountPrice;

    @Schema(description = "作废单数", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Integer cancelCount;

    @Schema(description = "按收款方式汇总", requiredMode = Schema.RequiredMode.REQUIRED)
    private List<PayTypeSummary> payTypes;

    @Schema(description = "按收款方式汇总")
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PayTypeSummary {

        @Schema(description = "收款方式", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        private Integer payType;

        @Schema(description = "单数", requiredMode = Schema.RequiredMode.REQUIRED, example = "8")
        private Integer orderCount;

        @Schema(description = "金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "21000")
        private Integer totalPrice;

    }

}
