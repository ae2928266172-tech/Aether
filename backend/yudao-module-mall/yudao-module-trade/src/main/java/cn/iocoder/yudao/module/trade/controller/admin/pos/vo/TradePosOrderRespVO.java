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

    @Schema(description = "商品金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "1000")
    private Integer totalPrice;

    @Schema(description = "整单折扣，百分比", example = "90")
    private Integer discountRate;

    @Schema(description = "是否手动修改了收款金额", example = "false")
    private Boolean priceAdjusted;

    @Schema(description = "优惠金额，单位：分", example = "100")
    private Integer discountPrice;

    @Schema(description = "应收金额（打折、改价后），单位：分", example = "900")
    private Integer payPrice;

    @Schema(description = "收款方式", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Integer payType;

    @Schema(description = "顾客付的金额，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "2000")
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

        @Schema(description = "分摊优惠后的金额，单位：分", example = "500")
        private Integer payPrice;

        @Schema(description = "赠送件数", example = "1")
        private Integer giftCount;

        @Schema(description = "医疗器械注册证号 / 备案凭证号")
        private String registrationNo;

        @Schema(description = "生产许可证号 / 生产备案凭证号")
        private String productionLicenseNo;

        @Schema(description = "注册人 / 备案人")
        private String registrant;

        @Schema(description = "生产地址")
        private String productionAddress;

    }

}
