/**
 * chrome.runtime API Implementation
 *
 * Extension lifecycle and inter-extension messaging.
 *
 * @module extensions/api/runtime
 */

import { LoadedExtension } from '../../../../core/extensions/types';

type MessageListener = (message: unknown, sender: unknown) => unknown;

export class RuntimeAPI {
  private messageListeners: Map<string, MessageListener[]> = new Map();

  getManifest(extension: LoadedExtension): unknown {
    return extension.manifest;
  }

  getURL(extension: LoadedExtension, resourcePath: string): string {
    return `volary-extension://${extension.id}/${resourcePath}`;
  }

  getId(extension: LoadedExtension): string {
    return extension.id;
  }

  /**
   * Register a message listener for an extension
   */
  addMessageListener(extensionId: string, callback: MessageListener): void {
    if (!this.messageListeners.has(extensionId)) {
      this.messageListeners.set(extensionId, []);
    }
    this.messageListeners.get(extensionId)!.push(callback);
  }

  /**
   * Remove a message listener
   */
  removeMessageListener(extensionId: string, callback: MessageListener): void {
    const listeners = this.messageListeners.get(extensionId);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) listeners.splice(index, 1);
    }
  }

  /**
   * Send a message to an extension's listeners
   */
  async sendMessage(extensionId: string, message: unknown): Promise<unknown> {
    const listeners = this.messageListeners.get(extensionId) || [];
    for (const listener of listeners) {
      const response = listener(message, { id: extensionId });
      if (response !== undefined) return response;
    }
    return undefined;
  }
}
