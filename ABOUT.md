# Matender（マテンダー）開発ガイド / プロダクト概要

> 目的：このドキュメントだけ読めば、**Android 実機で動かしながら開発を始められる状態**にする。

---

## 1. プロダクト概要

**Matender** は、
- 「日付」中心ではなく、
- **予定（親）** と **メモ/ファイル（子）** の関係を中心に扱う

階層型カレンダー・メモアプリです。

### コンセプト
- 親（予定）に対して、子（メモ・チェックリスト・ファイル）をぶら下げる。
- 日時管理とメモ管理を 1 つの文脈に統合する。
- 個人利用ではローカルで軽快に、将来的にはクラウド同期にも拡張可能にする。

---

## 2. 想定ユーザーと利用シーン

### 想定ユーザー
- 会議・イベント・タスクに紐づく情報をまとめて管理したい人
- Keep の手軽さとカレンダーの時系列整理を両立したい人
- JSON インポートなどを活用して効率運用したい人

### 利用シーン
- 会議予定（親）に「アジェンダ」「議事メモ」「資料リンク」（子）を集約
- 日付ごとに予定を見て、必要な情報にすぐアクセス
- 後でクラウド同期を ON にして、複数端末でも同一データを扱う

---

## 3. スコープ方針（重要）

このプロジェクトは **ローカルファースト** で進めます。

- **Phase 1（現在）:** ローカル動作を完成させる
  - Android 実機で安定動作
  - SQLite ベース保存
  - JSON インポート/エクスポート
- **Phase 2（将来）:** クラウド同期を追加
  - Supabase などの BaaS 連携（任意）
  - 同期 ON/OFF 切替可能
  - オフライン編集 + 復帰時同期

> つまり「クラウド前提」ではなく、**ローカルだけで完結する設計**を先に固める。

---

## 4. 技術選定（推奨）

### アプリ基盤
- **React Native + Expo（TypeScript）**
  - Android 実機デバッグが容易
  - 開発体験が良く、将来の配布にも移行しやすい

### UI / ナビゲーション
- `expo-router`（または React Navigation）
- `react-native-calendars`（カレンダー表示）
- `nativewind`（必要なら）

### データ
- **Local:** `expo-sqlite`（第一候補）
- **Cloud（将来）:** Supabase（Postgres + Auth + Storage）

### フォーム/バリデーション
- `react-hook-form`
- `zod`

---

## 5. Android 開発環境セットアップ（最短手順）

## 5.1 前提
- Node.js LTS（推奨: 20 系）
- npm または pnpm
- Android Studio（SDK / ADB）
- Expo Go（Android 実機にインストール）

## 5.2 初期化コマンド例

```bash
npx create-expo-app@latest matender --template
cd matender
npm install
```

## 5.3 推奨追加パッケージ

```bash
npx expo install expo-sqlite expo-file-system expo-document-picker
npm install zod react-hook-form
npm install react-native-calendars
```

## 5.4 実機起動

```bash
npx expo start
```

- 表示された QR を Android の Expo Go で読み取り
- または USB 接続 + `a` キーで Android ターゲット起動

---

## 6. 画面構成（MVP）

1. **CalendarScreen**
   - 月表示
   - 日付選択
   - 選択日の親予定一覧

2. **EventList / EventCard**
   - タイトル・時刻・子件数を表示
   - タップで詳細へ

3. **EventDetailScreen**
   - 親情報（タイトル、日時、タグ）
   - 子メモ一覧（チェック可）
   - 子ファイル一覧

4. **EventEditModal**
   - 親予定の追加・編集

5. **ChildEditModal**
   - 子要素（memo/checklist/file）追加・編集

---

## 7. データモデル（ローカル基準）

## 7.1 エンティティ

### ParentEvent
- `id: string (uuid)`
- `title: string`
- `description?: string`
- `date: string (YYYY-MM-DD)`
- `time?: string (HH:mm)`
- `createdAt: string`
- `updatedAt: string`

### ChildItem
- `id: string (uuid)`
- `parentId: string`
- `type: 'memo' | 'check' | 'file'`
- `content?: string`
- `isDone?: boolean`
- `fileName?: string`
- `fileUri?: string`
- `sortOrder: number`
- `createdAt: string`
- `updatedAt: string`

## 7.2 JSON 例

```json
{
  "id": "evt-001",
  "title": "プロジェクトMTG",
  "date": "2026-04-17",
  "time": "10:00",
  "children": [
    { "id": "c-1", "type": "memo", "content": "前回議事録の確認" },
    { "id": "c-2", "type": "check", "content": "担当者の確定", "isDone": false }
  ]
}
```

---

## 8. データ保存戦略

## 8.1 ローカル（必須）
- SQLite を正とする
- 起動時にマイグレーション実行
- UI はローカル DB 参照で高速表示

## 8.2 クラウド（将来・任意）
- 同期が有効な場合のみクラウド API を叩く
- ローカル変更をキュー化して順次同期
- 競合時は `updatedAt` 比較 + 将来的にマージ戦略導入

---

## 9. ディレクトリ設計（推奨）

```text
src/
  app/                # 画面（expo-router）
  components/         # UI部品
  features/
    calendar/
    event/
    child/
  db/
    schema.ts
    migrations/
    repositories/
  services/
    sync/             # 将来クラウド同期
    importExport/
  types/
  utils/
```

---

## 10. 開発ルール（最小）

- TypeScript を strict で利用
- DB 直接アクセスは `repositories` 経由に限定
- 日付文字列は `YYYY-MM-DD`、時刻は `HH:mm` で統一
- 画面ロジックとデータ操作ロジックを分離
- 1 PR = 1 意図（画面追加、DB変更、同期機能など）

---

## 11. マイルストーン

### M1: ローカル MVP
- カレンダー表示
- 親予定 CRUD
- 子メモ CRUD
- SQLite 永続化

### M2: 実用化
- JSON インポート/エクスポート
- 子要素並び替え
- 検索（タイトル/メモ）

### M3: 将来拡張
- Supabase 同期（任意 ON）
- 認証（任意）
- 添付ファイルのクラウド保存

---

## 12. 将来クラウド対応の設計メモ（今から仕込む）

クラウド実装前でも、次を守ると移行が楽になります。

- レコードに `id`, `createdAt`, `updatedAt` を持たせる
- 「DBアクセス層」と「UI層」を分ける
- 同期対象レコードに `syncStatus`（`local_only` / `pending` / `synced`）を持たせる余地を作る
- 削除を物理削除ではなく `deletedAt` で論理削除にする設計余地を検討

---

## 13. 非機能要件（最低ライン）

- 初回表示 2 秒以内（ローカル DB 前提）
- クラッシュフリー率の継続監視
- オフライン時でも主要操作（閲覧・追加・編集）が可能
- 日本語入力での扱いやすさ（改行、長文メモ）

---

## 14. リスクと対策

- **リスク:** 子要素が増えたときの一覧パフォーマンス低下
  - **対策:** 仮想化リスト・ページング
- **リスク:** 同期競合
  - **対策:** 最終更新時刻 + 競合 UI（将来）
- **リスク:** スキーマ変更時の破損
  - **対策:** マイグレーションとバックアップ

---

## 15. このドキュメントの完了条件

この ABOUT.md が満たすべき状態：
- Android 実機での開発開始手順が明確
- ローカルファースト方針が明確
- 将来クラウド化の拡張ポイントが明確
- MVP 実装に必要な画面・データ構造・マイルストーンが明確

---

必要であれば次ステップとして、`README.md` に「3分起動ガイド（コマンドのみ）」版を別途作成できます。
