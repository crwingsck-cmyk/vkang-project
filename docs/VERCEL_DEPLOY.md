# Vercel 部署指南

## 前置準備

### 1. 安裝 Vercel CLI（若尚未安裝）

```bash
npm i -g vercel
```

### 2. 設定環境變數

在 Vercel 專案設定中新增以下環境變數（或使用 `vercel env` 指令）：

**Firebase 客戶端（必填）：**
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

**Firebase Admin（API 建立產品用，必填）：**
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`（完整私鑰，含 `-----BEGIN PRIVATE KEY-----` 與 `-----END PRIVATE KEY-----`，換行用 `\n` 表示）

**選填：**
- `NEXT_PUBLIC_APP_NAME`（預設：Vkang ERP）
- `NEXT_PUBLIC_API_URL`（生產環境可留空或設為 Vercel 網址）

### 3. Firebase 授權網域

在 Firebase Console → Authentication → Settings → Authorized domains 中新增 Vercel 網域（例如 `your-app.vercel.app`）。

### 4. Firestore 索引

若尚未部署，請執行：

```bash
firebase deploy --only firestore:indexes
```

## 部署指令

```bash
# 首次部署（會引導連結專案）
vercel

# 正式環境部署
npm run deploy:vercel
# 或
vercel --prod
```

## 透過 GitHub 自動部署

1. 將專案推送到 GitHub
2. 前往 [vercel.com](https://vercel.com) 登入
3. 點擊「Add New Project」→ 匯入 GitHub 專案
4. 在專案設定中新增上述環境變數
5. 之後每次 push 到 main 分支會自動部署
