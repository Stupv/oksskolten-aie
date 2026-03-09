# Oksskolten 実装仕様書 — 画像アーカイブ

> [概要に戻る](./01_overview.ja.md)

## 画像アーカイブ

記事内のMarkdown画像（`![alt](url)`）をダウンロードし、ローカル保存またはリモートアップロードしてURLを書き換える機能。元画像のリンク切れに備える。

### 有効化

settings テーブルの `images.enabled` を `'1'` または `'true'` にセットすることで有効化。設定画面（`/settings/ai`）から操作する。

### 処理フロー（`archiveArticleImages()`）

```
POST /api/articles/:id/archive-images
    │
    ├─ 前提チェック: 記事存在 / full_text あり / 機能有効 / 未アーカイブ
    ├─ 202 Accepted を即返却
    │
    └─ バックグラウンド処理:
        │
        ├─ Markdown内の画像URLをregexで抽出: /!\[([^\]]*)\]\(([^)]+)\)/g
        │
        ├─ 以下はスキップ:
        │   - 既にローカルURL（/api/articles/images/...）
        │   - data: URI
        │
        ├─ safeFetch() で画像をダウンロード（30秒タイムアウト）
        │   - Content-Length または実バッファサイズが max_size_mb 超過 → スキップ
        │
        ├─ ファイル名: {articleId}_{sha256(url).slice(0,12)}{ext}
        │
        ├─ ローカルモード:
        │   - images.storage_path（デフォルト: data/articles/images/）に保存
        │   - URLを /api/articles/images/{filename} に書き換え
        │
        ├─ リモートモード:
        │   - FormData で images.upload_url にPOST
        │   - レスポンスから images.upload_resp_path でURLを抽出
        │   - 失敗時は元URLを維持（部分成功を許容）
        │
        ├─ full_text を書き換え後のテキストで UPDATE
        └─ markImagesArchived(articleId) でタイムスタンプ記録
```

### 画像配信

ローカルモードでアーカイブした画像は `GET /api/articles/images/:filename` で配信する。

- パストラバーサル防御: `path.basename(filename) !== filename || filename.includes('..')` → 400
- MIMEタイプ: 拡張子に基づく（`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.avif`）
- キャッシュ: `Cache-Control: public, max-age=31536000, immutable`

### 画像削除

記事削除時、`images_archived_at` がセットされている場合は `deleteArticleImages(articleId)` を呼び出す。ローカル画像ディレクトリから `{articleId}_*` にマッチするファイルを全て削除する。

### リモートアップロード設定

任意の画像ホスティングサービスにアップロードする場合の設定:

| 設定項目 | 説明 | 例 |
|---|---|---|
| `mode` | `'remote'` を指定 | `remote` |
| `url` | アップロード先エンドポイント | `https://imghost.example.com/api/upload` |
| `headers` | HTTPヘッダー（JSON文字列） | `{"Authorization":"Bearer xxx"}` |
| `fieldName` | フォームフィールド名 | `image` |
| `respPath` | レスポンスからURLを抽出するドットパス | `data.url` |

`extractByDotPath(obj, dotPath)` でレスポンスJSONからネストされたパスを辿ってURLを取得する。設定が不完全（`upload_url` や `upload_resp_path` 未設定）な場合は処理をスキップする。

テストアップロード（`POST /api/settings/image-storage/test`）で1x1透過PNGを送信し、設定が正しく機能するか事前に検証できる。
