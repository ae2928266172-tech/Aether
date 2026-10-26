package cn.iocoder.yudao.module.trade.service.order.handler;

import cn.hutool.core.collection.CollUtil;
import cn.iocoder.yudao.module.product.api.spu.ProductSpuApi;
import cn.iocoder.yudao.module.product.api.spu.dto.ProductSpuRespDTO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderItemDO;
import cn.iocoder.yudao.module.trade.service.material.TradeGiftUtils;
import cn.iocoder.yudao.module.trade.service.material.TradeSkuMaterialService;
import cn.iocoder.yudao.module.trade.service.material.bo.TradeGiftStockItemBO;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertList;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet;
import static java.util.Collections.singletonList;

/**
 * 买赠的 {@link TradeOrderHandler} 实现类
 *
 * 下单时按商品的买赠规则计算赠送件数并扣减赠品库存；取消订单、订单项售后时退回
 *
 * @author Aether
 */
@Component
public class TradeGiftOrderHandler implements TradeOrderHandler {

    @Resource
    private ProductSpuApi productSpuApi;
    @Resource
    private TradeSkuMaterialService skuMaterialService;

    @Override
    public void beforeOrderCreate(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        Map<Long, ProductSpuRespDTO> spuMap = productSpuApi.getSpuMap(convertSet(orderItems, TradeOrderItemDO::getSpuId));
        orderItems.forEach(item -> {
            ProductSpuRespDTO spu = spuMap.get(item.getSpuId());
            int giftCount = TradeGiftUtils.calculateGiftCount(spu, item.getCount());
            item.setGiftCount(giftCount);
            item.setGiftStockSource(giftCount > 0 ? spu.getGiftStockSource() : null);
        });
    }

    @Override
    public void afterOrderCreate(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        skuMaterialService.updateGiftStock(order.getId(), order.getNo(), buildGiftItems(orderItems), true);
    }

    @Override
    public void afterCancelOrder(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        // 售后的订单项，已经在 afterCancelOrderItem 退回赠品，所以这里不需要重复退回
        orderItems = filterOrderItemListByNoneAfterSale(orderItems);
        if (CollUtil.isEmpty(orderItems)) {
            return;
        }
        skuMaterialService.updateGiftStock(order.getId(), order.getNo(), buildGiftItems(orderItems), false);
    }

    @Override
    public void afterCancelOrderItem(TradeOrderDO order, TradeOrderItemDO orderItem) {
        skuMaterialService.updateGiftStock(order.getId(), order.getNo(), buildGiftItems(singletonList(orderItem)), false);
    }

    private static List<TradeGiftStockItemBO> buildGiftItems(List<TradeOrderItemDO> orderItems) {
        return convertList(orderItems, item -> new TradeGiftStockItemBO(
                item.getId(), item.getSkuId(), item.getGiftCount(), item.getGiftStockSource()));
    }

}
