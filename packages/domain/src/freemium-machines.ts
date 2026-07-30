import { setup } from 'xstate';

type CheckoutEvent =
  | { type: 'START_CHECKOUT' }
  | { type: 'CHECKOUT_CREATED' }
  | { type: 'CREATE_FAILED_RETRYABLE' }
  | { type: 'CREATE_FAILED_TERMINAL' }
  | { type: 'RETRY_CREATE' }
  | { type: 'CANCEL_REQUESTED' }
  | { type: 'RETURN_FROM_PROVIDER' }
  | { type: 'CHECKOUT_CANCELLED' }
  | { type: 'CHECKOUT_EXPIRED' }
  | { type: 'VERIFIED_PAYMENT_LINKED' }
  | { type: 'BEGIN_PROVISIONING' }
  | { type: 'ENTITLEMENT_COMMITTED' }
  | { type: 'PROVISIONING_FAILED_RETRYABLE' }
  | { type: 'PROVISIONING_FAILED_TERMINAL' }
  | { type: 'RETRY_PROVISIONING' };

export const premiumCheckoutMachine = setup({
  types: {
    events: {} as CheckoutEvent,
  },
}).createMachine({
  id: 'premiumCheckout',
  initial: 'idle',
  states: {
    idle: { on: { START_CHECKOUT: 'creating_checkout' } },
    creating_checkout: {
      on: {
        CHECKOUT_CREATED: 'awaiting_payment',
        CREATE_FAILED_RETRYABLE: 'create_failed_retryable',
        CREATE_FAILED_TERMINAL: 'failed_terminal',
        CANCEL_REQUESTED: 'cancelled',
      },
    },
    create_failed_retryable: {
      on: {
        RETRY_CREATE: 'creating_checkout',
        CANCEL_REQUESTED: 'cancelled',
      },
    },
    awaiting_payment: {
      on: {
        RETURN_FROM_PROVIDER: { target: 'awaiting_payment', reenter: false },
        CHECKOUT_CANCELLED: 'cancelled',
        CHECKOUT_EXPIRED: 'expired',
        VERIFIED_PAYMENT_LINKED: 'payment_confirmed',
      },
    },
    payment_confirmed: { on: { BEGIN_PROVISIONING: 'provisioning' } },
    provisioning: {
      on: {
        ENTITLEMENT_COMMITTED: 'provisioned',
        PROVISIONING_FAILED_RETRYABLE: 'provisioning_failed_retryable',
        PROVISIONING_FAILED_TERMINAL: 'failed_terminal',
      },
    },
    provisioning_failed_retryable: {
      on: { RETRY_PROVISIONING: 'provisioning' },
    },
    cancelled: { type: 'final' },
    expired: { type: 'final' },
    provisioned: { type: 'final' },
    failed_terminal: { type: 'final' },
  },
});

type WebhookEvent =
  | { type: 'VERIFY_SIGNATURE' }
  | { type: 'SIGNATURE_INVALID' }
  | { type: 'SIGNATURE_VALID' }
  | { type: 'EVENT_ALREADY_APPLIED' }
  | { type: 'EVENT_RESERVED' }
  | { type: 'EVENT_UNSUPPORTED' }
  | { type: 'EVENT_INVALID' }
  | { type: 'EVENT_MAPPED' }
  | { type: 'APPLY_SUCCEEDED' }
  | { type: 'APPLY_FAILED_RETRYABLE' }
  | { type: 'APPLY_FAILED_TERMINAL' }
  | { type: 'RETRY_EVENT' };

export const billingWebhookEventMachine = setup({
  types: { events: {} as WebhookEvent },
}).createMachine({
  id: 'billingWebhookEvent',
  initial: 'received',
  states: {
    received: { on: { VERIFY_SIGNATURE: 'verifying_signature' } },
    verifying_signature: {
      on: {
        SIGNATURE_INVALID: 'rejected_terminal',
        SIGNATURE_VALID: 'deduplicating',
      },
    },
    deduplicating: {
      on: {
        EVENT_ALREADY_APPLIED: 'duplicate_terminal',
        EVENT_RESERVED: 'mapping',
      },
    },
    mapping: {
      on: {
        EVENT_UNSUPPORTED: 'ignored_terminal',
        EVENT_INVALID: 'failed_terminal',
        EVENT_MAPPED: 'applying',
      },
    },
    applying: {
      on: {
        APPLY_SUCCEEDED: 'applied_terminal',
        APPLY_FAILED_RETRYABLE: 'failed_retryable',
        APPLY_FAILED_TERMINAL: 'failed_terminal',
      },
    },
    failed_retryable: { on: { RETRY_EVENT: 'applying' } },
    rejected_terminal: { type: 'final' },
    duplicate_terminal: { type: 'final' },
    ignored_terminal: { type: 'final' },
    applied_terminal: { type: 'final' },
    failed_terminal: { type: 'final' },
  },
});

type ExtensionAccountLinkEvent =
  | { type: 'LINK_REQUESTED' }
  | { type: 'LINK_CREATED' }
  | { type: 'CREATE_FAILED_RETRYABLE' }
  | { type: 'CREATE_FAILED_TERMINAL' }
  | { type: 'RETRY_LINK' }
  | { type: 'POLL_PENDING' }
  | { type: 'USER_APPROVED' }
  | { type: 'USER_REFUSED' }
  | { type: 'LINK_EXPIRED' }
  | { type: 'CANCEL' }
  | { type: 'ENTITLEMENT_REFRESHED' }
  | { type: 'DEVICE_REVOKED' }
  | { type: 'SIGN_OUT' };

export const extensionAccountLinkMachine = setup({
  types: { events: {} as ExtensionAccountLinkEvent },
}).createMachine({
  id: 'extensionAccountLink',
  initial: 'unlinked',
  states: {
    unlinked: { on: { LINK_REQUESTED: 'creating_link' } },
    creating_link: {
      on: {
        LINK_CREATED: 'awaiting_user_approval',
        CREATE_FAILED_RETRYABLE: 'link_failed_retryable',
        CREATE_FAILED_TERMINAL: 'failed_terminal',
      },
    },
    link_failed_retryable: { on: { RETRY_LINK: 'creating_link', CANCEL: 'cancelled_terminal' } },
    awaiting_user_approval: {
      on: {
        POLL_PENDING: { target: 'awaiting_user_approval', reenter: false },
        USER_APPROVED: 'linked',
        USER_REFUSED: 'refused_terminal',
        LINK_EXPIRED: 'expired_terminal',
        CANCEL: 'cancelled_terminal',
      },
    },
    linked: {
      on: {
        ENTITLEMENT_REFRESHED: { target: 'linked', reenter: false },
        DEVICE_REVOKED: 'unlinked',
        SIGN_OUT: 'unlinked',
      },
    },
    refused_terminal: { type: 'final' },
    expired_terminal: { type: 'final' },
    cancelled_terminal: { type: 'final' },
    failed_terminal: { type: 'final' },
  },
});

type AddPlatformAccountEvent =
  | { type: 'ADD_REQUESTED' }
  | { type: 'ACCOUNT_INACTIVE' }
  | { type: 'ACCESS_DENIED_PREMIUM' }
  | { type: 'LIMIT_REACHED' }
  | { type: 'PERMISSION_MISSING' }
  | { type: 'ACCESS_READY' }
  | { type: 'REQUEST_PERMISSION' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'SESSION_DETECTED' }
  | { type: 'SESSION_MISSING' }
  | { type: 'DETECTION_FAILED_RETRYABLE' }
  | { type: 'DETECTION_FAILED_TERMINAL' }
  | { type: 'RETRY_SESSION_CHECK' }
  | { type: 'CONFIRM_BINDING' }
  | { type: 'BINDING_COMMITTED' }
  | { type: 'PERSIST_FAILED_RETRYABLE' }
  | { type: 'PERSIST_FAILED_TERMINAL' }
  | { type: 'RETRY' }
  | { type: 'CANCEL_REQUESTED' };

export const addPlatformAccountMachine = setup({
  types: { events: {} as AddPlatformAccountEvent },
}).createMachine({
  id: 'addPlatformAccount',
  initial: 'idle',
  states: {
    idle: { on: { ADD_REQUESTED: 'checking_access' } },
    checking_access: {
      on: {
        ACCOUNT_INACTIVE: 'account_inactive_terminal',
        ACCESS_DENIED_PREMIUM: 'premium_required_terminal',
        LIMIT_REACHED: 'limit_reached_terminal',
        PERMISSION_MISSING: 'permission_required',
        ACCESS_READY: 'detecting_session',
      },
    },
    permission_required: {
      on: {
        REQUEST_PERMISSION: 'requesting_permission',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    requesting_permission: {
      on: {
        PERMISSION_GRANTED: 'detecting_session',
        PERMISSION_DENIED: 'permission_denied_terminal',
      },
    },
    detecting_session: {
      on: {
        SESSION_DETECTED: 'awaiting_confirmation',
        SESSION_MISSING: 'session_required',
        DETECTION_FAILED_RETRYABLE: 'failed_retryable',
        DETECTION_FAILED_TERMINAL: 'failed_terminal',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    session_required: {
      on: {
        RETRY_SESSION_CHECK: 'detecting_session',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    awaiting_confirmation: {
      on: {
        CONFIRM_BINDING: 'persisting',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    persisting: {
      on: {
        BINDING_COMMITTED: 'ready_terminal',
        PERSIST_FAILED_RETRYABLE: 'failed_retryable',
        PERSIST_FAILED_TERMINAL: 'failed_terminal',
      },
    },
    failed_retryable: {
      on: {
        RETRY: 'checking_access',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    account_inactive_terminal: { type: 'final' },
    premium_required_terminal: { type: 'final' },
    limit_reached_terminal: { type: 'final' },
    permission_denied_terminal: { type: 'final' },
    cancelled_terminal: { type: 'final' },
    ready_terminal: { type: 'final' },
    failed_terminal: { type: 'final' },
  },
});

type SwitchPlatformAccountEvent =
  | { type: 'SWITCH_REQUESTED' }
  | { type: 'TARGET_ALREADY_ACTIVE' }
  | { type: 'ACCESS_DENIED_PREMIUM' }
  | { type: 'SESSION_MATCHES_TARGET' }
  | { type: 'SESSION_MISMATCH' }
  | { type: 'RETRY_SESSION_CHECK' }
  | { type: 'CANCEL_REQUESTED' }
  | { type: 'SWITCH_COMMITTED' }
  | { type: 'SWITCH_FAILED_RETRYABLE' }
  | { type: 'SWITCH_FAILED_TERMINAL' }
  | { type: 'RETRY' };

export const switchPlatformAccountMachine = setup({
  types: { events: {} as SwitchPlatformAccountEvent },
}).createMachine({
  id: 'switchPlatformAccount',
  initial: 'idle',
  states: {
    idle: { on: { SWITCH_REQUESTED: 'checking_access' } },
    checking_access: {
      on: {
        TARGET_ALREADY_ACTIVE: 'completed_terminal',
        ACCESS_DENIED_PREMIUM: 'premium_required_terminal',
        SESSION_MATCHES_TARGET: 'committing',
        SESSION_MISMATCH: 'session_switch_required',
      },
    },
    session_switch_required: {
      on: {
        RETRY_SESSION_CHECK: 'checking_access',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    committing: {
      on: {
        SWITCH_COMMITTED: 'completed_terminal',
        SWITCH_FAILED_RETRYABLE: 'failed_retryable',
        SWITCH_FAILED_TERMINAL: 'failed_terminal',
      },
    },
    failed_retryable: { on: { RETRY: 'checking_access' } },
    completed_terminal: { type: 'final' },
    premium_required_terminal: { type: 'final' },
    cancelled_terminal: { type: 'final' },
    failed_terminal: { type: 'final' },
  },
});

type FormAssistEvent =
  | { type: 'ASSIST_REQUESTED' }
  | { type: 'CONSENT_APPROVED' }
  | { type: 'CONSENT_REFUSED' }
  | { type: 'ACCOUNT_INACTIVE' }
  | { type: 'PREMIUM_MISSING' }
  | { type: 'ORIGIN_UNSUPPORTED' }
  | { type: 'PERMISSION_MISSING' }
  | { type: 'ACCESS_READY' }
  | { type: 'REQUEST_PERMISSION' }
  | { type: 'REFUSE_PERMISSION' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'CAPTURE_SUCCEEDED' }
  | { type: 'CAPTURE_FAILED_RETRYABLE' }
  | { type: 'CAPTURE_FAILED_TERMINAL' }
  | { type: 'SUGGESTIONS_VALIDATED' }
  | { type: 'SUGGESTIONS_REJECTED_RETRYABLE' }
  | { type: 'SUGGESTIONS_REJECTED_TERMINAL' }
  | { type: 'REVIEW_UPDATED' }
  | { type: 'REFUSE_ALL' }
  | { type: 'APPLY_APPROVED_REQUESTED' }
  | { type: 'FORM_UNCHANGED' }
  | { type: 'FORM_CHANGED' }
  | { type: 'RECAPTURE_REQUESTED' }
  | { type: 'APPLY_SUCCEEDED' }
  | { type: 'APPLY_FAILED_ROLLED_BACK' }
  | { type: 'APPLY_FAILED_ROLLBACK_UNCERTAIN' }
  | { type: 'RETRY_CAPTURE' }
  | { type: 'RETRY_SUGGESTIONS' }
  | { type: 'RETRY_APPLY' }
  | { type: 'CANCEL_REQUESTED' };

export const applicationFormAssistMachine = setup({
  types: { events: {} as FormAssistEvent },
}).createMachine({
  id: 'applicationFormAssist',
  initial: 'idle',
  states: {
    idle: { on: { ASSIST_REQUESTED: 'awaiting_consent' } },
    awaiting_consent: {
      on: {
        CONSENT_APPROVED: 'checking_access',
        CONSENT_REFUSED: 'consent_refused_terminal',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    checking_access: {
      on: {
        ACCOUNT_INACTIVE: 'account_required_terminal',
        PREMIUM_MISSING: 'premium_required_terminal',
        ORIGIN_UNSUPPORTED: 'unsupported_terminal',
        PERMISSION_MISSING: 'permission_required',
        ACCESS_READY: 'capturing',
      },
    },
    permission_required: {
      on: {
        REQUEST_PERMISSION: 'requesting_permission',
        REFUSE_PERMISSION: 'permission_denied_terminal',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    requesting_permission: {
      on: {
        PERMISSION_GRANTED: 'capturing',
        PERMISSION_DENIED: 'permission_denied_terminal',
      },
    },
    capturing: {
      on: {
        CAPTURE_SUCCEEDED: 'requesting_suggestions',
        CAPTURE_FAILED_RETRYABLE: 'capture_failed_retryable',
        CAPTURE_FAILED_TERMINAL: 'failed_terminal',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    requesting_suggestions: {
      on: {
        SUGGESTIONS_VALIDATED: 'reviewing',
        SUGGESTIONS_REJECTED_RETRYABLE: 'suggestion_failed_retryable',
        SUGGESTIONS_REJECTED_TERMINAL: 'failed_terminal',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    reviewing: {
      on: {
        REVIEW_UPDATED: { target: 'reviewing', reenter: false },
        REFUSE_ALL: 'refused_terminal',
        APPLY_APPROVED_REQUESTED: 'checking_freshness',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    checking_freshness: {
      on: {
        FORM_UNCHANGED: 'applying',
        FORM_CHANGED: 'stale_form',
      },
    },
    stale_form: {
      on: {
        RECAPTURE_REQUESTED: 'capturing',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    applying: {
      on: {
        APPLY_SUCCEEDED: 'applied_terminal',
        APPLY_FAILED_ROLLED_BACK: 'apply_failed_retryable',
        APPLY_FAILED_ROLLBACK_UNCERTAIN: 'manual_review_required_terminal',
      },
    },
    capture_failed_retryable: {
      on: {
        RETRY_CAPTURE: 'capturing',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    suggestion_failed_retryable: {
      on: {
        RETRY_SUGGESTIONS: 'requesting_suggestions',
        RECAPTURE_REQUESTED: 'capturing',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    apply_failed_retryable: {
      on: {
        RETRY_APPLY: 'checking_freshness',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    account_required_terminal: { type: 'final' },
    premium_required_terminal: { type: 'final' },
    unsupported_terminal: { type: 'final' },
    permission_denied_terminal: { type: 'final' },
    consent_refused_terminal: { type: 'final' },
    refused_terminal: { type: 'final' },
    cancelled_terminal: { type: 'final' },
    applied_terminal: { type: 'final' },
    manual_review_required_terminal: { type: 'final' },
    failed_terminal: { type: 'final' },
  },
});
