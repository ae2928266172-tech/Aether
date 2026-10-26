package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

import static cn.iocoder.yudao.framework.common.util.date.DateUtils.FORMAT_YEAR_MONTH_DAY_HOUR_MINUTE_SECOND;

@Schema(description = "管理后台 - 商品销售明细查询 Request VO")
@Data
@EqualsAndHashCode(callSuper = true)
public class TradeProductSalesReqVO extends PageParam {

    @Schema(description = "时间范围（线上订单按支付时间，门店收银按收银时间）", requiredMode = Schema.RequiredMode.REQUIRED)
    @DateTimeFormat(pattern = FORMAT_YEAR_MONTH_DAY_HOUR_MINUTE_SECOND)
    @NotNull(message = "请选择时间范围")
    @Size(min = 2, max = 2, message = "请选择时间范围")
    private LocalDateTime[] time;

    @Schema(description = "来源：1 线上订单，2 门店收银", example = "2")
    private Integer source;

    @Schema(description = "商品 SPU 编号", example = "1")
    private Long spuId;

    @Schema(description = "商品 SKU 编号", example = "1")
    private Long skuId;

    @Schema(description = "商品名称关键字", example = "纱布")
    private String keyword;

}
