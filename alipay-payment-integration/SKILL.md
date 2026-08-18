---
name: alipay-payment-integration
display_name: 支付宝支付集成
description: 支付宝开放平台支付产品接入最佳实践。涵盖当面付、订单码支付、App支付、JSAPI支付、手机网站支付、电脑网站支付、预授权支付、商家扣款等全场景产品选型与集成指导。
version: 1.0.0
author: 整合者：叶建国 | 内容版权：支付宝（中国）网络技术有限公司
homepage: https://opendocs.alipay.com/
tags:
  - 支付宝
  - 支付集成
  - 当面付
  - 商家扣款
  - 预授权支付
license: MIT
compatibility:
  - openclaw
  - skillhub
---

# 支付宝支付集成

> **版权声明**：本 Skill 内容来源于支付宝（中国）网络技术有限公司官方文档，版权归属支付宝所有。如有疑问可咨询支付宝客服：4007585858
> 
> **Source**: ModelScope Skills - @Alipay/alipay-payment-integration
> **Copyright**: Alipay (China) Network Technology Co., Ltd.

---

## 简介

支付宝开放平台支付产品接入最佳实践。涵盖当面付、订单码支付、App支付、JSAPI支付、手机网站支付、电脑网站支付、预授权支付、商家扣款等全场景产品选型与集成指导。

**适用场景**：当用户提到"接入支付宝"、"集成支付宝支付"、"对接支付"、"支付宝收款"、"加个支付功能"、"支付宝下单"、"H5支付"、"小程序支付"、"预授权"、"付款码"、"扫码支付"、"网页支付"、"PC支付"、"周期扣款"、"自动续费"、"会员订阅"、"连续包月"、"代扣"时使用此 Skill。

**不适用场景**：不用于微信支付、银联支付、支付宝转账、对账、红包等非收单场景。

---

## 文档访问规范

所有支付宝支付产品的文档均为在线动态链接，接入前务必先阅读对应产品的在线文档获取最新接口参数和代码示例。

### 访问方式

使用 curl 获取内容：

```bash
# 示例：获取当面付文档
curl -sL "https://ideservice.alipay.com/cms/site/0izcu3"
```

### 递归访问

文档页面内包含的链接需要递归访问以获取完整内容。访问流程：

1. 首先访问主文档 URL
2. 解析文档中的链接（产品介绍、接入准备、接口文档等）
3. 递归访问这些链接获取详细内容

```bash
# 访问当面付子链接示例
curl -sL "https://ideservice.alipay.com/cms/site/0izal0"   # 产品介绍
curl -sL "https://ideservice.alipay.com/cms/site/0izal1"   # 接入准备
```

---

## 接入路由表

根据用户的业务场景，路由到对应的产品文档：

| 场景 | 推荐产品 | 核心 API | 在线文档 |
| --- | --- | --- | --- |
| 线下门店，用户出示付款码，商家扫码枪扫码收款 | 当面付 | `alipay.trade.pay` | [当面付文档](https://ideservice.alipay.com/cms/site/0izcu3) |
| 商家生成二维码，用户打开支付宝扫码付款 | 订单码支付 | `alipay.trade.precreate` | [订单码支付文档](https://ideservice.alipay.com/cms/site/0izg0z) |
| 手机浏览器 H5 页面内唤起支付宝付款 | 手机网站支付 | `alipay.trade.wap.pay` | [手机网站支付文档](https://ideservice.alipay.com/cms/site/0izne3) |
| 电脑浏览器网页内跳转支付宝收银台 | 电脑网站支付 | `alipay.trade.page.pay` | [电脑网站支付文档](https://ideservice.alipay.com/cms/site/0iztfv) |
| 支付宝小程序内调起支付 | JSAPI 支付 | `alipay.trade.create` + `my.tradePay` | [JSAPI 支付文档](https://ideservice.alipay.com/cms/site/0izg0f) |
| 原生 iOS/Android/鸿蒙 App 内调起支付宝付款 | App 支付 | `alipay.trade.app.pay` | [App 支付文档](https://ideservice.alipay.com/cms/site/0izsn4) |
| 押金冻结、信用住、免押租赁 | 预授权支付 | `alipay.fund.auth.order.app.freeze` | [预授权支付文档](https://ideservice.alipay.com/cms/site/0j0lyx) |
| 周期扣款、自动续费、会员订阅、连续包月 | 商家扣款 | `alipay.trade.app.pay`（支付并签约）+ `alipay.trade.pay`（后续扣款） | [商家扣款文档](https://ideservice.alipay.com/cms/site/0j0g6k) |

回答任何接入问题或编写代码前，先通过 curl 阅读上表中对应的在线文档链接。文档内包含最新的接口参数、代码示例和注意事项。

---

## 快速决策树

```
用户咨询支付宝接入
        |
        +-- 线下门店收款？
        |       +-- 用户出示付款码，商家扫 --> 当面付
        |       +-- 商家出示二维码，用户扫 --> 订单码支付
        |
        +-- 线上支付？
        |       +-- 原生 App（iOS/Android/鸿蒙）--> App 支付
        |       +-- 支付宝小程序 --> JSAPI支付
        |       +-- 手机浏览器 H5 --> 手机网站支付
        |       +-- 电脑浏览器网页 --> 电脑网站支付
        |
        +-- 需要冻结资金/押金？
        |       +-- 预授权支付
        |
        +-- 周期性自动扣款？
                +-- 会员订阅/连续包月/自动续费 --> 商家扣款
```

---

## 场景关键词匹配

| 关键词 | 路由产品 |
| --- | --- |
| 付款码、条码支付、扫码枪、被扫、线下门店、便利店、商超、餐饮、收银台扫码、实体店、面对面收款、扫码枪收款、用户出示付款码 | 当面付 |
| 订单码、商家二维码、主扫、预下单、商家生成二维码、用户扫码支付、商品二维码、预创建订单 | 订单码支付 |
| H5支付、WAP支付、手机网站、手机浏览器、移动端网页、手机网页支付、wap收银台、手机端网页、移动H5 | 手机网站支付 |
| PC支付、电脑网站、网页支付、电脑端支付、PC网页、电脑浏览器、网站支付、传统网页支付、网页收银台 | 电脑网站支付 |
| 小程序支付、JSAPI、支付宝小程序、生活号、小程序内支付、小程序收银台、小程序JSAPI、my.tradePay、小程序下单、支付宝内小程序 | JSAPI 支付 |
| App支付、移动应用支付、iOS支付、Android支付、鸿蒙支付、App内支付、原生App支付、手机App支付、移动端App、SDK支付、客户端支付 | App 支付 |
| 预授权、押金、资金冻结、信用住、免押、先享后付、酒店押金、租车押金、充电宝押金、单车押金、民宿押金、冻结资金、授权冻结、押金退还 | 预授权支付 |
| 周期扣款、自动续费、会员订阅、连续包月、代扣、商家扣款、定期扣款、会员自动续费、包月会员、订阅制、定期扣费、委托扣款、协议扣款 | 商家扣款 |

---

## 澄清话术

当用户描述模糊时：

```
请确认您的业务场景：

1. 线下门店收款
   - 当面付：用户出示付款码，商家用扫码枪收款
     适用：便利店、商超综合体、餐饮店、医院、学校、电影院、旅游景区等实体门店
   - 订单码支付：商家生成二维码，用户扫码付款
     适用：商品售卖、媒体广告支付等场景

2. 线上App支付
   - 原生 iOS/Android/鸿蒙 App 内调起支付宝付款
   - App 未安装支付宝客户端时可降级 H5 支付

3. 支付宝小程序支付
   - JSAPI支付：小程序内调起支付宝收银台完成支付
   - 适用：支付宝小程序内购物、服务购买等场景

4. 手机网站支付
   - 手机浏览器 H5 页面内唤起支付宝 App 或网页收银台
   - 适用：移动端网页内支付等场景

5. 电脑网站支付
   - 电脑浏览器跳转支付宝网页收银台
   - 支持扫码支付或登录账户支付
   - 适用：PC端电商网站、在线服务平台等

6. 预授权支付
   - 先冻结资金或信用额度，按实际消费扣款，剩余解冻归还
   - 适用：酒店民宿、传统租车、分时租赁、单车租赁、充电宝、雨伞、3C数码/手机/相机租赁等

7. 商家扣款（周期自动扣款）
   - 用户签约授权后，商家主动发起周期性扣款
   - 适用：会员包月、自动续费、定期还款等

请描述您的具体业务需求？
```

---

## 接入说明

| 主题 | 说明 | 在线文档 |
| --- | --- | --- |
| 服务端 SDK | 通用版 SDK（Java/PHP/.NET/Python/Node.js）、Easy 版 SDK（Java/PHP/.NET） | [SDK文档](https://ideservice.alipay.com/cms/site/0j0cjj) |
| 获取 AppId | 应用唯一标识的获取方式 | [AppId获取](https://ideservice.alipay.com/cms/site/02nebp) |
| 接口加签方式 | 加签方式说明，支持 RSA2 和 RSA，推荐使用 **RSA2**（SHA256WithRSA） | [加签文档](https://ideservice.alipay.com/cms/site/02mriz) |
| 正式网关 | 访问地址：`https://openapi.alipay.com/gateway.do` | - |
| 沙箱网关 | 访问地址：`https://openapi-sandbox.dl.alipaydev.com/gateway.do` | [沙箱文档](https://ideservice.alipay.com/cms/site/02np8i) |
| 接入规范和常见陷阱 | 支付产品接入中的核心规范和产品接入常见陷阱说明 | [规范文档](https://ideservice.alipay.com/cms/site/0j0kl2) |
| 公共错误码说明 | 此处为公共错误码说明，开发者在接入过程中遇到其他报错信息，可以参考所调用接口的 API 文档的 **业务错误码** 部分 | [错误码文档](https://ideservice.alipay.com/cms/site/02km9f) |

---

## 注意事项

- 本 Skill **不支持商家分账产品接入**，分账需求请查阅开放平台文档或咨询客服。
- 业务咨询和接入问题请查阅 [开放平台在线文档](https://opendocs.alipay.com/) 或咨询支付宝客服：**4007585858**
- 商家扣款产品已于 2026.3.28 完成产品升级，本文仅支持最新版本的接入。原有曾使用旧版本接入的商家仍可继续使用，但后续将不再进行能力更新，也不再接受新场景接入，相关文档前往[开放平台在线文档](https://opendocs.alipay.com/) 查看。
- 商家扣款当前只支持周期性扣款模式，用户主动免密支付场景暂不支持接入。
- 测试阶段建议开发者优先使用沙箱环境。
- 本文档中所有链接均指向支付宝在线文档，内容会动态更新，编写代码前务必通过阅读最新版本。

---

## 版权声明

本 Skill 的内容来源于 **支付宝（中国）网络技术有限公司** 官方开放平台文档。

- **版权归属**：支付宝（中国）网络技术有限公司
- **客服热线**：400-758-5858
- **官方网站**：[https://www.alipay.com](https://www.alipay.com)
- **开放平台**：[https://open.alipay.com](https://open.alipay.com)
- **在线文档**：[https://opendocs.alipay.com](https://opendocs.alipay.com)

本整合版仅作技术学习交流使用，原始内容由支付宝官方维护和更新。如有任何疑问或需要商业支持，请直接联系支付宝官方客服。

---

## 更新日志

### v1.0.0 (2026-04-04)
- 整合 ModelScope Skills @Alipay/alipay-payment-integration
- 适配 SkillHub 格式规范
- 添加版权声明和客服信息
