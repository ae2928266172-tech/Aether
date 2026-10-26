package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Schema(description = "管理后台 - 商品销售汇总（按规格）Response VO")
@Data
public class TradeProductSalesSummaryRespVO {

    @Schema(description = "商品 SPU 编号", example = "1")
    private Long spuId;

    @Schema(description = "商品名字", example = "医用纱布块")
    private String spuName;

    @Schema(description = "商品 SKU 编号", example = "1")
    private Long skuId;

    @Schema(description = "规格", example = "10 片装")
    private String skuName;

    @Schema(description = "线上件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "10")
    private Integer onlineCount;

    @Schema(description = "门店件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "5")
    private Integer posCount;

    @Schema(description = "合计件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "15")
    private Integer count;

    @Schema(description = "赠送件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Integer giftCount;

    @Schema(description = "单数", requiredMode = Schema.RequiredMode.REQUIRED, example = "6")
    private Integer orderCount;

    @Schema(description = "金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "4200")
    private Integer price;

}
