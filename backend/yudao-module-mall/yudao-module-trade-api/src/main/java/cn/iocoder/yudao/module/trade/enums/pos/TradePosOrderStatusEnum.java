package cn.iocoder.yudao.module.trade.enums.pos;

import cn.iocoder.yudao.framework.common.core.ArrayValuable;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.Arrays;

/**
 * 门店收银单状态枚举
 *
 * @author Aether
 */
@Getter
@AllArgsConstructor
public enum TradePosOrderStatusEnum implements ArrayValuable<Integer> {

    COMPLETED(10, "已完成"),
    CANCELED(20, "已作废");

    public static final Integer[] ARRAYS = Arrays.stream(values()).map(TradePosOrderStatusEnum::getStatus).toArray(Integer[]::new);

    /**
     * 状态值
     */
    private final Integer status;
    /**
     * 状态名
     */
    private final String name;

    @Override
    public Integer[] array() {
        return ARRAYS;
    }

}
