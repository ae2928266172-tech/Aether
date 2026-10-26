package cn.iocoder.yudao.module.trade.service.material;

import cn.iocoder.yudao.module.product.api.spu.dto.ProductSpuRespDTO;

/**
 * 买赠工具类
 *
 * @author Aether
 */
public class TradeGiftUtils {

    /**
     * 计算赠送件数：每买 giftBuyCount 件赠 giftCount 件，例如买 2 赠 1，买 5 件赠 2 件
     *
     * @param spu   商品
     * @param count 购买件数
     * @return 赠送件数
     */
    public static int calculateGiftCount(ProductSpuRespDTO spu, Integer count) {
        if (spu == null || count == null || !hasGift(spu)) {
            return 0;
        }
        return count / spu.getGiftBuyCount() * spu.getGiftCount();
    }

    public static boolean hasGift(ProductSpuRespDTO spu) {
        return spu.getGiftBuyCount() != null && spu.getGiftBuyCount() > 0
                && spu.getGiftCount() != null && spu.getGiftCount() > 0;
    }

}
