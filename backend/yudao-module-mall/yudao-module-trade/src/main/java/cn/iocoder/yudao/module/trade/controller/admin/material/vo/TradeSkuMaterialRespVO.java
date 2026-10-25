package cn.iocoder.yudao.module.trade.controller.admin.material.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Schema(description = "管理后台 - 商品规格库存物料 Response VO")
@Data
public class TradeSkuMaterialRespVO {

    @Schema(description = "商品 SKU 编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "2048")
    private Long skuId;

    @Schema(description = "库存物料（ERP 产品）编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Long erpProductId;

    @Schema(description = "库存物料名称", example = "一次性尿垫")
    private String erpProductName;

    @Schema(description = "库存物料单位", example = "片")
    private String erpProductUnitName;

    @Schema(description = "每件扣减数量", requiredMode = Schema.RequiredMode.REQUIRED, example = "2")
    private BigDecimal quantity;

    @Schema(description = "物料在默认仓库的库存", example = "100")
    private BigDecimal stockCount;

}
