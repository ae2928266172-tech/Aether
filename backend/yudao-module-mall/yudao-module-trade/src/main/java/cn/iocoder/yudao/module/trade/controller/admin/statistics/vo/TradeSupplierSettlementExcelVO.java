package cn.iocoder.yudao.module.trade.controller.admin.statistics.vo;

import org.apache.fesod.sheet.annotation.ExcelProperty;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 供应商月度对账 Excel VO：每个供应商的每个商品一行，金额单位：元
 *
 * @author Aether
 */
@Data
public class TradeSupplierSettlementExcelVO {

    @ExcelProperty("供应商")
    private String supplierName;

    @ExcelProperty("商品")
    private String spuName;

    @ExcelProperty("病房订单件数")
    private Integer onlineCount;

    @ExcelProperty("门店收银件数")
    private Integer posCount;

    @ExcelProperty("合计销售件数")
    private Integer count;

    @ExcelProperty("赠送件数")
    private Integer giftCount;

    @ExcelProperty("销售额（元）")
    private BigDecimal totalPrice;

    @ExcelProperty("销售成本（元）")
    private BigDecimal costPrice;

    @ExcelProperty("赠品成本（元）")
    private BigDecimal giftCostPrice;

}
