package cn.iocoder.yudao.module.erp.service.stock;

import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger.ErpStockLedgerRespVO;
import cn.iocoder.yudao.module.erp.controller.admin.stock.vo.ledger.ErpStockQuickOperateReqVO;
import jakarta.validation.Valid;

import java.time.LocalDate;
import java.util.List;

/**
 * 仓库台账 Service 接口
 *
 * 像一张表格一样看每个产品的期初、入库、出库、结存，并在同一个页面里快速入库、出库、调拨到门店
 *
 * @author Aether
 */
public interface ErpStockLedgerService {

    /**
     * 获得仓库台账：列出所有启用的产品（没有库存变化的也列出），按产品名称排序
     *
     * @param warehouseId 仓库编号
     * @param beginDate   开始日期
     * @param endDate     结束日期（含）
     * @param keyword     产品名称、条码关键字
     * @return 台账
     */
    List<ErpStockLedgerRespVO> getLedger(Long warehouseId, LocalDate beginDate, LocalDate endDate, String keyword);

    /**
     * 快速入库、出库、调拨：生成单据并直接审核，库存立即变化
     *
     * @param reqVO 请求
     * @return 单据编号
     */
    Long quickOperate(@Valid ErpStockQuickOperateReqVO reqVO);

}
