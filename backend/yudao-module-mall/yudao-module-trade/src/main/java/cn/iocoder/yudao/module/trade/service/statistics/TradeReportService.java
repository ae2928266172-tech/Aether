package cn.iocoder.yudao.module.trade.service.statistics;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeProductSalesReqVO;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeProductSalesRespVO;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeProductSalesSummaryRespVO;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeRevenueReportRespVO;

import java.time.LocalDate;
import java.util.List;

/**
 * 营收报表、商品销售明细 Service 接口
 *
 * @author Aether
 */
public interface TradeReportService {

    /**
     * 时间段：按天
     */
    String PERIOD_DAY = "day";
    /**
     * 时间段：按周（周一到周日）
     */
    String PERIOD_WEEK = "week";
    /**
     * 时间段：按月
     */
    String PERIOD_MONTH = "month";

    /**
     * 营收报表：按天 / 周 / 月汇总线上订单和门店收银，最后一行为合计
     *
     * @param beginDate 开始日期
     * @param endDate   结束日期（含）
     * @param period    时间段：day、week、month
     * @return 报表行
     */
    List<TradeRevenueReportRespVO> getRevenueReport(LocalDate beginDate, LocalDate endDate, String period);

    /**
     * 商品销售明细分页：每一行是一个订单里的一个商品，可以核对单号、时间、数量
     */
    PageResult<TradeProductSalesRespVO> getProductSalesPage(TradeProductSalesReqVO reqVO);

    /**
     * 商品销售明细（不分页），用于导出
     */
    List<TradeProductSalesRespVO> getProductSalesList(TradeProductSalesReqVO reqVO);

    /**
     * 按规格汇总商品销售数量、金额，按件数从多到少
     */
    List<TradeProductSalesSummaryRespVO> getProductSalesSummary(TradeProductSalesReqVO reqVO);

}
