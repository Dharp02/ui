import * as React from 'react';
import {
  ComparisonSection,
  type ComparisonSectionProps,
} from '../ComparisonSection';
import { CtaSection, type CtaSectionProps } from '../CtaSection';
import { FaqSection, type FaqSectionProps } from '../FaqSection';
import {
  FeatureGridSection,
  type FeatureGridSectionProps,
} from '../FeatureGridSection';
import { HeroSection, type HeroSectionProps } from '../HeroSection';
import { LeadFormSection, type LeadFormSectionProps } from '../LeadFormSection';
import {
  LogoCloudSection,
  type LogoCloudSectionProps,
} from '../LogoCloudSection';
import { PricingSection, type PricingSectionProps } from '../PricingSection';
import {
  ProcessStepsSection,
  type ProcessStepsSectionProps,
} from '../ProcessStepsSection';
import {
  ResourceCardsSection,
  type ResourceCardsSectionProps,
} from '../ResourceCardsSection';
import {
  SplitContentSection,
  type SplitContentSectionProps,
} from '../SplitContentSection';
import { StatsSection, type StatsSectionProps } from '../StatsSection';
import {
  TestimonialSection,
  type TestimonialSectionProps,
} from '../TestimonialSection';
import { VideoSection, type VideoSectionProps } from '../VideoSection';
import {
  BenchmarkTableSection,
  type BenchmarkTableSectionProps,
} from '../BenchmarkTableSection';
import {
  LinkGroupsSection,
  type LinkGroupsSectionProps,
} from '../LinkGroupsSection';
import {
  MetricListSection,
  type MetricListSectionProps,
} from '../MetricListSection';
import { PdfEmbedSection, type PdfEmbedSectionProps } from '../PdfEmbedSection';
import {
  RankedListSection,
  type RankedListSectionProps,
} from '../RankedListSection';
import { ReportByline, type ReportBylineProps } from '../ReportByline';
import { ReportLegend, type ReportLegendProps } from '../ReportLegend';
import {
  ReportMethodology,
  type ReportMethodologyProps,
} from '../ReportMethodology';
import {
  TileCartogramSection,
  type TileCartogramSectionProps,
} from '../TileCartogramSection';
import type { TemplateIconRegistry } from '../../templates/icons';
import type { TemplateComponents } from '../../templates/types';

/** A section the site renders itself, looked up by name in `LandingPage`'s `custom` map. */
export interface CustomBlock {
  type: 'custom';
  component: string;
  props?: Record<string, unknown>;
  id?: string;
}

/** Section props as page data: no event handlers, children or components, so a block survives JSON. */
type BlockData<P> = Omit<
  P,
  keyof React.DOMAttributes<HTMLElement> | 'components' | 'icons'
>;

/** One entry of a page's `blocks` array: a section's props tagged with its `type`. */
export type LandingBlock =
  | ({ type: 'hero' } & BlockData<HeroSectionProps>)
  | ({ type: 'logos' } & BlockData<LogoCloudSectionProps>)
  | ({ type: 'features' } & BlockData<FeatureGridSectionProps>)
  | ({ type: 'split' } & BlockData<SplitContentSectionProps>)
  | ({ type: 'process' } & BlockData<ProcessStepsSectionProps>)
  | ({ type: 'stats' } & BlockData<StatsSectionProps>)
  | ({ type: 'comparison' } & BlockData<ComparisonSectionProps>)
  | ({ type: 'pricing' } & BlockData<PricingSectionProps>)
  | ({ type: 'video' } & BlockData<VideoSectionProps>)
  | ({ type: 'testimonials' } & BlockData<TestimonialSectionProps>)
  | ({ type: 'resources' } & BlockData<ResourceCardsSectionProps>)
  | ({ type: 'faq' } & BlockData<FaqSectionProps>)
  | ({ type: 'lead-form' } & Omit<BlockData<LeadFormSectionProps>, 'action'> & {
        /** A URL, or the name of a function in `LandingPage`'s `actions` map. */
        action: string;
      })
  | ({ type: 'cta' } & BlockData<CtaSectionProps>)
  | ({ type: 'report-legend' } & BlockData<ReportLegendProps>)
  | ({ type: 'benchmark-table' } & BlockData<BenchmarkTableSectionProps>)
  | ({ type: 'ranked-list' } & BlockData<RankedListSectionProps>)
  | ({ type: 'tile-cartogram' } & BlockData<TileCartogramSectionProps>)
  | ({ type: 'metric-list' } & BlockData<MetricListSectionProps>)
  | ({ type: 'methodology' } & BlockData<ReportMethodologyProps>)
  | ({ type: 'byline' } & BlockData<ReportBylineProps>)
  | ({ type: 'link-groups' } & BlockData<LinkGroupsSectionProps>)
  | ({ type: 'pdf-embed' } & BlockData<PdfEmbedSectionProps>)
  | CustomBlock;

export type LandingBlockType = LandingBlock['type'];

const sections = {
  hero: HeroSection,
  logos: LogoCloudSection,
  features: FeatureGridSection,
  split: SplitContentSection,
  process: ProcessStepsSection,
  stats: StatsSection,
  comparison: ComparisonSection,
  pricing: PricingSection,
  video: VideoSection,
  testimonials: TestimonialSection,
  resources: ResourceCardsSection,
  faq: FaqSection,
  'lead-form': LeadFormSection,
  cta: CtaSection,
  'report-legend': ReportLegend,
  'benchmark-table': BenchmarkTableSection,
  'ranked-list': RankedListSection,
  'tile-cartogram': TileCartogramSection,
  'metric-list': MetricListSection,
  methodology: ReportMethodology,
  byline: ReportByline,
  'link-groups': LinkGroupsSection,
  'pdf-embed': PdfEmbedSection,
} satisfies Record<Exclude<LandingBlockType, 'custom'>, unknown>;

/** Block types whose section resolves icon tokens. */
const takesIcons = new Set<LandingBlockType>(['features', 'process']);

export interface LandingPageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The page, top to bottom. Plain data — import it from a content file or a CMS. */
  blocks: LandingBlock[];
  /** Site icon tokens, passed to every section that renders icons. */
  icons?: TemplateIconRegistry;
  /** Site image and link components (e.g. `next/image`, `next/link`), passed to every section. */
  components?: TemplateComponents;
  /** Site-owned sections for `{ type: 'custom', component }` blocks. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each custom section owns its props
  custom?: Record<string, React.ComponentType<any>>;
  /** Form actions (e.g. Server Actions, React 19) that `lead-form` blocks name in `action`. */
  actions?: Record<string, (formData: FormData) => void | Promise<void>>;
}

export const LandingPage = React.forwardRef<HTMLDivElement, LandingPageProps>(
  ({ blocks, icons, components, custom, actions, ...rest }, ref) => (
    <div ref={ref} data-slot="landing-page" {...rest}>
      {blocks.map((block, i) => {
        const key = block.id ?? `${block.type}-${i}`;
        if (block.type === 'custom') {
          const Custom = custom?.[block.component];
          return Custom ? (
            <Custom key={key} id={block.id} {...block.props} />
          ) : null;
        }
        const { type, ...props } = block;
        // `type` narrowed `props` to this section's props; TS can't correlate the lookup.
        const Section = sections[type] as unknown as React.ComponentType<
          Record<string, unknown>
        >;
        return (
          <Section
            key={key}
            components={components}
            {...(takesIcons.has(type) ? { icons } : {})}
            {...props}
            {...(block.type === 'lead-form'
              ? { action: actions?.[block.action] ?? block.action }
              : {})}
          />
        );
      })}
    </div>
  )
);
LandingPage.displayName = 'LandingPage';
