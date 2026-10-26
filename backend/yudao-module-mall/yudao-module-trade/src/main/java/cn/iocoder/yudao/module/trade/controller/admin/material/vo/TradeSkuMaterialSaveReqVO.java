package cn.iocoder.yudao.module.trade.controller.admin.material.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Schema(description = "管理后台 - 商品规格库存物料保存 Request VO")
@Data
public class TradeSkuMaterialSaveReqVO {

    @Schema(description = "商品 SPU 编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1024")
    @NotNull(message = "商品 SPU 编号不能为空")
    private Long spuId;

    @Schema(description = "对应关系列表，为空表示清空该商品的物料配置", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "对应关系列表不能为空")
    @Valid
    private List<Item> items;

    @Data
    public static class Item {

        @Schema(description = "商品 SKU 编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "2048")
        @NotNull(message = "商品 SKU 编号不能为空")
        private Long skuId;

        @Schema(description = "库存物料（ERP 产品）编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        @NotNull(message = "库存物料不能为空")
        private Long erpProductId;

        @Schema(description = "每件扣减数量", requiredMode = Schema.RequiredMode.REQUIRED, example = "2")
        @NotNull(message = "扣减数量不能为空")
        @DecimalMin(value = "0.0001", message = "扣减数量必须大于 0")
        private BigDecimal quantity;

    }

}
