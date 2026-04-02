/**
 * chrome.notifications API Implementation
 *
 * Shows system notifications on behalf of extensions.
 *
 * @module extensions/api/notifications
 */

import { Notification } from 'electron';

interface NotificationOptions {
  type?: string;
  title: string;
  message: string;
  iconUrl?: string;
}

export class NotificationsAPI {
  private activeNotifications: Map<string, Notification> = new Map();

  create(
    extensionId: string,
    notificationId: string,
    options: NotificationOptions
  ): string {
    const id = notificationId || `${extensionId}-${Date.now()}`;

    const notification = new Notification({
      title: options.title,
      body: options.message,
    });

    notification.show();
    this.activeNotifications.set(`${extensionId}:${id}`, notification);

    return id;
  }

  clear(extensionId: string, notificationId: string): boolean {
    const key = `${extensionId}:${notificationId}`;
    const notification = this.activeNotifications.get(key);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(key);
      return true;
    }
    return false;
  }
}
