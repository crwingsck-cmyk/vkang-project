# 修復 ADD PRODUCT 權限問題

若新增產品時出現「權限不足」，請依下列步驟檢查 Firestore 中的用戶文件。

## 步驟 1：確認 users 文件結構

1. 前往 [Firebase Console → Firestore](https://console.firebase.google.com/project/vkang-erp/firestore/data/users)
2. 找到您的帳號文件（用您的 UID 或 email 搜尋）
3. 確認有 **`role`** 欄位，且值為 **`ADMIN`**（全大寫）

## 步驟 2：正確的結構

您的文件應包含（role 在**最外層**）：

```
displayName: "CK CHIA"
email: "crwings.ck@gmail.com"
role: "ADMIN"          ← 必須在最外層，值為 ADMIN
isActive: true
...
```

## 步驟 3：若 role 在錯誤位置

若您的 `role` 被放在 `permissions` 裡面，請：

1. 在 Firestore 中**新增**一個頂層欄位：`role`，類型 `string`，值 `ADMIN`
2. 或將 `permissions.role` 的值改為頂層的 `role` 欄位

## 步驟 4：確認文件 ID

- 文件 ID 應為您的 **Firebase Auth UID**（例如 `Ap93VI9pLiTe0x9nJyqKAV5gVzi2`）
- 或系統會用 email 查詢，兩種方式皆可
