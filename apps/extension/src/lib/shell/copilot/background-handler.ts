import type { BridgeMessage } from '../messaging/bridge';
import type { CopilotCoordinator } from './coordinator';

type CopilotRequest = Extract<
  BridgeMessage,
  {
    type:
      | 'COPILOT_LINK'
      | 'COPILOT_SYNC_ENTITLEMENT'
      | 'COPILOT_CREATE_JOB'
      | 'COPILOT_GET_DOSSIER'
      | 'COPILOT_GET_JOB'
      | 'COPILOT_CANCEL_JOB'
      | 'COPILOT_REVIEW_JOB'
      | 'COPILOT_DELETE_DOSSIER';
  }
>;

function isCopilotRequest(message: BridgeMessage): message is CopilotRequest {
  return message.type.startsWith('COPILOT_') && !message.type.endsWith('_RESULT');
}

export function createCopilotBridgeHandler(coordinator: CopilotCoordinator) {
  return (message: BridgeMessage, sendResponse: (response: BridgeMessage) => void): boolean => {
    if (!isCopilotRequest(message)) {
      return false;
    }

    const unexpectedError = {
      code: 'REMOTE_FAILED' as const,
      message: 'Le service Copilot est indisponible.',
      retryable: true,
    };
    const respond = <T>(
      promise: Promise<T>,
      success: (payload: T) => BridgeMessage,
      failure: BridgeMessage
    ): void => {
      void promise
        .then((payload) => sendResponse(success(payload)))
        .catch(() => sendResponse(failure));
    };

    switch (message.type) {
      case 'COPILOT_LINK':
        respond(
          coordinator.link(message.payload.requestId),
          (payload) => ({ type: 'COPILOT_LINK_RESULT', payload }),
          {
            type: 'COPILOT_LINK_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'error',
              subject: null,
              error: unexpectedError,
            },
          }
        );
        return true;
      case 'COPILOT_SYNC_ENTITLEMENT':
        respond(
          coordinator.syncEntitlement(message.payload.requestId),
          (payload) => ({ type: 'COPILOT_ENTITLEMENT_RESULT', payload }),
          {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'error',
              state: 'error',
              entitlement: null,
              error: unexpectedError,
            },
          }
        );
        return true;
      case 'COPILOT_CREATE_JOB':
        respond(
          coordinator.createJob(message.payload),
          (payload) => ({ type: 'COPILOT_CREATE_JOB_RESULT', payload }),
          {
            type: 'COPILOT_CREATE_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              job: null,
              deletionReceipt: null,
              error: unexpectedError,
            },
          }
        );
        return true;
      case 'COPILOT_GET_DOSSIER':
        respond(
          coordinator.getDossier(message.payload.requestId, message.payload.missionId),
          (payload) => ({ type: 'COPILOT_GET_DOSSIER_RESULT', payload }),
          {
            type: 'COPILOT_GET_DOSSIER_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              dossier: null,
              error: unexpectedError,
            },
          }
        );
        return true;
      case 'COPILOT_GET_JOB':
        respond(
          coordinator.getJob(message.payload.requestId, message.payload.missionId),
          (payload) => ({ type: 'COPILOT_GET_JOB_RESULT', payload }),
          {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              job: null,
              deletionReceipt: null,
              error: unexpectedError,
            },
          }
        );
        return true;
      case 'COPILOT_CANCEL_JOB':
        respond(
          coordinator.cancelJob(
            message.payload.requestId,
            message.payload.missionId,
            message.payload.jobId
          ),
          (payload) => ({ type: 'COPILOT_CANCEL_JOB_RESULT', payload }),
          {
            type: 'COPILOT_CANCEL_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              job: null,
              deletionReceipt: null,
              error: unexpectedError,
            },
          }
        );
        return true;
      case 'COPILOT_REVIEW_JOB':
        respond(
          coordinator.reviewJob(
            message.payload.requestId,
            message.payload.missionId,
            message.payload.jobId,
            message.payload.decision
          ),
          (payload) => ({ type: 'COPILOT_REVIEW_JOB_RESULT', payload }),
          {
            type: 'COPILOT_REVIEW_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              job: null,
              deletionReceipt: null,
              error: unexpectedError,
            },
          }
        );
        return true;
      case 'COPILOT_DELETE_DOSSIER':
        respond(
          coordinator.deleteDossier(message.payload.requestId, message.payload.missionId),
          (payload) => ({ type: 'COPILOT_DELETE_DOSSIER_RESULT', payload }),
          {
            type: 'COPILOT_DELETE_DOSSIER_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              disposition: null,
              receipt: null,
              error: unexpectedError,
            },
          }
        );
        return true;
    }
  };
}
