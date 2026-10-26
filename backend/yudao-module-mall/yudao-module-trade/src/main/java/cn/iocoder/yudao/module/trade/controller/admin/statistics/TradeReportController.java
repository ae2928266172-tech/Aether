package cn.iocoder.yudao.module.trade.controller.admin.statistics;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.excel.core.util.ExcelUtils;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.*;
import cn.iocoder.yudao.module.trade.service.statistics.TradeReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static cn.iocoder.yudao.framework.apilog.core.enums.OperateTypeEnum.EXPORT;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertList;

@Tag(name = "管理后台 - 营收报表")
@RestController
@RequestMapping("/trade/report")
@Validated
public class TradeReportController {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Resource
    private TradeReportService reportService;

    @GetMapping("/revenue")
    @Operation(summary = "营收报表：日报、周报、月报")
    @Parameter(name = "beginDate", description = "开始日期", required = true, example = "2026-10-01")
    @Parameter(name = "endDate", description = "结束日期（含）", required = true, example = "2026-10-31")
    @Parameter(name = "period", description = "时间段：day、week、month", required = true, example = "day")
    @PreAuthorize("@ss.hasPermission('trade:report:query')")
    public CommonResult<List<TradeRevenueReportRespVO>> getRevenueReport(
            @RequestParam("beginDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate beginDate,
            @RequestParam("endDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
            @RequestParam(value = "period", defaultValue = "day") String period) {
        return success(reportService.getRevenueReport(beginDate, endDate, period));
    }

    @GetMapping("/revenue/export-excel")
    @Operation(summary = "导出营收报表 Excel")
    @PreAuthorize("@ss.hasPermission('trade:report:export')")
    @ApiAccessLog(operateType = EXPORT)
    public void exportRevenueReport(@RequestParam("beginDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate beginDate,
                                    @RequestParam("endDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
                                    @RequestParam(value = "period", defaultValue = "day") String period,
                                    HttpServletResponse response) throws IOException {
        List<TradeRevenueReportExcelVO> rows = convertList(reportService.getRevenueReport(beginDate, endDate, period), row -> {
            TradeRevenueReportExcelVO excel = new TradeRevenueReportExcelVO();
            excel.setPeriod(row.getPeriod()).setOnlineOrderCount(row.getOnlineOrderCount())
                    .setOnlinePrice(toYuan(row.getOnlinePrice())).setPosOrderCount(row.getPosOrderCount())
                    .setPosPrice(toYuan(row.getPosPrice())).setOrderCount(row.getOrderCount())
                    .setTotalPrice(toYuan(row.getTotalPrice())).setDiscountPrice(toYuan(row.getDiscountPrice()))
                    .setProductCount(row.getProductCount()).setGiftCount(row.getGiftCount())
                    .setCostPrice(toYuan(row.getCostPrice())).setProfitPrice(toYuan(row.getProfitPrice()));
            return excel;
        });
        String name = getPeriodName(period);
        ExcelUtils.write(response, name + "-" + beginDate + "至" + endDate + ".xls", name,
                TradeRevenueReportExcelVO.class, rows);
    }

    @GetMapping("/product-sales/summary")
    @Operation(summary = "商品销售汇总（按规格）")
    @PreAuthorize("@ss.hasPermission('trade:report:query')")
    public CommonResult<List<TradeProductSalesSummaryRespVO>> getProductSalesSummary(@Valid TradeProductSalesReqVO reqVO) {
        return success(reportService.getProductSalesSummary(reqVO));
    }

    @GetMapping("/product-sales/page")
    @Operation(summary = "商品销售明细分页")
    @PreAuthorize("@ss.hasPermission('trade:report:query')")
    public CommonResult<PageResult<TradeProductSalesRespVO>> getProductSalesPage(@Valid TradeProductSalesReqVO reqVO) {
        return success(reportService.getProductSalesPage(reqVO));
    }

    @GetMapping("/product-sales/export-excel")
    @Operation(summary = "导出商品销售明细 Excel")
    @PreAuthorize("@ss.hasPermission('trade:report:export')")
    @ApiAccessLog(operateType = EXPORT)
    public void exportProductSales(@Valid TradeProductSalesReqVO reqVO, HttpServletResponse response) throws IOException {
        List<TradeProductSalesExcelVO> rows = convertList(reportService.getProductSalesList(reqVO), row -> {
            TradeProductSalesExcelVO excel = new TradeProductSalesExcelVO();
            excel.setTime(row.getTime() != null ? row.getTime().format(TIME_FORMATTER) : null)
                    .setSource(row.getSource() == 1 ? "线上订单" : "门店收银").setOrderNo(row.getOrderNo())
                    .setSpuName(row.getSpuName()).setSkuName(row.getSkuName()).setCount(row.getCount())
                    .setGiftCount(row.getGiftCount()).setPrice(toYuan(row.getPrice())).setPlace(row.getPlace());
            return excel;
        });
        String range = reqVO.getTime()[0].toLocalDate() + "至" + reqVO.getTime()[1].toLocalDate();
        ExcelUtils.write(response, "商品销售明细-" + range + ".xls", "销售明细", TradeProductSalesExcelVO.class, rows);
    }

    private static String getPeriodName(String period) {
        if (TradeReportService.PERIOD_WEEK.equals(period)) {
            return "周报";
        }
        if (TradeReportService.PERIOD_MONTH.equals(period)) {
            return "月报";
        }
        return "日报";
    }

    private static BigDecimal toYuan(Integer fen) {
        return BigDecimal.valueOf(fen != null ? fen : 0, 2);
    }

}
