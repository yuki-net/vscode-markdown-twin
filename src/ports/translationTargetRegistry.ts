/** Read-only view of preview targets required by translation orchestration. */
export interface TranslationTargetRegistry {
  hasDocument(documentUri: string): boolean;
  getDocumentUris(): readonly string[];
  getTargetLanguages(documentUri: string): readonly string[];
}
