/**
 * Scan Pipeline — composable processing pipeline for mission data.
 *
 * Each stage is a pure(ish) transformation that takes missions and returns
 * transformed missions. The pipeline is designed for testability and extensibility.
 *
 * Pipeline stages:
 *   extract → normalize → dedup → filter → score → enrich(semantic) → persist
 *
 * Shell module: orchestrates I/O but delegates pure logic to core.
 */

import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import type { DeterministicBreakdown } from '../../core/types/score';

import { deduplicateMissions } from '../../core/scoring/dedup';
import { filterSalariedMissions } from '../../core/scoring/contract-filter';
import { scoreMission, type DeterministicScoreResult } from '../../core/scoring/relevance';
import { buildScoreBreakdown, computeFinalBreakdown } from '../../core/scoring/final-score';
import { createTracking } from '../../core/tracking/transitions';

import type { PlatformConnector } from '../connectors/platform-connector';
import { saveMissions } from '../storage/db';
import { saveTracking, getTracking } from '../storage/tracking';
import { scoreMissionsSemantic } from '../ai/semantic-scorer';

// ============================================================
// Pipeline types
// ============================================================

export interface PipelineContext {
  profile: UserProfile | null;
  now: Date;
  signal?: AbortSignal;
  maxSemanticPerScan: number;
  /** Connector search context built from profile */
  searchContext: ConnectorSearchContext | null;
}

export interface PipelineStage {
  readonly name: string;
  readonly execute: (missions: Mission[], ctx: PipelineContext) => Promise<Mission[]>;
}

// ============================================================
// Stage implementations
// ============================================================

/**
 * Stage 1: Extract — fetch missions from connectors.
 * This is the only stage that does network I/O.
 */
export function createExtractStage(
  connectors: PlatformConnector[],
  pageDelayMs = 500
): PipelineStage {
  return {
    name: 'extract',
    execute: async (missions: Mission[], ctx: PipelineContext) => {
      // This stage receives empty array and populates it
      const results: Mission[] = [];

      for (const connector of connectors) {
        if (ctx.signal?.aborted) {
          break;
        }

        const result = await connector.fetchMissions(
          ctx.now.getTime(),
          ctx.searchContext ?? undefined,
          ctx.signal
        );

        if (result.ok) {
          results.push(...result.value);
        }
      }

      return results;
    },
  };
}

/**
 * Stage 2: Filter — remove salaried positions (CDD/CDI).
 */
export const filterStage: PipelineStage = {
  name: 'filter',
  execute: async (missions: Mission[]) => {
    return filterSalariedMissions(missions);
  },
};

/**
 * Stage 3: Deduplicate — remove duplicates across sources.
 */
export const dedupStage: PipelineStage = {
  name: 'dedup',
  execute: async (missions: Mission[]) => {
    return deduplicateMissions(missions);
  },
};

/**
 * Stage 4: Score — deterministic scoring against profile.
 */
export const scoreStage: PipelineStage = {
  name: 'score',
  execute: async (missions: Mission[], ctx: PipelineContext) => {
    if (!ctx.profile) {
      return missions;
    }

    return missions.map((m) => {
      const result: DeterministicScoreResult = scoreMission(m, ctx.profile!, ctx.now);
      return {
        ...m,
        scoreBreakdown: buildScoreBreakdown(result.total, result.breakdown),
        score: result.total,
      };
    });
  },
};

/**
 * Stage 5: Enrich — semantic scoring via Gemini Nano.
 */
export const enrichStage: PipelineStage = {
  name: 'enrich',
  execute: async (missions: Mission[], ctx: PipelineContext) => {
    if (!ctx.profile || ctx.signal?.aborted) {
      return missions;
    }

    try {
      const semanticResults = await scoreMissionsSemantic(
        missions,
        ctx.profile,
        ctx.maxSemanticPerScan
      );

      return missions.map((m) => {
        const semantic = semanticResults.get(m.id);
        if (semantic && m.scoreBreakdown) {
          const updatedBreakdown = computeFinalBreakdown(
            m.scoreBreakdown.deterministic,
            m.scoreBreakdown.criteria,
            semantic.score,
            semantic.reason
          );
          return {
            ...m,
            scoreBreakdown: updatedBreakdown,
            semanticScore: semantic.score,
            semanticReason: semantic.reason,
            score: updatedBreakdown.total,
          };
        }
        return m;
      });
    } catch {
      // Gemini Nano unavailable, continue with basic scoring
      return missions;
    }
  },
};

/**
 * Stage 6: Track — create tracking records for new missions.
 */
export const trackStage: PipelineStage = {
  name: 'track',
  execute: async (missions: Mission[], ctx: PipelineContext) => {
    const now = ctx.now.getTime();

    // Create tracking records for missions that don't have one yet
    for (const mission of missions) {
      try {
        const existing = await getTracking(mission.id);
        if (!existing) {
          const tracking = createTracking(mission.id, now);
          await saveTracking(tracking);
        }
      } catch {
        // Non-critical: tracking creation should not block the pipeline
      }
    }

    return missions;
  },
};

/**
 * Stage 7: Persist — save scored missions to IndexedDB.
 */
export const persistStage: PipelineStage = {
  name: 'persist',
  execute: async (missions: Mission[]) => {
    if (missions.length > 0) {
      try {
        await saveMissions(missions);
      } catch {
        // Storage unavailable
      }
    }
    return missions;
  },
};

// ============================================================
// Pipeline runner
// ============================================================

export interface PipelineResult {
  missions: Mission[];
  stageResults: { stage: string; inputCount: number; outputCount: number }[];
}

/**
 * Run the full scan pipeline.
 *
 * Executes stages sequentially, passing the output of each stage
 * as input to the next. Returns the final missions plus per-stage metrics.
 */
export async function runPipeline(
  stages: PipelineStage[],
  initialMissions: Mission[],
  ctx: PipelineContext,
  onStageComplete?: (stage: string, progress: number) => void
): Promise<PipelineResult> {
  let current = initialMissions;
  const stageResults: PipelineResult['stageResults'] = [];

  for (let i = 0; i < stages.length; i++) {
    if (ctx.signal?.aborted) {
      break;
    }

    const stage = stages[i];
    const inputCount = current.length;

    current = await stage.execute(current, ctx);

    stageResults.push({
      stage: stage.name,
      inputCount,
      outputCount: current.length,
    });

    onStageComplete?.(stage.name, (i + 1) / stages.length);
  }

  return { missions: current, stageResults };
}

/**
 * Create the default scan pipeline stages (excluding extract, which is connector-specific).
 */
export function createDefaultPipelineStages(): PipelineStage[] {
  return [filterStage, dedupStage, scoreStage, enrichStage, trackStage, persistStage];
}
