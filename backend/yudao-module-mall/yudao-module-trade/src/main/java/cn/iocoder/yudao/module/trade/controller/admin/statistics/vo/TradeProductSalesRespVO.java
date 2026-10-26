package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Schema(description = "管理后台 - 商品销售明细的一行 Response VO")
@Data
public class TradeProductSalesRespVO {

    @Schema(description = "来源：1 线上订单，2 门店收银", requiredMode = Schema.RequiredMode.REQUIRED, example = "2")
    private Integer source;

    @Schema(description = "订单 / 收银单编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Long orderId;

    @Schema(description = "单号", requiredMode = Schema.RequiredMode.REQUIRED, example = "P202610260001")
    private String orderNo;

    @Schema(description = "时间", requiredMode = Schema.RequiredMode.REQUIRED)
    private LocalDateTime time;

    @Schema(description = "商品 SPU 编号", example = "1")
    private Long spuId;

    @Schema(description = "商品名字", example = "医用纱布块")
    private String spuName;

    @Schema(description = "商品 SKU 编号", example = "1")
    private Long skuId;

    @Schema(description = "规格", example = "10 片装")
    private String skuName;

    @Schema(description = "件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "2")
    private Integer count;

    @Schema(description = "赠送件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "0")
    private Integer giftCount;

    @Schema(description = "金额（分摊优惠后），单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "560")
    private Integer price;

    @Schema(description = "线上订单为配送地址，门店收银为收银员", example = "内科一病区 床号：12")
    private String place;

}
