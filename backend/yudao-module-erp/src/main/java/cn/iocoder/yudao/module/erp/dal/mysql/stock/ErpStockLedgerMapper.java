package cn.iocoder.yudao.module.erp.dal.mysql.stock;

import cn.iocoder.yudao.module.erp.service.stock.bo.ErpStockLedgerRowBO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 仓库台账 Mapper：按产品汇总某个仓库在一段时间内的入库、出库数量
 *
 * @author Aether
 */
@Mapper
public interface ErpStockLedgerMapper {

    /**
     * 时间段内的入库（正数）、出库（负数）合计
     */
    @Select("SELECT product_id AS productId," +
            " SUM(CASE WHEN count > 0 THEN count ELSE 0 END) AS inCount," +
            " SUM(CASE WHEN count < 0 THEN count ELSE 0 END) AS outCount" +
            " FROM erp_stock_record WHERE warehouse_id = #{warehouseId} AND deleted = 0" +
            " AND create_time >= #{beginTime} AND create_time < #{endTime} GROUP BY product_id")
    List<ErpStockLedgerRowBO> selectRangeRows(@Param("warehouseId") Long warehouseId,
                                              @Param("beginTime") LocalDateTime beginTime,
                                              @Param("endTime") LocalDateTime endTime);

    /**
     * 某个时间之后的库存变化合计（count 字段），用当前库存倒推期末结存
     */
    @Select("SELECT product_id AS productId, SUM(count) AS count" +
            " FROM erp_stock_record WHERE warehouse_id = #{warehouseId} AND deleted = 0" +
            " AND create_time >= #{time} GROUP BY product_id")
    List<ErpStockLedgerRowBO> selectRowsAfter(@Param("warehouseId") Long warehouseId,
                                              @Param("time") LocalDateTime time);

}
