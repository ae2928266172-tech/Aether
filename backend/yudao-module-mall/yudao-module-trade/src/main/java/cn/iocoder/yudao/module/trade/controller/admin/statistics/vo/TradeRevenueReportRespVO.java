package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;

@Schema(description = "管理后台 - 营收报表的一行（一天 / 一周 / 一个月）Response VO")
@Data
public class TradeRevenueReportRespVO {

    @Schema(description = "时间段名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "2026-10-20 ~ 2026-10-26")
    private String period;

    @Schema(description = "开始日期", requiredMode = Schema.RequiredMode.REQUIRED)
    private LocalDate beginDate;

    @Schema(description = "结束日期（含）", requiredMode = Schema.RequiredMode.REQUIRED)
    private LocalDate endDate;

    @Schema(description = "线上订单数", requiredMode = Schema.RequiredMode.REQUIRED, example = "10")
    private Integer onlineOrderCount;

    @Schema(description = "线上实收，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "10000")
    private Integer onlinePrice;

    @Schema(description = "门店收银单数", requiredMode = Schema.RequiredMode.REQUIRED, example = "20")
    private Integer posOrderCount;

    @Schema(description = "门店实收，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "20000")
    private Integer posPrice;

    @Schema(description = "合计单数", requiredMode = Schema.RequiredMode.REQUIRED, example = "30")
    private Integer orderCount;

    @Schema(description = "合计实收（营业额），单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "30000")
    private Integer totalPrice;

    @Schema(description = "优惠金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "500")
    private Integer discountPrice;

    @Schema(description = "销售件数（不含赠品）", requiredMode = Schema.RequiredMode.REQUIRED, example = "120")
    private Integer productCount;

    @Schema(description = "赠送件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "6")
    private Integer giftCount;

    @Schema(description = "成本（含赠品），单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "18000")
    private Integer costPrice;

    @Schema(description = "毛利，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "12000")
    private Integer profitPrice;

}
