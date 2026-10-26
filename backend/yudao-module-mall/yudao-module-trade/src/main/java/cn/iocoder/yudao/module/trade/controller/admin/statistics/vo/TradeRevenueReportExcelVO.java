package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import org.apache.fesod.sheet.annotation.ExcelProperty;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 营收报表 Excel VO，金额单位：元
 *
 * @author Aether
 */
@Data
public class TradeRevenueReportExcelVO {

    @ExcelProperty("时间")
    private String period;

    @ExcelProperty("线上订单数")
    private Integer onlineOrderCount;

    @ExcelProperty("线上实收（元）")
    private BigDecimal onlinePrice;

    @ExcelProperty("门店收银单数")
    private Integer posOrderCount;

    @ExcelProperty("门店实收（元）")
    private BigDecimal posPrice;

    @ExcelProperty("合计单数")
    private Integer orderCount;

    @ExcelProperty("营业额（元）")
    private BigDecimal totalPrice;

    @ExcelProperty("优惠（元）")
    private BigDecimal discountPrice;

    @ExcelProperty("销售件数")
    private Integer productCount;

    @ExcelProperty("赠送件数")
    private Integer giftCount;

    @ExcelProperty("成本（元）")
    private BigDecimal costPrice;

    @ExcelProperty("毛利（元）")
    private BigDecimal profitPrice;

}
