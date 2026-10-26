package cn.iocoder.yudao.module.trade.dal.mysql.statistics;

import cn.iocoder.yudao.module.trade.service.statistics.bo.TradeProductSalesBO;
import cn.iocoder.yudao.module.trade.service.statistics.bo.TradeReportDayBO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 营收报表、商品销售明细 Mapper
 *
 * 线上订单：已支付、未取消，按支付时间统计，金额扣除已退款；售后成功（已退款）的订单项不计件数。
 * 门店收银：已完成（未作废）的收银单，按收银时间统计，金额为打折、改价后的应收
 *
 * @author Aether
 */
@Mapper
public interface TradeReportMapper {

    String ONLINE_ORDER_WHERE = " o.pay_status = 1 AND o.status != 40 AND o.deleted = 0" +
            " AND o.pay_time >= #{beginTime} AND #{endTime} > o.pay_time";
    String POS_ORDER_WHERE = " o.status = 10 AND o.deleted = 0" +
            " AND o.create_time >= #{beginTime} AND #{endTime} > o.create_time";

    @Select("SELECT DATE(o.pay_time) AS day, COUNT(*) AS orderCount," +
            " SUM(o.pay_price - IFNULL(o.refund_price, 0)) AS price," +
            " SUM(IFNULL(o.discount_price, 0) + IFNULL(o.coupon_price, 0) + IFNULL(o.point_price, 0)) AS discountPrice" +
            " FROM trade_order o WHERE" + ONLINE_ORDER_WHERE + " GROUP BY DATE(o.pay_time)")
    List<TradeReportDayBO> selectOnlineOrderDays(@Param("beginTime") LocalDateTime beginTime,
                                                 @Param("endTime") LocalDateTime endTime);

    @Select("SELECT DATE(o.pay_time) AS day, SUM(i.count) AS productCount, SUM(IFNULL(i.gift_count, 0)) AS giftCount," +
            " SUM(IFNULL(i.cost_price, 0) * (i.count + IFNULL(i.gift_count, 0))) AS costPrice" +
            " FROM trade_order_item i INNER JOIN trade_order o ON i.order_id = o.id" +
            " WHERE" + ONLINE_ORDER_WHERE + " AND IFNULL(i.after_sale_status, 0) != 20 AND i.deleted = 0" +
            " GROUP BY DATE(o.pay_time)")
    List<TradeReportDayBO> selectOnlineItemDays(@Param("beginTime") LocalDateTime beginTime,
                                                @Param("endTime") LocalDateTime endTime);

    @Select("SELECT DATE(o.create_time) AS day, COUNT(*) AS orderCount," +
            " SUM(IFNULL(o.pay_price, o.total_price)) AS price, SUM(IFNULL(o.discount_price, 0)) AS discountPrice," +
            " SUM(o.product_count) AS productCount" +
            " FROM trade_pos_order o WHERE" + POS_ORDER_WHERE + " GROUP BY DATE(o.create_time)")
    List<TradeReportDayBO> selectPosOrderDays(@Param("beginTime") LocalDateTime beginTime,
                                              @Param("endTime") LocalDateTime endTime);

    @Select("SELECT DATE(o.create_time) AS day, SUM(IFNULL(i.gift_count, 0)) AS giftCount," +
            " SUM(IFNULL(i.cost_price, 0) * (i.count + IFNULL(i.gift_count, 0))) AS costPrice" +
            " FROM trade_pos_order_item i INNER JOIN trade_pos_order o ON i.order_id = o.id" +
            " WHERE" + POS_ORDER_WHERE + " AND i.deleted = 0 GROUP BY DATE(o.create_time)")
    List<TradeReportDayBO> selectPosItemDays(@Param("beginTime") LocalDateTime beginTime,
                                             @Param("endTime") LocalDateTime endTime);

    /**
     * 线上订单项 + 门店收银单项的明细，按时间倒序
     */
    String PRODUCT_SALES_UNION = "SELECT * FROM (" +
            " SELECT 1 AS source, o.id AS orderId, o.no AS orderNo, o.pay_time AS time, i.spu_id AS spuId," +
            " i.spu_name AS spuName, i.sku_id AS skuId, i.properties AS skuText, i.count AS count," +
            " IFNULL(i.gift_count, 0) AS giftCount, i.pay_price AS price, o.receiver_detail_address AS place" +
            " FROM trade_order_item i INNER JOIN trade_order o ON i.order_id = o.id" +
            " WHERE" + ONLINE_ORDER_WHERE + " AND IFNULL(i.after_sale_status, 0) != 20 AND i.deleted = 0" +
            " UNION ALL" +
            " SELECT 2 AS source, o.id AS orderId, o.no AS orderNo, o.create_time AS time, i.spu_id AS spuId," +
            " i.spu_name AS spuName, i.sku_id AS skuId, i.sku_name AS skuText, i.count AS count," +
            " IFNULL(i.gift_count, 0) AS giftCount, IFNULL(i.pay_price, i.total_price) AS price, o.cashier_name AS place" +
            " FROM trade_pos_order_item i INNER JOIN trade_pos_order o ON i.order_id = o.id" +
            " WHERE" + POS_ORDER_WHERE + " AND i.deleted = 0" +
            ") t WHERE 1 = 1" +
            "<if test='source != null'> AND t.source = #{source}</if>" +
            "<if test='spuId != null'> AND t.spuId = #{spuId}</if>" +
            "<if test='skuId != null'> AND t.skuId = #{skuId}</if>" +
            "<if test='keyword != null and keyword != \"\"'> AND t.spuName LIKE CONCAT('%', #{keyword}, '%')</if>";

    @Select("<script>" + PRODUCT_SALES_UNION + " ORDER BY t.time DESC, t.orderId DESC" +
            "<if test='limit != null'> LIMIT #{offset}, #{limit}</if></script>")
    List<TradeProductSalesBO> selectProductSalesList(@Param("beginTime") LocalDateTime beginTime,
                                                     @Param("endTime") LocalDateTime endTime,
                                                     @Param("source") Integer source,
                                                     @Param("spuId") Long spuId,
                                                     @Param("skuId") Long skuId,
                                                     @Param("keyword") String keyword,
                                                     @Param("offset") Integer offset,
                                                     @Param("limit") Integer limit);

    @Select("<script>SELECT COUNT(*) FROM (" + PRODUCT_SALES_UNION + ") c</script>")
    Long selectProductSalesCount(@Param("beginTime") LocalDateTime beginTime,
                                 @Param("endTime") LocalDateTime endTime,
                                 @Param("source") Integer source,
                                 @Param("spuId") Long spuId,
                                 @Param("skuId") Long skuId,
                                 @Param("keyword") String keyword);

}
