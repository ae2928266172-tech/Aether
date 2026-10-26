package cn.iocoder.yudao.module.trade.service.statistics;

import cn.iocoder.yudao.module.trade.controller.admin.statistics.vo.TradeSupplierSettlementRespVO;

import java.time.YearMonth;
import java.util.List;

/**
 * 供应商月度对账 Service 接口
 *
 * @author Aether
 */
public interface TradeSupplierSettlementService {

    /**
     * 获得某个月的供应商对账：每个供应商一行，含商品明细
     *
     * 统计病房订单（已支付、未取消、未退款）和门店收银（未作废）
     *
     * @param month 月份
     * @return 对账列表，按销售额从高到低
     */
    List<TradeSupplierSettlementRespVO> getSettlementList(YearMonth month);

}
