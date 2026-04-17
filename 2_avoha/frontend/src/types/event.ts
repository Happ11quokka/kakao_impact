// === Event Types (KPI logging) ===

export type EventType =
  | 'app_enter'
  | 'collect'
  | 'craft'
  | 'view_inventory'
  | 'view_workshop'
  | 'view_book'
  | 'view_mypage'
  | 'craft_success'
  | 'craft_fail'
  | 'recipe_unlock'
  | 'sticker_view';

export interface AppEvent {
  id?: string;
  eventType: EventType;
  props?: Record<string, unknown>;
  occurredAt: string;
}
