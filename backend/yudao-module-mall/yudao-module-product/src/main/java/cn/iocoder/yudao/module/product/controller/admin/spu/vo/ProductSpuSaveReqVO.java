package cn.iocoder.yudao.module.product.controller.admin.spu.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import cn.iocoder.yudao.framework.common.validation.InEnum;
import cn.iocoder.yudao.module.trade.enums.delivery.DeliveryTypeEnum;
import cn.iocoder.yudao.module.product.enums.spu.ProductSpuGiftStockSourceEnum;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Schema(description = "管理后台 - 商品 SPU 新增/更新 Request VO")
@Data
public class ProductSpuSaveReqVO {

    @Schema(description = "商品编号", example = "1")
    private Long id;

    @Schema(description = "商品名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "清凉小短袖")
    @NotEmpty(message = "商品名称不能为空")
    private String name;

    @Schema(description = "关键字", requiredMode = Schema.RequiredMode.REQUIRED, example = "清凉丝滑不出汗")
    @NotEmpty(message = "商品关键字不能为空")
    private String keyword;

    @Schema(description = "商品简介", requiredMode = Schema.RequiredMode.REQUIRED, example = "清凉小短袖简介")
    @NotEmpty(message = "商品简介不能为空")
    private String introduction;

    @Schema(description = "商品详情", requiredMode = Schema.RequiredMode.REQUIRED, example = "清凉小短袖详情")
    @NotEmpty(message = "商品详情不能为空")
    private String description;

    @Schema(description = "商品分类编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @NotNull(message = "商品分类不能为空")
    private Long categoryId;

    @Schema(description = "商品品牌编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @NotNull(message = "商品品牌不能为空")
    private Long brandId;

    @Schema(description = "商品封面图", requiredMode = Schema.RequiredMode.REQUIRED, example = "https://www.iocoder.cn/xx.png")
    @NotEmpty(message = "商品封面图不能为空")
    private String picUrl;

    @Schema(description = "商品轮播图", requiredMode = Schema.RequiredMode.REQUIRED,
            example = "[https://www.iocoder.cn/xx.png, https://www.iocoder.cn/xxx.png]")
    private List<String> sliderPicUrls;

    @Schema(description = "排序字段", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @NotNull(message = "商品排序字段不能为空")
    private Integer sort;

    // ========== SKU 相关字段 =========

    @Schema(description = "规格类型", requiredMode = Schema.RequiredMode.REQUIRED, example = "true")
    @NotNull(message = "商品规格类型不能为空")
    private Boolean specType;

    // ========== 物流相关字段 =========

    @Schema(description = "配送方式数组", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @NotEmpty(message = "配送方式不能为空")
    @InEnum(value = DeliveryTypeEnum.class, message = "配送方式不正确")
    private List<Integer> deliveryTypes;

    @Schema(description = "物流配置模板编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "111")
    private Long deliveryTemplateId;

    @Schema(description = "顾客端是否可见：false 时只在门店收银台售卖", example = "true")
    private Boolean customerVisible;

    @Schema(description = "供应商编号", example = "1")
    private Long supplierId;

    @Schema(description = "起订量：顾客端每单至少购买的件数，0 表示不限制", example = "10")
    @Min(value = 0, message = "起订量不能小于 0")
    private Integer minBuyCount;

    @Schema(description = "买赠：每买多少件，0 表示没有买赠", example = "2")
    @Min(value = 0, message = "买赠的购买件数不能小于 0")
    private Integer giftBuyCount;

    @Schema(description = "买赠：赠送多少件", example = "1")
    @Min(value = 0, message = "买赠的赠送件数不能小于 0")
    private Integer giftCount;

    @Schema(description = "买赠：赠品库存来源，1 总库存，2 赠品库", example = "1")
    @InEnum(value = ProductSpuGiftStockSourceEnum.class, message = "赠品库存来源不正确")
    private Integer giftStockSource;

    @Schema(description = "医疗器械注册证号 / 备案凭证号", example = "国械注准20263140001")
    @Size(max = 255, message = "医疗器械注册证号 / 备案凭证号不能超过 255 个字")
    private String registrationNo;

    @Schema(description = "生产许可证号 / 生产备案凭证号", example = "苏食药监械生产许20160012号")
    @Size(max = 255, message = "生产许可证号 / 生产备案凭证号不能超过 255 个字")
    private String productionLicenseNo;

    @Schema(description = "注册人 / 备案人", example = "某某医疗用品有限公司")
    @Size(max = 255, message = "注册人 / 备案人不能超过 255 个字")
    private String registrant;

    @Schema(description = "生产地址", example = "江苏省某某市某某路 1 号")
    @Size(max = 255, message = "生产地址不能超过 255 个字")
    private String productionAddress;

    @AssertTrue(message = "设置买赠时，赠送件数必须大于 0，并选择赠品库存来源")
    @JsonIgnore
    public boolean isGiftValid() {
        return giftBuyCount == null || giftBuyCount == 0 || (giftCount != null && giftCount > 0 && giftStockSource != null);
    }

    // ========== 营销相关字段 =========

    @Schema(description = "赠送积分", requiredMode = Schema.RequiredMode.REQUIRED, example = "111")
    @NotNull(message = "商品赠送积分不能为空")
    private Integer giveIntegral;

    @Schema(description = "分销类型", requiredMode = Schema.RequiredMode.REQUIRED, example = "true")
    @NotNull(message = "商品分销类型不能为空")
    private Boolean subCommissionType;

    // ========== 统计相关字段 =========

    @Schema(description = "虚拟销量", example = "66")
    private Integer virtualSalesCount;

    @Schema(description = "商品销量", requiredMode = Schema.RequiredMode.REQUIRED, example = "1999")
    private Integer salesCount;

    @Schema(description = "浏览量", requiredMode = Schema.RequiredMode.REQUIRED, example = "1999")
    private Integer browseCount;

    // ========== SKU 相关字段 =========

    @Schema(description = "SKU 数组")
    @Valid
    private List<ProductSkuSaveReqVO> skus;

}
