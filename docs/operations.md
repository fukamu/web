# 運用手順

## 公開前の設定

公開値を確認した担当者が、同じPull Requestで次を更新します。

1. `src/data/site.ts`に本番origin、会社情報、公開メール、電子公告URL、承認済みロゴ、CWA公開beacon token、承認済みプライバシー文書の状態・施行日を設定する。
2. ロゴ正本を`public/`へ追加し、実寸と日英altを`site.brand.logo`へ設定する。現状の透明faviconも承認済みブランドfaviconへ置き換える。
3. `wrangler.jsonc`に、本番originと一致する対象ホストだけの`custom_domain: true` routeを追加する。DNSやMX/TXT、製品サブドメインを変更しない。
4. GitHub Environment `production-site`に、variable `CLOUDFLARE_ACCOUNT_ID`、variable `SITE_BASE_URL`、secret `CLOUDFLARE_API_TOKEN`を設定する。API tokenは対象account / Workerのデプロイに必要な最小権限とし、通常運用にDNS編集権限を付けない。
5. Cloudflare Web Analyticsに本番hostnameと合成計測用`lhci.<本番hostname>`の扱いを設定し、合成トラフィックを実利用集計から区別する。Cloudflare側の自動snippet挿入は無効にして二重計測を防ぐ。
6. `npm run check:release-content`と`npm run build && npm run check:release-content -- --dist`を通す。

プライバシー文案はコードが生成したことを法的妥当性の根拠にせず、実際の取扱い、Cloudflare契約・設定、公開日を確認して承認します。

## Production Launch Gate

本番Workerは`PUBLIC_ACCESS_ENABLED=false`でdeployでき、一般公開とは独立している。通常のFeature Flagではなく、Static Assetsを含むサービス全体の認可境界である。Source of Truthは、Cloudflare Accessが署名した現在Userのapplication token `sub`、`wrangler.jsonc`の公開flag、Worker secret `LAUNCH_ALLOWED_USER_IDS_JSON`である。

### 初期設定

実際の本番hostname、Cloudflare Zero Trust team domain、Access application AUD、利用者は未確認のため、値をコードへ仮置きしない。担当者は次を行う。

1. 本番hostnameの`/__launch-auth*`だけを対象とするSelf-hosted Cloudflare Access applicationを作る。認証候補を絞るAccess policyを設定し、最終認可はWorker allowlistに残す。
2. Access applicationのCookie Path Attributeを無効にして、application domainの`CF_Authorization` cookieが`/__launch-auth`以外にも送られるようにする。HttpOnlyを有効、SameSiteを`Lax`にし、閉鎖状態の実Browserで再ログインを確認する。
3. Worker作成後、確認済みの値を標準入力から設定する。shell historyやRepositoryへ値を残さない。

```sh
printf '%s' 'https://<verified-team>.cloudflareaccess.com' | npm exec -- wrangler secret put CF_ACCESS_TEAM_DOMAIN
printf '%s' '<verified-application-aud>' | npm exec -- wrangler secret put CF_ACCESS_AUD
printf '%s' '[]' | npm exec -- wrangler secret put LAUNCH_ALLOWED_USER_IDS_JSON
```

設定前・設定不正時はWorkerが`503`でfail closedになる。`Cf-Access-Jwt-Assertion` / `CF_Authorization`は署名、issuer、audience、有効期限をWorker内で検証する。email、query、Client送信の`user_id`は認可に使わない。

### allowlist操作

Cloudflare側で検証したapplication tokenの`sub`だけを登録する。emailや推測したIDを入れない。追加・削除は常にallowlist全体をJSON配列として置換し、変更後に対象Userと未許可Userの両方でSmoke Testする。

```sh
printf '%s' '["<verified-access-sub>"]' | npm exec -- wrangler secret put LAUNCH_ALLOWED_USER_IDS_JSON
printf '%s' '[]' | npm exec -- wrangler secret put LAUNCH_ALLOWED_USER_IDS_JSON
```

Workerは各requestで現行allowlistを照合するため、削除したUserを過去の判定cacheで通さない。許可中のpage / assetと`GET /api/launch-status`は`Cache-Control: private, no-store`、`Vary: Cookie, Cf-Access-Jwt-Assertion`を返す。allowlist自体や他Userの状態は返さない。

### Closed production Smoke Test

本番変更を行わない隔離Browser profileを使い、次を記録する。

1. 未認証Browserでpageとassetの直接URLが`403`、`/api/launch-status`が`publicAccessEnabled=false`、`userAllowed=false`、`canAccess=false`である。
2. allowlist Userで`/__launch-auth`からAccessへログインし、元のpageへ戻り、statusが`false / true / true`になる。
3. `/__launch-logout`を開き、Cloudflare Accessのapplication logoutを経由して`CF_Authorization` cookieが失効し、再度pageが`403`になることを確認する。その後、同じUserで再ログインできることを確認する。
4. 全page、trailing-slash、404、言語切替、再読込を確認する。WebにはCRUD、決済、会員DBがないため追加しない。
5. 別Browser profileと別端末で未許可Userが拒否され、許可UserのHTML / statusが共有されないことを確認する。
6. Worker logにJWT、cookie、allowlist、User IDを出していないことを確認する。

自動release workflowはGateが閉じている場合、未認証側のdeny Smoke Testだけを実行し、公開pageのLighthouseを行わない。許可Userの対話的Access認証は上記手順で実施し、Issue / PR / deployment IDへ証跡を添付する。

### Closed Betaから一般公開

Closed Betaでは確認済み`sub`だけをallowlistへ追加する。一般公開は`wrangler.jsonc`の`PUBLIC_ACCESS_ENABLED`を文字列`"true"`へ変更する専用Pull Requestで行い、通常のreview / CI / deployを通す。公開後は未認証`GET /api/launch-status`が`publicAccessEnabled=true`、`canAccess=true`であること、通常のpublic cache policyとLighthouseが復帰したことを確認する。切戻しは同じfieldを`"false"`へ戻す明示的なPull Requestとし、Access設定・開発者allowlistを維持する。

## CI/CD

`Quality`はPRと対象branchで静的検証、token/content contract、build、容量、Wrangler dry-run、Playwright/axe、画面証跡を実行します。release contentが揃ったときだけ全URL・全端末・各5回のHTTPSラボLighthouseを追加実行します。main向けPRでは`Production release readiness`も必須で、release contentが不足したままmainへ進むことを防ぎます。

main更新では`Release production site`が同じconcurrency group内で次を直列実行します。

1. source / release content / build / browser / Lighthouse gate
2. 直前の成功リリース成果物を取得
3. 現行HTMLと、現行・直前HTMLが参照するhash assetだけを含む固定成果物を作成・hash検証
4. mainが新しいSHAへ進んでいないことを再確認
5. GitHub Environmentの承認とsecretを使って、固定成果物だけをWranglerで公開
6. 本番URLのstatus、header、redirect、404、canonical、hreflang、解析送信、全ページLighthouseを確認

初回公開では直前版がないためrecovery artifactはありません。2回目以降は、直前版HTMLと必要な現行・直前hash assetだけを含むrecovery artifactを90日保持します。古い法的文書やHTMLを現行成果物へ混ぜず、資産を無期限に蓄積しません。Cloudflare側が旧資産を無期限保持する前提にも依存しません。

## 復旧

通常の復旧は`Restore verified production artifact`を手動実行します。成功したrelease workflow run ID、そのrunのSHA、法的内容が現在も正しいことを確認した`CONFIRMED`が必要です。workflowは成功run・workflow path・SHA・成果物hashを再検証してから復旧します。

法的文書、会社情報、解析方針が現在と合わない過去版は復旧しません。修正版を通常のmainリリースとして公開します。Cloudflare dashboardからの直接deployを通常経路にせず、緊急操作をした場合は理由・操作者・deployment ID・復旧内容をIssueへ記録します。

## 保護設定

mainにはPull Request必須、`Validate, build, and browser-test`、`Production release readiness`、`Full Lighthouse release gate`必須、会話解決必須、force push / deletion禁止を設定します。管理者による迂回は緊急時だけとし記録します。production-siteには必要なreviewerとmain限定deployment branchを設定します。

## ローカルHTTPSラボ

Ubuntuでは`libnss3-tools`とPlaywright Chromiumが必要です。

```sh
npm exec -- playwright install --with-deps chromium
export CHROME_PATH="$(node --input-type=module -e "import { chromium } from '@playwright/test'; process.stdout.write(chromium.executablePath())")"
npm run build
npm run test:lighthouse
npm run report:lighthouse
```

Ubuntu標準以外の`certutil`を使う場合は、Chromeと互換性のある実体を`CERTUTIL_PATH`へ明示します。各runは新しいChrome profileとXDG NSS DBを作り、一時CAは終了時に削除されます。
