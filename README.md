# FUKAMU Web

FUKAMUが開発するプロダクトを紹介する公式ホームページ兼ポートフォリオです。現在は [FUKAMU Cycle](https://github.com/fukamu/cycle) を掲載しています。

## 方針

サイト本体はHTMLとCSSだけで構成し、JavaScript、フレームワーク、ランタイム依存関係、ビルド工程を持ちません。小規模な静的サイトに必要な複雑さだけに抑えることで、配信対象を確認しやすくし、攻撃面と保守負担を小さくしています。Node.jsはGitHub Actions内の検証ツールを一時実行するためにだけ使用し、プロダクション配信には不要です。

## Repository構造

```text
.
├── site/                       # Cloudflare Pagesへアップロードする全ファイル
│   ├── index.html
│   ├── 404.html
│   ├── styles.css
│   ├── robots.txt
│   ├── _headers
│   └── assets/favicon.svg
├── scripts/validate-site.py    # Python標準ライブラリだけの構造・参照検証
├── .github/workflows/
│   ├── site-ci.yml
│   └── site-deploy.yml
└── .github/dependabot.yml
```

`site/` 以外はデプロイされないため、README、検証スクリプト、workflowが公開アセットに混入しません。

## ローカル表示と検証

BashまたはPowerShellでRepositoryルートから次を実行し、<http://localhost:8000> を開きます。

```bash
python -m http.server 8000 --directory site
```

Python標準ライブラリによるローカル参照、必須ファイル、必須文言、HTMLの基本構造、JavaScript禁止、外部リソース禁止、セキュリティヘッダーの検証は次で実行できます。

```bash
python scripts/validate-site.py
```

CIではさらに固定バージョンのPrettier `3.9.6`、html-validate `11.9.0`、Stylelint `17.14.1` を一時実行し、format、HTML、基本的なアクセシビリティ、CSS構文を検査します。検証用のpackage manifestはRepositoryに置きません。

## プロダクトを追加する

`site/index.html` のProducts section内へ、既存の `.product-card` と同じ構造の `<article>` を追加します。見出しを1段ずつ保ち、確認できた説明と明示的なリンクテキストだけを記載してください。JavaScriptによるデータ層は不要です。

## セキュリティヘッダー

`site/_headers` は全パスに次を設定します。

| Header | 目的 |
| --- | --- |
| `Content-Security-Policy` | script、通信、form、object、frameを拒否し、style・font・imageを原則same-originへ制限します。favicon等に備えてimageの`data:`だけを許可します。 |
| `X-Content-Type-Options: nosniff` | MIME type推測を拒否します。 |
| `Referrer-Policy: no-referrer` | 外部遷移時を含めReferrerを送信しません。 |
| `Permissions-Policy` | camera、microphone、geolocation等の不要なbrowser機能を無効化します。 |
| `X-Frame-Options: DENY` | 古いbrowserでもframe埋め込みを拒否します。CSPの`frame-ancestors 'none'`も併用します。 |

独自ドメイン配下の別サービスへ影響を広げないため、HSTSのsubdomain一括適用やpreloadは設定していません。

`site/assets/favicon.svg` は白黒の「F」を使った暫定faviconであり、正式なブランドロゴではありません。

## CI/CD

`site-ci.yml` はpull request、mainへのpush、手動実行で、format・HTML・CSS・Repository固有ルール・ローカルHTTP 200を検証します。pull requestではSecretを使いません。

`site-deploy.yml` はmainへのpushまたは手動実行で同じ重要検証を再実行した後、`production-site` Environmentから認証情報を受け取り、WranglerによるCloudflare Pages Direct Uploadを行います。アップロード対象は常に `site/` だけです。CloudflareのGit integrationは使わず、検証とデプロイの権限をGitHub Actionsに一本化します。

必要なGitHub設定は次のとおりです。

| 種別 | 名前 | 用途 |
| --- | --- | --- |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Pages projectを所有するCloudflare Account |
| Variable | `CLOUDFLARE_PAGES_PROJECT_NAME` | Direct Upload先。推奨値は`fukamu-web` |
| EnvironmentまたはRepository Secret | `CLOUDFLARE_PAGES_API_TOKEN` | Pages deployment専用Token。Account / Cloudflare Pages / Editに限定 |
| Environment | `production-site` | Production deploymentの承認・Secret境界 |

API TokenはTerraform用Tokenと共用しません。変数が未設定ならworkflowはデプロイ前に明示的に停止します。

## 初回bootstrap

1. Infrastructure RepositoryでR2 State backendを用意し、Terraform applyを実行してPages projectを先に作成します。
2. このRepositoryに上記Variables、Secret、`production-site` Environmentを設定します。
3. `site-deploy.yml` を手動実行するか、サイト変更をmainへmergeします。

独自ドメインが未設定の間は、Terraform outputの `<project-name>.pages.dev` を使用します。Pages projectはDirect Uploadとして作成するため、後からCloudflare Git integrationを同じprojectへ追加しないでください。

## 参照した一次資料

- [Cloudflare Pages: Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages: Direct Upload with continuous integration](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Cloudflare Pages: custom headers](https://developers.cloudflare.com/pages/configuration/headers/)
