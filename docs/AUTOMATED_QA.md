# 担当範囲9：自動テスト

実行：`npm.cmd test`（依存関係のインストールは `pnpm.cmd install --frozen-lockfile`）

2026-10-02、momokaブランチで42件成功・失敗0件。実行者：Codex。

| 対象 | 検証内容 | テストファイル |
| --- | --- | --- |
| 認証 | 未認証・不正ヘッダー・偽造トークン・未確認メール拒否、期限切れSDKエラーを401へ変換、確認済みユーザー許可 | tests/auth.test.js |
| 画面遷移 | 未ログイン時loginへ移動、ログイン画面のループ防止、認証成功時appへ移動、セッション喪失・アカウント切替時の保護 | tests/client.test.js |
| ナビゲーション | 5項目の遷移先、認証後のフォーカス、現在位置の更新 | tests/navigation.test.js |
| 公開画面 | /からloginへの移動コード、appの初期非表示、共通ナビの読み込みと配信 | tests/server.test.js |
| 非公開ファイル | .env、server.js、account-store.js、image-store.js、firestore.rules、テスト用サーバー等が404 | tests/server.test.js |
| 履歴API（実HTTP） | 読取・保存・個別削除・全削除を未認証/偽造トークンで拒否、認証前に不正JSONを処理しない | tests/server.test.js |
| 履歴API（メモリ内ストア） | 保存、重複排除、件数制限、削除、別利用者の履歴を参照・削除できない、payloadによる所有者偽装を無視 | tests/account-store.test.js |
| 画像・結果の消去 | ロック時の消去、遅れて完了した画像読込・解析からの復元防止 | tests/privacy.test.js |

HTTPテストは空きポートを自動割当し、開発サーバーとのポート競合を回避する。
期限切れはFirebase SDKのエラーを模擬して検証。実トークンの有効期限検証はAdmin SDKに委譲しており、実Firebaseアカウントを使うE2Eではない。
履歴の正常系はメモリ内ストアを使用し、本番Firestoreのデータは操作しない。

## 資料と現行認証方針の差異

担当資料は「許可外メールを拒否」としているが、現行auth-server.jsはメール確認済みFirebaseユーザーを許可し、AUTH_ALLOWED_EMAILSを参照しない。
再現：確認済みのnew-user@example.comを返す検証器でauthorizeを呼ぶと成功する（既存の verified registered users are accepted テスト）。
資料上の期待結果は403、現行の結果は許可。今回のQAでは認証方針を変更せず、現行挙動をテストしている。
許可リストを再導入するか、担当資料を現行方針へ更新するかはチームで決定する。
