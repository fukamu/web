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
