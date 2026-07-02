$ErrorActionPreference = "Stop"

if (-not $env:GEMINI_API_KEY) {
  Write-Host "GEMINI_API_KEY が未設定です。"
  Write-Host "画面は開けますが、Gemini画像生成を使うにはAPIキーを設定してください。"
}

$localNode = Get-Command node -ErrorAction SilentlyContinue
$codexNode = "C:\Users\ryour\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if ($localNode) {
  & $localNode.Source ".\server.js"
} elseif (Test-Path $codexNode) {
  & $codexNode ".\server.js"
} else {
  Write-Host "Node.js が見つかりません。"
  Write-Host "Node.jsをインストールするか、Codexの同梱Node.jsが使える環境で実行してください。"
  exit 1
}
