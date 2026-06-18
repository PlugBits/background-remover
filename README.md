# Product Photo Cleaner

製品写真・部品写真・工具写真・治具写真を、PowerPoint、作業標準書、QC資料などに貼りやすい画像へ整えるWebツールです。

現在のメイン版は、画像をサーバーへ送らずにブラウザ内で背景除去とマスク修正を行います。GitHub Pagesだけで公開でき、Cloud Run APIは不要です。

## 主な機能

- ブラウザ内背景除去
- 元画像RGB + 編集済みAlphaマスクによる再合成
- 消えた部品を「点で囲んで戻す」
- 余計な背景を「点で囲んで消す」
- 島単位の前景/背景切替
- ズーム / パン / 右クリックパン
- 回転: 1度単位、45度、90度
- 透明PNG / 白背景PNG / 黒背景PNG / 検査グレーPNG
- コピー: 透過PNGをクリップボードへコピー
- 自動余白詰め
- 出力サイズ: 高画質 / 標準 / 軽量
- Undo / Redo
- キーボードショートカット
- ブラウザ設定に従うダークモード

## キーボードショートカット

- `Esc`: パンに戻る
- `Ctrl+Z`: 点選択中は点を1つ戻す。点がなければマスク編集を元に戻す
- `Enter`: 点で囲むモード中に囲みを実行
- `Delete`: 点で囲むモード中に囲みをクリア

## 構成

- `index.html` / `styles.css` / `app.js`: GitHub Pagesで公開するブラウザ内完結版
- `client-side/index.html`: 旧 `/client-side/` URL向けのルートリダイレクト
- `.github/workflows/pages.yml`: GitHub Pagesデプロイ
- `bg-removal-spec.md`: ブラウザ内完結版の仕様メモ

## 通信について

画像データはサーバーへ送信しません。

初回利用時のみ、`@imgly/background-removal` が背景除去モデルをブラウザへダウンロードします。モデル取得後の処理、マスク修正、コピー、保存はブラウザ内で実行されます。

## 入力と出力

- 入力: PNG / JPG / JPEG
- 画像処理: 長辺1800px以内に軽量化してブラウザ内で実行
- 出力: PNG
- 出力背景: 透明 / 白 / 黒 / 検査グレー
- アップロード画像は保存しません

## GitHub Pages

`main` ブランチへpushすると、GitHub ActionsでPages用ファイルが公開されます。

Toolsポータルには、ルートのGitHub Pages URLを登録してください。
