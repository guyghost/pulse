export class StrictJsonError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StrictJsonError';
  }
}

const MAX_JSON_DEPTH = 64;

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
  readonly #source: string;
  #offset = 0;

  constructor(source: string) {
    this.#source = source;
  }

  parse(): unknown {
    this.#skipWhitespace();
    const value = this.#parseValue(0);
    this.#skipWhitespace();
    if (this.#offset !== this.#source.length) {
      this.#fail('contains trailing data');
    }
    return value;
  }

  #fail(message: string): never {
    throw new StrictJsonError(`Strict JSON ${message} at byte-safe character ${this.#offset}.`);
  }

  #skipWhitespace(): void {
    while (['\t', '\n', '\r', ' '].includes(this.#source[this.#offset] ?? '')) {
      this.#offset += 1;
    }
  }

  #parseValue(depth: number): unknown {
    if (depth > MAX_JSON_DEPTH) {
      this.#fail('exceeds its nesting bound');
    }
    const character = this.#source[this.#offset];
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
      if (this.#source.startsWith(literal, this.#offset)) {
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
    if (this.#source[this.#offset] === '}') {
      this.#offset += 1;
      return result;
    }
    while (true) {
      if (this.#source[this.#offset] !== '"') {
        this.#fail('contains a non-string object key');
      }
      const key = this.#parseString();
      if (keys.has(key)) {
        this.#fail(`contains duplicate object key ${JSON.stringify(key)}`);
      }
      keys.add(key);
      this.#skipWhitespace();
      if (this.#source[this.#offset] !== ':') {
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
      const delimiter = this.#source[this.#offset];
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
    if (this.#source[this.#offset] === ']') {
      this.#offset += 1;
      return result;
    }
    while (true) {
      result.push(this.#parseValue(depth));
      this.#skipWhitespace();
      const delimiter = this.#source[this.#offset];
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
    while (this.#offset < this.#source.length) {
      const code = this.#source.charCodeAt(this.#offset);
      const character = this.#source[this.#offset];
      if (!escaped && character === '"') {
        this.#offset += 1;
        const raw = this.#source.slice(start, this.#offset);
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch (error) {
          throw new StrictJsonError('Strict JSON contains an invalid string.', { cause: error });
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
    const remaining = this.#source.slice(this.#offset);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remaining);
    if (!match) {
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

export function parseStrictJsonBytes(bytes: Uint8Array, label: string, maxBytes: number): unknown {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    bytes.byteLength === 0 ||
    bytes.byteLength > maxBytes
  ) {
    throw new StrictJsonError(`${label} is empty or exceeds its JSON byte bound.`);
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new StrictJsonError(`${label} is not strict UTF-8.`, { cause: error });
  }
  if (
    source.charCodeAt(0) === 0xfeff ||
    source.includes('\0') ||
    Buffer.byteLength(source, 'utf8') !== bytes.byteLength
  ) {
    throw new StrictJsonError(`${label} is not canonical UTF-8 JSON text.`);
  }
  try {
    return new StrictJsonParser(source).parse();
  } catch (error) {
    if (error instanceof StrictJsonError) {
      throw error;
    }
    throw new StrictJsonError(`${label} is not strict JSON.`, { cause: error });
  }
}
