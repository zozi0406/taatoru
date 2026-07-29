export interface ApiErrorOptions {
  readonly status?: number;
  readonly url?: string | URL;
  readonly retryAt?: Date;
  readonly hibernating?: boolean;
  readonly cause?: unknown;
}

function safeUrl(url: string | URL | undefined): string | null {
  if (url === undefined) {
    return null;
  }

  try {
    const parsed = new URL(url.toString());
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly safeUrl: string | null;
  readonly retryAt: Date | null;
  readonly isHibernating: boolean;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status ?? null;
    this.safeUrl = safeUrl(options.url);
    this.retryAt = options.retryAt ?? null;
    this.isHibernating =
      options.hibernating ?? message.toLowerCase().includes('hibernating');
  }
}

export class ApiDecodeError extends ApiError {
  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, options);
    this.name = 'ApiDecodeError';
  }
}

export class NetworkError extends ApiError {
  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, options);
    this.name = 'NetworkError';
  }
}
