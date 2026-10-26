package cn.iocoder.yudao.module.trade.service.config;

import cn.iocoder.yudao.module.trade.controller.admin.config.vo.TradeConfigSaveReqVO;
import cn.iocoder.yudao.module.trade.dal.dataobject.config.TradeConfigDO;
import cn.iocoder.yudao.module.trade.dal.dataobject.config.TradePosReceiptConfig;

import jakarta.validation.Valid;

/**
 * 交易中心配置 Service 接口
 *
 * @author owen
 */
public interface TradeConfigService {

    /**
     * 更新交易中心配置
     *
     * @param updateReqVO 更新信息
     */
    void saveTradeConfig(@Valid TradeConfigSaveReqVO updateReqVO);

    /**
     * 获得交易中心配置
     *
     * @return 交易中心配置
     */
    TradeConfigDO getTradeConfig();

    /**
     * 获得门店收银小票设置，没有设置的项填默认值
     *
     * @return 小票设置
     */
    TradePosReceiptConfig getPosReceiptConfig();

    /**
     * 保存门店收银小票设置
     *
     * @param config 小票设置
     */
    void savePosReceiptConfig(@Valid TradePosReceiptConfig config);

}
