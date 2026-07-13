import type { ProviderId } from '../../domain/provider';
import type { TranslationDocument } from '../../domain/translationDocument';
import type { TranslationCoordinator } from '../translationCoordinator';

export function translateDocument(
  coordinator: TranslationCoordinator,
  document: TranslationDocument,
  provider?: ProviderId
): Promise<boolean> {
  return coordinator.startTranslation(document, provider);
}
