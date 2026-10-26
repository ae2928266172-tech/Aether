package cn.iocoder.yudao.module.erp.controller.admin.stock;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.framework.excel.core.util.ExcelUtils;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger.ErpStockLedgerExcelVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger.ErpStockLedgerRespVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger.ErpStockQuickOperateReqVO;
import cn.iocoder.yudao.module.erp.dal.dataobject.stock.ErpWarehouseDO;
import cn.iocoder.yudao.module.erp.service.stock.ErpStockLedgerService;
import cn.iocoder.yudao.module.erp.service.stock.ErpWarehouseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

import static cn.iocoder.yudao.framework.apilog.core.enums.OperateTypeEnum.EXPORT;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - ERP 仓库台账")
@RestController
@RequestMapping("/erp/stock-ledger")
@Validated
public class ErpStockLedgerController {

    @Resource
    private ErpStockLedgerService ledgerService;
    @Resource
    private ErpWarehouseService warehouseService;

    @GetMapping("/list")
    @Operation(summary = "获得仓库台账")
    @Parameter(name = "warehouseId", description = "仓库编号", required = true, example = "3")
    @Parameter(name = "beginDate", description = "开始日期", required = true, example = "2026-10-01")
    @Parameter(name = "endDate", description = "结束日期（含）", required = true, example = "2026-10-31")
    @Parameter(name = "keyword", description = "产品名称、条码", example = "纱布")
    @PreAuthorize("@ss.hasPermission('erp:stock-ledger:query')")
    public CommonResult<List<ErpStockLedgerRespVO>> getLedger(
            @RequestParam("warehouseId") Long warehouseId,
            @RequestParam("beginDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate beginDate,
            @RequestParam("endDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
            @RequestParam(value = "keyword", required = false) String keyword) {
        return success(ledgerService.getLedger(warehouseId, beginDate, endDate, keyword));
    }

    @GetMapping("/export-excel")
    @Operation(summary = "导出仓库台账 Excel")
    @PreAuthorize("@ss.hasPermission('erp:stock-ledger:query')")
    @ApiAccessLog(operateType = EXPORT)
    public void exportLedger(@RequestParam("warehouseId") Long warehouseId,
                             @RequestParam("beginDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate beginDate,
                             @RequestParam("endDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
                             @RequestParam(value = "keyword", required = false) String keyword,
                             HttpServletResponse response) throws IOException {
        List<ErpStockLedgerRespVO> list = ledgerService.getLedger(warehouseId, beginDate, endDate, keyword);
        ErpWarehouseDO warehouse = warehouseService.getWarehouse(warehouseId);
        String name = (warehouse != null ? warehouse.getName() : "仓库") + "台账-" + beginDate + "至" + endDate;
        ExcelUtils.write(response, name + ".xls", "台账", ErpStockLedgerExcelVO.class,
                BeanUtils.toBean(list, ErpStockLedgerExcelVO.class));
    }

    @PostMapping("/quick-operate")
    @Operation(summary = "快速入库、出库、调拨（生成单据并直接审核）")
    @PreAuthorize("@ss.hasPermission('erp:stock-ledger:operate')")
    public CommonResult<Long> quickOperate(@Valid @RequestBody ErpStockQuickOperateReqVO reqVO) {
        return success(ledgerService.quickOperate(reqVO));
    }

}
