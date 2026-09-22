# 調査記録

調査日は2026-09-22（UTC）です。公開情報を推測で補わず、実装に使った根拠と未確認事項を分離しています。

## リポジトリ

| 対象          | 確認revision                               | 採用した事実                                                                                                                                                         |
| ------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web           | `691143a37e0938f0272dd3dca70691e66c1bef56` | 最新mainはREADMEのみ。過去サイトはrevert済みで、公開承認済みの正本とは扱わない                                                                                       |
| notes         | `c23248ce25ef2d2464611bf59b777f5362f06781` | カード、本文リンク、自動保存、過去カード・つながり表示。UIは日本語。正式値と一般公開は未確認                                                                         |
| cycle         | `7f4bf1198690145f35b2b335c5841b08149933d4` | 目標とPDCAサイクル、履歴、任意のAI支援。UIは日本語。本番と利用者向け法的文書は未確認                                                                                 |
| design-tokens | `eeb074c531aa984b63d373b65c0aa9213fd6a3bd` | artifact `5fcb062fafb717a5b7b9572187b3afd67519c715`の8ファイルをそのままvendor。manifest SHA-256は`5c7e8e0c146a08677d3b54f594ee240094646b65678f2cd4eaec7e58f76b3915` |

製品説明は上記revisionの一次資料に限定し、`src/data/products.ts`に参照ファイルを記録しました。所有者限定URL、staging、実装上のfixtureは正式URL・正式会社情報として採用していません。

## 配信・依存関係

- Cloudflare Workers Static Assetsのscriptless構成を採用し、`assets.directory`、`404-page`、`force-trailing-slash`を設定しました。
- 本番custom domainは未確認のため未設定です。`workers_dev`と`preview_urls`はfalseです。
- Cloudflare Web Analyticsは手動snippetを1か所だけ生成する設計です。公開beacon tokenがない間は一切出力しません。
- 依存は調査時点の互換性を実際に確認して完全固定しました。Node 24.21.0、npm 11.19.0、Astro 7.3.3、Wrangler 4.136.2、Lighthouse 13.5.0、Playwright 1.63.0、TypeScript 6.0.3です。
- Playwrightが固定するChrome for TestingをCIのブラウザとして使います。HTTPSラボではUbuntu `libnss3-tools`の`certutil`を使い、隔離したXDG NSS DBだけに一時CAを信頼させます。証明書検証は無効化しません。

## GitHub / Cloudflareの確認結果

- GitHubのmain保護rule / rulesetは調査時点で未設定でした。
- GitHub Environment `production-site`は存在しましたが、repository / environmentの変数とsecretは未設定でした。
- 現行mainには有効なworkflowがなく、過去のPages deployは失敗状態でした。
- Cloudflareのaccount、custom domain、Web Analytics site、API tokenはローカルまたはGitHub設定から確認できませんでした。

## 未確認の公開情報

`src/data/site.ts`では未確認値を`null`、公開状態を`draft`、プライバシー文書を`draft`として保持します。必要なのは正式な本番origin、設立日、代表者名、公開所在地、公開メール、freee発行の電子公告URL、承認済みロゴ正本、Cloudflare Web Analyticsの公開beacon token、プライバシー文案の承認と施行日です。

FUKAMU Notes / Cycleは正式公開を確認できないため`preparing`です。この状態でも、誤認を生まない会社サイトの実装と安全なプレビューは成立します。
