# Vkang ERP — AI Agent 指南

本文件提供 AI 代理在參與此專案時所需的背景與慣例。

---

## 專案概述

**Vkang ERP** 是產品分銷管理系統，採用金字塔型經銷架構。主要功能包含訂單、庫存、用戶、財務與倉庫管理。

- **技術棧**：Next.js 14、React 18、Firebase / Firestore、Tailwind CSS、TypeScript
- **語言**：使用者介面與訊息請使用繁體中文

---

## 目錄結構

```
src/
├── app/                    # Next.js App Router 頁面
│   ├── auth/               # 登入、註冊
│   ├── dashboard/          # 儀表板
│   ├── products/           # 產品 CRUD
│   ├── users/              # 用戶 CRM
│   ├── orders/             # 訂單（僅批量進貨與分配）
│   ├── inventory/          # 庫存
│   ├── financials/         # 財務
│   └── warehouse/          # 倉庫（調撥、借貨、盤點）
├── components/             # 共用元件
├── context/                # React Context（Auth、Toast）
├── services/database/      # Firestore 服務層
├── types/                  # TypeScript 型別
└── lib/                    # 工具函式
```

---

## 訂單流程（重要）

- **唯一建立入口**：`/orders/create-bulk`（批量進貨與分配）
- **無一般建立訂單**：已移除 `/orders/create`，僅保留批量模式
- **流程**：主訂單 → 買方自用 → 下線分配 → 剩餘列為買方庫存
- **訂單 ID**：使用 `TXN-${baseCreatedAt}-${orderSeq}` 確保每筆訂單唯一

---

## 用戶角色

| 角色 | 說明 |
|-----|------|
| ADMIN | 管理員 |
| STOCKIST | 經銷商 |
| CUSTOMER | 顧客 |

---

## 慣例

1. 資料存取集中在 `services/database/`
2. 使用 `ProtectedRoute` 與 `useAuth()` 檢查權限
3. 與使用者溝通使用繁體中文
