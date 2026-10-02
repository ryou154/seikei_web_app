# 開発設計書

## 1. 目的

この文書は、4人が同時に開発しても作業が衝突せず、認証・画像・履歴・クリニック情報を安全につなげられるように、画面、データ、API、Git運用、確認手順を定義する。

本システムは学習用の参考シミュレーターであり、医療診断、治療効果、容姿の優劣を判定するものではない。

## 2. 担当分担

|担当|作業|主な所有範囲|
|---|---|---|
|開発リーダー|画像保存バックエンド、全体統合、Cloud Run確認|画像API、Storage、最終マージ|
|担当1|履歴・結果画面|`history.html`, `history-page.js`, `history-page.css`|
|担当2|クリニック検索・公式情報|`clinics.html`, `clinic-search.js`, データファイル|
|担当3|共通ナビゲーション・認証導線・QA|ナビゲーション、画面遷移、テスト、確認表|

同じファイルを複数人が同時に大きく変更しない。`server.js` とStorage関連は開発リーダーが所有する。

## 3. 利用者の基本フロー

1. `/` を開くと `login.html` へ移動する。
2. Googleまたはメール・パスワードでログインする。
3. Firebase IDトークンをCloud Runで検証する。
4. メール確認済みかつ許可リスト内なら `app.html` へ移動する。
5. 顔画像と希望条件を入力する。
6. GeminiでAfter画像を生成する。
7. 顔バランス、分析コメント、クリニック候補を確認する。
8. 同意した場合だけ、設定・結果・画像を履歴へ保存する。
9. 履歴画面で確認、再利用、削除する。

## 4. システム構成

```text
Browser
  |-- Firebase Authentication: ログイン、IDトークン取得
  |-- Cloud Run: 静的画面、認証API、Gemini API中継、保存API
        |-- Gemini API: After画像生成
        |-- Cloud Firestore: 設定、履歴、結果メタデータ
        |-- Cloud Storage: 同意を得たBefore／After画像
```

ブラウザからFirestoreやStorageへ直接書き込まず、Cloud Runで認証・所有者確認を行う。

## 5. 画面構成

|URL|役割|認証|
|---|---|---|
|`/`|ログイン画面への入口|不要|
|`/login.html`|ログイン・登録・確認メール・再設定|不要|
|`/app.html`|シミュレーション入力と結果|必須|
|`/history.html`|履歴一覧・詳細・再実行|必須|
|`/clinics.html`|クリニック検索・比較|必須|

保護画面は見た目を隠すだけでなく、使用するAPI側でも必ず認証する。

## 6. 現行Firestore構造

```text
users/{firebaseUid}/private/settings
  schemaVersion
  settings
  updatedAt

users/{firebaseUid}/private/history
  schemaVersion
  entries[]  // 最大10件
```

親の `users/{firebaseUid}` ドキュメントにはフィールドを持たせないため、Firebase Consoleで「ドキュメントは存在しない」と表示されても異常ではない。

履歴にはID、作成日時、入力文、各パーツ設定、地域、予算、ダウンタイムと次の結果を保存する。

```text
result
  beforeScore / afterScore
  analysis
  clinicNames[]
  generationModel / generationStatus
  images: { before, after }
```

## 7. 画像保存構造

```text
Cloud Storage
  users/{firebaseUid}/simulations/{historyId}/before
  users/{firebaseUid}/simulations/{historyId}/after

Firestore history entry.result
  id
  savedAt
  requestText
  profile
  beforeScore
  afterScore
  analysis
  clinicNames[]
  images: { before: true, after: true }
```

FirestoreへBase64画像や巨大な画像本文を保存しない。Storage上の保存先はサーバーがFirebase UIDから決定し、クライアントから渡された所有者IDを信用しない。

## 8. API契約

### 現在利用できるAPI

|Method|Path|用途|
|---|---|---|
|GET|`/api/firebase-config`|Firebase Web公開設定|
|GET|`/api/session`|ログイン・利用権限確認|
|POST|`/api/gemini-edit`|After画像生成|
|GET/PUT/DELETE|`/api/account/settings`|設定の取得・保存・削除|
|GET/PUT/DELETE|`/api/account/history`|履歴の取得・保存・全削除|
|DELETE|`/api/account/history/{id}`|履歴1件削除|
|PUT|`/api/account/history/{id}/images`|Before／After画像保存|
|GET|`/api/account/history/{id}/images/before`|Before画像取得|
|GET|`/api/account/history/{id}/images/after`|After画像取得|
|DELETE|`/api/account/history/{id}/images`|画像削除|

認証が必要なAPIは `Authorization: Bearer {Firebase ID token}` を必須とする。ブラウザでは `window.AppAuth.fetch()` を使う。画像取得は認証付きBlobレスポンスとし、公開URLを履歴へ保存しない。

## 9. セキュリティ・プライバシー

- 顔画像保存は初期状態でOFFにし、保存前に明示的な同意を取る。
- 保存目的、保存対象、削除方法を画面に表示する。
- Gemini APIキーとサービスアカウント鍵をGitへ登録しない。
- Firebase UIDは検証済みIDトークンから取得する。
- 未ログインは401、許可外・未確認メールは403、設定不備は503とする。
- エラーメッセージに内部パス、認証情報、APIキーを含めない。
- 画像と履歴を削除する操作は確認後に実行し、StorageとFirestoreの両方を削除する。
- 医療効果を保証する表現や、顔スコアを容姿評価として扱う表現を使わない。

## 10. Git作業手順

1. 作業前に `git fetch origin` を実行する。
2. 最新の `main` から担当ブランチを作る。
3. 1つの機能単位で小さくコミットする。
4. APIや共有HTMLを変更する前にチームへ知らせる。
5. `pnpm test` を実行する。
6. PRを作成し、目的、変更ファイル、確認方法、スクリーンショット、未対応を記載する。
7. 別メンバーがレビューする。
8. 開発リーダーが統合し、Cloud Run反映後に公開URLを確認する。

秘密情報を含む `.env`、鍵JSON、顔画像をコミットしない。

## 11. 推奨統合順序

1. 共通ナビゲーションと画面の入口
2. クリニック検索画面
3. 履歴画面（モック画像で完成）
4. 画像保存バックエンド
5. 履歴画面と画像APIの接続
6. 全員でPC・スマホ・複数アカウント確認
7. Cloud Runへ公開

各段階で `main` を動作可能な状態に保つ。未完成機能を既存画面からリンクする場合は、利用不可状態を明示する。

## 12. 完了基準

- 許可された4アカウントでログインできる。
- ユーザーごとに設定、履歴、画像が分離される。
- 他ユーザーのIDをURLや本文へ入れてもデータへアクセスできない。
- 顔画像を保存しない選択ができる。
- 履歴1件削除と全削除で関連画像も消える。
- Gemini失敗時も画面操作を続けられる。
- PCとスマートフォンで主要操作が完了できる。
- 公式情報のURLと確認日が表示される。
- `pnpm test` がすべて成功する。
- Cloud Run公開URLでログイン、生成、保存、再読込、削除を確認する。

## 13. チーム連絡ルール

- 作業開始時にブランチ名と担当ファイルを共有する。
- 仕様変更は口頭だけで済ませず、Issueまたは設計書へ残す。
- 競合が起きたら相手の変更を削除せず、双方の目的を確認して統合する。
- APIレスポンス変更は、利用している担当者へ事前に伝える。
- 作業完了報告には「変更点」「確認済み」「未確認」「次に必要な作業」を含める。
