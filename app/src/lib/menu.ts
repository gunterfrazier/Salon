import menuJson from "../../seed/service-menu.json";
import type { MenuService } from "./schedule/plan";

export interface Menu {
  timezone: string;
  stages: Record<string, number>;
  categories: { key: string; name: string; services: (MenuService & { description?: string; bookableOnline: boolean })[] }[];
}

export const menu = menuJson as unknown as Menu;

export const servicesByKey: Record<string, MenuService> = Object.fromEntries(
  menu.categories.flatMap((c) => c.services).map((s) => [s.key, s]),
);
