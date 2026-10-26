package cn.iocoder.yudao.module.product.enums.spu;

import cn.iocoder.yudao.framework.common.core.ArrayValuable;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.Arrays;

/**
 * 买赠的赠品库存来源枚举
 *
 * @author Aether
 */
@Getter
@AllArgsConstructor
public enum ProductSpuGiftStockSourceEnum implements ArrayValuable<Integer> {

    MAIN(1, "总库存"),
    GIFT(2, "赠品库");

    public static final Integer[] ARRAYS = Arrays.stream(values()).map(ProductSpuGiftStockSourceEnum::getSource).toArray(Integer[]::new);

    /**
     * 来源
     */
    private final Integer source;
    /**
     * 名字
     */
    private final String name;

    @Override
    public Integer[] array() {
        return ARRAYS;
    }

    public static boolean isGift(Integer source) {
        return GIFT.getSource().equals(source);
    }

}
