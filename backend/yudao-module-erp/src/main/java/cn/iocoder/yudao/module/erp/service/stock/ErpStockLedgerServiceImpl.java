package cn.iocoder.yudao.module.erp.service.stock;

import cn.hutool.core.util.StrUtil;
import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.module.erp.controller.admin.product.vo.product.ErpProductRespVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.in.ErpStockInSaveReqVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger.ErpStockLedgerRespVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger.ErpStockQuickOperateReqVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.move.ErpStockMoveSaveReqVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.out.ErpStockOutSaveReqVO;
import cn.iocoder.yudao.module.erp.dal.dataobject.stock.ErpStockDO;
import cn.iocoder.yudao.module.erp.dal.mysql.stock.ErpStockLedgerMapper;
import cn.iocoder.yudao.module.erp.dal.mysql.stock.ErpStockMapper;
import cn.iocoder.yudao.module.erp.enums.ErpAuditStatus;
import cn.iocoder.yudao.module.erp.service.product.ErpProductService;
import cn.iocoder.yudao.module.erp.service.stock.bo.ErpStockLedgerRowBO;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;

import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.*;

/**
 * 仓库台账 Service 实现类
 *
 * 期末结存 = 当前库存 - 结束日期之后的库存变化；期初结存 = 期末结存 - 本期入库 - 本期出库（出库为负数）
 *
 * @author Aether
 */
@Service
@Validated
public class ErpStockLedgerServiceImpl implements ErpStockLedgerService {

    @Resource
    private ErpStockLedgerMapper ledgerMapper;
    @Resource
    private ErpStockMapper stockMapper;
    @Resource
    private ErpProductService productService;
    @Resource
    private ErpWarehouseService warehouseService;
    @Resource
    private ErpStockInService stockInService;
    @Resource
    private ErpStockOutService stockOutService;
    @Resource
    private ErpStockMoveService stockMoveService;

    @Override
    public List<ErpStockLedgerRespVO> getLedger(Long warehouseId, LocalDate beginDate, LocalDate endDate, String keyword) {
        warehouseService.validWarehouseList(Collections.singleton(warehouseId));
        LocalDateTime beginTime = beginDate.atStartOfDay();
        LocalDateTime endTime = endDate.plusDays(1).atStartOfDay();
        Map<Long, ErpStockLedgerRowBO> rangeMap = convertMap(
                ledgerMapper.selectRangeRows(warehouseId, beginTime, endTime), ErpStockLedgerRowBO::getProductId);
        Map<Long, ErpStockLedgerRowBO> afterMap = convertMap(
                ledgerMapper.selectRowsAfter(warehouseId, endTime), ErpStockLedgerRowBO::getProductId);
        Map<Long, BigDecimal> stockMap = new HashMap<>();
        stockMapper.selectList(ErpStockDO::getWarehouseId, warehouseId)
                .forEach(stock -> stockMap.put(stock.getProductId(), stock.getCount()));

        List<ErpProductRespVO> products = productService.getProductVOListByStatus(CommonStatusEnum.ENABLE.getStatus());
        String word = StrUtil.trimToNull(keyword);
        List<ErpStockLedgerRespVO> list = new ArrayList<>();
        for (ErpProductRespVO product : products) {
            if (word != null && !StrUtil.containsIgnoreCase(product.getName(), word)
                    && !StrUtil.containsIgnoreCase(product.getBarCode(), word)) {
                continue;
            }
            ErpStockLedgerRowBO range = rangeMap.get(product.getId());
            ErpStockLedgerRowBO after = afterMap.get(product.getId());
            BigDecimal current = nvl(stockMap.get(product.getId()));
            BigDecimal inCount = range != null ? nvl(range.getInCount()) : BigDecimal.ZERO;
            BigDecimal outCount = range != null ? nvl(range.getOutCount()) : BigDecimal.ZERO;
            BigDecimal closing = current.subtract(after != null ? nvl(after.getCount()) : BigDecimal.ZERO);
            BigDecimal opening = closing.subtract(inCount).subtract(outCount);
            ErpStockLedgerRespVO row = new ErpStockLedgerRespVO();
            row.setProductId(product.getId()).setProductName(product.getName()).setBarCode(product.getBarCode())
                    .setStandard(product.getStandard()).setCategoryName(product.getCategoryName())
                    .setUnitName(product.getUnitName()).setOpeningCount(strip(opening)).setInCount(strip(inCount))
                    .setOutCount(strip(outCount.negate())).setClosingCount(strip(closing)).setCurrentCount(strip(current));
            list.add(row);
        }
        list.sort(Comparator.comparing(ErpStockLedgerRespVO::getCategoryName, Comparator.nullsLast(String::compareTo))
                .thenComparing(ErpStockLedgerRespVO::getProductName));
        return list;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long quickOperate(ErpStockQuickOperateReqVO reqVO) {
        LocalDateTime now = LocalDateTime.now();
        // 单价取产品的采购价，便于看库存金额；没有设置时为 0
        Map<Long, ErpProductRespVO> productMap = productService.getProductVOMap(
                convertSet(reqVO.getItems(), ErpStockQuickOperateReqVO.Item::getProductId));
        Function<Long, BigDecimal> priceOf = productId -> {
            ErpProductRespVO product = productMap.get(productId);
            return product != null && product.getPurchasePrice() != null ? product.getPurchasePrice() : BigDecimal.ZERO;
        };
        switch (reqVO.getType()) {
            case ErpStockQuickOperateReqVO.TYPE_IN: {
                ErpStockInSaveReqVO in = new ErpStockInSaveReqVO();
                in.setSupplierId(reqVO.getSupplierId()).setInTime(now).setRemark(reqVO.getRemark())
                        .setItems(convertList(reqVO.getItems(), item -> new ErpStockInSaveReqVO.Item()
                                .setWarehouseId(reqVO.getWarehouseId()).setProductId(item.getProductId())
                                .setProductPrice(priceOf.apply(item.getProductId()))
                                .setCount(item.getCount()).setRemark(item.getRemark())));
                Long id = stockInService.createStockIn(in);
                stockInService.updateStockInStatus(id, ErpAuditStatus.APPROVE.getStatus());
                return id;
            }
            case ErpStockQuickOperateReqVO.TYPE_OUT: {
                ErpStockOutSaveReqVO out = new ErpStockOutSaveReqVO();
                out.setOutTime(now).setRemark(reqVO.getRemark())
                        .setItems(convertList(reqVO.getItems(), item -> new ErpStockOutSaveReqVO.Item()
                                .setWarehouseId(reqVO.getWarehouseId()).setProductId(item.getProductId())
                                .setProductPrice(priceOf.apply(item.getProductId()))
                                .setCount(item.getCount()).setRemark(item.getRemark())));
                Long id = stockOutService.createStockOut(out);
                stockOutService.updateStockOutStatus(id, ErpAuditStatus.APPROVE.getStatus());
                return id;
            }
            default: {
                ErpStockMoveSaveReqVO move = new ErpStockMoveSaveReqVO();
                move.setMoveTime(now).setRemark(reqVO.getRemark())
                        .setItems(convertList(reqVO.getItems(), item -> new ErpStockMoveSaveReqVO.Item()
                                .setFromWarehouseId(reqVO.getWarehouseId()).setToWarehouseId(reqVO.getToWarehouseId())
                                .setProductId(item.getProductId()).setProductPrice(priceOf.apply(item.getProductId()))
                                .setCount(item.getCount()).setRemark(item.getRemark())));
                Long id = stockMoveService.createStockMove(move);
                stockMoveService.updateStockMoveStatus(id, ErpAuditStatus.APPROVE.getStatus());
                return id;
            }
        }
    }

    private static BigDecimal nvl(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    /**
     * 去掉小数点后多余的 0，例如 10.0000 显示为 10
     */
    private static BigDecimal strip(BigDecimal value) {
        BigDecimal result = value.stripTrailingZeros();
        return result.scale() < 0 ? result.setScale(0) : result;
    }

}
