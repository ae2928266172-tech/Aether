package cn.iocoder.yudao.module.trade.service.order.handler;

import cn.iocoder.yudao.module.product.api.sku.ProductSkuApi;
import cn.iocoder.yudao.module.product.api.sku.dto.ProductSkuRespDTO;
import cn.iocoder.yudao.module.product.api.spu.ProductSpuApi;
import cn.iocoder.yudao.module.product.api.spu.dto.ProductSpuRespDTO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderItemDO;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet;

/**
 * 供应商对账的 {@link TradeOrderHandler} 实现类
 *
 * 下单时把商品的供应商、成本价记录到订单项上，之后商品换供应商、改成本价，也不影响历史对账
 *
 * @author Aether
 */
@Component
public class TradeSupplierOrderHandler implements TradeOrderHandler {

    @Resource
    private ProductSpuApi productSpuApi;
    @Resource
    private ProductSkuApi productSkuApi;

    @Override
    public void beforeOrderCreate(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        Map<Long, ProductSpuRespDTO> spuMap = productSpuApi.getSpuMap(convertSet(orderItems, TradeOrderItemDO::getSpuId));
        Map<Long, ProductSkuRespDTO> skuMap = productSkuApi.getSkuMap(convertSet(orderItems, TradeOrderItemDO::getSkuId));
        orderItems.forEach(item -> {
            ProductSpuRespDTO spu = spuMap.get(item.getSpuId());
            ProductSkuRespDTO sku = skuMap.get(item.getSkuId());
            item.setSupplierId(spu != null ? spu.getSupplierId() : null);
            item.setCostPrice(sku != null ? sku.getCostPrice() : null);
        });
    }

}
