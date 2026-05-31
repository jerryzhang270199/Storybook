import {
  getDefaultResultOrder,
  setDefaultResultOrder,
} from "node:dns";

type DnsResultOrder = "ipv4first" | "ipv6first" | "verbatim";

type DoubaoConnectionRetryOptions = {
  delay?: (durationMs: number) => Promise<void>;
  getDefaultResultOrder?: () => string;
  logWarning?: (message: string, payload: Record<string, unknown>) => void;
  maxAttempts?: number;
  setDefaultResultOrder?: (order: DnsResultOrder) => void;
};

const DEFAULT_CONNECTION_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 500;

function getNestedValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function collectErrorText(error: unknown): string {
  const cause = getNestedValue(error, "cause");
  return [
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
    String(getNestedValue(error, "code") ?? ""),
    String(getNestedValue(error, "type") ?? ""),
    cause instanceof Error ? cause.name : "",
    cause instanceof Error ? cause.message : "",
    String(getNestedValue(cause, "code") ?? ""),
    String(getNestedValue(cause, "errno") ?? ""),
  ]
    .join(" ")
    .toLowerCase();
}

export function isDoubaoConnectionError(error: unknown): boolean {
  const message = collectErrorText(error);
  return [
    "connection error",
    "fetch failed",
    "econnreset",
    "enotfound",
    "etimedout",
    "ssl_error_syscall",
    "und_err_connect_timeout",
    "networkerror",
  ].some((token) => message.includes(token));
}

export async function withDoubaoConnectionRetry<T>(
  operation: () => Promise<T>,
  {
    delay = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
    getDefaultResultOrder: readDnsOrder = getDefaultResultOrder,
    logWarning = console.warn,
    maxAttempts = DEFAULT_CONNECTION_ATTEMPTS,
    setDefaultResultOrder: writeDnsOrder = setDefaultResultOrder,
  }: DoubaoConnectionRetryOptions = {},
): Promise<T> {
  const safeMaxAttempts = Math.max(1, Math.trunc(maxAttempts));
  let attempt = 1;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isDoubaoConnectionError(error) || attempt >= safeMaxAttempts) {
        throw error;
      }

      if (readDnsOrder() !== "ipv6first") {
        try {
          writeDnsOrder("ipv6first");
        } catch {
          // Keep retrying the transient network error even if DNS preference cannot be changed.
        }
      }

      logWarning("[doubao] connection failed; retrying request", {
        attempt,
        error: error instanceof Error ? error.message : "unknown",
        maxAttempts: safeMaxAttempts,
      });
      await delay(Math.min(attempt * RETRY_BASE_DELAY_MS, 3_000));
      attempt += 1;
    }
  }
}
