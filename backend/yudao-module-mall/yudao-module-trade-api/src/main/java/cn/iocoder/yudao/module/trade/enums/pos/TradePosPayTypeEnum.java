package cn.iocoder.yudao.module.trade.enums.pos;

import cn.iocoder.yudao.framework.common.core.ArrayValuable;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.Arrays;

/**
 * 门店收银收款方式枚举
 *
 * 微信、支付宝为收银员用顾客的付款码 / 门店收款码收款后，在收银台记录收款方式
 *
 * @author Aether
 */
@Getter
@AllArgsConstructor
public enum TradePosPayTypeEnum implements ArrayValuable<Integer> {

    CASH(1, "现金"),
    WECHAT(2, "微信"),
    ALIPAY(3, "支付宝"),
    OTHER(9, "其他");

    public static final Integer[] ARRAYS = Arrays.stream(values()).map(TradePosPayTypeEnum::getType).toArray(Integer[]::new);

    /**
     * 类型
     */
    private final Integer type;
    /**
     * 名字
     */
    private final String name;

    @Override
    public Integer[] array() {
        return ARRAYS;
    }

    public static boolean isCash(Integer type) {
        return CASH.getType().equals(type);
    }

}
