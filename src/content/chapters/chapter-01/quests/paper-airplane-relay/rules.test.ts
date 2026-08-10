import { describe, expect, it } from "vitest";
import { advancePaperAirplaneRelayStage, uniqueIds } from "./rules";

const none = { adviceIds: [], materialIds: [], windHits: 0 };

describe("Paper Airplane Relay rules", () => {
  it("requires every distinct advisor and material", () => {
    expect(advancePaperAirplaneRelayStage("ask_for_advice", { type: "advisor_consulted", advisor: "ryan" }, none)).toBe("ask_for_advice");
    expect(advancePaperAirplaneRelayStage("ask_for_advice", { type: "advisor_consulted", advisor: "andrew" }, { ...none, adviceIds: ["ryan", "billy"] })).toBe("find_materials");
    expect(advancePaperAirplaneRelayStage("find_materials", { type: "material_found", material: "message_strip" }, { ...none, materialIds: ["clean_sheet", "card_wing"] })).toBe("fold_plane");
    expect(uniqueIds(["ryan"], "ryan")).toEqual(["ryan"]);
  });

  it("only advances the relay after all wind catches", () => {
    expect(advancePaperAirplaneRelayStage("chase_plane", { type: "wind_gust_caught" }, { ...none, windHits: 1 })).toBe("chase_plane");
    expect(advancePaperAirplaneRelayStage("chase_plane", { type: "wind_gust_caught" }, { ...none, windHits: 2 })).toBe("decode_message");
  });
});
