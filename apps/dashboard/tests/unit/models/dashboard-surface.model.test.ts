import { describe, expect, it } from 'vitest';
import {
  canShowMetrics,
  canShowSetupChecklist,
  canShowStatusBanner,
  deriveDashboardPhase,
  isFeedPrimary,
  type DashboardSurfaceInput,
} from '../../../src/models/dashboard-surface.model';

const base: DashboardSurfaceInput = {
  isConnected: true,
  configurationMissing: false,
  hasConnectedExtension: true,
  missionFeedLength: 5,
};

describe('deriveDashboardPhase', () => {
  it('returns unconfigured when configuration is missing', () => {
    expect(deriveDashboardPhase({ ...base, configurationMissing: true, isConnected: true })).toBe(
      'unconfigured'
    );
  });

  it('returns unconfigured when not connected even if config is present', () => {
    expect(deriveDashboardPhase({ ...base, isConnected: false })).toBe('unconfigured');
  });

  it('returns unconfigured when both signals fail (order short-circuits)', () => {
    expect(
      deriveDashboardPhase({
        ...base,
        configurationMissing: true,
        isConnected: false,
      })
    ).toBe('unconfigured');
  });

  it('returns onboarding when connected + configured but no extension linked', () => {
    expect(deriveDashboardPhase({ ...base, hasConnectedExtension: false })).toBe('onboarding');
  });

  it('returns live_empty when ready but feed has no missions', () => {
    expect(deriveDashboardPhase({ ...base, missionFeedLength: 0 })).toBe('live_empty');
  });

  it('returns live_populated when ready and feed has missions', () => {
    expect(deriveDashboardPhase({ ...base, missionFeedLength: 1 })).toBe('live_populated');
  });
});

describe('dashboard surface gating helpers', () => {
  it('metrics render only in live_populated', () => {
    expect(canShowMetrics('live_populated')).toBe(true);
    expect(canShowMetrics('live_empty')).toBe(false);
    expect(canShowMetrics('onboarding')).toBe(false);
    expect(canShowMetrics('unconfigured')).toBe(false);
  });

  it('status banner renders only in live phases', () => {
    expect(canShowStatusBanner('live_populated')).toBe(true);
    expect(canShowStatusBanner('live_empty')).toBe(true);
    expect(canShowStatusBanner('onboarding')).toBe(false);
    expect(canShowStatusBanner('unconfigured')).toBe(false);
  });

  it('setup checklist renders only in pre-live phases', () => {
    expect(canShowSetupChecklist('unconfigured')).toBe(true);
    expect(canShowSetupChecklist('onboarding')).toBe(true);
    expect(canShowSetupChecklist('live_empty')).toBe(false);
    expect(canShowSetupChecklist('live_populated')).toBe(false);
  });

  it('feed is primary only in live phases', () => {
    expect(isFeedPrimary('live_empty')).toBe(true);
    expect(isFeedPrimary('live_populated')).toBe(true);
    expect(isFeedPrimary('onboarding')).toBe(false);
    expect(isFeedPrimary('unconfigured')).toBe(false);
  });
});
