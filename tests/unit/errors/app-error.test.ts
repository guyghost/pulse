import { describe, it, expect } from 'vitest';
import {
	createNetworkError,
	createStorageError,
	createParsingError,
	createConnectorError,
	createValidationError,
	isRetryable,
	isFatal,
	serializeError,
	deserializeError,
	type AppError,
} from '../../../src/lib/core/errors/app-error';

const TS = 1700000000000;

describe('isRetryable', () => {
	it('returns true for network error with retryable: true', () => {
		const error = createNetworkError('Timeout', { retryable: true, status: 503 }, TS);
		expect(isRetryable(error)).toBe(true);
	});

	it('returns false for network error with retryable: false', () => {
		const error = createNetworkError('Not found', { retryable: false, status: 404 }, TS);
		expect(isRetryable(error)).toBe(false);
	});

	it('returns true for storage error (recoverable by default)', () => {
		const error = createStorageError('Read failed', { operation: 'read' }, TS);
		expect(isRetryable(error)).toBe(true);
	});

	it('returns false for parsing error (non-recoverable)', () => {
		const error = createParsingError('Invalid JSON', { source: 'collective' }, TS);
		expect(isRetryable(error)).toBe(false);
	});

	it('returns false for validation error (non-recoverable)', () => {
		const error = createValidationError('Invalid field', { field: 'tjm' }, TS);
		expect(isRetryable(error)).toBe(false);
	});

	it('returns false for connector error with recoverable: false', () => {
		const error = createConnectorError('No session', {
			connectorId: 'free-work',
			phase: 'detect',
			recoverable: false,
		}, TS);
		expect(isRetryable(error)).toBe(false);
	});

	it('returns true for connector error with recoverable: true', () => {
		const error = createConnectorError('Rate limited', {
			connectorId: 'free-work',
			phase: 'fetch',
			recoverable: true,
		}, TS);
		expect(isRetryable(error)).toBe(true);
	});
});

describe('isFatal', () => {
	it('returns true for parsing error (non-recoverable)', () => {
		const error = createParsingError('Invalid JSON', { source: 'collective' }, TS);
		expect(isFatal(error)).toBe(true);
	});

	it('returns false for network error (recoverable by default)', () => {
		const error = createNetworkError('Timeout', { retryable: true }, TS);
		expect(isFatal(error)).toBe(false);
	});

	it('returns true for network error with retryable: false', () => {
		const error = createNetworkError('Forbidden', { retryable: false, status: 403 }, TS);
		expect(isFatal(error)).toBe(true);
	});

	it('returns false for storage error (recoverable by default)', () => {
		const error = createStorageError('Read failed', { operation: 'read' }, TS);
		expect(isFatal(error)).toBe(false);
	});
});

describe('serializeError / deserializeError', () => {
	it('round-trips network error correctly', () => {
		const original = createNetworkError('Timeout', {
			retryable: true,
			status: 503,
			url: 'https://example.com/api',
			context: { attempt: 2 },
		}, TS);

		const serialized = serializeError(original);
		const deserialized = deserializeError(serialized);

		expect(deserialized.type).toBe('network');
		expect(deserialized.message).toBe('Timeout');
		expect(deserialized.recoverable).toBe(true);
		expect(deserialized.timestamp).toBe(TS);
		if (deserialized.type === 'network') {
			expect(deserialized.retryable).toBe(true);
			expect(deserialized.status).toBe(503);
			expect(deserialized.url).toBe('https://example.com/api');
		}
		expect(deserialized.context).toEqual({ attempt: 2 });
	});

	it('round-trips storage error correctly', () => {
		const original = createStorageError('Write failed', {
			operation: 'write',
			key: 'missions',
		}, TS);

		const serialized = serializeError(original);
		const deserialized = deserializeError(serialized);

		expect(deserialized.type).toBe('storage');
		if (deserialized.type === 'storage') {
			expect(deserialized.operation).toBe('write');
			expect(deserialized.key).toBe('missions');
		}
	});

	it('round-trips parsing error correctly', () => {
		const original = createParsingError('Invalid JSON', {
			source: 'collective',
			raw: '{"broken": }',
		}, TS);

		const serialized = serializeError(original);
		const deserialized = deserializeError(serialized);

		expect(deserialized.type).toBe('parsing');
		if (deserialized.type === 'parsing') {
			expect(deserialized.source).toBe('collective');
			expect(deserialized.raw).toBe('{"broken": }');
		}
	});

	it('round-trips connector error correctly', () => {
		const original = createConnectorError('No session', {
			connectorId: 'free-work',
			phase: 'detect',
			recoverable: false,
		}, TS);

		const serialized = serializeError(original);
		const deserialized = deserializeError(serialized);

		expect(deserialized.type).toBe('connector');
		if (deserialized.type === 'connector') {
			expect(deserialized.connectorId).toBe('free-work');
			expect(deserialized.phase).toBe('detect');
		}
		expect(deserialized.recoverable).toBe(false);
	});

	it('round-trips validation error correctly', () => {
		const original = createValidationError('Invalid TJM', {
			field: 'tjm',
			expected: 'number',
			received: 'string',
		}, TS);

		const serialized = serializeError(original);
		const deserialized = deserializeError(serialized);

		expect(deserialized.type).toBe('validation');
		if (deserialized.type === 'validation') {
			expect(deserialized.field).toBe('tjm');
			expect(deserialized.expected).toBe('number');
			expect(deserialized.received).toBe('string');
		}
	});

	it('throws on unknown error type during deserialization', () => {
		const invalid = { type: 'unknown', message: 'test', recoverable: true, timestamp: TS };
		expect(() => deserializeError(invalid)).toThrow('Unknown error type');
	});
});
