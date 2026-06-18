# Product Photo Cleaner

製品写真・部品写真・工具写真・治具写真を、プレゼン資料、作業標準書、QC資料などに貼りやすい画像へ整えるWebツールです。

フロントエンドは GitHub Pages で公開する静的Webアプリ、背景除去処理は Cloud Run 上の Python API で実行します。

## 主な機能

- 背景除去
- 自動余白除去
- 中央配置
- 背景色切替: 透明 / 白 / 黒
- 用途別プリセット
- Before / After 比較スライダー
- PNG / JPEG 保存
- 複数画像の直列一括処理
- ZIPダウンロード
- API送信前の画像軽量化

## 用途プリセット

- PowerPoint資料: 透過PNG、余白少なめ、中央配置
- 作業標準書: 白背景、余白中、中央配置
- QCレポート: 白背景、余白中、中央配置
- 部品写真: 白背景を初期値にし、黒背景表示でも確認しやすい設定
- カスタム: 背景、余白、出力形式、フチ除去、輪郭補正を手動設定

## 構成

- `index.html` / `styles.css` / `app.js`: GitHub Pages 用フロント
- `config.js`: Cloud Run API URL
- `api/`: Cloud Run 用 FastAPI アプリ
- `.github/workflows/pages.yml`: GitHub Pages デプロイ

## API

背景除去APIは既存の `/remove-background` を使います。

```js
window.BACKGROUND_REMOVER_CONFIG = {
  apiEndpoint: "https://your-service.run.app/remove-background"
};
```

## 制限

- 入力: PNG / JPG / JPEG
- 最大サイズ: 元画像 1ファイル 20MB
- API送信サイズ: 軽量化後 5MB 以下
- 出力: PNG / JPEG
- アップロード画像は保存しません
- 複数画像はAPI負荷を避けるため1枚ずつ直列処理します
- API送信前にブラウザ側で長辺2400px以内、JPEG品質0.88を目安に軽量化します
- 軽量化後も5MBを超える場合は、品質と寸法を段階的に下げて5MB以内に収めます

## Cloud Run API

ローカル確認:

```bash
cd api
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

Cloud Run へのデプロイ例:

```bash
gcloud run deploy background-remover-api \
  --source ./api \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars ALLOWED_ORIGINS=https://YOUR_USER.github.io \
  --memory 2Gi \
  --cpu 1 \
  --max-instances 1
```

`rembg` の初回モデル読み込みが重い場合があるため、メモリは `2Gi` を推奨します。

## GitHub Pages

`main` ブランチへ push すると GitHub Actions で Pages 用ファイルが公開されます。

Tools ポータルには、公開後の GitHub Pages URL を追加してください。
