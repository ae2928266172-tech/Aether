package cn.iocoder.yudao.module.trade.service.statistics;

import cn.hutool.core.util.StrUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeProductSalesReqVO;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeProductSalesRespVO;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeProductSalesSummaryRespVO;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeRevenueReportRespVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.order.TradeOrderItemDO;
import cn.iocoder.yudao.module.trade.dal.mysql.statistics.TradeReportMapper;
import cn.iocoder.yudao.module.trade.service.statistics.bo.TradeProductSalesBO;
import cn.iocoder.yudao.module.trade.service.statistics.bo.TradeReportDayBO;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertList;

/**
 * 营收报表、商品销售明细 Service 实现类
 *
 * @author Aether
 */
@Service
@Validated
public class TradeReportServiceImpl implements TradeReportService {

    /**
     * 来源：线上订单
     */
    public static final int SOURCE_ONLINE = 1;
    /**
     * 来源：门店收银
     */
    public static final int SOURCE_POS = 2;

    private static final DateTimeFormatter MONTH_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM");

    @Resource
    private TradeReportMapper reportMapper;

    @Override
    public List<TradeRevenueReportRespVO> getRevenueReport(LocalDate beginDate, LocalDate endDate, String period) {
        LocalDateTime beginTime = beginDate.atStartOfDay();
        LocalDateTime endTime = endDate.plusDays(1).atStartOfDay();
        Map<LocalDate, TradeReportDayBO> onlineOrders = toDayMap(reportMapper.selectOnlineOrderDays(beginTime, endTime));
        Map<LocalDate, TradeReportDayBO> onlineItems = toDayMap(reportMapper.selectOnlineItemDays(beginTime, endTime));
        Map<LocalDate, TradeReportDayBO> posOrders = toDayMap(reportMapper.selectPosOrderDays(beginTime, endTime));
        Map<LocalDate, TradeReportDayBO> posItems = toDayMap(reportMapper.selectPosItemDays(beginTime, endTime));

        // 按时间段累加每一天，没有销售的时间段也输出一行 0，方便看出哪天没有营业
        Map<LocalDate, TradeRevenueReportRespVO> rows = new LinkedHashMap<>();
        for (LocalDate day = beginDate; !day.isAfter(endDate); day = day.plusDays(1)) {
            LocalDate periodBegin = getPeriodBegin(day, period);
            LocalDate finalDay = day;
            TradeRevenueReportRespVO row = rows.computeIfAbsent(periodBegin, key -> newRow(
                    key.isBefore(beginDate) ? beginDate : key, getPeriodEnd(finalDay, period, endDate), period));
            add(row, onlineOrders.get(day), onlineItems.get(day), posOrders.get(day), posItems.get(day));
        }
        List<TradeRevenueReportRespVO> result = new ArrayList<>(rows.values());
        // 合计行
        TradeRevenueReportRespVO total = newRow(beginDate, endDate, null);
        total.setPeriod("合计");
        result.forEach(row -> sum(total, row));
        result.add(total);
        return result;
    }

    private static LocalDate getPeriodBegin(LocalDate day, String period) {
        if (PERIOD_WEEK.equals(period)) {
            return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        }
        if (PERIOD_MONTH.equals(period)) {
            return day.withDayOfMonth(1);
        }
        return day;
    }

    private static LocalDate getPeriodEnd(LocalDate day, String period, LocalDate endDate) {
        LocalDate end = day;
        if (PERIOD_WEEK.equals(period)) {
            end = day.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        } else if (PERIOD_MONTH.equals(period)) {
            end = day.with(TemporalAdjusters.lastDayOfMonth());
        }
        return end.isAfter(endDate) ? endDate : end;
    }

    private static TradeRevenueReportRespVO newRow(LocalDate beginDate, LocalDate endDate, String period) {
        TradeRevenueReportRespVO row = new TradeRevenueReportRespVO();
        row.setBeginDate(beginDate).setEndDate(endDate);
        if (PERIOD_MONTH.equals(period)) {
            row.setPeriod(beginDate.format(MONTH_FORMATTER));
        } else if (PERIOD_WEEK.equals(period)) {
            row.setPeriod(beginDate + " ~ " + endDate);
        } else {
            row.setPeriod(beginDate.toString());
        }
        row.setOnlineOrderCount(0).setOnlinePrice(0).setPosOrderCount(0).setPosPrice(0).setOrderCount(0)
                .setTotalPrice(0).setDiscountPrice(0).setProductCount(0).setGiftCount(0).setCostPrice(0)
                .setProfitPrice(0);
        return row;
    }

    private static void add(TradeRevenueReportRespVO row, TradeReportDayBO onlineOrder, TradeReportDayBO onlineItem,
                            TradeReportDayBO posOrder, TradeReportDayBO posItem) {
        int onlineCount = onlineOrder != null ? nvl(onlineOrder.getOrderCount()) : 0;
        int onlinePrice = onlineOrder != null ? nvl(onlineOrder.getPrice()) : 0;
        int posCount = posOrder != null ? nvl(posOrder.getOrderCount()) : 0;
        int posPrice = posOrder != null ? nvl(posOrder.getPrice()) : 0;
        int discount = (onlineOrder != null ? nvl(onlineOrder.getDiscountPrice()) : 0)
                + (posOrder != null ? nvl(posOrder.getDiscountPrice()) : 0);
        int productCount = (onlineItem != null ? nvl(onlineItem.getProductCount()) : 0)
                + (posOrder != null ? nvl(posOrder.getProductCount()) : 0);
        int giftCount = (onlineItem != null ? nvl(onlineItem.getGiftCount()) : 0)
                + (posItem != null ? nvl(posItem.getGiftCount()) : 0);
        int cost = (onlineItem != null ? nvl(onlineItem.getCostPrice()) : 0)
                + (posItem != null ? nvl(posItem.getCostPrice()) : 0);
        row.setOnlineOrderCount(row.getOnlineOrderCount() + onlineCount)
                .setOnlinePrice(row.getOnlinePrice() + onlinePrice)
                .setPosOrderCount(row.getPosOrderCount() + posCount).setPosPrice(row.getPosPrice() + posPrice)
                .setOrderCount(row.getOrderCount() + onlineCount + posCount)
                .setTotalPrice(row.getTotalPrice() + onlinePrice + posPrice)
                .setDiscountPrice(row.getDiscountPrice() + discount)
                .setProductCount(row.getProductCount() + productCount).setGiftCount(row.getGiftCount() + giftCount)
                .setCostPrice(row.getCostPrice() + cost)
                .setProfitPrice(row.getProfitPrice() + onlinePrice + posPrice - cost);
    }

    private static void sum(TradeRevenueReportRespVO total, TradeRevenueReportRespVO row) {
        total.setOnlineOrderCount(total.getOnlineOrderCount() + row.getOnlineOrderCount())
                .setOnlinePrice(total.getOnlinePrice() + row.getOnlinePrice())
                .setPosOrderCount(total.getPosOrderCount() + row.getPosOrderCount())
                .setPosPrice(total.getPosPrice() + row.getPosPrice())
                .setOrderCount(total.getOrderCount() + row.getOrderCount())
                .setTotalPrice(total.getTotalPrice() + row.getTotalPrice())
                .setDiscountPrice(total.getDiscountPrice() + row.getDiscountPrice())
                .setProductCount(total.getProductCount() + row.getProductCount())
                .setGiftCount(total.getGiftCount() + row.getGiftCount())
                .setCostPrice(total.getCostPrice() + row.getCostPrice())
                .setProfitPrice(total.getProfitPrice() + row.getProfitPrice());
    }

    private static Map<LocalDate, TradeReportDayBO> toDayMap(List<TradeReportDayBO> list) {
        return list.stream().filter(bo -> bo.getDay() != null)
                .collect(Collectors.toMap(TradeReportDayBO::getDay, Function.identity(), (a, b) -> a));
    }

    @Override
    public PageResult<TradeProductSalesRespVO> getProductSalesPage(TradeProductSalesReqVO reqVO) {
        LocalDateTime[] range = getTimeRange(reqVO);
        Long total = reportMapper.selectProductSalesCount(range[0], range[1], reqVO.getSource(), reqVO.getSpuId(),
                reqVO.getSkuId(), StrUtil.trimToNull(reqVO.getKeyword()));
        if (total == null || total == 0) {
            return PageResult.empty();
        }
        int offset = (reqVO.getPageNo() - 1) * reqVO.getPageSize();
        List<TradeProductSalesBO> list = reportMapper.selectProductSalesList(range[0], range[1], reqVO.getSource(),
                reqVO.getSpuId(), reqVO.getSkuId(), StrUtil.trimToNull(reqVO.getKeyword()), offset, reqVO.getPageSize());
        return new PageResult<>(convertList(list, TradeReportServiceImpl::convert), total);
    }

    @Override
    public List<TradeProductSalesRespVO> getProductSalesList(TradeProductSalesReqVO reqVO) {
        LocalDateTime[] range = getTimeRange(reqVO);
        List<TradeProductSalesBO> list = reportMapper.selectProductSalesList(range[0], range[1], reqVO.getSource(),
                reqVO.getSpuId(), reqVO.getSkuId(), StrUtil.trimToNull(reqVO.getKeyword()), null, null);
        return convertList(list, TradeReportServiceImpl::convert);
    }

    @Override
    public List<TradeProductSalesSummaryRespVO> getProductSalesSummary(TradeProductSalesReqVO reqVO) {
        Map<Long, TradeProductSalesSummaryRespVO> summaryMap = new LinkedHashMap<>();
        Map<Long, Set<String>> orderKeys = new HashMap<>();
        getProductSalesList(reqVO).forEach(row -> {
            TradeProductSalesSummaryRespVO summary = summaryMap.computeIfAbsent(row.getSkuId(), key -> {
                TradeProductSalesSummaryRespVO vo = new TradeProductSalesSummaryRespVO();
                vo.setSpuId(row.getSpuId()).setSpuName(row.getSpuName()).setSkuId(row.getSkuId())
                        .setSkuName(row.getSkuName()).setOnlineCount(0).setPosCount(0).setCount(0).setGiftCount(0)
                        .setOrderCount(0).setPrice(0);
                return vo;
            });
            int count = nvl(row.getCount());
            if (row.getSource() == SOURCE_ONLINE) {
                summary.setOnlineCount(summary.getOnlineCount() + count);
            } else {
                summary.setPosCount(summary.getPosCount() + count);
            }
            summary.setCount(summary.getCount() + count).setGiftCount(summary.getGiftCount() + nvl(row.getGiftCount()))
                    .setPrice(summary.getPrice() + nvl(row.getPrice()));
            if (orderKeys.computeIfAbsent(row.getSkuId(), key -> new HashSet<>())
                    .add(row.getSource() + "-" + row.getOrderId())) {
                summary.setOrderCount(summary.getOrderCount() + 1);
            }
        });
        List<TradeProductSalesSummaryRespVO> list = new ArrayList<>(summaryMap.values());
        list.sort(Comparator.comparing(TradeProductSalesSummaryRespVO::getCount).reversed());
        return list;
    }

    /**
     * 时间范围：前端传的结束时间是 23:59:59，查询时用开区间，所以加 1 秒
     */
    private static LocalDateTime[] getTimeRange(TradeProductSalesReqVO reqVO) {
        return new LocalDateTime[]{reqVO.getTime()[0], reqVO.getTime()[1].plusSeconds(1)};
    }

    private static TradeProductSalesRespVO convert(TradeProductSalesBO bo) {
        TradeProductSalesRespVO vo = BeanUtils.toBean(bo, TradeProductSalesRespVO.class);
        vo.setSkuName(bo.getSource() == SOURCE_ONLINE ? buildOnlineSkuName(bo.getSkuText()) : bo.getSkuText());
        return vo;
    }

    /**
     * 线上订单项的规格是属性 JSON，拼成“10 片装 / 白色”；单规格商品（默认属性）为空
     */
    private static String buildOnlineSkuName(String propertiesJson) {
        if (StrUtil.isBlank(propertiesJson)) {
            return null;
        }
        List<TradeOrderItemDO.Property> properties = JsonUtils.parseArray(propertiesJson, TradeOrderItemDO.Property.class);
        String name = properties.stream().filter(p -> p.getPropertyId() != null && p.getPropertyId() != 0L)
                .map(TradeOrderItemDO.Property::getValueName).collect(Collectors.joining(" / "));
        return name.isEmpty() ? null : name;
    }

    private static int nvl(Integer value) {
        return value != null ? value : 0;
    }

}
