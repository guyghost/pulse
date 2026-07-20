import { createHash } from 'node:crypto';

import { CONNECTOR_HEALTH_REGISTRY } from '../../tests/health/connector-registry';

export const MAX_STREAM_BYTES = 524_288;
export const MAX_EVIDENCE_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 64;

export type Sha256 = string;
export type ConnectorHealthSignal =
  | 'SIGABRT'
  | 'SIGALRM'
  | 'SIGBUS'
  | 'SIGCHLD'
  | 'SIGCONT'
  | 'SIGFPE'
  | 'SIGHUP'
  | 'SIGILL'
  | 'SIGINT'
  | 'SIGIO'
  | 'SIGIOT'
  | 'SIGKILL'
  | 'SIGPIPE'
  | 'SIGPOLL'
  | 'SIGPROF'
  | 'SIGPWR'
  | 'SIGQUIT'
  | 'SIGSEGV'
  | 'SIGSTKFLT'
  | 'SIGSTOP'
  | 'SIGSYS'
  | 'SIGTERM'
  | 'SIGTRAP'
  | 'SIGTSTP'
  | 'SIGTTIN'
  | 'SIGTTOU'
  | 'SIGUNUSED'
  | 'SIGURG'
  | 'SIGUSR1'
  | 'SIGUSR2'
  | 'SIGVTALRM'
  | 'SIGWINCH'
  | 'SIGXCPU'
  | 'SIGXFSZ';

export type ConnectorHealthParseStatus =
  'valid' | 'missing' | 'oversized' | 'malformed_json' | 'duplicate_json_key' | 'invalid_report';

export type ConnectorHealthFailureCode =
  | 'child_exit_nonzero'
  | 'child_signalled'
  | 'child_timed_out'
  | 'stdout_overflow'
  | 'stderr_nonempty'
  | 'stderr_overflow'
  | 'report_missing'
  | 'report_oversized'
  | 'report_malformed_json'
  | 'report_duplicate_json_key'
  | 'report_invalid_schema'
  | 'report_declared_failure'
  | 'connector_check_failed'
  | 'parser_regression_failed';

export type ConnectorHealthCheck = {
  id: 'unit-tests' | 'regression-fixtures';
  status: 'pass' | 'fail';
  code:
    | 'unit_tests_passed'
    | 'unit_tests_failed'
    | 'unit_test_file_missing'
    | 'regression_fixtures_present'
    | 'regression_fixture_directory_missing'
    | 'regression_fixture_set_empty';
  detail: string | null;
};

export interface ConnectorHealthReportV1 {
  schema: 'missionpulse.connector-health-report';
  version: 1;
  generatedAt: string;
  status: 'pass' | 'fail';
  connectors: Array<{
    connectorId: string;
    name: string;
    status: 'pass' | 'fail';
    checks: ConnectorHealthCheck[];
  }>;
  regression: {
    id: 'parser-regression';
    status: 'pass' | 'fail';
    code: 'parser_regression_passed' | 'parser_regression_failed';
    detail: string | null;
  };
}

export interface ConnectorHealthEvidenceV1 {
  schema: 'missionpulse.connector-health-evidence';
  version: 1;
  evidenceSha256: Sha256;
  capturedAt: string;
  source: {
    repository: string;
    sourceCommit: string;
    workflowPath: '.github/workflows/connector-health.yml';
    eventKind: 'schedule' | 'workflow_dispatch';
    ref: string;
    runId: string;
    runAttempt: number;
  };
  child: {
    exitCode: number | null;
    signal: ConnectorHealthSignal | null;
    timedOut: boolean;
    stdoutBytes: number;
    stdoutTruncated: boolean;
    stdoutSha256: Sha256;
    stderrBytes: number;
    stderrTruncated: boolean;
    stderrSha256: Sha256;
  };
  reportObservation: {
    parseStatus: ConnectorHealthParseStatus;
    reportBytes: number;
    reportSha256: Sha256 | null;
  };
  report: ConnectorHealthReportV1 | null;
  disposition: 'passed' | 'failed';
  failureCodes: ConnectorHealthFailureCode[];
  failureFingerprint: Sha256 | null;
}

export interface CapturedStream {
  prefix: Uint8Array;
  truncated: boolean;
}

export interface CapturedChild {
  exitCode: number | null;
  signal: ConnectorHealthSignal | null;
  timedOut: boolean;
  stdout: CapturedStream;
  stderr: CapturedStream;
}

interface EvidenceSourceInput {
  repository: string;
  sourceCommit: string;
  eventKind: 'schedule' | 'workflow_dispatch';
  ref: string;
  runId: string;
  runAttempt: number;
}

export class ConnectorHealthContractError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectorHealthContractError';
  }
}

class StrictJsonError extends Error {
  constructor(
    readonly kind: 'duplicate' | 'malformed',
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'StrictJsonError';
  }
}

export const CONNECTOR_HEALTH_SIGNALS = [
  'SIGABRT',
  'SIGALRM',
  'SIGBUS',
  'SIGCHLD',
  'SIGCONT',
  'SIGFPE',
  'SIGHUP',
  'SIGILL',
  'SIGINT',
  'SIGIO',
  'SIGIOT',
  'SIGKILL',
  'SIGPIPE',
  'SIGPOLL',
  'SIGPROF',
  'SIGPWR',
  'SIGQUIT',
  'SIGSEGV',
  'SIGSTKFLT',
  'SIGSTOP',
  'SIGSYS',
  'SIGTERM',
  'SIGTRAP',
  'SIGTSTP',
  'SIGTTIN',
  'SIGTTOU',
  'SIGUNUSED',
  'SIGURG',
  'SIGUSR1',
  'SIGUSR2',
  'SIGVTALRM',
  'SIGWINCH',
  'SIGXCPU',
  'SIGXFSZ',
] as const satisfies readonly ConnectorHealthSignal[];

const SIGNALS = new Set<ConnectorHealthSignal>(CONNECTOR_HEALTH_SIGNALS);

export function isConnectorHealthSignal(value: unknown): value is ConnectorHealthSignal {
  return typeof value === 'string' && SIGNALS.has(value as ConnectorHealthSignal);
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

class StrictJsonParser {
  #offset = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.#skipWhitespace();
    const value = this.#parseValue(0);
    this.#skipWhitespace();
    if (this.#offset !== this.source.length) {
      this.#fail('contains trailing data');
    }
    return value;
  }

  #fail(message: string): never {
    throw new StrictJsonError('malformed', `Strict JSON ${message} at character ${this.#offset}.`);
  }

  #skipWhitespace(): void {
    while (['\t', '\n', '\r', ' '].includes(this.source[this.#offset] ?? '')) {
      this.#offset += 1;
    }
  }

  #parseValue(depth: number): unknown {
    if (depth > MAX_JSON_DEPTH) {
      this.#fail('exceeds its nesting bound');
    }
    const character = this.source[this.#offset];
    if (character === '{') {
      return this.#parseObject(depth + 1);
    }
    if (character === '[') {
      return this.#parseArray(depth + 1);
    }
    if (character === '"') {
      return this.#parseString();
    }
    if (character === '-' || (character !== undefined && /[0-9]/.test(character))) {
      return this.#parseNumber();
    }
    for (const [literal, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (this.source.startsWith(literal, this.#offset)) {
        this.#offset += literal.length;
        return value;
      }
    }
    this.#fail('contains an invalid value');
  }

  #parseObject(depth: number): Record<string, unknown> {
    this.#offset += 1;
    this.#skipWhitespace();
    const result: Record<string, unknown> = {};
    const keys = new Set<string>();
    if (this.source[this.#offset] === '}') {
      this.#offset += 1;
      return result;
    }
    while (true) {
      if (this.source[this.#offset] !== '"') {
        this.#fail('contains a non-string object key');
      }
      const key = this.#parseString();
      if (keys.has(key)) {
        throw new StrictJsonError('duplicate', `Strict JSON contains duplicate key ${key}.`);
      }
      keys.add(key);
      this.#skipWhitespace();
      if (this.source[this.#offset] !== ':') {
        this.#fail('is missing an object colon');
      }
      this.#offset += 1;
      this.#skipWhitespace();
      Object.defineProperty(result, key, {
        value: this.#parseValue(depth),
        enumerable: true,
        configurable: false,
        writable: false,
      });
      this.#skipWhitespace();
      const delimiter = this.source[this.#offset];
      if (delimiter === '}') {
        this.#offset += 1;
        return result;
      }
      if (delimiter !== ',') {
        this.#fail('contains a malformed object delimiter');
      }
      this.#offset += 1;
      this.#skipWhitespace();
    }
  }

  #parseArray(depth: number): unknown[] {
    this.#offset += 1;
    this.#skipWhitespace();
    const result: unknown[] = [];
    if (this.source[this.#offset] === ']') {
      this.#offset += 1;
      return result;
    }
    while (true) {
      result.push(this.#parseValue(depth));
      this.#skipWhitespace();
      const delimiter = this.source[this.#offset];
      if (delimiter === ']') {
        this.#offset += 1;
        return result;
      }
      if (delimiter !== ',') {
        this.#fail('contains a malformed array delimiter');
      }
      this.#offset += 1;
      this.#skipWhitespace();
    }
  }

  #parseString(): string {
    const start = this.#offset;
    this.#offset += 1;
    let escaped = false;
    while (this.#offset < this.source.length) {
      const code = this.source.charCodeAt(this.#offset);
      const character = this.source[this.#offset];
      if (!escaped && character === '"') {
        this.#offset += 1;
        let value: unknown;
        try {
          value = JSON.parse(this.source.slice(start, this.#offset));
        } catch (error) {
          throw new StrictJsonError('malformed', 'Strict JSON contains an invalid string.', {
            cause: error,
          });
        }
        if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
          this.#fail('contains a non-Unicode scalar string');
        }
        return value;
      }
      if (!escaped && code < 0x20) {
        this.#fail('contains an unescaped control character');
      }
      if (!escaped && character === '\\') {
        escaped = true;
      } else {
        escaped = false;
      }
      this.#offset += 1;
    }
    this.#fail('contains an unterminated string');
  }

  #parseNumber(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.source.slice(this.#offset)
    );
    if (match === null) {
      this.#fail('contains an invalid number');
    }
    this.#offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      this.#fail('contains a non-finite number');
    }
    return value;
  }
}

function parseStrictJsonBytes(bytes: Uint8Array, maxBytes: number): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new StrictJsonError('malformed', 'Strict JSON is empty or oversized.');
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new StrictJsonError('malformed', 'Strict JSON is not UTF-8.', { cause: error });
  }
  if (source.charCodeAt(0) === 0xfeff || source.includes('\0')) {
    throw new StrictJsonError('malformed', 'Strict JSON has a BOM or NUL.');
  }
  return new StrictJsonParser(source).parse();
}

export function parseBoundedStrictJson(bytes: Uint8Array, maxBytes: number): unknown {
  try {
    return parseStrictJsonBytes(bytes, maxBytes);
  } catch (error) {
    throw new ConnectorHealthContractError('JSON bytes violate the strict bounded contract.', {
      cause: error,
    });
  }
}

export function sha256Hex(bytes: Uint8Array): Sha256 {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value: unknown, depth: number): string {
  if (depth > MAX_JSON_DEPTH) {
    throw new ConnectorHealthContractError('JCS value exceeds its nesting bound.');
  }
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new ConnectorHealthContractError('JCS numbers must be finite and integer-safe.');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    if (hasUnpairedSurrogate(value)) {
      throw new ConnectorHealthContractError('JCS strings must contain Unicode scalar values.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new ConnectorHealthContractError('JCS arrays cannot contain holes.');
      }
    }
    return `[${value.map((entry) => canonicalize(entry, depth + 1)).join(',')}]`;
  }
  if (typeof value !== 'object' || value === null) {
    throw new ConnectorHealthContractError('JCS values must be JSON values.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConnectorHealthContractError('JCS objects cannot have a custom prototype.');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new ConnectorHealthContractError('JCS objects cannot contain symbols.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const entries = keys.map((key) => {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new ConnectorHealthContractError('JCS objects require enumerable data properties.');
    }
    return `${JSON.stringify(key)}:${canonicalize(descriptor.value, depth + 1)}`;
  });
  return `{${entries.join(',')}}`;
}

export function canonicalizeJson(value: unknown): string {
  return canonicalize(value, 0);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConnectorHealthContractError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ConnectorHealthContractError(`${label} has invalid keys.`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ConnectorHealthContractError(`${label} must be a string.`);
  }
  return value;
}

function boundedText(value: unknown, label: string, maxBytes: number): string {
  const text = stringValue(value, label);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (
    bytes === 0 ||
    bytes > maxBytes ||
    hasUnpairedSurrogate(text) ||
    /[\0\r\n]/.test(text) ||
    text.includes('```') ||
    text.includes('<!--') ||
    text.includes('-->')
  ) {
    throw new ConnectorHealthContractError(`${label} violates its text bound.`);
  }
  return text;
}

function canonicalTimestamp(value: unknown, label: string): string {
  const timestamp = stringValue(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    throw new ConnectorHealthContractError(`${label} must be canonical UTC.`);
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== timestamp) {
    throw new ConnectorHealthContractError(`${label} must round-trip through ISO UTC.`);
  }
  return timestamp;
}

function passFail(value: unknown, label: string): 'pass' | 'fail' {
  if (value !== 'pass' && value !== 'fail') {
    throw new ConnectorHealthContractError(`${label} must be pass or fail.`);
  }
  return value;
}

function nullableDetail(value: unknown, label: string): string | null {
  return value === null ? null : boundedText(value, label, 2_048);
}

function validateCheck(value: unknown, connectorId: string, index: number): ConnectorHealthCheck {
  const check = record(value, `connector ${connectorId} check`);
  exactKeys(check, ['id', 'status', 'code', 'detail'], `connector ${connectorId} check`);
  const expectedId = index === 0 ? 'unit-tests' : 'regression-fixtures';
  if (check.id !== expectedId) {
    throw new ConnectorHealthContractError(`connector ${connectorId} check order is invalid.`);
  }
  const status = passFail(check.status, `connector ${connectorId} check status`);
  const code = stringValue(check.code, `connector ${connectorId} check code`);
  const allowed =
    expectedId === 'unit-tests'
      ? status === 'pass'
        ? ['unit_tests_passed']
        : ['unit_tests_failed', 'unit_test_file_missing']
      : status === 'pass'
        ? ['regression_fixtures_present']
        : ['regression_fixture_directory_missing', 'regression_fixture_set_empty'];
  if (!allowed.includes(code)) {
    throw new ConnectorHealthContractError(`connector ${connectorId} check code disagrees.`);
  }
  const detail = nullableDetail(check.detail, `connector ${connectorId} check detail`);
  if (status === 'pass' && expectedId === 'unit-tests' && detail !== null) {
    throw new ConnectorHealthContractError('passing unit tests require a null detail.');
  }
  if (status === 'pass' && expectedId === 'regression-fixtures') {
    if (detail === null || !/^[1-9]\d*$/.test(detail)) {
      throw new ConnectorHealthContractError('fixture count must be canonical and positive.');
    }
  }
  return { id: expectedId, status, code: code as ConnectorHealthCheck['code'], detail };
}

function validateReportObject(value: unknown): ConnectorHealthReportV1 {
  const report = record(value, 'report');
  exactKeys(
    report,
    ['schema', 'version', 'generatedAt', 'status', 'connectors', 'regression'],
    'report'
  );
  if (report.schema !== 'missionpulse.connector-health-report' || report.version !== 1) {
    throw new ConnectorHealthContractError('report identity is invalid.');
  }
  const generatedAt = canonicalTimestamp(report.generatedAt, 'report generatedAt');
  const status = passFail(report.status, 'report status');
  if (
    !Array.isArray(report.connectors) ||
    report.connectors.length !== CONNECTOR_HEALTH_REGISTRY.length
  ) {
    throw new ConnectorHealthContractError('report connectors must equal the committed registry.');
  }
  const registry = [...CONNECTOR_HEALTH_REGISTRY].sort(({ id: left }, { id: right }) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right))
  );
  const connectors = report.connectors.map((rawConnector, index) => {
    const connector = record(rawConnector, 'connector');
    exactKeys(connector, ['connectorId', 'name', 'status', 'checks'], 'connector');
    const expected = registry[index];
    if (
      expected === undefined ||
      connector.connectorId !== expected.id ||
      connector.name !== expected.name
    ) {
      throw new ConnectorHealthContractError('report connector registry/order is invalid.');
    }
    boundedText(connector.connectorId, 'connector id', 64);
    boundedText(connector.name, 'connector name', 128);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expected.id)) {
      throw new ConnectorHealthContractError('registry connector id is invalid.');
    }
    const connectorStatus = passFail(connector.status, 'connector status');
    if (!Array.isArray(connector.checks) || connector.checks.length !== 2) {
      throw new ConnectorHealthContractError('connector checks are incomplete.');
    }
    const checks = connector.checks.map((check, checkIndex) =>
      validateCheck(check, expected.id, checkIndex)
    );
    const derived = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
    if (connectorStatus !== derived) {
      throw new ConnectorHealthContractError('connector aggregate status disagrees.');
    }
    return { connectorId: expected.id, name: expected.name, status: connectorStatus, checks };
  });
  const regression = record(report.regression, 'regression');
  exactKeys(regression, ['id', 'status', 'code', 'detail'], 'regression');
  if (regression.id !== 'parser-regression') {
    throw new ConnectorHealthContractError('regression id is invalid.');
  }
  const regressionStatus = passFail(regression.status, 'regression status');
  const regressionCode = stringValue(regression.code, 'regression code');
  if (
    (regressionStatus === 'pass' && regressionCode !== 'parser_regression_passed') ||
    (regressionStatus === 'fail' && regressionCode !== 'parser_regression_failed')
  ) {
    throw new ConnectorHealthContractError('regression code disagrees.');
  }
  const regressionDetail = nullableDetail(regression.detail, 'regression detail');
  if (regressionStatus === 'pass' && regressionDetail !== null) {
    throw new ConnectorHealthContractError('passing regression requires a null detail.');
  }
  const derivedStatus =
    connectors.every((connector) => connector.status === 'pass') && regressionStatus === 'pass'
      ? 'pass'
      : 'fail';
  if (status !== derivedStatus) {
    throw new ConnectorHealthContractError('report root status disagrees.');
  }
  return {
    schema: 'missionpulse.connector-health-report',
    version: 1,
    generatedAt,
    status,
    connectors,
    regression: {
      id: 'parser-regression',
      status: regressionStatus,
      code: regressionCode as 'parser_regression_passed' | 'parser_regression_failed',
      detail: regressionDetail,
    },
  };
}

function inspectReport(stdout: CapturedStream): {
  parseStatus: ConnectorHealthParseStatus;
  report: ConnectorHealthReportV1 | null;
} {
  if (stdout.truncated) {
    return { parseStatus: 'oversized', report: null };
  }
  if (stdout.prefix.byteLength === 0) {
    return { parseStatus: 'missing', report: null };
  }
  let parsed: unknown;
  try {
    parsed = parseStrictJsonBytes(stdout.prefix, MAX_STREAM_BYTES);
  } catch (error) {
    if (error instanceof StrictJsonError && error.kind === 'duplicate') {
      return { parseStatus: 'duplicate_json_key', report: null };
    }
    return { parseStatus: 'malformed_json', report: null };
  }
  try {
    return { parseStatus: 'valid', report: validateReportObject(parsed) };
  } catch {
    return { parseStatus: 'invalid_report', report: null };
  }
}

function sortedFailureCodes(
  child: ConnectorHealthEvidenceV1['child'],
  observation: ConnectorHealthEvidenceV1['reportObservation'],
  report: ConnectorHealthReportV1 | null
): ConnectorHealthFailureCode[] {
  const codes = new Set<ConnectorHealthFailureCode>();
  if (child.exitCode !== null && child.exitCode !== 0) {
    codes.add('child_exit_nonzero');
  }
  if (child.signal !== null) {
    codes.add('child_signalled');
  }
  if (child.timedOut) {
    codes.add('child_timed_out');
  }
  if (child.stdoutTruncated) {
    codes.add('stdout_overflow');
  }
  if (child.stderrBytes > 0) {
    codes.add('stderr_nonempty');
  }
  if (child.stderrTruncated) {
    codes.add('stderr_overflow');
  }
  const parseCode: Partial<Record<ConnectorHealthParseStatus, ConnectorHealthFailureCode>> = {
    missing: 'report_missing',
    oversized: 'report_oversized',
    malformed_json: 'report_malformed_json',
    duplicate_json_key: 'report_duplicate_json_key',
    invalid_report: 'report_invalid_schema',
  };
  const observedCode = parseCode[observation.parseStatus];
  if (observedCode !== undefined) {
    codes.add(observedCode);
  }
  if (report?.status === 'fail') {
    codes.add('report_declared_failure');
  }
  if (report?.connectors.some((connector) => connector.status === 'fail')) {
    codes.add('connector_check_failed');
  }
  if (report?.regression.status === 'fail') {
    codes.add('parser_regression_failed');
  }
  return [...codes].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function stableFingerprint(
  source: ConnectorHealthEvidenceV1['source'],
  child: ConnectorHealthEvidenceV1['child'],
  failureCodes: ConnectorHealthFailureCode[],
  report: ConnectorHealthReportV1 | null
): Sha256 {
  const failingChecks =
    report?.connectors.flatMap((connector) =>
      connector.checks
        .filter((check) => check.status === 'fail')
        .map((check) => `${connector.connectorId}/${check.id}`)
    ) ?? [];
  const projection = {
    workflowPath: source.workflowPath,
    repository: source.repository,
    sourceCommit: source.sourceCommit,
    childOutcomeCodes: failureCodes.filter((code) => code.startsWith('child_')),
    failingConnectorCheckIds: failingChecks.sort(),
    failureCodes,
  };
  return sha256Hex(Buffer.from(canonicalizeJson(projection), 'utf8'));
}

function validateCapturedStream(stream: CapturedStream, label: string): void {
  if (stream.prefix.byteLength > MAX_STREAM_BYTES) {
    throw new ConnectorHealthContractError(`${label} prefix exceeds ${MAX_STREAM_BYTES}.`);
  }
  if (stream.truncated && stream.prefix.byteLength !== MAX_STREAM_BYTES) {
    throw new ConnectorHealthContractError(`${label} truncated prefix must equal the cap.`);
  }
}

function validateSourceInput(source: EvidenceSourceInput): ConnectorHealthEvidenceV1['source'] {
  const repository = boundedText(source.repository, 'source repository', 256);
  const ref = boundedText(source.ref, 'source ref', 256);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(source.sourceCommit)) {
    throw new ConnectorHealthContractError('sourceCommit must be lower-case Git hex.');
  }
  if (!/^\d{1,32}$/.test(source.runId)) {
    throw new ConnectorHealthContractError('runId must contain 1..32 ASCII digits.');
  }
  if (!Number.isInteger(source.runAttempt) || source.runAttempt < 1 || source.runAttempt > 1_000) {
    throw new ConnectorHealthContractError('runAttempt is outside policy.');
  }
  return {
    repository,
    sourceCommit: source.sourceCommit,
    workflowPath: '.github/workflows/connector-health.yml',
    eventKind: source.eventKind,
    ref,
    runId: source.runId,
    runAttempt: source.runAttempt,
  };
}

function assertChildOutcome(child: CapturedChild): void {
  validateCapturedStream(child.stdout, 'stdout');
  validateCapturedStream(child.stderr, 'stderr');
  const hasExit = child.exitCode !== null;
  const hasSignal = child.signal !== null;
  if (hasExit === hasSignal) {
    throw new ConnectorHealthContractError('Exactly one child exitCode or signal is required.');
  }
  if (
    child.exitCode !== null &&
    (!Number.isInteger(child.exitCode) || child.exitCode < 0 || child.exitCode > 255)
  ) {
    throw new ConnectorHealthContractError('child exitCode is outside 0..255.');
  }
  if (child.signal !== null && !SIGNALS.has(child.signal)) {
    throw new ConnectorHealthContractError('child signal is outside the Linux allowlist.');
  }
}

function encodeEvidence(evidenceWithoutDigest: Omit<ConnectorHealthEvidenceV1, 'evidenceSha256'>): {
  evidence: ConnectorHealthEvidenceV1;
  bytes: Uint8Array;
} {
  const evidenceSha256 = sha256Hex(Buffer.from(canonicalizeJson(evidenceWithoutDigest), 'utf8'));
  const evidence: ConnectorHealthEvidenceV1 = { ...evidenceWithoutDigest, evidenceSha256 };
  const bytes = Buffer.from(canonicalizeJson(evidence), 'utf8');
  if (bytes.byteLength > MAX_EVIDENCE_BYTES) {
    throw new ConnectorHealthContractError('evidence exceeds its byte bound.');
  }
  return { evidence, bytes };
}

export function buildConnectorHealthEvidence(input: {
  capturedAt: string;
  source: EvidenceSourceInput;
  child: CapturedChild;
}): { evidence: ConnectorHealthEvidenceV1; bytes: Uint8Array } {
  const capturedAt = canonicalTimestamp(input.capturedAt, 'capturedAt');
  const source = validateSourceInput(input.source);
  assertChildOutcome(input.child);
  const stdoutBytes = input.child.stdout.prefix.byteLength;
  const stderrBytes = input.child.stderr.prefix.byteLength;
  const child: ConnectorHealthEvidenceV1['child'] = {
    exitCode: input.child.exitCode,
    signal: input.child.signal,
    timedOut: input.child.timedOut,
    stdoutBytes,
    stdoutTruncated: input.child.stdout.truncated,
    stdoutSha256: sha256Hex(input.child.stdout.prefix),
    stderrBytes,
    stderrTruncated: input.child.stderr.truncated,
    stderrSha256: sha256Hex(input.child.stderr.prefix),
  };
  const inspected = inspectReport(input.child.stdout);
  const reportObservation: ConnectorHealthEvidenceV1['reportObservation'] = {
    parseStatus: inspected.parseStatus,
    reportBytes: stdoutBytes,
    reportSha256: stdoutBytes === 0 ? null : child.stdoutSha256,
  };
  const failureCodes = sortedFailureCodes(child, reportObservation, inspected.report);
  const disposition = failureCodes.length === 0 ? 'passed' : 'failed';
  const failureFingerprint =
    disposition === 'failed'
      ? stableFingerprint(source, child, failureCodes, inspected.report)
      : null;
  return encodeEvidence({
    schema: 'missionpulse.connector-health-evidence',
    version: 1,
    capturedAt,
    source,
    child,
    reportObservation,
    report: inspected.report,
    disposition,
    failureCodes,
    failureFingerprint,
  });
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new ConnectorHealthContractError(`${label} must be an integer in range.`);
  }
  return value as number;
}

function sha(value: unknown, label: string): Sha256 {
  const digest = stringValue(value, label);
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new ConnectorHealthContractError(`${label} must be a SHA-256 hex digest.`);
  }
  return digest;
}

function equalArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateConnectorHealthEvidenceBytes(bytes: Uint8Array): ConnectorHealthEvidenceV1 {
  let parsed: unknown;
  try {
    parsed = parseStrictJsonBytes(bytes, MAX_EVIDENCE_BYTES);
  } catch (error) {
    throw new ConnectorHealthContractError('evidence is not strict JSON.', { cause: error });
  }
  const root = record(parsed, 'evidence');
  exactKeys(
    root,
    [
      'schema',
      'version',
      'evidenceSha256',
      'capturedAt',
      'source',
      'child',
      'reportObservation',
      'report',
      'disposition',
      'failureCodes',
      'failureFingerprint',
    ],
    'evidence'
  );
  if (root.schema !== 'missionpulse.connector-health-evidence' || root.version !== 1) {
    throw new ConnectorHealthContractError('evidence identity is invalid.');
  }
  const evidenceSha256 = sha(root.evidenceSha256, 'evidenceSha256');
  const capturedAt = canonicalTimestamp(root.capturedAt, 'capturedAt');
  const rawSource = record(root.source, 'source');
  exactKeys(
    rawSource,
    ['repository', 'sourceCommit', 'workflowPath', 'eventKind', 'ref', 'runId', 'runAttempt'],
    'source'
  );
  if (rawSource.workflowPath !== '.github/workflows/connector-health.yml') {
    throw new ConnectorHealthContractError('source workflowPath is invalid.');
  }
  if (rawSource.eventKind !== 'schedule' && rawSource.eventKind !== 'workflow_dispatch') {
    throw new ConnectorHealthContractError('source eventKind is invalid.');
  }
  const source = validateSourceInput({
    repository: stringValue(rawSource.repository, 'source repository'),
    sourceCommit: stringValue(rawSource.sourceCommit, 'source commit'),
    eventKind: rawSource.eventKind,
    ref: stringValue(rawSource.ref, 'source ref'),
    runId: stringValue(rawSource.runId, 'source runId'),
    runAttempt: integer(rawSource.runAttempt, 'source runAttempt', 1, 1_000),
  });
  const rawChild = record(root.child, 'child');
  exactKeys(
    rawChild,
    [
      'exitCode',
      'signal',
      'timedOut',
      'stdoutBytes',
      'stdoutTruncated',
      'stdoutSha256',
      'stderrBytes',
      'stderrTruncated',
      'stderrSha256',
    ],
    'child'
  );
  const signal =
    rawChild.signal === null
      ? null
      : SIGNALS.has(rawChild.signal as ConnectorHealthSignal)
        ? (rawChild.signal as ConnectorHealthSignal)
        : (() => {
            throw new ConnectorHealthContractError('child signal is invalid.');
          })();
  const exitCode =
    rawChild.exitCode === null ? null : integer(rawChild.exitCode, 'child exitCode', 0, 255);
  if (typeof rawChild.timedOut !== 'boolean') {
    throw new ConnectorHealthContractError('child timedOut must be boolean.');
  }
  if (
    typeof rawChild.stdoutTruncated !== 'boolean' ||
    typeof rawChild.stderrTruncated !== 'boolean'
  ) {
    throw new ConnectorHealthContractError('child truncation flags must be boolean.');
  }
  const stdoutBytes = integer(rawChild.stdoutBytes, 'child stdoutBytes', 0, MAX_STREAM_BYTES);
  const stderrBytes = integer(rawChild.stderrBytes, 'child stderrBytes', 0, MAX_STREAM_BYTES);
  if (rawChild.stdoutTruncated && stdoutBytes !== MAX_STREAM_BYTES) {
    throw new ConnectorHealthContractError('stdout truncated count must equal the cap.');
  }
  if (rawChild.stderrTruncated && stderrBytes !== MAX_STREAM_BYTES) {
    throw new ConnectorHealthContractError('stderr truncated count must equal the cap.');
  }
  if ((exitCode === null) === (signal === null)) {
    throw new ConnectorHealthContractError('Exactly one child exitCode or signal is required.');
  }
  const child: ConnectorHealthEvidenceV1['child'] = {
    exitCode,
    signal,
    timedOut: rawChild.timedOut,
    stdoutBytes,
    stdoutTruncated: rawChild.stdoutTruncated,
    stdoutSha256: sha(rawChild.stdoutSha256, 'child stdoutSha256'),
    stderrBytes,
    stderrTruncated: rawChild.stderrTruncated,
    stderrSha256: sha(rawChild.stderrSha256, 'child stderrSha256'),
  };
  const rawObservation = record(root.reportObservation, 'reportObservation');
  exactKeys(rawObservation, ['parseStatus', 'reportBytes', 'reportSha256'], 'reportObservation');
  const statuses: ConnectorHealthParseStatus[] = [
    'valid',
    'missing',
    'oversized',
    'malformed_json',
    'duplicate_json_key',
    'invalid_report',
  ];
  if (!statuses.includes(rawObservation.parseStatus as ConnectorHealthParseStatus)) {
    throw new ConnectorHealthContractError('report parseStatus is invalid.');
  }
  const parseStatus = rawObservation.parseStatus as ConnectorHealthParseStatus;
  const reportBytes = integer(rawObservation.reportBytes, 'reportBytes', 0, MAX_STREAM_BYTES);
  if (reportBytes !== stdoutBytes) {
    throw new ConnectorHealthContractError('reportBytes must equal child.stdoutBytes.');
  }
  const reportSha256 =
    rawObservation.reportSha256 === null ? null : sha(rawObservation.reportSha256, 'reportSha256');
  if (parseStatus === 'missing' && reportBytes !== 0) {
    throw new ConnectorHealthContractError('missing report requires zero reportBytes.');
  }
  if (reportBytes === 0) {
    if (parseStatus !== 'missing' || reportSha256 !== null) {
      throw new ConnectorHealthContractError('missing report digest/count invariants failed.');
    }
  } else if (reportSha256 !== child.stdoutSha256) {
    throw new ConnectorHealthContractError('reportSha256 must equal child.stdoutSha256.');
  }
  if (parseStatus === 'oversized' && !child.stdoutTruncated) {
    throw new ConnectorHealthContractError('oversized report requires truncated stdout.');
  }
  if (
    ['valid', 'malformed_json', 'duplicate_json_key', 'invalid_report'].includes(parseStatus) &&
    child.stdoutTruncated
  ) {
    throw new ConnectorHealthContractError(`${parseStatus} requires untruncated stdout.`);
  }
  const report = parseStatus === 'valid' ? validateReportObject(root.report) : null;
  if (
    (parseStatus === 'valid') !== (root.report !== null) ||
    (parseStatus !== 'valid' && root.report !== null)
  ) {
    throw new ConnectorHealthContractError('report presence disagrees with parseStatus.');
  }
  const reportObservation = { parseStatus, reportBytes, reportSha256 };
  const derivedFailureCodes = sortedFailureCodes(child, reportObservation, report);
  if (!Array.isArray(root.failureCodes)) {
    throw new ConnectorHealthContractError('failureCodes must be an array.');
  }
  const failureCodes = root.failureCodes.map((code) => stringValue(code, 'failure code'));
  if (!equalArray(failureCodes, derivedFailureCodes)) {
    throw new ConnectorHealthContractError('failureCodes are not the exact derived sorted set.');
  }
  const disposition = derivedFailureCodes.length === 0 ? 'passed' : 'failed';
  if (root.disposition !== disposition) {
    throw new ConnectorHealthContractError('disposition disagrees with derived failure codes.');
  }
  const failureFingerprint =
    disposition === 'failed' ? stableFingerprint(source, child, derivedFailureCodes, report) : null;
  if (root.failureFingerprint !== failureFingerprint) {
    throw new ConnectorHealthContractError(
      'failureFingerprint disagrees with the stable projection.'
    );
  }
  const evidence: ConnectorHealthEvidenceV1 = {
    schema: 'missionpulse.connector-health-evidence',
    version: 1,
    evidenceSha256,
    capturedAt,
    source,
    child,
    reportObservation,
    report,
    disposition,
    failureCodes: derivedFailureCodes,
    failureFingerprint,
  };
  const { evidenceSha256: ignoredDigest, ...withoutDigest } = evidence;
  void ignoredDigest;
  const expectedDigest = sha256Hex(Buffer.from(canonicalizeJson(withoutDigest), 'utf8'));
  if (expectedDigest !== evidenceSha256) {
    throw new ConnectorHealthContractError('evidenceSha256 self-digest mismatch.');
  }
  if (Buffer.from(bytes).toString('utf8') !== canonicalizeJson(evidence)) {
    throw new ConnectorHealthContractError('evidence file must be exact JCS bytes.');
  }
  return evidence;
}
