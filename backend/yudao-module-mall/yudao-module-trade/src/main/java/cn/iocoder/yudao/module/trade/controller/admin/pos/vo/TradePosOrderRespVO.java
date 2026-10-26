package cn.iocoder.yudao.module.trade.controller.admin.pos.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Schema(description = "管理后台 - 门店收银单 Response VO")
@Data
public class TradePosOrderRespVO {

    @Schema(description = "编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Long id;

    @Schema(description = "收银单号", requiredMode = Schema.RequiredMode.REQUIRED, example = "P202610260001")
    private String no;

    @Schema(description = "状态", requiredMode = Schema.RequiredMode.REQUIRED, example = "10")
    private Integer status;

    @Schema(description = "商品件数（不含赠品）", requiredMode = Schema.RequiredMode.REQUIRED, example = "3")
    private Integer productCount;

    @Schema(description = "应收金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "1000")
    private Integer totalPrice;

    @Schema(description = "收款方式", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Integer payType;

    @Schema(description = "实收金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "2000")
    private Integer receivedPrice;

    @Schema(description = "找零金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "1000")
    private Integer changePrice;

    @Schema(description = "收银员编号", example = "1")
    private Long cashierId;

    @Schema(description = "收银员名字", example = "门店店员")
    private String cashierName;

    @Schema(description = "备注")
    private String remark;

    @Schema(description = "作废时间")
    private LocalDateTime cancelTime;

    @Schema(description = "作废原因")
    private String cancelReason;

    @Schema(description = "收银时间", requiredMode = Schema.RequiredMode.REQUIRED)
    private LocalDateTime createTime;

    @Schema(description = "商品项")
    private List<Item> items;

    @Schema(description = "收银单项")
    @Data
    public static class Item {

        @Schema(description = "编号", example = "1")
        private Long id;

        @Schema(description = "商品 SPU 编号", example = "1")
        private Long spuId;

        @Schema(description = "商品名字", example = "医用纱布")
        private String spuName;

        @Schema(description = "商品 SKU 编号", example = "1")
        private Long skuId;

        @Schema(description = "规格名字", example = "包装:两片装")
        private String skuName;

        @Schema(description = "商品图片")
        private String picUrl;

        @Schema(description = "单价，单位：分", example = "280")
        private Integer price;

        @Schema(description = "购买件数", example = "2")
        private Integer count;

        @Schema(description = "小计金额，单位：分", example = "560")
        private Integer totalPrice;

        @Schema(description = "赠送件数", example = "1")
        private Integer giftCount;

    }

}
