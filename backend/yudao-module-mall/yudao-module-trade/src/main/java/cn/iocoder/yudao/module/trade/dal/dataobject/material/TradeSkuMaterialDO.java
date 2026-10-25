package cn.iocoder.yudao.module.trade.dal.dataobject.material;

import cn.iocoder.yudao.framework.mybatis.core.dataobject.BaseDO;
import com.baomidou.mybatisplus.annotation.KeySequence;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.*;

import java.math.BigDecimal;

/**
 * 商品规格（SKU）与库存物料的对应关系 DO
 *
 * 库存物料即 ERP 产品。多个规格、甚至不同名称的商品，可以对应同一个库存物料，下单时按 {@link #quantity} 扣减它的库存。
 * 例如：小杯扣 1 份、大杯扣 2 份。配置了物料的规格，库存由物料库存自动换算，不再单独维护。
 *
 * @author Aether
 */
@TableName("trade_sku_material")
@KeySequence("trade_sku_material_seq") // 用于 Oracle、PostgreSQL、Kingbase、DB2、H2 数据库的主键自增。如果是 MySQL 等数据库，可不写。
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TradeSkuMaterialDO extends BaseDO {

    /**
     * 编号
     */
    @TableId
    private Long id;
    /**
     * 商品 SPU 编号
     */
    private Long spuId;
    /**
     * 商品 SKU 编号
     */
    private Long skuId;
    /**
     * 库存物料编号，即 ERP 产品编号
     */
    private Long erpProductId;
    /**
     * 每卖出 1 件该规格，扣减的物料数量
     */
    private BigDecimal quantity;

}
