export { ProviderRateLimitError as TooManyRequestsError } from '../../domain/translationError';

export function readRetryAfterMilliseconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
}

export async function readResponseErrorMessage(
  response: Response,
  messagePickers: Array<(payload: any) => string | undefined>
): Promise<string> {
  const payload: any = await response.json().catch(() => ({}));

  for (const pick of messagePickers) {
    const maybe = pick(payload);
    if (typeof maybe === 'string' && maybe.trim().length > 0) {
      return maybe;
    }
  }

  return response.statusText;
}
