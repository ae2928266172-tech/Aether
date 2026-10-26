package cn.iocoder.yudao.module.trade.service.order.handler;

import cn.hutool.core.collection.CollUtil;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderItemDO;
import cn.iocoder.yudao.module.trade.service.material.TradeSkuMaterialService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;

import java.util.List;

import static java.util.Collections.singletonList;

/**
 * 共享库存物料的 {@link TradeOrderHandler} 实现类
 *
 * 下单时按规格的物料配置扣减 ERP 库存，取消订单、订单项售后时退回。
 * 和 {@link TradeProductSkuOrderHandler} 一致：下单即占用库存，未支付超时取消后自动退回。
 *
 * @author Aether
 */
@Component
public class TradeSkuMaterialOrderHandler implements TradeOrderHandler {

    @Resource
    private TradeSkuMaterialService skuMaterialService;

    @Override
    public void afterOrderCreate(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        skuMaterialService.deductStockByOrder(order, orderItems);
    }

    @Override
    public void afterCancelOrder(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        // 售后的订单项，已经在 afterCancelOrderItem 退回库存，所以这里不需要重复退回
        orderItems = filterOrderItemListByNoneAfterSale(orderItems);
        if (CollUtil.isEmpty(orderItems)) {
            return;
        }
        skuMaterialService.restoreStockByOrder(order, orderItems);
    }

    @Override
    public void afterCancelOrderItem(TradeOrderDO order, TradeOrderItemDO orderItem) {
        skuMaterialService.restoreStockByOrder(order, singletonList(orderItem));
    }

}
