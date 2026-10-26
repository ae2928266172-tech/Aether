package cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Schema(description = "管理后台 - 仓库台账的一行 Response VO")
@Data
public class ErpStockLedgerRespVO {

    @Schema(description = "产品编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Long productId;

    @Schema(description = "产品名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "医用纱布块")
    private String productName;

    @Schema(description = "条码", example = "69010001")
    private String barCode;

    @Schema(description = "规格", example = "10×10cm")
    private String standard;

    @Schema(description = "分类", example = "护理用品")
    private String categoryName;

    @Schema(description = "单位", example = "包")
    private String unitName;

    @Schema(description = "期初结存", requiredMode = Schema.RequiredMode.REQUIRED, example = "100")
    private BigDecimal openingCount;

    @Schema(description = "本期入库", requiredMode = Schema.RequiredMode.REQUIRED, example = "50")
    private BigDecimal inCount;

    @Schema(description = "本期出库（正数）", requiredMode = Schema.RequiredMode.REQUIRED, example = "30")
    private BigDecimal outCount;

    @Schema(description = "期末结存", requiredMode = Schema.RequiredMode.REQUIRED, example = "120")
    private BigDecimal closingCount;

    @Schema(description = "当前库存", requiredMode = Schema.RequiredMode.REQUIRED, example = "120")
    private BigDecimal currentCount;

}
