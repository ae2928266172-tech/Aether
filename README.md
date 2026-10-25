# Aether 住院用品收银 + 进销存系统

面向医院住院部的零售系统：住院病人在病房扫码进入微信小程序，选购住院用品并**必须填写床号**，工作人员在后台看到“病区 + 床号”后配送到床边。库存由后台通过 ERP 统一管理，门店店员看不到、也改不了库存。

基于开源项目 [ruoyi-vue-pro](https://gitee.com/zhijiantianya/ruoyi-vue-pro)（商城 + ERP 模块）二次开发。

## 目录结构

| 目录 | 说明 |
| --- | --- |
| `backend/` | Java 后端（Spring Boot 3 / JDK 17），保留 system、infra、member、pay、mall、erp 模块 |
| `admin-ui/` | 管理后台（Vue 3 + Element Plus），来自 yudao-ui-admin-vue3 |
| `mall-uniapp/` | 病人端微信小程序 / H5（uni-app），来自 yudao-mall-uniapp |
| `scripts/e2e_hospital.py` | 后端接口端到端测试脚本 |

## 新增功能

1. **病区与扫码下单**
   - 后台「商城系统 → 订单中心 → 配送管理 → 病区管理」维护病区（名称、位置、排序、状态）。
   - 每个病区可生成**小程序码**（扫码直接打开小程序首页并带上病区）和 **H5 二维码**（备用），都可以下载打印后贴在病房。
   - 小程序扫码后自动记住病区，结算页默认选中“病房配送”，**床号必填**，否则无法提交订单（后端同样校验）。
2. **病房配送流程**：订单新增配送方式“病房配送”。后台订单列表可按病区、床号筛选，操作“开始配送”（待配送 → 配送中）和“确认送达”（→ 已完成），并记录订单日志。
3. **门店不可见库存**：新增权限 `product:spu:stock`。没有该权限的角色在商品列表、详情、导出接口里库存字段均为空，界面隐藏库存列和“警戒库存”页签，也没有 ERP 菜单。
4. **多规格 / 多商品共用库存物料**
   - 商品列表点「库存物料」，为每个 SKU 绑定一个 ERP 产品（物料）和**扣减数量**，例如“小杯”扣 1、“大杯”扣 2；不同名称的商品也可以绑定同一物料。
   - 下单时按“数量 × 扣减量”从 ERP 默认仓库出库；取消订单 / 取消订单项时自动退回。
   - ERP 任何库存变动（采购入库、盘点、其它出入库等）后，自动重算商城 SKU 可售库存 = ⌊物料库存 ÷ 扣减量⌋。

## 部署

### 环境要求

- JDK 17、Maven 3.8+
- MySQL 8（或 MariaDB 10.6+）
- Redis 6+
- Node.js 18+、pnpm 8+
- HBuilderX（编译小程序）和微信开发者工具

### 1. 初始化数据库

创建数据库（例如 `aether`，字符集 `utf8mb4`），按以下**顺序**导入 `backend/sql/mysql/` 下的脚本：

```bash
mysql -uroot -p aether < backend/sql/mysql/ruoyi-vue-pro.sql
mysql -uroot -p aether < backend/sql/mysql/quartz.sql
mysql -uroot -p aether < backend/sql/mysql/mall-erp-tables.sql
mysql -uroot -p aether < backend/sql/mysql/hospital-menu.sql
mysql -uroot -p aether < backend/sql/mysql/hospital-init.sql
```

- `mall-erp-tables.sql`：商城、会员、支付、ERP 业务表（由 `backend/sql/tools/gen_ddl_from_do.py` 根据实体类生成）。
- `hospital-menu.sql`：病区、病房配送、库存权限、库存物料等菜单，以及“门店店员”“后台管理”两个角色和演示账号。
- `hospital-init.sql`：字典项、索引、默认仓库“住院部仓库”。

### 2. 启动后端

修改 `backend/yudao-server/src/main/resources/application-local.yaml`（生产环境建议复制为 `application-prod.yaml`）中的 MySQL、Redis 连接，以及 `wx.miniapp.appid / secret`（填你自己的小程序，生成小程序码需要）。

```bash
cd backend
mvn clean package -DskipTests
java -jar yudao-server/target/yudao-server.jar --spring.profiles.active=local
```

默认端口 48080。

### 3. 启动管理后台

```bash
cd admin-ui
pnpm install
pnpm dev          # 开发
pnpm build:prod   # 打包到 dist-prod，用 Nginx 部署
```

在 `.env.*` 中设置 `VITE_BASE_URL`（后端地址）和 `VITE_MALL_H5_DOMAIN`（H5 地址，用于生成 H5 二维码）。

### 4. 编译病人端小程序

1. 用 HBuilderX 打开 `mall-uniapp/`。
2. 把 `manifest.json` 中 `mp-weixin.appid` 改成你的小程序 AppID，`.env` 中 `SHOPRO_BASE_URL` 改成后端的 HTTPS 地址。
3. 发行 → 小程序-微信，用微信开发者工具上传审核。小程序后台需把后端域名加入“request 合法域名”。
4. 在管理后台「系统管理 → 三方登录 → 三方应用」中添加微信小程序（AppID / AppSecret），病人才能一键登录。

### 5. 配置支付

在「支付管理 → 应用信息」中确认存在应用标识为 `mall` 的应用，并为它开通微信小程序支付渠道（商户号、APIv3 密钥、证书）。测试阶段可以使用“钱包支付”渠道。

## 日常使用

1. **病区**：「配送管理 → 病区管理」新增病区 → 点「二维码」下载小程序码，打印贴到对应病房。
2. **物料**：「ERP → 产品管理」新建物料（如“纸杯”），然后「ERP → 采购入库 / 其它入库」入库到默认仓库“住院部仓库”。
3. **商品**：「商品管理 → 商品列表」创建商品和规格，配送方式勾选“病房配送”；然后点「库存物料」为每个规格选物料、填扣减数量。保存后商品库存会自动按物料库存计算。
4. **配送**：病人下单支付后，在「订单列表」按病区筛选 → 「开始配送」→ 送到床边后「确认送达」。

## 演示账号

| 账号 | 密码 | 角色 | 说明 |
| --- | --- | --- | --- |
| admin | admin123 | 超级管理员 | 全部权限 |
| backoffice | admin123 | 后台管理 | 商城、会员、支付、ERP，可看可改库存 |
| store | admin123 | 门店店员 | 查看商品、处理订单和配送，看不到库存和 ERP |

**上线前务必修改以上密码。**

## 测试

```bash
# 单元测试
cd backend && mvn test -pl yudao-module-mall/yudao-module-product,yudao-module-mall/yudao-module-trade

# 端到端测试（需先启动后端并导入 SQL）
python3 scripts/e2e_hospital.py
```

## 已知限制

- 库存扣减和同步只针对 ERP 的**默认仓库**；多仓库需要再扩展。
- 后台界面目前每个 SKU 只能绑定**一种**物料（后端数据结构支持多种）。
- 商城 / ERP 表结构是根据实体类自动生成的，不是官方 SQL，字段类型如有出入请按需调整。
- 小程序端代码已改好，但尚未在真机上验证；小程序码需要已发布的小程序和正确的 AppID / Secret 才能生成，生成失败时后台会提示并提供 H5 二维码。

## 开源协议

本项目基于以下 MIT 协议开源项目修改，原版权声明见各子目录 `LICENSE`：

- [ruoyi-vue-pro](https://gitee.com/zhijiantianya/ruoyi-vue-pro)
- [yudao-ui-admin-vue3](https://gitee.com/yudaocode/yudao-ui-admin-vue3)
- [yudao-mall-uniapp](https://gitee.com/yudaocode/yudao-mall-uniapp)
