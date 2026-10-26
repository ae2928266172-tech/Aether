package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Schema(description = "管理后台 - 供应商月度对账 Response VO")
@Data
public class TradeSupplierSettlementRespVO {

    @Schema(description = "供应商编号，为空表示未设置供应商", example = "1")
    private Long supplierId;

    @Schema(description = "供应商名字", requiredMode = Schema.RequiredMode.REQUIRED, example = "某某医疗器械")
    private String supplierName;

    @Schema(description = "病房订单销售件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "10")
    private Integer onlineCount;

    @Schema(description = "病房订单销售额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "2800")
    private Integer onlinePrice;

    @Schema(description = "门店收银销售件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "5")
    private Integer posCount;

    @Schema(description = "门店收银销售额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "1400")
    private Integer posPrice;

    @Schema(description = "合计销售件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "15")
    private Integer count;

    @Schema(description = "合计赠送件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "3")
    private Integer giftCount;

    @Schema(description = "合计销售额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "4200")
    private Integer totalPrice;

    @Schema(description = "销售成本（成本价 × 销售件数），单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "3000")
    private Integer costPrice;

    @Schema(description = "赠品成本（成本价 × 赠送件数），单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "600")
    private Integer giftCostPrice;

    @Schema(description = "商品明细")
    private List<Product> products;

    @Schema(description = "供应商对账商品明细")
    @Data
    public static class Product {

        @Schema(description = "商品 SPU 编号", example = "1")
        private Long spuId;

        @Schema(description = "商品名字", example = "医用纱布")
        private String spuName;

        @Schema(description = "病房订单销售件数", example = "10")
        private Integer onlineCount;

        @Schema(description = "门店收银销售件数", example = "5")
        private Integer posCount;

        @Schema(description = "合计销售件数", example = "15")
        private Integer count;

        @Schema(description = "合计赠送件数", example = "3")
        private Integer giftCount;

        @Schema(description = "合计销售额，单位：分", example = "4200")
        private Integer totalPrice;

        @Schema(description = "销售成本，单位：分", example = "3000")
        private Integer costPrice;

        @Schema(description = "赠品成本，单位：分", example = "600")
        private Integer giftCostPrice;

    }

}
