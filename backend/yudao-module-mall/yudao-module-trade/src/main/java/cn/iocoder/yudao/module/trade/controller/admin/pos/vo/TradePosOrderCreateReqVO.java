package cn.iocoder.yudao.module.trade.controller.admin.pos.vo;

import cn.iocoder.yudao.framework.common.validation.InEnum;
import cn.iocoder.yudao.module.trade.enums.pos.TradePosPayTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Schema(description = "管理后台 - 门店收银下单 Request VO")
@Data
public class TradePosOrderCreateReqVO {

    @Schema(description = "商品列表", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotEmpty(message = "请先添加商品")
    @Valid
    private List<Item> items;

    @Schema(description = "收款方式", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @NotNull(message = "收款方式不能为空")
    @InEnum(value = TradePosPayTypeEnum.class, message = "收款方式不正确")
    private Integer payType;

    @Schema(description = "实收金额，单位：分。现金收款时必填", example = "5000")
    @Min(value = 0, message = "实收金额不能小于 0")
    private Integer receivedPrice;

    @Schema(description = "备注", example = "3 床家属")
    @Size(max = 255, message = "备注不能超过 255 个字")
    private String remark;

    @Schema(description = "商品项")
    @Data
    public static class Item {

        @Schema(description = "SKU 编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        @NotNull(message = "商品规格不能为空")
        private Long skuId;

        @Schema(description = "购买件数", requiredMode = Schema.RequiredMode.REQUIRED, example = "2")
        @NotNull(message = "购买件数不能为空")
        @Min(value = 1, message = "购买件数必须大于 0")
        private Integer count;

    }

}
