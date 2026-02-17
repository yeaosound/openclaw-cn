import { EventEmitter } from "node:events";

export type DesktopEventMap = {
  gatewayTransition: {
    state: string;
    at: string;
  };
};

export class DesktopEventBus {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof DesktopEventMap>(event: K, payload: DesktopEventMap[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DesktopEventMap>(event: K, listener: (payload: DesktopEventMap[K]) => void) {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}
