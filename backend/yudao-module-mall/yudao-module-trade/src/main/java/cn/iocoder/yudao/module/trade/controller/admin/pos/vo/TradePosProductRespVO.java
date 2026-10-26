package cn.iocoder.yudao.module.trade.controller.admin.pos.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Schema(description = "管理后台 - 门店收银台商品 Response VO")
@Data
public class TradePosProductRespVO {

    @Schema(description = "商品 SPU 编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Long id;

    @Schema(description = "商品名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "医用纱布")
    private String name;

    @Schema(description = "商品图片", example = "https://www.iocoder.cn/1.png")
    private String picUrl;

    @Schema(description = "商品分类（小类）编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "2")
    private Long categoryId;

    @Schema(description = "最低价格，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "280")
    private Integer price;

    @Schema(description = "是否多规格", requiredMode = Schema.RequiredMode.REQUIRED, example = "false")
    private Boolean specType;

    @Schema(description = "顾客端是否可见", example = "true")
    private Boolean customerVisible;

    @Schema(description = "买赠：每买多少件", example = "2")
    private Integer giftBuyCount;

    @Schema(description = "买赠：赠送多少件", example = "1")
    private Integer giftCount;

    @Schema(description = "规格列表")
    private List<Sku> skus;

    @Schema(description = "门店收银台商品规格")
    @Data
    public static class Sku {

        @Schema(description = "SKU 编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        private Long id;

        @Schema(description = "规格名字，例如：包装:两片装", example = "包装:两片装")
        private String name;

        @Schema(description = "价格，单位：分", requiredMode = Schema.RequiredMode.REQUIRED, example = "280")
        private Integer price;

        @Schema(description = "图片", example = "https://www.iocoder.cn/1.png")
        private String picUrl;

        @Schema(description = "条码", example = "6901234567890")
        private String barCode;

        @Schema(description = "是否售罄（门店看不到具体库存，只显示是否售罄）", requiredMode = Schema.RequiredMode.REQUIRED)
        private Boolean soldOut;

    }

}
