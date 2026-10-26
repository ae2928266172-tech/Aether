package cn.iocoder.yudao.module.trade.controller.admin.pos.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Schema(description = "管理后台 - 门店收银台商品分类 Response VO")
@Data
public class TradePosCategoryRespVO {

    @Schema(description = "分类编号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    private Long id;

    @Schema(description = "父分类编号，0 表示大类", requiredMode = Schema.RequiredMode.REQUIRED, example = "0")
    private Long parentId;

    @Schema(description = "分类名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "护理用品")
    private String name;

    @Schema(description = "分类图片", example = "https://www.iocoder.cn/1.png")
    private String picUrl;

}
