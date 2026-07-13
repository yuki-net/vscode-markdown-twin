export { ProviderRateLimitError as TooManyRequestsError } from '../../domain/translationError';

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
