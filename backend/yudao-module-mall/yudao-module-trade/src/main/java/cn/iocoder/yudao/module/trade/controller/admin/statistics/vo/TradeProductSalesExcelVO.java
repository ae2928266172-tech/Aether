package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import lombok.Data;
import org.apache.fesod.sheet.annotation.ExcelProperty;

import java.math.BigDecimal;

/**
 * 商品销售明细 Excel VO，金额单位：元
 *
 * @author Aether
 */
@Data
public class TradeProductSalesExcelVO {

    @ExcelProperty("时间")
    private String time;

    @ExcelProperty("来源")
    private String source;

    @ExcelProperty("单号")
    private String orderNo;

    @ExcelProperty("商品")
    private String spuName;

    @ExcelProperty("规格")
    private String skuName;

    @ExcelProperty("数量")
    private Integer count;

    @ExcelProperty("赠送")
    private Integer giftCount;

    @ExcelProperty("金额（元）")
    private BigDecimal price;

    @ExcelProperty("配送地址 / 收银员")
    private String place;

}
