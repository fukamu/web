# FUKAMU株式会社コーポレートサイト

FUKAMU株式会社と製品を日本語・英語で紹介する静的サイトです。Astroで生成し、Cloudflare Workers Static AssetsへGitHub Actionsから公開します。

現在のソースは**公開前**です。会社情報、公開URL、法的文書、ロゴ、Cloudflare設定の正式値が揃うまで、`check:release-content`が本番公開を停止します。未確認の製品URLは掲載せず、FUKAMU Notes / FUKAMU Cycleは「準備中」として扱います。

## 開発

Node.js 24.21.0、npm 11.19.0を使用します。

```sh
npm ci
npm run dev
```

主な検証コマンドです。

```sh
npm run check
npm run check:release-artifact
npm run build
npm run check:budgets
npm run test:site
npm run test:visual
npm run check:release-content
```

`check:release-content`は、公開前の現在は理由付きで失敗するのが正しい状態です。Lighthouseの正式ゲートは公開値を反映後、CIで全URLをPC・スマートフォン各5回測定します。

## 構成

- `src/data/site.ts`: 公開状態、会社情報、origin、ロゴ、解析、法的文書の日付
- `src/data/products.ts`: 製品状態と根拠。`available`には検証済みHTTPS URLと公開根拠が必須
- `src/content/legal/`: 日英のプライバシー・アクセス解析文案
- `vendor/fukamu-design-tokens/`: 固定revisionから機械取得したデザイントークン
- `performance/`: 容量・Lighthouse条件
- `scripts/`: content/token/release gate、成果物固定、HTTPSラボ、Lighthouse集計
- `.github/workflows/`: 品質、リリース、復旧workflow

公開前に必要な値と手順は[運用手順](docs/operations.md)、調査根拠は[調査記録](docs/research.md)、検証項目は[受入確認](docs/acceptance.md)を参照してください。
