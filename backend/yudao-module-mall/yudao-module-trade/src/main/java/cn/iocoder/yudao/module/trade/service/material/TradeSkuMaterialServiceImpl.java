package cn.iocoder.yudao.module.trade.service.material;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjectUtil;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.erp.dal.dataobject.stock.ErpStockDO;
import cn.iocoder.yudao.module.erp.dal.dataobject.stock.ErpWarehouseDO;
import cn.iocoder.yudao.module.erp.enums.stock.ErpStockRecordBizTypeEnum;
import cn.iocoder.yudao.module.erp.service.product.ErpProductService;
import cn.iocoder.yudao.module.erp.service.stock.ErpStockRecordService;
import cn.iocoder.yudao.module.erp.service.stock.ErpStockService;
import cn.iocoder.yudao.module.erp.service.stock.ErpWarehouseService;
import cn.iocoder.yudao.module.erp.service.stock.bo.ErpStockRecordCreateReqBO;
import cn.iocoder.yudao.module.product.api.sku.ProductSkuApi;
import cn.iocoder.yudao.module.product.api.sku.dto.ProductSkuRespDTO;
import cn.iocoder.yudao.module.trade.controller.admin.material.vo.TradeSkuMaterialSaveReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.material.TradeSkuMaterialDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderItemDO;
import cn.iocoder.yudao.module.trade.dal.mysql.material.TradeSkuMaterialMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.*;
import static cn.iocoder.yudao.module.trade.enums.ErrorCodeConstants.SKU_MATERIAL_DEFAULT_WAREHOUSE_NOT_EXISTS;
import static cn.iocoder.yudao.module.trade.enums.ErrorCodeConstants.SKU_MATERIAL_SKU_NOT_EXISTS;

/**
 * 商品规格库存物料 Service 实现类
 *
 * 物料库存统一放在 ERP 的【默认仓库】：采购入库、盘点等都在 ERP 里操作，商城下单时从默认仓库扣减
 *
 * @author Aether
 */
@Service
@Validated
@Slf4j
public class TradeSkuMaterialServiceImpl implements TradeSkuMaterialService {

    @Resource
    private TradeSkuMaterialMapper skuMaterialMapper;

    @Resource
    private ProductSkuApi productSkuApi;

    @Resource
    private ErpProductService erpProductService;
    @Resource
    private ErpWarehouseService erpWarehouseService;
    @Resource
    private ErpStockService erpStockService;
    @Resource
    private ErpStockRecordService erpStockRecordService;

    @Override
    public List<TradeSkuMaterialDO> getSkuMaterialListBySpuId(Long spuId) {
        return skuMaterialMapper.selectListBySpuId(spuId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveSkuMaterials(TradeSkuMaterialSaveReqVO saveReqVO) {
        // 1. 校验规格属于该商品、物料存在
        List<ProductSkuRespDTO> skus = productSkuApi.getSkuListBySpuId(Collections.singleton(saveReqVO.getSpuId()));
        Set<Long> skuIds = convertSet(skus, ProductSkuRespDTO::getId);
        saveReqVO.getItems().forEach(item -> {
            if (!skuIds.contains(item.getSkuId())) {
                throw exception(SKU_MATERIAL_SKU_NOT_EXISTS);
            }
        });
        erpProductService.validProductList(convertSet(saveReqVO.getItems(), TradeSkuMaterialSaveReqVO.Item::getErpProductId));

        // 2. 整体覆盖
        List<TradeSkuMaterialDO> oldList = skuMaterialMapper.selectListBySpuId(saveReqVO.getSpuId());
        skuMaterialMapper.deleteBySpuId(saveReqVO.getSpuId());
        List<TradeSkuMaterialDO> newList = convertList(saveReqVO.getItems(), item ->
                BeanUtils.toBean(item, TradeSkuMaterialDO.class).setSpuId(saveReqVO.getSpuId()));
        if (CollUtil.isNotEmpty(newList)) {
            skuMaterialMapper.insertBatch(newList);
        }

        // 3. 重新换算规格库存（取消了物料配置的规格，保留当前库存，交由商品自身维护）
        syncSkuStockBySkuIds(convertSet(newList, TradeSkuMaterialDO::getSkuId));
        log.info("[saveSkuMaterials][spu({}) 物料配置 {} -> {}]", saveReqVO.getSpuId(), oldList.size(), newList.size());
    }

    @Override
    public void deductStockByOrder(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        createStockRecords(order, orderItems, ErpStockRecordBizTypeEnum.MALL_ORDER_OUT, -1);
    }

    @Override
    public void restoreStockByOrder(TradeOrderDO order, List<TradeOrderItemDO> orderItems) {
        createStockRecords(order, orderItems, ErpStockRecordBizTypeEnum.MALL_ORDER_OUT_CANCEL, 1);
    }

    private void createStockRecords(TradeOrderDO order, List<TradeOrderItemDO> orderItems,
                                    ErpStockRecordBizTypeEnum bizType, int sign) {
        if (CollUtil.isEmpty(orderItems)) {
            return;
        }
        Map<Long, List<TradeSkuMaterialDO>> materialMap = convertMultiMap(
                skuMaterialMapper.selectListBySkuIds(convertSet(orderItems, TradeOrderItemDO::getSkuId)),
                TradeSkuMaterialDO::getSkuId);
        if (materialMap.isEmpty()) {
            return;
        }
        Long warehouseId = getDefaultWarehouseId();
        for (TradeOrderItemDO item : orderItems) {
            for (TradeSkuMaterialDO material : materialMap.getOrDefault(item.getSkuId(), Collections.emptyList())) {
                BigDecimal count = material.getQuantity().multiply(BigDecimal.valueOf(item.getCount()))
                        .multiply(BigDecimal.valueOf(sign));
                erpStockRecordService.createStockRecord(new ErpStockRecordCreateReqBO(
                        material.getErpProductId(), warehouseId, count,
                        bizType.getType(), order.getId(), item.getId(), order.getNo()));
            }
        }
    }

    @Override
    public void syncSkuStockByErpProductIds(Collection<Long> erpProductIds) {
        if (CollUtil.isEmpty(erpProductIds)) {
            return;
        }
        Set<Long> skuIds = convertSet(skuMaterialMapper.selectListByErpProductIds(erpProductIds),
                TradeSkuMaterialDO::getSkuId);
        syncSkuStockBySkuIds(skuIds);
    }

    private void syncSkuStockBySkuIds(Set<Long> skuIds) {
        if (CollUtil.isEmpty(skuIds)) {
            return;
        }
        ErpWarehouseDO warehouse = erpWarehouseService.getDefaultWarehouse();
        if (warehouse == null) {
            log.warn("[syncSkuStockBySkuIds][未设置 ERP 默认仓库，跳过规格({}) 库存换算]", skuIds);
            return;
        }
        Map<Long, List<TradeSkuMaterialDO>> materialMap = convertMultiMap(
                skuMaterialMapper.selectListBySkuIds(skuIds), TradeSkuMaterialDO::getSkuId);
        Map<Long, BigDecimal> stockCounts = new HashMap<>();
        Map<Long, Integer> skuStocks = new HashMap<>();
        for (ProductSkuRespDTO sku : productSkuApi.getSkuList(skuIds)) {
            List<TradeSkuMaterialDO> materials = materialMap.get(sku.getId());
            if (CollUtil.isEmpty(materials)) {
                continue;
            }
            int available = Integer.MAX_VALUE;
            for (TradeSkuMaterialDO material : materials) {
                BigDecimal stockCount = stockCounts.computeIfAbsent(material.getErpProductId(), productId -> {
                    ErpStockDO stock = erpStockService.getStock(productId, warehouse.getId());
                    return stock != null && stock.getCount() != null ? stock.getCount() : BigDecimal.ZERO;
                });
                int count = stockCount.signum() <= 0 ? 0
                        : stockCount.divide(material.getQuantity(), 0, RoundingMode.FLOOR).intValue();
                available = Math.min(available, count);
            }
            if (available != ObjectUtil.defaultIfNull(sku.getStock(), 0)) {
                skuStocks.put(sku.getId(), available);
            }
        }
        // 直接设置库存：不能用 updateSkuStock 增量接口，它会同时反向修改销量
        productSkuApi.setSkuStock(skuStocks);
    }

    private Long getDefaultWarehouseId() {
        ErpWarehouseDO warehouse = erpWarehouseService.getDefaultWarehouse();
        if (warehouse == null) {
            throw exception(SKU_MATERIAL_DEFAULT_WAREHOUSE_NOT_EXISTS);
        }
        return warehouse.getId();
    }

}
