import type * as vscode from 'vscode';
import type { SecretRepository } from '../../ports/secretRepository';

export class VscodeSecretRepository implements SecretRepository {
  constructor(private readonly storage: vscode.SecretStorage) {}

  async get(providerId: string): Promise<string | undefined> {
    return await this.storage.get(this.key(providerId));
  }

  async set(providerId: string, secret: string): Promise<void> {
    await this.storage.store(this.key(providerId), secret);
  }

  async delete(providerId: string): Promise<void> {
    await this.storage.delete(this.key(providerId));
  }

  private key(providerId: string): string {
    return `markdownTwin.apiKey.${providerId}`;
  }
}
