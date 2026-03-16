/**
 * Machine XState pour gérer l'état de connexion réseau
 * States: online, offline, reconnecting, slow
 * Events: CONNECTION_LOST, CONNECTION_RESTORED, SPEED_DETECTED
 */

import { setup, assign, fromCallback } from 'xstate';
import { subscribeToConnection, type ConnectionInfo, type ConnectionStatus } from '../lib/shell/utils/connection-monitor';

type ConnectionContext = {
	status: ConnectionStatus;
	lastOnlineTime: number | null;
	lastOfflineTime: number | null;
	downlink?: number;
	rtt?: number;
	effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
};

type ConnectionEvent =
	| { type: 'CONNECTION_LOST' }
	| { type: 'CONNECTION_RESTORED'; info: ConnectionInfo }
	| { type: 'SPEED_DETECTED'; info: ConnectionInfo }
	| { type: 'OFFLINE_ACKNOWLEDGED' };

const connectionActor = fromCallback(({ sendBack }) => {
	const unsubscribe = subscribeToConnection((info) => {
		if (info.status === 'offline') {
			sendBack({ type: 'CONNECTION_LOST' });
		} else if (info.status === 'slow') {
			sendBack({ type: 'SPEED_DETECTED', info });
		} else {
			sendBack({ type: 'CONNECTION_RESTORED', info });
		}
	});

	return unsubscribe;
});

export const connectionMachine = setup({
	types: {
		context: {} as ConnectionContext,
		events: {} as ConnectionEvent,
	},
	actors: {
		connectionMonitor: connectionActor,
	},
	actions: {
		markOffline: assign({
			status: () => 'offline',
			lastOfflineTime: () => Date.now(),
		}),
		markOnline: assign({
			status: ({ event }) => {
				if (event.type === 'CONNECTION_RESTORED') {
					return event.info.status;
				}
				return 'online';
			},
			lastOnlineTime: () => Date.now(),
			downlink: ({ event }) => {
				if (event.type === 'CONNECTION_RESTORED') {
					return event.info.downlink;
				}
				return undefined;
			},
			rtt: ({ event }) => {
				if (event.type === 'CONNECTION_RESTORED') {
					return event.info.rtt;
				}
				return undefined;
			},
			effectiveType: ({ event }) => {
				if (event.type === 'CONNECTION_RESTORED') {
					return event.info.effectiveType;
				}
				return undefined;
			},
		}),
		markSlow: assign({
			status: () => 'slow',
			downlink: ({ event }) => {
				if (event.type === 'SPEED_DETECTED') {
					return event.info.downlink;
				}
				return undefined;
			},
			rtt: ({ event }) => {
				if (event.type === 'SPEED_DETECTED') {
					return event.info.rtt;
				}
				return undefined;
			},
			effectiveType: ({ event }) => {
				if (event.type === 'SPEED_DETECTED') {
					return event.info.effectiveType;
				}
				return undefined;
			},
		}),
	},
	guards: {
		wasOffline: ({ context }) => context.lastOfflineTime !== null,
	},
}).createMachine({
	id: 'connection',
	initial: 'unknown',
	context: {
		status: 'unknown',
		lastOnlineTime: null,
		lastOfflineTime: null,
	},
	invoke: {
		src: 'connectionMonitor',
	},
	states: {
		unknown: {
			on: {
				CONNECTION_RESTORED: {
					target: 'online',
					actions: 'markOnline',
				},
				CONNECTION_LOST: {
					target: 'offline',
					actions: 'markOffline',
				},
				SPEED_DETECTED: {
					target: 'slow',
					actions: 'markSlow',
				},
			},
		},
		online: {
			on: {
				CONNECTION_LOST: {
					target: 'offline',
					actions: 'markOffline',
				},
				SPEED_DETECTED: {
					target: 'slow',
					actions: 'markSlow',
				},
			},
		},
		offline: {
			entry: 'markOffline',
			on: {
				CONNECTION_RESTORED: {
					target: 'reconnecting',
					actions: 'markOnline',
				},
			},
		},
		reconnecting: {
			after: {
				500: {
					target: 'online',
					guard: 'wasOffline',
				},
			},
			on: {
				CONNECTION_LOST: {
					target: 'offline',
					actions: 'markOffline',
				},
			},
		},
		slow: {
			on: {
				CONNECTION_RESTORED: {
					target: 'online',
					actions: 'markOnline',
				},
				CONNECTION_LOST: {
					target: 'offline',
					actions: 'markOffline',
				},
			},
		},
	},
});
