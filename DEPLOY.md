# Vkang ERP — 部署指南

## 架構說明

| 層級 | 技術 | 用途 |
|------|------|------|
| 前端 + SSR | Next.js 14 → **Vercel** | 頁面渲染、API Routes |
| 資料庫 | **Firestore** | 所有業務數據 |
| 認證 | **Firebase Auth** | 登入/權限 |
| 規則 + 索引 | Firebase CLI | Firestore 安全規則 + 複合索引 |

---

## 第一步：Firebase 設定

### 1. 建立 Firebase 專案
1. 前往 [Firebase Console](https://console.firebase.google.com)
2. 建立新專案（或使用現有）
3. 開啟 **Authentication** → 啟用 Email/Password
4. 開啟 **Firestore Database** → 建立資料庫（Production mode）

### 2. 取得設定值
Firebase Console → 專案設定 → 你的應用程式 → Firebase SDK 設定

複製設定到 `.env.local`：
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123
```

### 3. 部署 Firestore 規則 + 索引

安裝 Firebase CLI（若尚未安裝）：
```bash
npm install -g firebase-tools
firebase login
```

初始化專案：
```bash
# 複製範本
cp .firebaserc.example .firebaserc
# 編輯 .firebaserc，填入你的 Firebase Project ID
```

部署規則和索引：
```bash
firebase deploy --only firestore
```

> ⚠️ 索引建立需要約 **2-5 分鐘**，建立完成前部分查詢可能失敗。

---

## 第二步：建立第一個管理員帳號

1. 先啟動 `npm run dev`
2. 到 `/auth/register` 建立帳號
3. 在 **Firebase Console → Firestore → users 集合** 找到該文件
4. 手動將 `role` 欄位改為 `ADMIN`
5. 重新登入，即可進入管理後台

---

## 第三步：Vercel 部署

### 方式 A：透過 Vercel CLI
```bash
npm install -g vercel
vercel
# 依照提示操作
```

### 方式 B：透過 GitHub 整合（推薦）
1. 將程式碼推送到 GitHub
2. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
3. Import Project → 選擇 GitHub repo
4. Framework Preset 選 **Next.js**（自動偵測）
5. 設定環境變數（與 `.env.local` 相同的 6 個 `NEXT_PUBLIC_` 變數）
6. 點擊 Deploy

### 自定義 Domain（選用）
Vercel Dashboard → 你的專案 → Settings → Domains → Add

---

## 環境變數對照表

| 變數名 | 說明 | 範例 |
|--------|------|------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth Domain | `xxx.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firestore 專案 ID | `vkang-erp` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage Bucket | `xxx.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging | `1234567890` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID | `1:xxx:web:yyy` |

---

## 部署前檢查清單

- [ ] `.env.local` 填入正確的 Firebase 設定
- [ ] `npm run build` 通過，無錯誤
- [ ] Firebase Firestore 已建立（Production mode）
- [ ] Firebase Auth 已啟用 Email/Password
- [ ] `firebase deploy --only firestore` 已執行（規則 + 索引）
- [ ] 索引建立完成（Firebase Console → Firestore → Indexes）
- [ ] 第一個 ADMIN 帳號已建立
- [ ] Vercel 環境變數已設定
- [ ] 正式網址已驗證可以登入

---

## 常用指令

```bash
# 本地開發
npm run dev

# 型別檢查
npm run type-check

# Build 驗證
npm run build

# 部署 Firestore（規則 + 索引）
firebase deploy --only firestore

# 部署 Firestore 規則（只部署規則）
firebase deploy --only firestore:rules

# 部署 Firestore 索引（只部署索引）
firebase deploy --only firestore:indexes

# Vercel 部署
vercel --prod
```

---

## Firestore 集合結構

```
Firestore
├── users/          {uid}     → User 文件（uid = Firebase Auth UID）
├── products/       {sku}     → Product 文件
├── inventory/      {uid_sku} → Inventory 文件（複合 ID）
├── transactions/   {TXN-ts}  → Transaction（SALE/TRANSFER/LOAN）
└── financials/     {FIN-ts}  → Financial 收支記錄
```
