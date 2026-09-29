# AI骨格フィット・整形シミュレーター

顔画像と希望イメージをもとに、AIによるAfter予測画像・分析コメント・おすすめクリニック情報を表示する学習用WEBアプリです。

> このアプリは授業制作・学習用の参考シミュレーションです。医療診断や実際の治療判断を行うものではありません。

## 公開URL

Google Cloud Runで公開しています。

https://seikei-web-app-688786456161.asia-northeast1.run.app

## チーム開発資料

- [全体開発設計書](docs/DEVELOPMENT_DESIGN.md)
- [担当1: 履歴・結果画面](docs/01_history_ui_assignment.md)
- [担当2: クリニック検索・公式情報整備](docs/02_clinic_search_assignment.md)
- [担当3: 共通ナビゲーション・認証導線・QA](docs/03_navigation_qa_assignment.md)

各担当は最新の `main` から指定ブランチを作り、指示書の所有範囲と完了条件に従って作業します。

## 主な機能

- 顔画像のファイルアップロード
- スマホ/PCカメラでの撮影アップロード
- 理想イメージの入力
- パーツ別の希望選択
- 変化の強さをパーセントで調整
- Gemini APIによるAfter画像生成
- 生成失敗時のローカル簡易After画像表示
- AI分析風コメント
- 地域入力に応じたおすすめクリニック表示
- Googleまたはメール・パスワードでのログイン
- ユーザー別の入力設定保存
- Firestoreへの設定履歴保存（最新10件、画像は含まない）

## 使い方

1. 公開URLを開く
2. 顔画像を選択、またはカメラで撮影する
3. 理想のイメージを入力する
4. パーツや変化の強さを選ぶ
5. 地域を入力する
6. `AIシミュレーションを実行` を押す
7. Before/After画像、AI分析コメント、おすすめクリニックを確認する

## ローカルで起動する場合

`index.html` を直接開くと、Gemini API連携は使えません。Gemini画像生成を使う場合は、ローカルサーバーから開きます。

### PowerShell

```powershell
cd seikei_web_app
npm install -g pnpm@11.19.0
pnpm install --frozen-lockfile --ignore-scripts
$env:GEMINI_API_KEY="取得したGemini APIキー"
.\start-server.ps1
```

ブラウザで次を開きます。

```text
http://localhost:3000
```

Node.js 22以上と依存パッケージのインストールが必要です。`start-server.ps1` はPCに入っているNode.js、またはCodex同梱のNode.jsを探して `server.js` を起動します。

## Firebaseログイン

Googleログイン、メール／パスワード登録、確認メールの再送、パスワード再設定、ログアウトに対応しています。
初回登録後は、メール内の確認リンクを開き「メール確認後に続ける」を押してください。

`firebase-config.js` にチームのFirebase Web接続情報を設定済みです。`FIREBASE_API_KEY`、`FIREBASE_AUTH_DOMAIN`、`FIREBASE_PROJECT_ID`、`FIREBASE_APP_ID` で上書きもできます。これらはブラウザ用の公開設定であり、Geminiキーやサービスアカウント秘密鍵ではありません。Geminiの既存環境変数はそのまま使用します。`.env` ファイルの自動読込は行いません。

サーバーはFirebase Admin SDKでIDトークンの署名・期限・対象プロジェクトを検証し、メール確認済みの以下4名に限り `/api/session` と `/api/gemini-edit` を許可します。

- c3337@oic.jp
- c3241@oic.jp
- c3122@oic.jp
- c3201@oic.jp

許可リストはCloud Runの `AUTH_ALLOWED_EMAILS` 環境変数で管理します。Firebase自体へのユーザー登録を制限するものではありません。署名検証には公開鍵を使用し、秘密鍵ファイルは不要です。失効済みトークンと無効化されたアカウントもサーバー側で拒否します。

入力設定と履歴はFirestoreへ保存し、Firebase UIDごとに分離します。写真・生成画像は保存しません。旧バージョンのブラウザ履歴は所有者を特定できないため自動移行しません。

Firebase ConsoleでGoogle・メール／パスワードを有効化し、Cloud Runのホスト名を承認済みドメインに追加してください。ローカルで試す場合は `localhost` も必要です。Googleログインはポップアップを使用します。

テスト: `pnpm test`。デプロイ後は対象アカウントでGoogleログイン、メール登録・確認、再設定、ログアウト、アカウント切替、設定・履歴の保存を確認してください。確認メール・再設定メールの実送信は自動テストでは行いません。詳しい設定は `AUTH_SETUP.md` を確認してください。

## Gemini APIについて

現在、画像生成には次のモデルを使用しています。

```text
gemini-2.5-flash-image
```

顔画像と入力内容は、After画像を生成するためにGemini APIへ送信されます。APIキーはコードやGitHubに直接書かず、環境変数 `GEMINI_API_KEY` で設定します。

### スマホ対応

スマホでは写真サイズが大きくなりやすいため、Geminiへ送信する画像だけ軽量化しています。画面に表示するBefore画像はそのまま表示し、送信用だけJPEGに変換します。

- PC: 長辺768px、JPEG品質0.75
- スマホ: 長辺384px、JPEG品質0.6

## Google Cloud Runでの公開構成

このアプリはGoogle Cloud Runで公開しています。

### 使用サービス

- GitHub
- Google Cloud Run
- Google Cloud Build
- Google Artifact Registry
- Gemini API
- Firebase Authentication
- Cloud Firestore

### デプロイの流れ

1. VS Codeでコードを編集する
2. GitHubの `main` ブランチへpushする
3. Cloud Buildが自動でビルドする
4. Cloud Runへ自動デプロイされる
5. 公開URLへ反映される

### Cloud Runの環境変数

Cloud Runのサービス設定で次の環境変数を設定します。

```text
GEMINI_API_KEY=Google AI Studioで取得したAPIキー
FIREBASE_API_KEY=Firebase WebアプリのapiKey
FIREBASE_AUTH_DOMAIN=Firebase WebアプリのauthDomain
FIREBASE_PROJECT_ID=対象プロジェクトID
FIREBASE_APP_ID=Firebase WebアプリのappId
AUTH_ALLOWED_EMAILS=利用を許可するメールアドレス（カンマ区切り）
```

APIキーを変更した場合は、Cloud Runの「新しいリビジョンの編集とデプロイ」から環境変数を差し替えます。

### Cloud Runの設定

- サービス名: `seikei-web-app`
- リージョン: `asia-northeast1`
- 認証: パブリックアクセスを許可
- 起動: `node server.js`
- ポート: Cloud Runの `PORT` 環境変数を使用

## チームメンバーの操作権限

Google Cloudを操作するメンバーは、Google Cloud IAMでプロジェクトに追加します。

確認場所:

```text
IAMと管理 > IAM > プロジェクト「My First Project」の権限
```

授業用に簡単に共同作業する場合は、対象メンバーに `編集者` ロールを付与するとCloud Runやログを操作できます。

より細かく権限を分ける場合は、次のようなロールを使います。

```text
Cloud Run 管理者
Cloud Build 編集者
Artifact Registry 書き込み
サービス アカウント ユーザー
ログ閲覧者
```

GitHub側でも、リポジトリに共同編集者として追加しておく必要があります。

## トラブル対応

### Gemini生成に失敗する

- APIキーがCloud Runの環境変数に設定されているか確認する
- Gemini APIの利用枠や課金状態を確認する
- 画像サイズを小さくして再実行する
- 変化の強さを少し下げて試す
- Cloud Runのログで `/api/gemini-edit` のエラーを確認する

### スマホだけ失敗する

- ページを再読み込みする
- カメラ撮影で試す
- 写真フォルダから選んだ画像がHEICの場合は、iPhoneのカメラ設定を「互換性優先」にする
- 通信環境の良い場所で試す

### GitHubにpushしても反映されない

- Cloud Runの「リビジョン」を確認する
- Cloud Buildのビルド履歴を確認する
- GitHub連携が `main` ブランチになっているか確認する

## ファイル構成

```text
seikei_web_app/
├─ index.html        画面HTML
├─ style.css         デザイン
├─ script.js         画面操作・画像処理・Gemini呼び出し
├─ auth.js           ログイン画面とFirebase Authentication連携
├─ auth-server.js    Firebase IDトークン検証と利用者制限
├─ account-data.js   設定・履歴の画面操作
├─ account-store.js  Firestore保存API
├─ firestore.rules   ブラウザからの直接アクセスを拒否するルール
├─ server.js         Cloud Run用サーバー、認証・保存・Gemini API中継
├─ Dockerfile        Cloud Run用コンテナ設定
├─ package.json      Node.js起動設定
├─ start-server.ps1  ローカル起動用スクリプト
├─ data/             データ類
└─ images/           画像素材
```
