import type { Locale } from "./site.ts";

type LocalizedText = Readonly<Record<Locale, string>>;

type LegalReadiness = Readonly<{
  documentsImplemented: boolean;
  formalValuesConfigured: boolean;
  publiclyReachable: boolean;
  offeringAligned: boolean;
  note: LocalizedText;
}>;

type ProductBase = Readonly<{
  id: "notes" | "cycle";
  name: string;
  audience: LocalizedText;
  problem: LocalizedText;
  summary: LocalizedText;
  features: Readonly<Record<Locale, readonly string[]>>;
  uiLanguages: readonly string[];
  availabilityLabel: LocalizedText;
  evidence: Readonly<{
    repository: string;
    revision: string;
    sources: readonly string[];
  }>;
  legalReadiness: LegalReadiness;
}>;

export type PreparingProduct = ProductBase &
  Readonly<{
    status: "preparing";
  }>;

export type AvailableProduct = ProductBase &
  Readonly<{
    status: "available";
    officialUrl: `https://${string}`;
    publicAvailabilityEvidence: `https://${string}`;
  }>;

export type Product = PreparingProduct | AvailableProduct;

export const products = Object.freeze([
  Object.freeze({
    id: "notes",
    name: "FUKAMU Notes",
    status: "preparing",
    audience: Object.freeze({
      ja: "考えや知識を、自分の手で少しずつ育てたい人へ。",
      en: "For people who want to develop their own ideas and knowledge over time.",
    }),
    problem: Object.freeze({
      ja: "書いたことが増えるほど、以前の考えとの関係を見失いやすくなります。",
      en: "As notes accumulate, the relationships between earlier and newer ideas can become difficult to follow.",
    }),
    summary: Object.freeze({
      ja: "考えをカードに書き、本文内のリンクでカード同士をつなぐノートです。",
      en: "A note-taking product for writing ideas on cards and connecting cards with links in their text.",
    }),
    features: Object.freeze({
      ja: Object.freeze([
        "カードの作成と編集",
        "端末への自動保存",
        "過去のカードをたどる表示",
        "カード同士の明示的なつながりの表示",
      ]),
      en: Object.freeze([
        "Create and edit cards",
        "Automatic saving on the device",
        "Browse earlier cards",
        "View explicit connections between cards",
      ]),
    }),
    uiLanguages: Object.freeze(["日本語"]),
    availabilityLabel: Object.freeze({
      ja: "一般提供に向けて準備中です。正式な利用URLは、公開状態と法的文書を確認してから案内します。",
      en: "Preparing for general availability. An official product URL will be added only after availability and legal information are verified.",
    }),
    evidence: Object.freeze({
      repository: "https://github.com/fukamu/notes",
      revision: "c23248ce25ef2d2464611bf59b777f5362f06781",
      sources: Object.freeze([
        "README.md",
        "components/notes-presentation.tsx",
        "docs/legal-launch-compliance.md",
      ]),
    }),
    legalReadiness: Object.freeze({
      documentsImplemented: true,
      formalValuesConfigured: false,
      publiclyReachable: false,
      offeringAligned: false,
      note: Object.freeze({
        ja: "法的ページの実装はありますが、正式情報の設定、一般公開、実際の提供内容との最終整合は未確認です。",
        en: "Legal pages exist in the product repository, but formal values, public availability, and final alignment with the actual offering are not yet verified.",
      }),
    }),
  }) satisfies PreparingProduct,
  Object.freeze({
    id: "cycle",
    name: "FUKAMU Cycle",
    status: "preparing",
    audience: Object.freeze({
      ja: "目標に向けた行動を記録し、振り返りながら改善したい人へ。",
      en: "For people who want to record, review, and improve the work they do toward a goal.",
    }),
    problem: Object.freeze({
      ja: "計画と実行だけで終わると、次に何を変えるかを判断する材料が残りにくくなります。",
      en: "When work stops at planning and execution, it can be difficult to retain enough context to decide what to change next.",
    }),
    summary: Object.freeze({
      ja: "目標に向けた計画・実行・評価・改善を記録し、サイクルごとに振り返るアプリです。",
      en: "An application for recording plans, actions, evaluations, and improvements toward a goal, then reviewing each cycle.",
    }),
    features: Object.freeze({
      ja: Object.freeze([
        "目標の設定",
        "PDCAサイクルの記録",
        "サイクル完了後の目標の見直し",
        "過去の目標とサイクルの履歴",
        "任意で使える、目標整理や次のアクションのAI支援",
      ]),
      en: Object.freeze([
        "Set goals",
        "Record PDCA cycles",
        "Review a goal after completing a cycle",
        "Review the history of goals and cycles",
        "Optional AI assistance for refining goals and actions",
      ]),
    }),
    uiLanguages: Object.freeze(["日本語"]),
    availabilityLabel: Object.freeze({
      ja: "一般提供に向けて準備中です。正式な利用URLは、本番環境と利用者向け文書を確認してから案内します。",
      en: "Preparing for general availability. An official product URL will be added only after the production environment and user-facing legal information are verified.",
    }),
    evidence: Object.freeze({
      repository: "https://github.com/fukamu/cycle",
      revision: "7f4bf1198690145f35b2b335c5841b08149933d4",
      sources: Object.freeze([
        "docs/design.md",
        "docs/environment.md",
        "docs/operations.md",
        "frontend/src/app/App.tsx",
      ]),
    }),
    legalReadiness: Object.freeze({
      documentsImplemented: false,
      formalValuesConfigured: false,
      publiclyReachable: false,
      offeringAligned: false,
      note: Object.freeze({
        ja: "利用者向け法的文書、正式情報の設定、本番の一般公開、実際の提供内容との整合はいずれも未確認です。",
        en: "User-facing legal documents, formal values, general production availability, and alignment with the actual offering are not yet verified.",
      }),
    }),
  }) satisfies PreparingProduct,
] as const satisfies readonly Product[]);

export function productById(id: Product["id"]): Product {
  const product = products.find((candidate) => candidate.id === id);
  if (!product) {
    throw new Error(`Unknown product: ${id}`);
  }
  return product;
}
