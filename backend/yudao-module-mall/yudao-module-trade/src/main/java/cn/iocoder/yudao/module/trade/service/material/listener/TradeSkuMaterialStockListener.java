package cn.iocoder.yudao.module.trade.service.material.listener;

import cn.iocoder.yudao.module.erp.service.stock.event.ErpStockChangeEvent;
import cn.iocoder.yudao.module.trade.service.material.TradeSkuMaterialService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.Collections;

/**
 * 监听 ERP 库存变化，重新换算对应商品规格的库存
 *
 * 在事务提交前执行，保证同一个事务里的其它库存变化（例如说：下单时规格自身的库存扣减）都已经完成，换算结果以物料库存为准
 *
 * @author Aether
 */
@Component
public class TradeSkuMaterialStockListener {

    @Resource
    private TradeSkuMaterialService skuMaterialService;

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    public void onStockChange(ErpStockChangeEvent event) {
        skuMaterialService.syncSkuStockByErpProductIds(Collections.singleton(event.getProductId()));
    }

}
