import { EventEmitter } from "events";
import logger from "../config/logger";

class EventBus extends EventEmitter {
  private static instance: EventBus;

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  emit(event: string, data: any): boolean {
    logger.info(`EventBus: Emitting ${event}`, {
      event,
      data: JSON.stringify(data),
      timestamp: new Date().toISOString(),
    });
    return super.emit(event, data);
  }

  on(event: string, listener: (...args: any[]) => void): this {
    logger.debug(`EventBus: Registering listener for ${event}`);
    return super.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): this {
    logger.debug(`EventBus: Removing listener for ${event}`);
    return super.off(event, listener);
  }

  // Tournament-specific event helpers
  emitTournamentEvent(event: string, data: any): boolean {
    const enrichedData = {
      ...data,
      timestamp: new Date().toISOString(),
      eventId: this.generateEventId(),
      source: "backend",
    };
    return this.emit(event, enrichedData);
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default EventBus.getInstance();
