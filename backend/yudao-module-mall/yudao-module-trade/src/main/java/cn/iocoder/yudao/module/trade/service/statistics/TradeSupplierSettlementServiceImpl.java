package cn.iocoder.yudao.module.trade.service.statistics;

import cn.iocoder.yudao.module.erp.dal.dataobject.purchase.ErpSupplierDO;
import cn.iocoder.yudao.module.erp.service.purchase.ErpSupplierService;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeSupplierSettlementRespVO;
import cn.iocoder.yudao.module.trade.dal.mysql.statistics.TradeSupplierSettlementMapper;
import cn.iocoder.yudao.module.trade.service.statistics.bo.TradeSupplierSettlementRowBO;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;

import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet;

/**
 * 供应商月度对账 Service 实现类
 *
 * @author Aether
 */
@Service
@Validated
public class TradeSupplierSettlementServiceImpl implements TradeSupplierSettlementService {

    private static final String NO_SUPPLIER_NAME = "未设置供应商";

    @Resource
    private TradeSupplierSettlementMapper settlementMapper;
    @Resource
    private ErpSupplierService supplierService;

    @Override
    public List<TradeSupplierSettlementRespVO> getSettlementList(YearMonth month) {
        LocalDateTime beginTime = month.atDay(1).atStartOfDay();
        LocalDateTime endTime = month.plusMonths(1).atDay(1).atStartOfDay();
        List<TradeSupplierSettlementRowBO> onlineRows = settlementMapper.selectOnlineRows(beginTime, endTime);
        List<TradeSupplierSettlementRowBO> posRows = settlementMapper.selectPosRows(beginTime, endTime);

        // 按供应商 + 商品合并线上、门店的数据
        Map<Long, TradeSupplierSettlementRespVO> supplierMap = new LinkedHashMap<>();
        Map<String, TradeSupplierSettlementRespVO.Product> productMap = new HashMap<>();
        onlineRows.forEach(row -> merge(supplierMap, productMap, row, true));
        posRows.forEach(row -> merge(supplierMap, productMap, row, false));

        // 拼接供应商名字，按销售额从高到低
        Set<Long> supplierIds = convertSet(supplierMap.keySet(), id -> id);
        supplierIds.remove(0L);
        Map<Long, ErpSupplierDO> suppliers = supplierIds.isEmpty() ? Collections.emptyMap()
                : supplierService.getSupplierMap(supplierIds);
        List<TradeSupplierSettlementRespVO> list = new ArrayList<>(supplierMap.values());
        list.forEach(vo -> {
            ErpSupplierDO supplier = vo.getSupplierId() != null ? suppliers.get(vo.getSupplierId()) : null;
            vo.setSupplierName(supplier != null ? supplier.getName()
                    : vo.getSupplierId() == null ? NO_SUPPLIER_NAME : "供应商#" + vo.getSupplierId());
            vo.getProducts().sort(Comparator.comparing(TradeSupplierSettlementRespVO.Product::getTotalPrice).reversed());
        });
        list.sort(Comparator.comparing(TradeSupplierSettlementRespVO::getTotalPrice).reversed());
        return list;
    }

    private static void merge(Map<Long, TradeSupplierSettlementRespVO> supplierMap,
                              Map<String, TradeSupplierSettlementRespVO.Product> productMap,
                              TradeSupplierSettlementRowBO row, boolean online) {
        Long supplierKey = row.getSupplierId() != null ? row.getSupplierId() : 0L;
        TradeSupplierSettlementRespVO supplier = supplierMap.computeIfAbsent(supplierKey, key -> {
            TradeSupplierSettlementRespVO vo = new TradeSupplierSettlementRespVO();
            vo.setSupplierId(row.getSupplierId());
            vo.setOnlineCount(0).setOnlinePrice(0).setPosCount(0).setPosPrice(0).setCount(0).setGiftCount(0)
                    .setTotalPrice(0).setCostPrice(0).setGiftCostPrice(0).setProducts(new ArrayList<>());
            return vo;
        });
        TradeSupplierSettlementRespVO.Product product = productMap.computeIfAbsent(supplierKey + "-" + row.getSpuId(), key -> {
            TradeSupplierSettlementRespVO.Product vo = new TradeSupplierSettlementRespVO.Product();
            vo.setSpuId(row.getSpuId()).setSpuName(row.getSpuName()).setOnlineCount(0).setPosCount(0).setCount(0)
                    .setGiftCount(0).setTotalPrice(0).setCostPrice(0).setGiftCostPrice(0);
            supplier.getProducts().add(vo);
            return vo;
        });
        int count = nvl(row.getCount());
        int price = nvl(row.getTotalPrice());
        if (online) {
            supplier.setOnlineCount(supplier.getOnlineCount() + count).setOnlinePrice(supplier.getOnlinePrice() + price);
            product.setOnlineCount(product.getOnlineCount() + count);
        } else {
            supplier.setPosCount(supplier.getPosCount() + count).setPosPrice(supplier.getPosPrice() + price);
            product.setPosCount(product.getPosCount() + count);
        }
        supplier.setCount(supplier.getCount() + count).setGiftCount(supplier.getGiftCount() + nvl(row.getGiftCount()))
                .setTotalPrice(supplier.getTotalPrice() + price)
                .setCostPrice(supplier.getCostPrice() + nvl(row.getCostPrice()))
                .setGiftCostPrice(supplier.getGiftCostPrice() + nvl(row.getGiftCostPrice()));
        product.setCount(product.getCount() + count).setGiftCount(product.getGiftCount() + nvl(row.getGiftCount()))
                .setTotalPrice(product.getTotalPrice() + price)
                .setCostPrice(product.getCostPrice() + nvl(row.getCostPrice()))
                .setGiftCostPrice(product.getGiftCostPrice() + nvl(row.getGiftCostPrice()));
    }

    private static int nvl(Integer value) {
        return value != null ? value : 0;
    }

}
