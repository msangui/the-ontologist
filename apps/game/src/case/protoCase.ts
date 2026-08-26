import { VOCAB } from '@ontologist/semantic-engine';
import type { TruthValue } from '@ontologist/semantic-engine';

/**
 * Proto-case: a hand-sized preview of "The Recall at FreshMart" (backlog #37),
 * wired straight into the semantic engine. This is demo data living in the app
 * for now; it migrates to a Scenario Schema JSON file as #30 grows the schema
 * (placement, scan facts, briefs).
 *
 * The chain the player uncovers:
 *   recall notice  → hazelnut paste is a recalled ingredient
 *   product label  → Choco Oat Bites contains Choco Base Mix
 *   manifest       → Choco Base Mix contains hazelnut paste
 *   ⇒ engine derives (transitive) that Choco Oat Bites contains it → AFFECTED
 *
 * Trail Crunch's label is smudged: contains = unknown → UNCERTAIN, not safe.
 * Sunny Pops' shelf tag contradicts the manifest → a red thread.
 */

export interface ScanFact {
  readonly subject: string;
  readonly predicate: string;
  readonly object: string | number | boolean;
  readonly truth?: TruthValue;
}

export interface ProtoEntity {
  readonly id: string;
  readonly label: string;
  readonly kind: 'product' | 'document';
  /** World placement, x/z on the floor grid. */
  readonly position: readonly [number, number];
  /** One-line flavor for the Lens card. */
  readonly blurb: string;
  readonly scanFacts: readonly ScanFact[];
  /** Evidence wave: 1 = investigation, 2 = Field Verification (hidden until commit). */
  readonly wave?: 1 | 2;
}

export const STORE_ID = 'store:freshmart-12';
export const RECALLED_CLASS = 'class:recalled-ingredient';

/** Case-start ontology: asserted before play, provenance "scenario". */
export const ONTOLOGY_FACTS: readonly ScanFact[] = [
  { subject: 'contains', predicate: VOCAB.transitiveProperty, object: true },
  { subject: 'sells', predicate: VOCAB.inverseOf, object: 'soldAt' },
];

export const ENTITIES: readonly ProtoEntity[] = [
  {
    id: 'doc:recall-notice',
    label: 'Recall Notice',
    kind: 'document',
    position: [-6.5, -4],
    blurb: 'URGENT — supplier batch recall: hazelnut paste, Northstar Foods.',
    scanFacts: [
      { subject: 'ing:hazelnut-paste', predicate: VOCAB.instanceOf, object: RECALLED_CLASS },
    ],
  },
  {
    id: 'doc:delivery-manifest',
    label: 'Delivery Manifest',
    kind: 'document',
    position: [-6.5, -0.5],
    blurb: "This week's deliveries, with supplier mix compositions.",
    scanFacts: [
      { subject: 'mix:choco-base', predicate: 'contains', object: 'ing:hazelnut-paste' },
      { subject: 'product:choco-oat-bites', predicate: 'soldAt', object: STORE_ID },
      { subject: 'product:trail-crunch', predicate: 'soldAt', object: STORE_ID },
      { subject: 'product:sunny-pops', predicate: 'soldAt', object: STORE_ID },
    ],
  },
  {
    id: 'product:choco-oat-bites',
    label: 'Choco Oat Bites',
    kind: 'product',
    position: [2.5, -2.6],
    blurb: 'Ingredients: choco base mix, rolled oats, honey.',
    scanFacts: [
      { subject: 'product:choco-oat-bites', predicate: 'contains', object: 'mix:choco-base' },
    ],
  },
  {
    id: 'product:trail-crunch',
    label: 'Trail Crunch',
    kind: 'product',
    position: [5.5, -2.6],
    blurb: 'The ingredient label is smudged — hazelnut paste? Can’t tell.',
    scanFacts: [
      {
        subject: 'product:trail-crunch',
        predicate: 'contains',
        object: 'ing:hazelnut-paste',
        truth: 'unknown',
      },
    ],
  },
  {
    id: 'product:berry-granola',
    label: 'Berry Granola',
    kind: 'product',
    position: [2.5, 2.4],
    blurb: 'Ingredients: rolled oats, dried berries.',
    scanFacts: [
      { subject: 'product:berry-granola', predicate: 'contains', object: 'ing:rolled-oats' },
    ],
  },
  {
    id: 'product:sunny-pops',
    label: 'Sunny Pops',
    kind: 'product',
    position: [5.5, 2.4],
    blurb: 'Shelf tag says DISCONTINUED — but it was on this week’s manifest…',
    scanFacts: [
      { subject: 'product:sunny-pops', predicate: 'contains', object: 'ing:corn' },
      { subject: 'product:sunny-pops', predicate: 'soldAt', object: STORE_ID, truth: 'false' },
    ],
  },
  {
    id: 'doc:lab-report',
    label: 'Lab Results',
    kind: 'document',
    position: [-5.2, 2.8],
    blurb: 'Courier drop from the testing lab — the field results are in.',
    wave: 2,
    scanFacts: [
      // The unknown resolves: Trail Crunch DOES contain the recalled paste.
      { subject: 'product:trail-crunch', predicate: 'contains', object: 'ing:hazelnut-paste' },
      // And an explicit negative: Berry Granola is confirmed clean.
      {
        subject: 'product:berry-granola',
        predicate: 'contains',
        object: 'ing:hazelnut-paste',
        truth: 'false',
      },
    ],
  },
];

/** The human anchor (§1.6): who is harmed if the meaning failure persists. */
export const ANCHOR_NAME = 'Maya';

export const PRODUCT_IDS = ENTITIES.filter((e) => e.kind === 'product').map((e) => e.id);

/** Human labels for every id that can appear in a fact. */
export const LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(ENTITIES.map((e) => [e.id, e.label])),
  [STORE_ID]: 'FreshMart #12',
  [RECALLED_CLASS]: 'Recalled Ingredient',
  'mix:choco-base': 'Choco Base Mix',
  'ing:hazelnut-paste': 'Hazelnut Paste',
  'ing:rolled-oats': 'Rolled Oats',
  'ing:corn': 'Corn',
  contains: 'contains',
  soldAt: 'sold at',
  sells: 'sells',
};
