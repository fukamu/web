# 受入確認

## 自動検証

- `npm run check`: format、Astro / TypeScript、vendored tokenの8ファイル・manifest SHA、内容contract
- `npm run test:launch-gate`: 公開/allowlistの4状態、JWT署名・issuer・audience、未認証・存在しないUser・設定異常・直接request・cache境界
- `npm run test:launch-gate:e2e`: Production相当Workerで未許可Browser、直接page / asset request、status API、JavaScript無効画面を確認
- `npm run check:release-artifact`: 現行と直前版のHTML・header境界、参照hash assetの持越し、未参照旧assetの除外、復旧成果物
- `npm run build`: 日英12ページ、404、robots、sitemapの静的生成
- `npm run check:budgets`: route別の非圧縮byte数、request数、JS / image / font予算
- `npm run test:site`: desktop / mobile、内部リンク、hreflang、redirect、404、JavaScript無効、解析遮断、token由来style、keyboard、320 CSS px、axe serious / critical 0
- `npm run test:visual`: 全12ページのdesktop / mobile screenshot
- `npm run check:release-content`: 本番実値、承認済み法的文書、custom domain、index可能なdist、CWA snippetを公開前に強制
- `npm run test:lighthouse && npm run report:lighthouse`: 日英12ページ×desktop/mobile×5回。Performance / Accessibility / Best Practices / SEOの各算術平均98以上

## 手動確認

- 日本語・英語の内容が同じ事実を伝え、未確認情報を断定していない
- 320 CSS pxからdesktopまで横スクロール・切れ・重なりがない
- skip link、focus、見出し順、表のmobile再配置、色と非色の状態表現が理解できる
- 製品が準備中の間、外部利用CTA、無効button、`#`仮link、staging URLが出ない
- 会社情報、問い合わせ、電子公告、プライバシーの導線がheader / footerから到達できる
- ロゴ正本反映後、寸法、alt、favicon、OGPで誤認・ぼけ・レイアウトシフトがない

## 公開後確認

Production Launch Gateが閉じている間は、まず未認証Browserで全page / assetが`403`、`GET /api/launch-status`が`canAccess: false`、全応答が`private, no-store`であることを自動確認する。次に、allowlistへ登録した実Userの隔離Browserで[運用手順のSmoke Test](operations.md#closed-production-smoke-test)を完了する。許可Userの結果が別Browserへcache共有されないことも確認する。

- 本番HTTPSで全ページ200、未知URL404、拡張子なしURLのtrailing slash転送
- Content-Type、gzip / Brotli、ETag / 304、HTML再検証、hash asset immutable cache
- CSP、nosniff、Referrer-Policy、Permissions-Policy、frame制限、対象hostだけのHSTS
- canonical、hreflang、sitemap、robots、本番noindexなし
- 公開メールの表示・mailto・コピー、freee電子公告URLのHTTPS到達と社名
- CWA scriptは1回だけ取得、beacon POSTが成功、遮断しても全機能が利用可能。Cookie / localStorageを作らず、payloadに問い合わせ本文・製品利用者内容・機微URLがない
- 本番の全URL Lighthouseを同じ5回条件で再測定し、ラボとの差を記録
- Wrangler出力からdeployment / version IDを保存し、Issue / PR / merge SHA / workflow run / 本番URLと結び付ける

本番実値が未確認の間は「実装完了／公開待ち」です。`check:release-content`の失敗を無効化、条件分岐で回避、仮値で通過させてはいけません。
