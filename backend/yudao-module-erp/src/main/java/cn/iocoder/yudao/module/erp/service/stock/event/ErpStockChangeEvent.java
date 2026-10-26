package cn.iocoder.yudao.module.erp.service.stock.event;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

/**
 * ERP 产品库存变化事件
 *
 * 每次写入库存明细（采购入库、销售出库、盘点、商城订单等）后发布
 *
 * @author Aether
 */
@Getter
public class ErpStockChangeEvent extends ApplicationEvent {

    /**
     * 产品编号
     */
    private final Long productId;
    /**
     * 仓库编号
     */
    private final Long warehouseId;

    public ErpStockChangeEvent(Object source, Long productId, Long warehouseId) {
        super(source);
        this.productId = productId;
        this.warehouseId = warehouseId;
    }

}
