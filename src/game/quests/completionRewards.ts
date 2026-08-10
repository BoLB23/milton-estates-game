import type { ImplementedQuestId, ItemId } from "../types";

/** Rewards coupled to durable completion rather than a scene callback. */
export interface QuestCompletionReward {
  readonly items: readonly ItemId[];
  readonly secrets: readonly string[];
}

export const QUEST_COMPLETION_REWARDS: Readonly<Partial<Record<ImplementedQuestId, QuestCompletionReward>>> = {
  creek_clubhouse: {
    items: ["clubhouse_journal_page"],
    secrets: ["creek_clubhouse_landmark", "creek_clubhouse_shortcut"],
  },
  paper_airplane_relay: {
    items: ["paper_airplane"],
    secrets: ["paper_airplane_shortcut"],
  },
  bent_creek_caddy_caper: {
    items: ["bent_creek_visitor_badge"],
    secrets: [],
  },
};
