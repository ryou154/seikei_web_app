# AI骨格フィット・整形シミュレーター

学習用のWEBアプリ試作品です。

## 使い方

1. VS Codeで `seikei_web_app` フォルダーを開く
2. `index.html` をブラウザで開く
3. 顔画像を選択する
4. 理想のイメージを入力する
5. `AIシミュレーションを実行` を押す

## Gemini画像生成を使う場合

Gemini画像生成を使う場合は、`index.html` を直接開くのではなく、ローカルサーバーから開きます。

1. Google AI StudioでGemini APIキーを取得する
2. VS Codeのターミナルで `seikei_web_app` フォルダーへ移動する
3. 次のコマンドでAPIキーを設定する

PowerShell:

```powershell
$env:GEMINI_API_KEY="取得したAPIキー"
.\start-server.ps1
```

4. ブラウザで `http://localhost:3000` を開く
5. `After画像の作成方法` で `Gemini画像生成` を選ぶ

`npm` が使えない場合でも、このアプリは外部パッケージを使っていないため問題ありません。  
`start-server.ps1` は、PCに入っているNode.jsまたはCodex同梱のNode.jsを使って `server.js` を起動します。

Gemini画像生成を使うと、選択した顔画像と入力内容がGoogleのGemini APIへ送信されます。

## 機能

- 顔画像のプレビュー
- 希望内容に応じたAI分析風コメント
- おすすめクリニック表示
- ブラウザ内の保存履歴
- Gemini APIによるAfter画像生成

## 注意

このアプリは授業制作・学習用の参考シミュレーションです。医療診断や実際の治療判断を行うものではありません。
