import type { ItemId } from "../game/types";

export type ItemUseKind = "none" | "equip_transport";

export interface ItemDefinition {
  readonly itemId: ItemId;
  readonly label: string;
  /** Texture key or a short fallback glyph used by the Backpack. */
  readonly icon: string;
  readonly description: string;
  readonly stackLimit: number;
  readonly useKind: ItemUseKind;
}

export const ITEMS: Readonly<Record<ItemId, ItemDefinition>> = {
  xbox_controller: {
    itemId: "xbox_controller",
    label: "Xbox controller",
    icon: "controller",
    description: "Jeremy's missing controller, ready to bring home.",
    stackLimit: 1,
    useKind: "none",
  },
  bicycle: {
    itemId: "bicycle",
    label: "Bicycle",
    icon: "bicycle",
    description: "A borrowed bike that is now yours to ride.",
    stackLimit: 1,
    useKind: "equip_transport",
  },
  field_token: {
    itemId: "field_token",
    label: "Field token",
    icon: "field-token",
    description: "A brass token found out in Milton's field.",
    stackLimit: 99,
    useKind: "none",
  },
};

export function getItemDefinition(itemId: ItemId): ItemDefinition {
  return ITEMS[itemId];
}

export function isItemId(value: unknown): value is ItemId {
  return value === "xbox_controller" || value === "bicycle" || value === "field_token";
}
