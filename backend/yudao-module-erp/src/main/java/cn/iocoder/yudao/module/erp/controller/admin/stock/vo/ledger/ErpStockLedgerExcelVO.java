package cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger;

import lombok.Data;
import org.apache.fesod.sheet.annotation.ExcelProperty;

import java.math.BigDecimal;

/**
 * 仓库台账 Excel VO
 *
 * @author Aether
 */
@Data
public class ErpStockLedgerExcelVO {

    @ExcelProperty("品名")
    private String productName;

    @ExcelProperty("规格")
    private String standard;

    @ExcelProperty("单位")
    private String unitName;

    @ExcelProperty("分类")
    private String categoryName;

    @ExcelProperty("条码")
    private String barCode;

    @ExcelProperty("期初结存")
    private BigDecimal openingCount;

    @ExcelProperty("本期入库")
    private BigDecimal inCount;

    @ExcelProperty("本期出库")
    private BigDecimal outCount;

    @ExcelProperty("期末结存")
    private BigDecimal closingCount;

}
