package cn.iocoder.yudao.module.trade.controller.admin.statistics;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.excel.core.util.ExcelUtils;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeSupplierSettlementExcelVO;
import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeSupplierSettlementRespVO;
import cn.iocoder.yudao.module.trade.service.statistics.TradeSupplierSettlementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

import static cn.iocoder.yudao.framework.apilog.core.enums.OperateTypeEnum.EXPORT;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - 供应商月度对账")
@RestController
@RequestMapping("/trade/supplier-settlement")
@Validated
public class TradeSupplierSettlementController {

    @Resource
    private TradeSupplierSettlementService settlementService;

    @GetMapping("/list")
    @Operation(summary = "获得某个月的供应商对账")
    @Parameter(name = "month", description = "月份", required = true, example = "2026-10")
    @PreAuthorize("@ss.hasPermission('trade:supplier-settlement:query')")
    public CommonResult<List<TradeSupplierSettlementRespVO>> getSettlementList(
            @RequestParam("month") @DateTimeFormat(pattern = "yyyy-MM") YearMonth month) {
        return success(settlementService.getSettlementList(month));
    }

    @GetMapping("/export-excel")
    @Operation(summary = "导出某个月的供应商对账 Excel")
    @Parameter(name = "month", description = "月份", required = true, example = "2026-10")
    @PreAuthorize("@ss.hasPermission('trade:supplier-settlement:export')")
    @ApiAccessLog(operateType = EXPORT)
    public void exportSettlementExcel(@RequestParam("month") @DateTimeFormat(pattern = "yyyy-MM") YearMonth month,
                                      HttpServletResponse response) throws IOException {
        List<TradeSupplierSettlementExcelVO> rows = new ArrayList<>();
        settlementService.getSettlementList(month).forEach(supplier -> {
            supplier.getProducts().forEach(product -> {
                TradeSupplierSettlementExcelVO row = new TradeSupplierSettlementExcelVO();
                row.setSupplierName(supplier.getSupplierName()).setSpuName(product.getSpuName())
                        .setOnlineCount(product.getOnlineCount()).setPosCount(product.getPosCount())
                        .setCount(product.getCount()).setGiftCount(product.getGiftCount())
                        .setTotalPrice(toYuan(product.getTotalPrice())).setCostPrice(toYuan(product.getCostPrice()))
                        .setGiftCostPrice(toYuan(product.getGiftCostPrice()));
                rows.add(row);
            });
            TradeSupplierSettlementExcelVO total = new TradeSupplierSettlementExcelVO();
            total.setSupplierName(supplier.getSupplierName()).setSpuName("【合计】")
                    .setOnlineCount(supplier.getOnlineCount()).setPosCount(supplier.getPosCount())
                    .setCount(supplier.getCount()).setGiftCount(supplier.getGiftCount())
                    .setTotalPrice(toYuan(supplier.getTotalPrice())).setCostPrice(toYuan(supplier.getCostPrice()))
                    .setGiftCostPrice(toYuan(supplier.getGiftCostPrice()));
            rows.add(total);
        });
        ExcelUtils.write(response, "供应商对账-" + month + ".xls", month.toString(),
                TradeSupplierSettlementExcelVO.class, rows);
    }

    private static BigDecimal toYuan(Integer fen) {
        return BigDecimal.valueOf(fen != null ? fen : 0, 2);
    }

}
