package cn.iocoder.yudao.module.trade.dal.dataobject.pos;

import cn.iocoder.yudao.framework.mybatis.core.dataobject.BaseDO;
import cn.iocoder.yudao.module.product.enums.spu.ProductSpuGiftStockSourceEnum;
import com.baomidou.mybatisplus.annotation.KeySequence;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.*;

/**
 * 门店收银单项 DO
 *
 * @author Aether
 */
@TableName("trade_pos_order_item")
@KeySequence("trade_pos_order_item_seq") // 用于 Oracle、PostgreSQL、Kingbase、DB2、H2 数据库的主键自增。如果是 MySQL 等数据库，可不写。
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TradePosOrderItemDO extends BaseDO {

    /**
     * 编号
     */
    @TableId
    private Long id;
    /**
     * 收银单编号
     *
     * 关联 {@link TradePosOrderDO#getId()}
     */
    private Long orderId;
    /**
     * 商品 SPU 编号
     */
    private Long spuId;
    /**
     * 商品名字
     */
    private String spuName;
    /**
     * 商品 SKU 编号
     */
    private Long skuId;
    /**
     * 规格名字，例如：包装:两片装；单规格商品为空
     */
    private String skuName;
    /**
     * 商品图片
     */
    private String picUrl;
    /**
     * 单价，单位：分
     */
    private Integer price;
    /**
     * 购买件数
     */
    private Integer count;
    /**
     * 小计金额，单位：分
     */
    private Integer totalPrice;
    /**
     * 赠送件数（买赠）
     */
    private Integer giftCount;
    /**
     * 赠品库存来源
     *
     * 枚举 {@link ProductSpuGiftStockSourceEnum}
     */
    private Integer giftStockSource;
    /**
     * 供应商编号，收银时从商品复制，用于每月按供应商对账
     */
    private Long supplierId;
    /**
     * 成本价，单位：分。收银时从商品 SKU 复制
     */
    private Integer costPrice;

}
