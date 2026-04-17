import {
  getProfile,
  saveProfile,
  saveConnectorStatuses,
  getMissionById,
} from '../lib/shell/storage/db';
import type {
  BridgeMessage,
  ScanProgressPayload,
  ConnectorProgress,
} from '../lib/shell/messaging/bridge';
import type { UserProfile } from '../lib/core/types/profile';
import type { PersistedConnectorStatus } from '../lib/core/types/connector-status';
import type { AuthUser } from '../lib/core/types/auth';
import { getSettings, setSettings } from '../lib/shell/storage/chrome-storage';
import {
  runScan,
  cancelCurrentScan,
  isScanRunning,
  ScanError,
  type ConnectorScanState,
} from '../lib/shell/scan/scanner';
import { getConnectors } from '../lib/shell/connectors/index';
import { getSeenIds, saveSeenIds } from '../lib/shell/storage/seen-missions';
import { setNewMissionCount } from '../lib/shell/storage/session-storage';
import { markAsSeen } from '../lib/core/seen/mark-seen';
import {
  notifyHighScoreMissions,
  setupNotificationClickHandler,
} from '../lib/shell/notifications/notify-missions';
import { clearExpiredSemanticCache } from '../lib/shell/storage/semantic-cache';
import { clearAllHealthSnapshots } from '../lib/shell/storage/connector-health';
import { setFirstScanDone, getFirstScanDone } from '../lib/shell/storage/first-scan';
import { createDefaultProfile } from '../lib/core/profile/defaults';
import {
  getTracking,
  saveTracking,
  getAllTrackings,
  getTrackingsByStatus,
} from '../lib/shell/storage/tracking';
import {
  createTracking,
  transitionStatus,
  addGeneratedAsset,
} from '../lib/core/tracking/transitions';
import { generateAsset } from '../lib/shell/ai/mission-generator';
import {
  saveGeneratedAsset,
  getGeneratedAssetsForMission,
} from '../lib/shell/storage/generated-assets';
import { getSupabaseClient } from '../lib/shell/auth/supabase-client';
import { saveAuthUser, loadAuthUser, clearAuthUser } from '../lib/shell/auth/auth-storage';
import { isPremiumActive } from '../lib/core/types/auth';
import type { GeneratedAsset } from '../lib/core/types/generation';
import { generatePremium } from '../lib/shell/auth/premium-api';
import { validateMessage } from '../lib/shell/messaging/schemas';
import { classifyError } from '../lib/shell/messaging/error-boundary';

if (import.meta.env.DEV) {
  console.log('[MissionPulse] Service worker started');
}

// Trigger expired semantic cache cleanup on startup
clearExpiredSemanticCache().catch((err) => {
  console.warn('[MissionPulse] Failed to cleanup expired semantic cache:', err);
});

// Reset circuit breaker health snapshots on every SW startup.
// Circuits that opened during a previous session due to transient errors
// are cleared so connectors can be tried fresh on next scan.
clearAllHealthSnapshots().catch(() => {});

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Rewrite Origin header for APIs that block chrome-extension:// origin
chrome.declarativeNetRequest
  .updateDynamicRules({
    removeRuleIds: [1, 2, 3],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.lehibou.com',
            },
            {
              header: 'Referer',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.lehibou.com/',
            },
          ],
        },
        condition: {
          urlFilter: 'api.lehibou.com',
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
      {
        id: 2,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://app.collective.work',
            },
            {
              header: 'Referer',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://app.collective.work/',
            },
          ],
        },
        condition: {
          urlFilter: 'api.collective.work',
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
      {
        id: 3,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.free-work.com',
            },
            {
              header: 'Referer',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.free-work.com/',
            },
          ],
        },
        condition: {
          urlFilter: 'free-work.com/api',
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
    ],
  })
  .catch((err) => {
    console.warn('[MissionPulse] Failed to set header rewrite rules:', err);
  });

// Setup notification click handler
setupNotificationClickHandler();

// ── Scan orchestration helpers ──

/**
 * Convertit les ConnectorScanState du scanner en ConnectorProgress pour le bridge.
 */
function toConnectorProgress(states: ConnectorScanState[]): ConnectorProgress[] {
  return states.map((s) => ({
    connectorId: s.connectorId,
    connectorName: s.connectorName,
    state: s.state,
    missionsCount: s.missionsCount,
    error: s.error,
    retryCount: s.retryCount,
  }));
}

/**
 * Envoie un message SCAN_PROGRESS au side panel (si ouvert).
 * Les erreurs de messaging sont ignorées (panel peut être fermé).
 */
function sendScanProgress(payload: ScanProgressPayload): void {
  chrome.runtime.sendMessage({ type: 'SCAN_PROGRESS', payload }).catch(() => {
    // Side panel not open, ignore
  });
}

/**
 * Gère un SCAN_START initié par le side panel.
 * Lance runScan() avec un callback de progression qui envoie SCAN_PROGRESS au panel.
 * Retourne les missions scannées.
 */
async function handleScanStartFromPanel(): Promise<import('../lib/core/types/mission').Mission[]> {
  // Si un scan est déjà en cours, retourner vide (mutex du scanner)
  if (isScanRunning()) {
    if (import.meta.env.DEV) {
      console.log('[MissionPulse] SCAN_START ignored — scan already in progress');
    }
    return [];
  }

  const result = await runScan(
    undefined, // signal (panel can use SCAN_CANCEL instead)
    undefined, // onProgress (legacy)
    {
      pageDelayMs: 500,
      onDetailedProgress: (info) => {
        sendScanProgress({
          phase: info.phase,
          current: info.current,
          total: info.total,
          connectorProgress: toConnectorProgress(info.connectorStates),
        });
      },
    }
  );

  // Persist connector statuses + update badge (same as alarm handler)
  await persistScanResults(result.missions, result.errors);

  return result.missions;
}

/**
 * Persiste les résultats de scan: statuts connecteurs, badge, notifications.
 * Partagé entre l'alarm handler et le SCAN_START handler.
 */
async function clearNewMissionBadge(): Promise<void> {
  await setNewMissionCount(0);
  await chrome.action.setBadgeText({ text: '' });
}

async function persistScanResults(
  missions: import('../lib/core/types/mission').Mission[],
  errors: { connectorId: string; message: string }[]
): Promise<void> {
  const now = Date.now();

  // Persist last sync timestamp
  try {
    await chrome.storage.local.set({ lastGlobalSync: now });
  } catch {
    /* Non-critical: sync timestamp */
  }

  // Persist connector statuses
  const statusMap = new Map<string, { missions: number; error: string | null }>();
  for (const mission of missions) {
    const entry = statusMap.get(mission.source) ?? { missions: 0, error: null };
    entry.missions++;
    statusMap.set(mission.source, entry);
  }
  for (const err of errors) {
    const entry = statusMap.get(err.connectorId) ?? { missions: 0, error: null };
    entry.error = err.message;
    statusMap.set(err.connectorId, entry);
  }
  const persistedStatuses: PersistedConnectorStatus[] = [...statusMap.entries()].map(
    ([id, data]) => ({
      connectorId: id,
      connectorName: id,
      lastState: data.error && data.missions === 0 ? 'error' : 'done',
      missionsCount: data.missions,
      error: data.error ? { type: 'connector', message: data.error } : null,
      lastSyncAt: now,
      lastSuccessAt: data.missions > 0 ? now : null,
    })
  );
  try {
    await saveConnectorStatuses(persistedStatuses);
  } catch {
    /* Non-critical: status persistence */
  }

  if (missions.length === 0) {
    await clearNewMissionBadge();
    return;
  }

  // Update badge with new mission count
  const seenIds = await getSeenIds();
  const seenSet = new Set(seenIds);
  const newMissions = missions.filter((m) => !seenSet.has(m.id));
  const newCount = newMissions.length;

  if (newCount > 0) {
    await setNewMissionCount(newCount);
    await chrome.action.setBadgeText({ text: String(newCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#58d9a9' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } else {
    await clearNewMissionBadge();
  }

  // Send notifications for high-score missions if enabled
  if (newCount > 0) {
    const notification = await notifyHighScoreMissions(newMissions);
    if (notification.shown && notification.notifiedMissionIds.length > 0) {
      await saveSeenIds(markAsSeen(seenIds, notification.notifiedMissionIds));
    }
  }
}

// Message handler — profile management + scan orchestration
chrome.runtime.onMessage.addListener((rawMessage: unknown, _sender, sendResponse) => {
  // ── Input validation ──────────────────────────────────────────────────────
  const validation = validateMessage(rawMessage);
  if (!validation.valid) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Bridge] Validation failed for "${validation.messageType ?? 'unknown'}":`,
        validation.errors,
        { sender: _sender.id ?? _sender.tab?.id }
      );
    }
    sendResponse({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: validation.errors.join('; ') },
    });
    return false;
  }

  // Cast validé — le message a passé les schémas Zod
  const message = rawMessage as BridgeMessage;

  // ── Error boundary global ─────────────────────────────────────────────────
  // Chaque branche a son propre try/catch mais cette enveloppe protège contre
  // toute exception imprévue qui sinon crasherait le service worker.
  try {
    if (message.type === 'GET_PROFILE') {
      getProfile().then((profile) => {
        sendResponse({ type: 'PROFILE_RESULT', payload: profile });
      });
      return true;
    }

    if (message.type === 'SAVE_PROFILE') {
      // Profile is now saved directly from the side panel via IndexedDB.
      // Keep handler for backwards compatibility with queued messages.
      saveProfile(message.payload)
        .then(() => {
          sendResponse({ type: 'PROFILE_RESULT', payload: message.payload });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_PROFILE via bridge (legacy):', err.message);
          sendResponse({ type: 'PROFILE_RESULT', payload: null });
        });
      return true;
    }

    // ── Scan orchestration (panel → service worker) ──

    if (message.type === 'SCAN_START') {
      handleScanStartFromPanel()
        .then((missions) => {
          sendResponse({ type: 'SCAN_COMPLETE', payload: missions });
        })
        .catch((err) => {
          console.error('[MissionPulse] SCAN_START error:', err);
          const code = err instanceof ScanError ? err.code : 'UNKNOWN';
          const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue lors du scan';
          sendResponse({ type: 'SCAN_ERROR', payload: { message: errorMessage, code } });
        });
      return true; // async response
    }

    if (message.type === 'SCAN_CANCEL') {
      cancelCurrentScan();
      sendResponse({ type: 'SCAN_CANCEL' });
      return false;
    }

    // ── Tracking handlers ──

    if (message.type === 'UPDATE_TRACKING') {
      const { missionId, status, note } = message.payload;
      const now = Date.now();

      (async () => {
        try {
          let tracking = await getTracking(missionId);
          if (!tracking) {
            tracking = createTracking(missionId, now);
          }

          const updated = transitionStatus(tracking, status, now, note ?? null);
          if (!updated) {
            sendResponse({
              type: 'TRACKING_UPDATED',
              payload: tracking,
            });
            return;
          }

          await saveTracking(updated);
          sendResponse({ type: 'TRACKING_UPDATED', payload: updated });
        } catch (err) {
          console.error('[MissionPulse] UPDATE_TRACKING error:', err);
          sendResponse({
            type: 'TRACKING_UPDATED',
            payload: {
              missionId,
              currentStatus: status,
              history: [],
              generatedAssetIds: [],
              userRating: null,
              notes: '',
            },
          });
        }
      })();
      return true;
    }

    if (message.type === 'GET_TRACKINGS') {
      const { status } = message.payload ?? {};
      const query = status ? getTrackingsByStatus(status) : getAllTrackings();

      query
        .then((trackings) => {
          sendResponse({ type: 'TRACKINGS_RESULT', payload: trackings });
        })
        .catch((err) => {
          console.error('[MissionPulse] GET_TRACKINGS error:', err);
          sendResponse({ type: 'TRACKINGS_RESULT', payload: [] });
        });
      return true;
    }

    // ── Generation handlers ──

    if (message.type === 'GENERATE_ASSET') {
      const { missionId, generationType } = message.payload;

      (async () => {
        try {
          const mission = await getMissionById(missionId);
          if (!mission) {
            sendResponse({ type: 'GENERATION_RESULT', payload: null });
            return;
          }

          const profile = await getProfile();
          if (!profile) {
            sendResponse({ type: 'GENERATION_RESULT', payload: null });
            return;
          }

          let asset: GeneratedAsset | null = null;

          // Try premium backend first if user is premium
          const authUser = await loadAuthUser();
          if (authUser && isPremiumActive(authUser, Date.now())) {
            try {
              asset = await generatePremium(missionId, generationType, mission, profile);
            } catch (err) {
              if (import.meta.env.DEV) {
                console.warn(
                  '[MissionPulse] Premium generation failed, falling back to Gemini Nano:',
                  err
                );
              }
            }
          }

          // Fall back to Gemini Nano (free, local)
          if (!asset) {
            asset = await generateAsset(missionId, generationType, mission, profile);
          }

          if (!asset) {
            sendResponse({ type: 'GENERATION_RESULT', payload: null });
            return;
          }

          // Persist the generated asset
          await saveGeneratedAsset(asset);

          // Update tracking to reference the new asset
          let tracking = await getTracking(missionId);
          if (!tracking) {
            tracking = createTracking(missionId, Date.now());
          }
          const updatedTracking = addGeneratedAsset(tracking, asset.id);
          await saveTracking(updatedTracking);

          sendResponse({ type: 'GENERATION_RESULT', payload: asset });
        } catch (err) {
          console.error('[MissionPulse] GENERATE_ASSET error:', err);
          sendResponse({ type: 'GENERATION_RESULT', payload: null });
        }
      })();
      return true;
    }

    if (message.type === 'GET_GENERATED_ASSETS') {
      const { missionId } = message.payload;

      getGeneratedAssetsForMission(missionId)
        .then((assets) => {
          sendResponse({ type: 'GENERATED_ASSETS_RESULT', payload: assets });
        })
        .catch((err) => {
          console.error('[MissionPulse] GET_GENERATED_ASSETS error:', err);
          sendResponse({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
        });
      return true;
    }

    // ── Auth handlers ──

    if (message.type === 'AUTH_LOGIN') {
      const { email, password } = message.payload;
      const supabase = getSupabaseClient();

      (async () => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error || !data.user) {
            sendResponse({
              type: 'AUTH_RESULT',
              payload: {
                status: 'unauthenticated',
                user: null,
                error: error?.message ?? 'Login failed',
              },
            });
            return;
          }

          // Query profiles table for premium status
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_status, subscription_period_end')
            .eq('id', data.user.id)
            .single();

          const now = Date.now();
          let premiumStatus: AuthUser['premiumStatus'] = 'free';
          let premiumExpiresAt: number | null = null;

          if (profile?.subscription_status === 'premium') {
            const expiresAt = profile.subscription_period_end
              ? new Date(profile.subscription_period_end).getTime()
              : null;
            if (expiresAt && expiresAt > now) {
              premiumStatus = 'premium';
              premiumExpiresAt = expiresAt;
            } else if (expiresAt && expiresAt <= now) {
              premiumStatus = 'expired';
              premiumExpiresAt = expiresAt;
            } else {
              // No expiry set but marked premium — treat as active
              premiumStatus = 'premium';
            }
          }

          const authUser: AuthUser = {
            id: data.user.id,
            email: data.user.email ?? email,
            premiumStatus,
            premiumExpiresAt,
          };

          await saveAuthUser(authUser);
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'authenticated', user: authUser },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Login failed';
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'unauthenticated', user: null, error: msg },
          });
        }
      })();
      return true;
    }

    if (message.type === 'AUTH_SIGNUP') {
      const { email, password } = message.payload;
      const supabase = getSupabaseClient();

      (async () => {
        try {
          const { data, error } = await supabase.auth.signUp({ email, password });
          if (error || !data.user) {
            sendResponse({
              type: 'AUTH_RESULT',
              payload: {
                status: 'unauthenticated',
                user: null,
                error: error?.message ?? 'Signup failed',
              },
            });
            return;
          }

          // New users start as free — the trigger creates the profile row
          const authUser: AuthUser = {
            id: data.user.id,
            email: data.user.email ?? email,
            premiumStatus: 'free',
            premiumExpiresAt: null,
          };

          await saveAuthUser(authUser);
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'authenticated', user: authUser },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Signup failed';
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'unauthenticated', user: null, error: msg },
          });
        }
      })();
      return true;
    }

    if (message.type === 'AUTH_LOGOUT') {
      const supabase = getSupabaseClient();

      (async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // Session may already be gone — ignore
        }
        await clearAuthUser();
        sendResponse({ type: 'AUTH_RESULT', payload: { status: 'unauthenticated', user: null } });
      })();
      return true;
    }

    if (message.type === 'AUTH_STATUS') {
      const supabase = getSupabaseClient();

      (async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.user) {
            // No active session — try cached user
            const cached = await loadAuthUser();
            if (cached) {
              sendResponse({
                type: 'AUTH_RESULT',
                payload: { status: 'authenticated', user: cached },
              });
            } else {
              sendResponse({
                type: 'AUTH_RESULT',
                payload: { status: 'unauthenticated', user: null },
              });
            }
            return;
          }

          // Active session — refresh premium status from profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_status, subscription_period_end')
            .eq('id', session.user.id)
            .single();

          const now = Date.now();
          let premiumStatus: AuthUser['premiumStatus'] = 'free';
          let premiumExpiresAt: number | null = null;

          if (profile?.subscription_status === 'premium') {
            const expiresAt = profile.subscription_period_end
              ? new Date(profile.subscription_period_end).getTime()
              : null;
            if (expiresAt && expiresAt > now) {
              premiumStatus = 'premium';
              premiumExpiresAt = expiresAt;
            } else if (expiresAt && expiresAt <= now) {
              premiumStatus = 'expired';
              premiumExpiresAt = expiresAt;
            } else {
              premiumStatus = 'premium';
            }
          }

          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email ?? '',
            premiumStatus,
            premiumExpiresAt,
          };

          await saveAuthUser(authUser);
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'authenticated', user: authUser },
          });
        } catch {
          // On any error, fall back to cache
          const cached = await loadAuthUser();
          sendResponse({
            type: 'AUTH_RESULT',
            payload: cached
              ? { status: 'authenticated', user: cached }
              : { status: 'unknown', user: null },
          });
        }
      })();
      return true;
    }

    // ── Toast handler (forward to side panel) ──

    if (message.type === 'SHOW_TOAST') {
      chrome.runtime.sendMessage(message).catch(() => {
        // Side panel not open, ignore
      });
      sendResponse({ type: 'TOAST_SHOWN' });
      return false;
    }

    // ── Profile broadcast ──

    if (message.type === 'PROFILE_UPDATED') {
      chrome.runtime.sendMessage(message).catch(() => {
        // No listeners, ignore
      });
      return false;
    }
  } catch (err: unknown) {
    // Error boundary — protège le service worker contre les crashes inattendus
    const category = classifyError(err);
    const errMessage = err instanceof Error ? err.message : String(err);

    if (import.meta.env.DEV) {
      console.error('[Bridge] Unhandled error in message handler:', {
        category,
        message: errMessage,
        messageType: (rawMessage as Record<string, unknown>)?.type,
      });
    }

    try {
      sendResponse({ success: false, error: { code: category, message: errMessage } });
    } catch {
      // sendResponse peut échouer si le canal est déjà fermé
    }
    return false;
  }
});

const ALARM_NAME = 'auto-scan';

async function setupAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clearAll();
  if (settings.autoScan) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.scanIntervalMinutes,
    });
    if (import.meta.env.DEV) {
      console.log(`[MissionPulse] Auto-scan alarm set: every ${settings.scanIntervalMinutes}min`);
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) {
    return;
  }
  if (import.meta.env.DEV) {
    console.log('[MissionPulse] Auto-scan triggered');
  }
  try {
    const result = await runScan(undefined, undefined, {
      pageDelayMs: 500,
      onDetailedProgress: (info) => {
        // Envoyer la progression au panel (si ouvert)
        sendScanProgress({
          phase: info.phase,
          current: info.current,
          total: info.total,
          connectorProgress: toConnectorProgress(info.connectorStates),
        });
      },
    });

    // Persist results + badge + notifications (shared logic)
    await persistScanResults(result.missions, result.errors);

    // Notify side panel with final missions (for immediate UI update)
    if (result.missions.length > 0) {
      try {
        await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: result.missions });
      } catch {
        // Side panel not open, ignore
      }
    }
  } catch (err) {
    console.error('[MissionPulse] Auto-scan error:', err);
    const code = err instanceof ScanError ? err.code : 'UNKNOWN';
    const errorMessage =
      err instanceof Error ? err.message : 'Erreur inconnue lors du scan automatique';
    try {
      await chrome.runtime.sendMessage({
        type: 'SCAN_ERROR',
        payload: { message: errorMessage, code },
      });
    } catch {
      // Side panel not open, ignore
    }
  }
});

// Re-setup alarm when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    setupAlarm();
  }
});

// Initial setup
setupAlarm();

// ── First-install silent scan ──────────────────────────────────────────────────
// On fresh install: detect active platform sessions in parallel.
// If any found, run a silent scan with a default profile so the user
// lands directly on a populated feed — no wizard required.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') {
    return;
  }

  if (import.meta.env.DEV) {
    console.log('[MissionPulse] Fresh install — starting zero-config first scan');
  }

  try {
    // Already done? (shouldn't happen on fresh install, but guard anyway)
    const alreadyDone = await getFirstScanDone();
    if (alreadyDone) {
      return;
    }

    // Detect active sessions across all connectors in parallel
    const settings = await getSettings();
    const allConnectors = await getConnectors(settings.enabledConnectors);
    const now = Date.now();
    const sessionResults = await Promise.allSettled(allConnectors.map((c) => c.detectSession(now)));

    const activeConnectorIds: string[] = allConnectors
      .filter((_c, i) => {
        const r = sessionResults[i];
        return r.status === 'fulfilled' && r.value.ok && r.value.value === true;
      })
      .map((c) => c.id);

    if (activeConnectorIds.length === 0) {
      // No sessions — user will go through normal onboarding
      if (import.meta.env.DEV) {
        console.log('[MissionPulse] No active sessions found on install, skipping first scan');
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.log(
        `[MissionPulse] Found ${activeConnectorIds.length} active session(s):`,
        activeConnectorIds
      );
    }

    // Temporarily restrict scan to only connectors with active sessions
    const previousEnabled = settings.enabledConnectors;
    await setSettings({ ...settings, enabledConnectors: activeConnectorIds });

    // Run silent scan with an explicit default profile so missions are scored
    // even before the user completes onboarding.
    const result = await runScan(undefined, undefined, {
      pageDelayMs: 300,
      profileOverride: createDefaultProfile(),
    });

    // Restore previous connector list
    await setSettings({
      ...settings,
      enabledConnectors: previousEnabled.length > 0 ? previousEnabled : activeConnectorIds,
    });

    if (result.missions.length > 0) {
      await setFirstScanDone();

      // Notify side panel if it’s open
      try {
        await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: result.missions });
      } catch {
        // Panel not open yet — missions are in IndexedDB, will load on next open
      }

      if (import.meta.env.DEV) {
        console.log(`[MissionPulse] First scan complete: ${result.missions.length} missions`);
      }
    }
  } catch (err) {
    // First scan failure is non-critical — user sees normal onboarding
    console.warn('[MissionPulse] First scan on install failed:', err);
  }
});

chrome.action.onUserSettingsChanged.addListener(async (change) => {
  if (change.isOnToolbar) {
    if (import.meta.env.DEV) {
      console.log('[MissionPulse] Extension pinned to toolbar');
    }
    const settings = await getSettings();
    if (!settings.autoScan && settings.notifications) {
      try {
        await chrome.notifications.create('suggest-auto-scan', {
          type: 'basic',
          iconUrl: 'static/icons/icon-128.svg',
          title: 'MissionPulse',
          message: 'Activez le scan automatique dans les parametres pour ne rater aucune mission.',
        });
      } catch {
        // Notifications permission not available
      }
    }
  }
});

export {};
