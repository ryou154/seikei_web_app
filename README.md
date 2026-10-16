# AI骨格フィット・整形シミュレーター

顔画像と希望イメージをもとに、AIによるAfter予測画像・分析コメント・おすすめクリニック情報を表示する学習用WEBアプリです。

> このアプリは授業制作・学習用の参考シミュレーションです。医療診断や実際の治療判断を行うものではありません。

## 公開URL

Google Cloud Runで公開しています。

https://seikei-web-app-688786456161.asia-northeast1.run.app

ログイン画面: https://seikei-web-app-688786456161.asia-northeast1.run.app/login.html

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
- Firestoreへの分析結果・設定履歴保存（最新10件）
- 明示的に同意した場合のBefore／After画像保存・再表示

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

サーバーはFirebase Admin SDKでIDトークンの署名・期限・対象プロジェクトを検証し、Firebaseに登録され、メール確認済みのユーザーに `/api/session` と `/api/gemini-edit` を許可します。未確認メールのユーザーは利用できません。

- c3337@oic.jp
- c3241@oic.jp
- c3122@oic.jp
- c3201@oic.jp

Firebase自体へのユーザー登録を制限するものではありません。署名検証には公開鍵を使用し、秘密鍵ファイルは不要です。トークン失効・アカウント無効化の即時検知は行わず、発行済みIDトークンは有効期限まで受け付けます。

入力設定、分析結果、履歴はFirestoreへ保存し、Firebase UIDごとに分離します。顔写真とAfter画像は、保存時に利用者がチェックした場合だけCloud Storageへ保存します。画像取得にもログインが必要です。旧バージョンのブラウザ履歴は所有者を特定できないため自動移行しません。

Firebase ConsoleでGoogle・メール／パスワードを有効化し、Cloud Runのホスト名を承認済みドメインに追加してください。ローカルで試す場合は `localhost` も必要です。Googleログインはポップアップを使用します。

テスト: `pnpm test`。デプロイ後は対象アカウントでGoogleログイン、メール登録・確認、再設定、ログアウトとアカウント切替を確認してください。確認メール・再設定メールの実送信は自動テストでは行いません。

## クリニック情報API

クリニック情報はCloud RunからFirestoreへ接続し、ログイン済みユーザーだけが次のAPIを利用できます。ブラウザからFirestoreやGoogle Places APIを直接呼び出しません。

```text
GET /api/clinics
GET /api/clinics/:clinicId
```

一覧APIでは `prefecture`、`city`、`keyword`、`treatment`、`hasPricing`、`verificationStatus`、`page`、`limit` を指定できます。公開状態が `published` の情報だけを返し、内部確認メモなどはレスポンスに含めません。

既存の21院をFirestore用データへ変換するときは、最初にドライランを実行します。

```powershell
npm run clinics:check
```

Firestoreへ書き込む場合だけ確認用環境変数を付けます。Firebase Admin SDKのApplication Default CredentialsとFirestore書き込み権限が必要です。

```powershell
$env:CONFIRM_CLINIC_IMPORT="yes"
npm run clinics:import
```

移行処理は同じIDへ再実行でき、既存ドキュメントの `createdAt` は保持します。従来データでは営業状態、料金詳細、リスク、保証などを確認できないため推測せず、確認状態を `needs_review` として登録します。

### Google Placesから候補を収集する

Places API（New）のText Searchを使い、都道府県ごとに「美容外科」「美容クリニック」を検索します。取得するのは候補発見に必要なPlace IDと名称だけです。名称は実行結果の確認用に一時表示し、Firestoreへは保存しません。写真・口コミ・住所・座標・電話番号・営業時間も候補収集では要求しません。

まずAPIを呼ばず、最大リクエスト数だけを確認します。

```powershell
npm run clinics:places:plan -- --prefecture 大阪府 --max-pages 1
npm run clinics:places:plan -- --all --max-pages 1
```

大阪府・2キーワード・1ページは最大2リクエスト、全国・2キーワード・1ページは最大94リクエストです。1ページは最大20件で、`--max-pages`は1〜3に制限しています。

APIを呼び出して結果を確認するだけの場合:

```powershell
$env:GOOGLE_PLACES_API_KEY="Places API（New）専用キー"
$env:CONFIRM_PLACES_REQUEST="yes"
npm run clinics:places:check -- --prefecture 大阪府 --max-pages 1
```

Firestoreへ保存する場合:

```powershell
$env:GOOGLE_PLACES_API_KEY="Places API（New）専用キー"
$env:CONFIRM_PLACES_REQUEST="yes"
$env:CONFIRM_CLINIC_IMPORT="yes"
npm run clinics:places:sync -- --prefecture 大阪府 --max-pages 1
```

新規候補はPlace ID、検索した都道府県・キーワード、確認日時だけを `draft / unverified` で保存し、利用者画面へ自動公開しません。Google Places由来の名称などは長期保存せず、公式サイトを確認した担当者がクリニック情報を登録します。既存Place IDを再取得した場合も、公式サイト、施術、料金、医師、確認状態などの人が確認した項目は上書きしません。全国実行の前に大阪府など1地域で結果と請求状況を確認してください。

APIキーはFirebase Web APIキーやGemini APIキーと共用せず、Places API（New）だけに制限したサーバー用キーを使用します。Text SearchではField Maskが必須で、不要な項目を要求しないことが処理量と課金の抑制につながります。

### クリニック候補を確認・公開する

管理担当者は `/admin-clinics.html` で候補一覧を開き、Google Placesの候補名をその場で確認してから、公式サイトを情報源として施術、料金、医師、症例、リスク、保証などを登録します。候補名は確認用にPlaces APIから都度取得し、Firestoreへ保存しません。

管理画面から候補を収集する場合は、次の順で操作します。

1. 「Googleから候補を収集」で都道府県を選ぶ
2. 取得ページ数を選ぶ（1ページにつき2検索、最大20件ずつ）
3. 「候補を収集」を押し、API呼び出し回数を確認する
4. 収集完了後、「下書き」の候補一覧から対象院を選ぶ
5. Googleから一時取得した院名、住所、電話、営業時間、営業状態、公式サイト候補を確認する
6. 公式サイトを開き、施術、料金、医師、症例、リスク、保証を入力する
7. 作業途中は「下書き保存」、すべて確認できたら「確認して公開」を押す

候補収集は管理者だけが実行でき、同時に複数回実行できません。新規候補は必ず `draft / unverified` で保存され、自動公開されません。Googleの基本情報は空欄だけに入力されるため、すでに人が確認した値を上書きしません。

管理画面を利用できるメールアドレスは `CLINIC_ADMIN_EMAILS` にカンマ区切りで設定します。未設定時は `AUTH_ALLOWED_EMAILS` を使用します。公開には、確認済み状態、名称、都道府県、公式サイトURL、1件以上の情報源が必要です。下書きは利用者向けAPIに表示されません。

```text
CLINIC_ADMIN_EMAILS=admin1@example.com,admin2@example.com
GOOGLE_PLACES_API_KEY=Places API（New）専用キー
```

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
- Cloud Storage for Firebase

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
FIREBASE_STORAGE_BUCKET=Firebase Storageのバケット名
```

APIキーを変更した場合は、Cloud Runの「新しいリビジョンの編集とデプロイ」から環境変数を差し替えます。

### Cloud Runの設定

- サービス名: `seikei-web-app`
- リージョン: `asia-northeast1`
- 認証: パブリックアクセスを許可
- 起動: `node server.js`
- ポート: Cloud Runの `PORT` 環境変数を使用

### 画像保存の設定

1. Firebase Consoleの `Storage` からデフォルトバケットを作成する。
2. バケット名をCloud Runの `FIREBASE_STORAGE_BUCKET` に設定する。
3. Cloud Runの実行サービスアカウントへ、対象バケットに限定して `Storage オブジェクト ユーザー` を付与する。
4. 新しいリビジョンをデプロイし、画像保存への同意をONにして保存・再表示・削除を確認する。

画像は `users/{firebaseUid}/simulations/{historyId}/before` と `after` に保存します。公開URLは発行せず、Cloud Runがログイン済みの所有者を確認して返します。1枚5MB、1回の送信14MBを上限とし、JPEG・PNG・WebPだけを受け付けます。

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
├─ login.html        ログイン画面
├─ app.html          シミュレーション画面
├─ style.css         デザイン
├─ script.js         画面操作・画像処理・Gemini呼び出し
├─ auth-client.js    Firebase Authenticationとのブラウザ連携
├─ auth-server.js    Firebase IDトークン検証と利用者制限
├─ navigation.js     共通ナビゲーション
├─ account-data.js   設定・履歴の画面操作
├─ account-store.js  Firestore保存API
├─ clinic-store.js   クリニック検索・詳細API
├─ places-clinic-sync.js  Google Places候補収集・Firestore同期
├─ image-store.js    Cloud Storage画像保存API
├─ firestore.rules   ブラウザからの直接アクセスを拒否するルール
├─ server.js         Cloud Run用サーバー、認証・Firestore・Storage・Gemini API中継
├─ Dockerfile        Cloud Run用コンテナ設定
├─ package.json      Node.js起動設定
├─ start-server.ps1  ローカル起動用スクリプト
├─ scripts/          Firestoreへのクリニック移行スクリプト
├─ data/             データ類
└─ images/           画像素材
```
