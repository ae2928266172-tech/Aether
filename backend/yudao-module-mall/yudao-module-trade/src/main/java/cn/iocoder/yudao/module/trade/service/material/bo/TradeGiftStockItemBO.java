package cn.iocoder.yudao.module.trade.service.material.bo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 买赠赠品扣减库存 BO
 *
 * @author Aether
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TradeGiftStockItemBO {

    /**
     * 单据项编号（订单项 / 收银单项）
     */
    private Long itemId;
    /**
     * 商品 SKU 编号
     */
    private Long skuId;
    /**
     * 赠送件数
     */
    private Integer giftCount;
    /**
     * 赠品库存来源
     *
     * 枚举 ProductSpuGiftStockSourceEnum
     */
    private Integer giftStockSource;

}
