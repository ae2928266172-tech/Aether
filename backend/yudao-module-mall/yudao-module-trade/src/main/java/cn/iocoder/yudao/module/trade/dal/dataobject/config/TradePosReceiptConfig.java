package cn.iocoder.yudao.module.trade.dal.dataobject.config;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Arrays;
import java.util.List;

/**
 * 门店收银小票设置，以 JSON 保存在 {@link TradeConfigDO#getPosReceipt()}
 *
 * 抬头、底部文字支持变量：{单号} {时间} {收银员} {件数} {商品金额} {优惠} {应收} {实收} {找零} {收款方式}，
 * 商品明细（名称、规格、数量、金额、赠送）按收银单自动生成
 *
 * @author Aether
 */
@Schema(description = "管理后台 - 门店收银小票设置")
@Data
public class TradePosReceiptConfig {

    /**
     * 医疗器械信息可选字段：注册证号、生产许可证号、注册人、生产地址
     */
    public static final List<String> DEVICE_FIELDS = Arrays.asList(
            "registrationNo", "productionLicenseNo", "registrant", "productionAddress");

    @Schema(description = "小票标题，一般是店名", example = "Aether 住院用品店")
    @Size(max = 32, message = "小票标题不能超过 32 个字")
    private String title;

    @Schema(description = "标题下方的文字，可以写地址、电话，支持变量", example = "住院部一楼 · 电话 0000-0000000")
    @Size(max = 500, message = "抬头文字不能超过 500 个字")
    private String headerText;

    @Schema(description = "底部文字，支持变量", example = "谢谢惠顾，请保留小票")
    @Size(max = 500, message = "底部文字不能超过 500 个字")
    private String footerText;

    @Schema(description = "纸张宽度，单位 mm：58 或 80", example = "58")
    private Integer paperWidth;

    @Schema(description = "收款后自动打印", example = "true")
    private Boolean autoPrint;

    @Schema(description = "打印份数", example = "1")
    @Min(value = 1, message = "打印份数至少 1 份")
    @Max(value = 3, message = "打印份数最多 3 份")
    private Integer copies;

    @Schema(description = "收款成功后语音播报金额", example = "true")
    private Boolean voice;

    @Schema(description = "打印规格名", example = "true")
    private Boolean showSkuName;

    @Schema(description = "打印单价", example = "true")
    private Boolean showPrice;

    @Schema(description = "打印收银员", example = "true")
    private Boolean showCashier;

    @Schema(description = "打印收款方式、实收、找零", example = "true")
    private Boolean showPayment;

    @Schema(description = "打印医疗器械信息（商品设置了才打印）", example = "false")
    private Boolean showDeviceInfo;

    @Schema(description = "打印哪些医疗器械信息：registrationNo、productionLicenseNo、registrant、productionAddress")
    private List<String> deviceFields;

    /**
     * 补齐默认值：首次使用或老数据没有设置时
     */
    public static TradePosReceiptConfig fillDefaults(TradePosReceiptConfig config) {
        TradePosReceiptConfig result = config != null ? config : new TradePosReceiptConfig();
        if (result.getFooterText() == null) {
            result.setFooterText("谢谢惠顾，请保留小票\n退换货请凭小票办理");
        }
        if (result.getPaperWidth() == null || (result.getPaperWidth() != 58 && result.getPaperWidth() != 80)) {
            result.setPaperWidth(58);
        }
        if (result.getAutoPrint() == null) {
            result.setAutoPrint(true);
        }
        if (result.getCopies() == null) {
            result.setCopies(1);
        }
        if (result.getVoice() == null) {
            result.setVoice(true);
        }
        if (result.getShowSkuName() == null) {
            result.setShowSkuName(true);
        }
        if (result.getShowPrice() == null) {
            result.setShowPrice(true);
        }
        if (result.getShowCashier() == null) {
            result.setShowCashier(true);
        }
        if (result.getShowPayment() == null) {
            result.setShowPayment(true);
        }
        if (result.getShowDeviceInfo() == null) {
            result.setShowDeviceInfo(false);
        }
        if (result.getDeviceFields() == null) {
            result.setDeviceFields(DEVICE_FIELDS);
        }
        return result;
    }

}
