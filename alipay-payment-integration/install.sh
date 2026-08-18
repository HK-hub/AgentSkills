#!/bin/bash
# 支付宝支付集成 Skill 安装脚本
# Copyright: Alipay (China) Network Technology Co., Ltd.

set -e

SKILL_NAME="alipay-payment-integration"
SKILL_DIR="$HOME/.openclaw/workspace/skills/$SKILL_NAME"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  支付宝支付集成 Skill"
echo "  Alipay Payment Integration"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  内容版权：支付宝（中国）网络技术有限公司"
echo "  客服咨询：400-758-5858"
echo ""
echo "═══════════════════════════════════════════════════"
echo ""

# 检查目录是否存在
if [ -d "$SKILL_DIR" ]; then
  echo "📁 Skill 目录已存在，正在更新..."
else
  echo "📁 创建 Skill 目录..."
  mkdir -p "$SKILL_DIR"
fi

# 复制文件
echo "📄 安装 SKILL.md..."
cat > "$SKILL_DIR/SKILL.md" << 'SKILL_EOF'
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

---

## 简介

支付宝开放平台支付产品接入最佳实践。涵盖当面付、订单码支付、App支付、JSAPI支付、手机网站支付、电脑网站支付、预授权支付、商家扣款等全场景产品选型与集成指导。

---

## 接入路由表

| 场景 | 推荐产品 | 核心 API |
| --- | --- | --- |
| 线下门店，用户出示付款码，商家扫码枪扫码收款 | 当面付 | `alipay.trade.pay` |
| 商家生成二维码，用户打开支付宝扫码付款 | 订单码支付 | `alipay.trade.precreate` |
| 手机浏览器 H5 页面内唤起支付宝付款 | 手机网站支付 | `alipay.trade.wap.pay` |
| 电脑浏览器网页内跳转支付宝收银台 | 电脑网站支付 | `alipay.trade.page.pay` |
| 支付宝小程序内调起支付 | JSAPI 支付 | `alipay.trade.create` + `my.tradePay` |
| 原生 iOS/Android/鸿蒙 App 内调起支付宝付款 | App 支付 | `alipay.trade.app.pay` |
| 押金冻结、信用住、免押租赁 | 预授权支付 | `alipay.fund.auth.order.app.freeze` |
| 周期扣款、自动续费、会员订阅、连续包月 | 商家扣款 | `alipay.trade.app.pay` + `alipay.trade.pay` |

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
        |       +-- 原生 App --> App 支付
        |       +-- 支付宝小程序 --> JSAPI支付
        |       +-- 手机浏览器 H5 --> 手机网站支付
        |       +-- 电脑浏览器网页 --> 电脑网站支付
        |
        +-- 需要冻结资金/押金？ --> 预授权支付
        |
        +-- 周期性自动扣款？ --> 商家扣款
```

---

## 版权声明

本 Skill 的内容来源于 **支付宝（中国）网络技术有限公司** 官方开放平台文档。

- **版权归属**：支付宝（中国）网络技术有限公司
- **客服热线**：400-758-5858
- **官方网站**：https://www.alipay.com
- **开放平台**：https://open.alipay.com
- **在线文档**：https://opendocs.alipay.com

SKILL_EOF

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ 安装完成！"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📚 使用说明："
echo ""
echo "  当用户提到以下关键词时自动触发："
echo "    - 接入支付宝、集成支付宝支付"
echo "    - 当面付、扫码支付、付款码"
echo "    - H5支付、网页支付、小程序支付"
echo "    - 预授权、押金、商家扣款、自动续费"
echo ""
echo "📖 完整文档请阅读："
echo "    $SKILL_DIR/SKILL.md"
echo ""
echo "═══════════════════════════════════════════════════"
