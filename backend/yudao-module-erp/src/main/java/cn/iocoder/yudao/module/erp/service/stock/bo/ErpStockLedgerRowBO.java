package cn.iocoder.yudao.module.erp.service.stock.bo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 仓库台账：某个产品在某个仓库的库存变化汇总
 *
 * @author Aether
 */
@Data
public class ErpStockLedgerRowBO {

    /**
     * 产品编号
     */
    private Long productId;
    /**
     * 数量合计（入库为正，出库为负）
     */
    private BigDecimal inCount;
    /**
     * 出库数量合计（负数）
     */
    private BigDecimal outCount;
    /**
     * 当前库存
     */
    private BigDecimal count;

}
