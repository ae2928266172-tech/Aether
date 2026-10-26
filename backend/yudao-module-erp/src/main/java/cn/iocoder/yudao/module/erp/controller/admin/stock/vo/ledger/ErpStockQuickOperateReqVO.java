package cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Schema(description = "管理后台 - 仓库快速出入库 Request VO：一步生成单据并审核，库存立即变化")
@Data
public class ErpStockQuickOperateReqVO {

    /**
     * 入库
     */
    public static final String TYPE_IN = "in";
    /**
     * 出库
     */
    public static final String TYPE_OUT = "out";
    /**
     * 调拨（例如说：从中心仓库出库到门店）
     */
    public static final String TYPE_MOVE = "move";

    @Schema(description = "类型：in 入库，out 出库，move 调拨", requiredMode = Schema.RequiredMode.REQUIRED, example = "move")
    @NotBlank(message = "类型不能为空")
    @Pattern(regexp = "in|out|move", message = "类型不正确")
    private String type;

    @Schema(description = "仓库编号（调拨时为调出仓库）", requiredMode = Schema.RequiredMode.REQUIRED, example = "3")
    @NotNull(message = "请选择仓库")
    private Long warehouseId;

    @Schema(description = "调入仓库编号，调拨时必填", example = "1")
    private Long toWarehouseId;

    @Schema(description = "供应商编号，入库时可选", example = "1")
    private Long supplierId;

    @Schema(description = "备注", example = "10 月 26 日门店补货")
    @Size(max = 255, message = "备注不能超过 255 个字")
    private String remark;

    @Schema(description = "产品列表", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotEmpty(message = "请至少填写一个产品的数量")
    @Valid
    private List<Item> items;

    @AssertTrue(message = "调拨时请选择不同的调入仓库")
    public boolean isMoveValid() {
        return !TYPE_MOVE.equals(type) || (toWarehouseId != null && !toWarehouseId.equals(warehouseId));
    }

    @Schema(description = "产品项")
    @Data
    public static class Item {

        @Schema(description = "产品编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        @NotNull(message = "产品不能为空")
        private Long productId;

        @Schema(description = "数量", requiredMode = Schema.RequiredMode.REQUIRED, example = "10")
        @NotNull(message = "数量不能为空")
        @DecimalMin(value = "0.0001", message = "数量必须大于 0")
        private BigDecimal count;

        @Schema(description = "备注")
        private String remark;

    }

}
