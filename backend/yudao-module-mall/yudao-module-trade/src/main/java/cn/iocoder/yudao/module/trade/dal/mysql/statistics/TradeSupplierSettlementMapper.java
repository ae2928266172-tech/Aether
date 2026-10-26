package cn.iocoder.yudao.module.trade.dal.mysql.statistics;

import cn.iocoder.yudao.module.trade.service.statistics.bo.TradeSupplierSettlementRowBO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 供应商对账 Mapper：按供应商 + 商品汇总线上订单、门店收银的销售数据
 *
 * 供应商、成本价取下单时记录在订单项上的值
 *
 * @author Aether
 */
@Mapper
public interface TradeSupplierSettlementMapper {

    /**
     * 线上订单：已支付、未取消，排除售后成功（已退款）的订单项，按支付时间统计
     */
    @Select("SELECT i.supplier_id AS supplierId, i.spu_id AS spuId, MAX(i.spu_name) AS spuName," +
            " SUM(i.count) AS count, SUM(IFNULL(i.gift_count, 0)) AS giftCount, SUM(i.pay_price) AS totalPrice," +
            " SUM(IFNULL(i.cost_price, 0) * i.count) AS costPrice," +
            " SUM(IFNULL(i.cost_price, 0) * IFNULL(i.gift_count, 0)) AS giftCostPrice" +
            " FROM trade_order_item i INNER JOIN trade_order o ON i.order_id = o.id" +
            " WHERE o.pay_status = 1 AND o.status <> 40 AND o.pay_time >= #{beginTime} AND o.pay_time < #{endTime}" +
            " AND IFNULL(i.after_sale_status, 0) <> 20 AND o.deleted = 0 AND i.deleted = 0" +
            " GROUP BY i.supplier_id, i.spu_id")
    List<TradeSupplierSettlementRowBO> selectOnlineRows(@Param("beginTime") LocalDateTime beginTime,
                                                        @Param("endTime") LocalDateTime endTime);

    /**
     * 门店收银：已完成（未作废）的收银单，按收银时间统计；销售额取分摊整单优惠后的金额
     */
    @Select("SELECT i.supplier_id AS supplierId, i.spu_id AS spuId, MAX(i.spu_name) AS spuName," +
            " SUM(i.count) AS count, SUM(IFNULL(i.gift_count, 0)) AS giftCount, SUM(IFNULL(i.pay_price, i.total_price)) AS totalPrice," +
            " SUM(IFNULL(i.cost_price, 0) * i.count) AS costPrice," +
            " SUM(IFNULL(i.cost_price, 0) * IFNULL(i.gift_count, 0)) AS giftCostPrice" +
            " FROM trade_pos_order_item i INNER JOIN trade_pos_order o ON i.order_id = o.id" +
            " WHERE o.status = 10 AND o.create_time >= #{beginTime} AND o.create_time < #{endTime}" +
            " AND o.deleted = 0 AND i.deleted = 0" +
            " GROUP BY i.supplier_id, i.spu_id")
    List<TradeSupplierSettlementRowBO> selectPosRows(@Param("beginTime") LocalDateTime beginTime,
                                                     @Param("endTime") LocalDateTime endTime);

}
