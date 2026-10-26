# Aether 住院用品收银 + 进销存系统

面向医院住院部的零售系统：住院病人在病房扫码进入微信小程序，选购住院用品并**必须填写床号**，工作人员在后台看到“病区 + 床号”后配送到床边。库存由后台通过 ERP 统一管理，门店店员看不到、也改不了库存。

基于开源项目 [ruoyi-vue-pro](https://gitee.com/zhijiantianya/ruoyi-vue-pro)（商城 + ERP 模块）二次开发。

## 目录结构

| 目录 | 说明 |
| --- | --- |
| `backend/` | Java 后端（Spring Boot 3 / JDK 17），保留 system、infra、member、pay、mall、erp 模块 |
| `admin-ui/` | 管理后台（Vue 3 + Element Plus），来自 yudao-ui-admin-vue3 |
| `mall-uniapp/` | 病人端微信小程序 / H5（uni-app），来自 yudao-mall-uniapp |
| `scripts/e2e_hospital.py` | 后端接口端到端测试：病区下单、库存物料、门店权限 |
| `scripts/e2e_pos.py` | 后端接口端到端测试：收银台、顾客端可见、起订量、买赠、供应商对账 |

## 新增功能

1. **病区与扫码下单**
   - 后台「商城管理 → 订单中心 → 配送管理 → 病区管理」维护病区（名称、位置、排序、状态）。
   - 每个病区可生成**小程序码**（扫码直接打开小程序首页并带上病区）和 **H5 二维码**（备用），都可以下载打印后贴在病房。
   - 小程序扫码后自动记住病区，结算页默认选中“病房配送”，**床号必填**，否则无法提交订单（后端同样校验）。
2. **病房配送流程**：订单新增配送方式“病房配送”。后台订单列表可按病区、床号筛选，操作“开始配送”（待配送 → 配送中）和“确认送达”（→ 已完成），并记录订单日志。
3. **门店不可见库存**：新增权限 `product:spu:stock`。没有该权限的角色在商品列表、详情、导出接口里库存字段均为空，界面隐藏库存列和“警戒库存”页签，也没有 ERP 菜单。
4. **多规格 / 多商品共用库存物料**
   - 商品列表点「库存物料」，为每个 SKU 绑定一个 ERP 产品（物料）和**扣减数量**，例如“小杯”扣 1、“大杯”扣 2；不同名称的商品也可以绑定同一物料。
   - 下单时按“数量 × 扣减量”从 ERP 默认仓库出库；取消订单 / 取消订单项时自动退回。
   - ERP 任何库存变动（采购入库、盘点、其它出入库等）后，自动重算商城 SKU 可售库存 = ⌊物料库存 ÷ 扣减量⌋。
5. **门店触屏收银台**
   - 「订单中心 → 门店收银」点「打开收银台」，进入全屏触屏界面（地址 `/pos`，可以在收银机浏览器里设为首页）。
   - 按大类 / 小类点选商品，多规格弹出大按钮选择；支持扫码枪扫商品条码直接加入；右侧购物车大号加减按钮。
   - 收款方式：现金（数字键盘、快捷金额、自动算找零）、微信、支付宝、其他；收款后可打印 58mm 小票。
   - 收银和线上订单共用库存（同样按库存物料扣减 ERP），门店看不到库存数量，只显示“已售罄”。
   - 「交班汇总」看当前收银员今天的笔数和各收款方式金额；后台收银记录可以作废（商品退回库存）。
6. **顾客端是否可见**：商品编辑「销售设置」里关闭“顾客端可见”后，病人在小程序里看不到、也不能下单，只能在门店收银台卖（适合便宜、不值得送病房的东西）。
7. **起订量**：例如纱布 2.8 元设 10 件起购，病人选数量时最少就是 10，少于 10 件无法下单（后端同样校验）。门店收银不受限制。
8. **买赠**：例如“买 2 赠 1”，按购买件数自动计算赠送件数，在病人结算页、订单、收银小票上显示“赠 N 件”。赠品可以选择：
   - **从总库存扣**：和正常销售一样从默认仓库扣减；
   - **从赠品库扣**：从 ERP 里勾选了“赠品库”的仓库扣减（默认已建好“赠品库”，需要先给商品绑定库存物料，并往赠品库入库）。
9. **商品分类（大类 / 小类）**：沿用商城的两级分类，「商品分类」先建大类（如“护理用品”），再在下面建小类（如“纱布敷料”）；商品挂在小类下。小程序分类页和收银台都按大类、小类展示。
10. **供应商与月度对账**
    - 供应商在「进销存 → 采购管理 → 供应商信息」维护，商品编辑「销售设置」里选择供应商。
    - 「订单中心 → 供应商对账」选择月份，按供应商汇总病房订单和门店收银的销量、销售额、成本（下单时的成本价）、赠送件数和赠品成本，可展开看每个商品，并导出 Excel。
11. **顾客端配送文案可改**：「订单中心 → 交易配置 → 扫码配送」可以改顾客看到的叫法，不局限于病房：
    - 配送方式名称（默认“送到病房”，可改成“送货上门”“送到桌边”等）、区域叫法（默认“病区”，可改成“楼栋”“楼层”）、位置叫法（默认“床号”，可改成“房间号”“桌号”）；
    - 位置是否必填。关闭后顾客可以不填，配送地址只显示区域名。页面右侧有顾客端预览。
12. **首页经营看板**：登录后首页显示今日线上订单、待配送、今日门店收款、库存预警，最近待配送订单和常用入口；按账号权限显示（门店店员看不到库存预警）。

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
- `hospital-menu.sql`：病区、病房配送、库存权限、库存物料、门店收银、供应商对账等菜单，“门店店员”“后台管理”两个角色和演示账号；并停用本项目用不到的上游菜单（工作流、CRM、AI 等）、把默认租户改名为 Aether。
- `hospital-init.sql`：字典项、索引、默认仓库“住院部仓库”、赠品仓库“赠品库”、默认首页装修模板“住院用品商城”、默认交易配置（含扫码配送文案）。

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
2. **物料**：「进销存 → 产品管理」新建物料（如“纸杯”），然后「进销存 → 采购入库 / 其它入库」入库到默认仓库“住院部仓库”。
3. **商品**：「商品管理 → 商品分类」先建大类、小类；「商品列表」创建商品和规格，配送方式勾选“病房配送”，在「销售设置」里选供应商、设置是否顾客端可见、起订量、买赠；然后点「库存物料」为每个规格选物料、填扣减数量。保存后商品库存会自动按物料库存计算。
4. **首页**：「商城管理 → 商城首页 → 装修模板」编辑“住院用品商城”的首页，在“商品卡片”里选择要展示的商品（默认模板里商品为空）。
5. **配送**：病人下单支付后，在「订单列表」按病区筛选 → 「开始配送」→ 送到床边后「确认送达」。
6. **门店收银**：店员登录后台 →「订单中心 → 门店收银」→「打开收银台」，建议点右上角「全屏」。下班前点「交班汇总」核对现金。
7. **月底对账**：「订单中心 → 供应商对账」选上个月，导出 Excel 发给供应商核对。

## 换成自己的品牌

上游项目都是 **MIT 协议**，允许商用、修改、改名后销售，唯一要求是保留原来的版权声明（各子目录的 `LICENSE` 文件不要删）。界面上已经去掉了“芋道”的名称、Logo、文档链接、统计代码和上游演示菜单；Java 包名 `cn.iocoder` 是代码内部的，不出现在界面上，不影响商用。

换成你自己的品牌只需要改这些地方：

| 位置 | 改什么 |
| --- | --- |
| `admin-ui/.env` | `VITE_APP_TITLE`（系统名称，显示在浏览器标题、左上角、登录页）、`VITE_APP_SLOGAN`（登录页标语） |
| `admin-ui/src/assets/imgs/logo.png`、`admin-ui/public/logo.png`、`admin-ui/public/favicon.ico` | 换成你的 Logo（正方形 PNG，建议 256×256）和网站图标 |
| `admin-ui/src/views/Login/Login.vue` | 登录页左侧的介绍文字和三条功能亮点（`features`） |
| `admin-ui/src/store/modules/app.ts`、`admin-ui/src/styles/var.css` | 主题色（默认青绿 `#0d9488`）和左侧菜单颜色；登录后也可以在右上角「设置」里临时调整 |
| `mall-uniapp/manifest.json`、`pages.json`、`package.json` | 小程序 / H5 名称 |
| `mall-uniapp/static/local/` | 顾客端 Logo、底部导航图标、公告图标 |
| 后台「商城管理 → 商城首页 → 装修模板」 | 顾客端首页顶部标题、公告、按钮颜色 |
| 后台「系统管理 → 租户管理」 | 租户名称（需和 `admin-ui/.env` 的 `VITE_APP_DEFAULT_LOGIN_TENANT` 一致） |
| 后台「系统管理 → 菜单管理」 | 菜单名称、图标；用不到的模块已停用，需要时可重新启用 |

只给一家门店用时，登录页不显示“租户”输入框（`VITE_APP_TENANT_INPUT_ENABLE=false`）；以后要给多家客户各开一套数据（SaaS），把它改成 `true`，再在「租户管理」里给每个客户建租户。

### 上线前检查

- 修改所有演示账号的密码，删除不用的演示账号。
- 重新生成接口加密密钥：后端 `application.yaml` 的 `yudao.api-encrypt.request-key / response-key` 和前端 `.env` 的 `VITE_APP_API_ENCRYPT_REQUEST_KEY / RESPONSE_KEY` 改成同一组新值（AES 为 32 位字符）。
- 把 `.env.prod`、`mall-uniapp/.env` 里的 `your-api-domain.example.com` 等占位域名改成你的正式域名（需要 HTTPS）。
- 小程序 AppID、支付商户号换成你自己的。

## 演示账号

| 账号 | 密码 | 角色 | 说明 |
| --- | --- | --- | --- |
| admin | admin123 | 超级管理员 | 全部权限 |
| backoffice | admin123 | 后台管理 | 商城、会员、支付、ERP，可看可改库存 |
| store | admin123 | 门店店员 | 门店收银、查看商品、处理订单和配送，看不到库存、ERP 和供应商对账 |

**上线前务必修改以上密码。**

## 测试

```bash
# 单元测试
cd backend && mvn test -pl yudao-module-mall/yudao-module-product,yudao-module-mall/yudao-module-trade

# 端到端测试（需先启动后端，并导入一份全新的 SQL；两个脚本各用一份新库）
python3 scripts/e2e_hospital.py
python3 scripts/e2e_pos.py
```

## 已知限制

- 库存扣减和同步只针对 ERP 的**默认仓库**（买赠“从赠品库扣”时用赠品库）；多仓库需要再扩展。
- 收银台的微信 / 支付宝是“店员确认已收款”的记账方式，没有对接扫码枪收款（付款码）接口。
- 小票通过浏览器打印，需要把收银机的默认打印机设为小票机、纸张设为 58mm。
- 后台界面目前每个 SKU 只能绑定**一种**物料（后端数据结构支持多种）。
- 商城 / ERP 表结构是根据实体类自动生成的，不是官方 SQL，字段类型如有出入请按需调整。
- 小程序端代码已改好，但尚未在真机上验证；小程序码需要已发布的小程序和正确的 AppID / Secret 才能生成，生成失败时后台会提示并提供 H5 二维码。

## 开源协议

本项目基于以下 MIT 协议开源项目修改，原版权声明见各子目录 `LICENSE`：

- [ruoyi-vue-pro](https://gitee.com/zhijiantianya/ruoyi-vue-pro)
- [yudao-ui-admin-vue3](https://gitee.com/yudaocode/yudao-ui-admin-vue3)
- [yudao-mall-uniapp](https://gitee.com/yudaocode/yudao-mall-uniapp)
