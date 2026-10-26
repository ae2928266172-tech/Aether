package cn.iocoder.yudao.module.trade.controller.admin.pos.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

import static cn.iocoder.yudao.framework.common.util.date.DateUtils.FORMAT_YEAR_MONTH_DAY_HOUR_MINUTE_SECOND;

@Schema(description = "管理后台 - 门店收银单分页 Request VO")
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class TradePosOrderPageReqVO extends PageParam {

    @Schema(description = "收银单号", example = "P202610260001")
    private String no;

    @Schema(description = "状态", example = "10")
    private Integer status;

    @Schema(description = "收款方式", example = "1")
    private Integer payType;

    @Schema(description = "收银员编号", example = "1")
    private Long cashierId;

    @Schema(description = "收银时间")
    @DateTimeFormat(pattern = FORMAT_YEAR_MONTH_DAY_HOUR_MINUTE_SECOND)
    private LocalDateTime[] createTime;

}
