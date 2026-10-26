package cn.iocoder.yudao.module.trade.service.pos;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjectUtil;
import cn.hutool.core.util.StrUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.product.api.sku.ProductSkuApi;
import cn.iocoder.yudao.module.product.api.property.dto.ProductPropertyValueDetailRespDTO;
import cn.iocoder.yudao.module.product.api.sku.dto.ProductSkuRespDTO;
import cn.iocoder.yudao.module.product.api.sku.dto.ProductSkuUpdateStockReqDTO;
import cn.iocoder.yudao.module.product.api.spu.ProductSpuApi;
import cn.iocoder.yudao.module.product.api.spu.dto.ProductSpuRespDTO;
import cn.iocoder.yudao.module.product.dal.dataobject.spu.ProductSpuDO;
import cn.iocoder.yudao.module.product.enums.spu.ProductSpuStatusEnum;
import cn.iocoder.yudao.module.product.service.category.ProductCategoryService;
import cn.iocoder.yudao.module.product.service.spu.ProductSpuService;
import cn.iocoder.yudao.module.trade.controller.admin.pos.vo.*;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.pos.TradePosOrderItemDO;
import cn.iocoder.yudao.module.trade.dal.mysql.pos.TradePosOrderItemMapper;
import cn.iocoder.yudao.module.trade.dal.mysql.pos.TradePosOrderMapper;
import cn.iocoder.yudao.module.trade.dal.redis.no.TradeNoRedisDAO;
import cn.iocoder.yudao.module.trade.enums.pos.TradePosOrderStatusEnum;
import cn.iocoder.yudao.module.trade.enums.pos.TradePosPayTypeEnum;
import cn.iocoder.yudao.module.trade.service.material.TradeGiftUtils;
import cn.iocoder.yudao.module.trade.service.material.TradeSkuMaterialService;
import cn.iocoder.yudao.module.trade.service.material.bo.TradeGiftStockItemBO;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.*;
import static cn.iocoder.yudao.module.trade.enums.ErrorCodeConstants.*;

/**
 * 门店收银 Service 实现类
 *
 * 和线上订单共用库存：收银时扣减规格库存（计入销量）、按物料配置扣减 ERP 默认仓库，买赠的赠品按商品设置扣减；
 * 作废时全部退回。门店专售（顾客端不可见）的商品只能在这里卖，起订量只限制顾客端
 *
 * @author Aether
 */
@Service
@Validated
@Slf4j
public class TradePosServiceImpl implements TradePosService {

    @Resource
    private TradePosOrderMapper posOrderMapper;
    @Resource
    private TradePosOrderItemMapper posOrderItemMapper;
    @Resource
    private TradeNoRedisDAO tradeNoRedisDAO;

    @Resource
    private ProductSpuService productSpuService;
    @Resource
    private ProductCategoryService productCategoryService;
    @Resource
    private ProductSpuApi productSpuApi;
    @Resource
    private ProductSkuApi productSkuApi;
    @Resource
    private TradeSkuMaterialService skuMaterialService;

    @Override
    public List<TradePosProductRespVO> getProductList() {
        List<ProductSpuDO> spus = productSpuService.getSpuListByStatus(ProductSpuStatusEnum.ENABLE.getStatus());
        if (CollUtil.isEmpty(spus)) {
            return Collections.emptyList();
        }
        Map<Long, List<ProductSkuRespDTO>> skuMap = convertMultiMap(
                productSkuApi.getSkuListBySpuId(convertSet(spus, ProductSpuDO::getId)), ProductSkuRespDTO::getSpuId);
        return convertList(spus, spu -> {
            TradePosProductRespVO product = BeanUtils.toBean(spu, TradePosProductRespVO.class);
            product.setSkus(convertList(skuMap.getOrDefault(spu.getId(), Collections.emptyList()), sku -> {
                TradePosProductRespVO.Sku skuVO = BeanUtils.toBean(sku, TradePosProductRespVO.Sku.class);
                skuVO.setName(buildSkuName(sku));
                skuVO.setPicUrl(StrUtil.blankToDefault(sku.getPicUrl(), spu.getPicUrl()));
                skuVO.setSoldOut(ObjectUtil.defaultIfNull(sku.getStock(), 0) <= 0);
                return skuVO;
            }));
            return product;
        });
    }

    @Override
    public List<TradePosCategoryRespVO> getCategoryList() {
        return BeanUtils.toBean(productCategoryService.getEnableCategoryList(), TradePosCategoryRespVO.class);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public TradePosOrderDO createOrder(Long cashierId, String cashierName, TradePosOrderCreateReqVO createReqVO) {
        // 1.1 合并相同规格，校验规格、商品
        Map<Long, Integer> skuCounts = new LinkedHashMap<>();
        createReqVO.getItems().forEach(item -> skuCounts.merge(item.getSkuId(), item.getCount(), Integer::sum));
        Map<Long, ProductSkuRespDTO> skuMap = productSkuApi.getSkuMap(skuCounts.keySet());
        if (skuMap.size() != skuCounts.size()) {
            throw exception(POS_ORDER_SKU_NOT_EXISTS);
        }
        Map<Long, ProductSpuRespDTO> spuMap = productSpuApi.getSpuMap(
                convertSet(skuMap.values(), ProductSkuRespDTO::getSpuId));
        skuMap.values().forEach(sku -> {
            ProductSpuRespDTO spu = spuMap.get(sku.getSpuId());
            if (spu == null) {
                throw exception(POS_ORDER_SKU_NOT_EXISTS);
            }
            if (!ProductSpuStatusEnum.isEnable(spu.getStatus())) {
                throw exception(POS_ORDER_SPU_NOT_ENABLE, spu.getName());
            }
        });
        // 1.2 构建收银单项
        List<TradePosOrderItemDO> items = new ArrayList<>();
        skuCounts.forEach((skuId, count) -> {
            ProductSkuRespDTO sku = skuMap.get(skuId);
            ProductSpuRespDTO spu = spuMap.get(sku.getSpuId());
            int giftCount = TradeGiftUtils.calculateGiftCount(spu, count);
            items.add(TradePosOrderItemDO.builder().spuId(spu.getId()).spuName(spu.getName())
                    .skuId(skuId).skuName(buildSkuName(sku))
                    .picUrl(StrUtil.blankToDefault(sku.getPicUrl(), spu.getPicUrl()))
                    .price(sku.getPrice()).count(count).totalPrice(sku.getPrice() * count)
                    .giftCount(giftCount).giftStockSource(giftCount > 0 ? spu.getGiftStockSource() : null)
                    .supplierId(spu.getSupplierId()).costPrice(sku.getCostPrice()).build());
        });
        // 1.3 计算金额、找零
        int totalPrice = getSumValue(items, TradePosOrderItemDO::getTotalPrice, Integer::sum);
        int receivedPrice = totalPrice;
        if (TradePosPayTypeEnum.isCash(createReqVO.getPayType()) && createReqVO.getReceivedPrice() != null) {
            receivedPrice = createReqVO.getReceivedPrice();
            if (receivedPrice < totalPrice) {
                throw exception(POS_ORDER_RECEIVED_PRICE_NOT_ENOUGH);
            }
        }

        // 2. 保存收银单
        TradePosOrderDO order = TradePosOrderDO.builder()
                .no(tradeNoRedisDAO.generate(TradeNoRedisDAO.POS_ORDER_NO_PREFIX))
                .status(TradePosOrderStatusEnum.COMPLETED.getStatus())
                .productCount(getSumValue(items, TradePosOrderItemDO::getCount, Integer::sum))
                .totalPrice(totalPrice).payType(createReqVO.getPayType())
                .receivedPrice(receivedPrice).changePrice(receivedPrice - totalPrice)
                .cashierId(cashierId).cashierName(cashierName).remark(createReqVO.getRemark()).build();
        posOrderMapper.insert(order);
        items.forEach(item -> item.setOrderId(order.getId()));
        posOrderItemMapper.insertBatch(items);

        // 3. 扣减库存：规格库存（不足会报错，计入销量）、ERP 物料、赠品
        productSkuApi.updateSkuStock(new ProductSkuUpdateStockReqDTO(convertList(items, item ->
                new ProductSkuUpdateStockReqDTO.Item().setId(item.getSkuId()).setIncrCount(-item.getCount()))));
        skuMaterialService.deductStockByPosOrder(order, items);
        skuMaterialService.updateGiftStock(order.getId(), order.getNo(), buildGiftItems(items), true);
        log.info("[createOrder][收银员({}) 收银单({}) 金额({})]", cashierId, order.getNo(), totalPrice);
        return order;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelOrder(TradePosOrderCancelReqVO cancelReqVO) {
        // 1. 校验状态，并作废
        TradePosOrderDO order = validateOrderExists(cancelReqVO.getId());
        int updateCount = posOrderMapper.updateByIdAndStatus(order.getId(), TradePosOrderStatusEnum.COMPLETED.getStatus(),
                new TradePosOrderDO().setStatus(TradePosOrderStatusEnum.CANCELED.getStatus())
                        .setCancelTime(LocalDateTime.now()).setCancelReason(cancelReqVO.getReason()));
        if (updateCount == 0) {
            throw exception(POS_ORDER_CANCEL_FAIL_STATUS_NOT_COMPLETED);
        }

        // 2. 退回库存
        List<TradePosOrderItemDO> items = posOrderItemMapper.selectListByOrderId(order.getId());
        productSkuApi.updateSkuStock(new ProductSkuUpdateStockReqDTO(convertList(items, item ->
                new ProductSkuUpdateStockReqDTO.Item().setId(item.getSkuId()).setIncrCount(item.getCount()))));
        skuMaterialService.restoreStockByPosOrder(order, items);
        skuMaterialService.updateGiftStock(order.getId(), order.getNo(), buildGiftItems(items), false);
    }

    private TradePosOrderDO validateOrderExists(Long id) {
        TradePosOrderDO order = posOrderMapper.selectById(id);
        if (order == null) {
            throw exception(POS_ORDER_NOT_EXISTS);
        }
        return order;
    }

    @Override
    public TradePosOrderDO getOrder(Long id) {
        return posOrderMapper.selectById(id);
    }

    @Override
    public PageResult<TradePosOrderDO> getOrderPage(TradePosOrderPageReqVO pageReqVO) {
        return posOrderMapper.selectPage(pageReqVO);
    }

    @Override
    public List<TradePosOrderItemDO> getOrderItemListByOrderIds(Collection<Long> orderIds) {
        if (CollUtil.isEmpty(orderIds)) {
            return Collections.emptyList();
        }
        return posOrderItemMapper.selectListByOrderIds(orderIds);
    }

    @Override
    public TradePosSummaryRespVO getSummary(Long cashierId, LocalDateTime beginTime, LocalDateTime endTime) {
        List<TradePosOrderDO> orders = posOrderMapper.selectListByCreateTime(cashierId, beginTime, endTime);
        List<TradePosOrderDO> completed = filterList(orders,
                order -> TradePosOrderStatusEnum.COMPLETED.getStatus().equals(order.getStatus()));
        TradePosSummaryRespVO summary = new TradePosSummaryRespVO();
        summary.setOrderCount(completed.size());
        summary.setTotalPrice(completed.stream().mapToInt(TradePosOrderDO::getTotalPrice).sum());
        summary.setCancelCount(orders.size() - completed.size());
        Map<Integer, List<TradePosOrderDO>> payTypeMap = convertMultiMap(completed, TradePosOrderDO::getPayType);
        summary.setPayTypes(Arrays.stream(TradePosPayTypeEnum.values()).map(payType -> {
            List<TradePosOrderDO> list = payTypeMap.getOrDefault(payType.getType(), Collections.emptyList());
            return new TradePosSummaryRespVO.PayTypeSummary(payType.getType(), list.size(),
                    list.stream().mapToInt(TradePosOrderDO::getTotalPrice).sum());
        }).collect(Collectors.toList()));
        return summary;
    }

    /**
     * 规格名称，例如“10 片装”“L / 白色”；单规格商品的默认属性（编号 0）不显示
     */
    private static String buildSkuName(ProductSkuRespDTO sku) {
        if (CollUtil.isEmpty(sku.getProperties())) {
            return null;
        }
        String name = sku.getProperties().stream().filter(p -> p.getPropertyId() != null && p.getPropertyId() != 0L)
                .map(ProductPropertyValueDetailRespDTO::getValueName).collect(Collectors.joining(" / "));
        return name.isEmpty() ? null : name;
    }

    private static List<TradeGiftStockItemBO> buildGiftItems(List<TradePosOrderItemDO> items) {
        return convertList(items, item -> new TradeGiftStockItemBO(
                item.getId(), item.getSkuId(), item.getGiftCount(), item.getGiftStockSource()));
    }

}
