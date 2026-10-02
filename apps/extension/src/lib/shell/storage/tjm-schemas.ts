import { z } from 'zod';
import type { TJMHistory } from '../../core/types/tjm';
import { MISSION_CATEGORIES } from '../../core/types/mission-classification';
import { MISSION_SOURCES } from '../../core/types/mission';

export const TJMRegionSchema = z.enum([
  'ile-de-france',
  'lyon',
  'marseille',
  'toulouse',
  'bordeaux',
  'nantes',
  'lille',
  'strasbourg',
  'rennes',
  'grenoble',
  'montpellier',
  'nice',
  'remote',
  'other',
]);
const SenioritySchema = z.enum(['junior', 'confirmed', 'senior']);
const RemoteSchema = z.enum(['full', 'hybrid', 'onsite']);
const CategorySchema = z.enum(MISSION_CATEGORIES);
const CountSchema = z.number().int().nonnegative();
const DateSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const PriceSchema = z.number().positive();
export const TJMObservationSchema = z
  .object({
    identity: z.string().min(1),
    observedAt: DateSchema,
    source: z.enum(MISSION_SOURCES),
    stacks: z.array(z.string()),
    tjm: PriceSchema.nullable(),
    category: CategorySchema.nullable(),
    seniority: SenioritySchema.nullable(),
    remote: RemoteSchema.nullable(),
    region: TJMRegionSchema.nullable(),
  })
  .strict();
export const TJMLegacyRecordSchema = z.object({
  stack: z.string(),
  date: DateSchema,
  min: z.number(),
  max: z.number(),
  average: z.number(),
  sampleCount: CountSchema,
  seniority: SenioritySchema.nullable().default(null),
  region: TJMRegionSchema.nullable().default(null),
});
export const TJMFiltersSchema = z
  .object({
    profileStacks: z.array(z.string().min(1).max(120)).max(50).optional(),
    region: TJMRegionSchema.or(z.literal('unknown')).optional(),
    period: z.enum(['7d', '30d', 'all']).optional(),
    category: CategorySchema.or(z.literal('unknown')).optional(),
    seniority: SenioritySchema.or(z.literal('unknown')).optional(),
    remote: RemoteSchema.or(z.literal('unknown')).optional(),
  })
  .strict();
const PopulationSchema = z
  .object({
    total: CountSchema,
    priced: CountSchema,
    withoutTjm: CountSchema,
    range: z
      .object({ min: PriceSchema, max: PriceSchema, median: PriceSchema })
      .strict()
      .nullable(),
  })
  .strict();
export const TJMSampleAnalysisSchema = PopulationSchema.extend({
  lastUpdated: DateSchema.nullable(),
  firstObservedAt: DateSchema.nullable(),
  unknown: z
    .object({
      category: CountSchema,
      seniority: CountSchema,
      remote: CountSchema,
      region: CountSchema,
    })
    .strict(),
  sources: z.array(z.object({ source: z.enum(MISSION_SOURCES), count: CountSchema }).strict()),
  levels: z.array(
    z
      .object({ seniority: SenioritySchema.or(z.literal('unknown')), population: PopulationSchema })
      .strict()
  ),
  legacy: z
    .object({
      recordCount: CountSchema,
      series: z.array(z.object({ date: DateSchema, average: z.number() }).strict()),
    })
    .strict(),
}).strict();

/** Tolerant legacy migration, shared by the real storage and development bridge. */
export function parseTJMHistory(raw: unknown): TJMHistory {
  const parsed = z
    .object({
      records: z.array(z.unknown()).default([]),
      observations: z.array(z.unknown()).default([]),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { records: [], observations: [] };
  }
  return {
    records: parsed.data.records.flatMap((record) => {
      const result = TJMLegacyRecordSchema.safeParse(record);
      return result.success ? [result.data] : [];
    }),
    observations: parsed.data.observations.flatMap((observation) => {
      const result = TJMObservationSchema.safeParse(observation);
      return result.success ? [result.data] : [];
    }),
  };
}
