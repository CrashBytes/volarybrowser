/**
 * chrome.alarms API Implementation
 *
 * Allows extensions to schedule periodic or one-time alarms.
 *
 * @module extensions/api/alarms
 */

interface Alarm {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

type AlarmListener = (alarm: Alarm) => void;

export class AlarmsAPI {
  private alarms: Map<string, Map<string, NodeJS.Timeout>> = new Map();
  private alarmData: Map<string, Map<string, Alarm>> = new Map();
  private listeners: Map<string, AlarmListener[]> = new Map();

  private getExtAlarms(extensionId: string) {
    if (!this.alarms.has(extensionId)) this.alarms.set(extensionId, new Map());
    if (!this.alarmData.has(extensionId)) this.alarmData.set(extensionId, new Map());
    return {
      timers: this.alarms.get(extensionId)!,
      data: this.alarmData.get(extensionId)!,
    };
  }

  create(extensionId: string, name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number; when?: number }): void {
    const { timers, data } = this.getExtAlarms(extensionId);

    // Clear existing alarm with same name
    if (timers.has(name)) {
      clearTimeout(timers.get(name)!);
      clearInterval(timers.get(name)!);
    }

    const delayMs = alarmInfo.when
      ? Math.max(0, alarmInfo.when - Date.now())
      : (alarmInfo.delayInMinutes ?? 1) * 60_000;

    const alarm: Alarm = {
      name,
      scheduledTime: Date.now() + delayMs,
      periodInMinutes: alarmInfo.periodInMinutes,
    };
    data.set(name, alarm);

    const fire = () => {
      const ls = this.listeners.get(extensionId) || [];
      for (const l of ls) l(alarm);
    };

    if (alarmInfo.periodInMinutes) {
      const timer = setTimeout(() => {
        fire();
        const interval = setInterval(fire, alarmInfo.periodInMinutes! * 60_000);
        timers.set(name, interval);
      }, delayMs);
      timers.set(name, timer);
    } else {
      const timer = setTimeout(() => {
        fire();
        timers.delete(name);
        data.delete(name);
      }, delayMs);
      timers.set(name, timer);
    }
  }

  get(extensionId: string, name: string): Alarm | undefined {
    return this.alarmData.get(extensionId)?.get(name);
  }

  getAll(extensionId: string): Alarm[] {
    return Array.from(this.alarmData.get(extensionId)?.values() || []);
  }

  clear(extensionId: string, name: string): boolean {
    const { timers, data } = this.getExtAlarms(extensionId);
    const timer = timers.get(name);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      timers.delete(name);
      data.delete(name);
      return true;
    }
    return false;
  }

  clearAll(extensionId: string): void {
    const { timers, data } = this.getExtAlarms(extensionId);
    for (const timer of timers.values()) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    timers.clear();
    data.clear();
  }

  addListener(extensionId: string, callback: AlarmListener): void {
    if (!this.listeners.has(extensionId)) this.listeners.set(extensionId, []);
    this.listeners.get(extensionId)!.push(callback);
  }

  destroy(): void {
    for (const timers of this.alarms.values()) {
      for (const timer of timers.values()) {
        clearTimeout(timer);
        clearInterval(timer);
      }
    }
    this.alarms.clear();
    this.alarmData.clear();
    this.listeners.clear();
  }
}
