import { describe, expect, it } from "vitest";
import { LOCATION_IDS, CHRONICLE_SEED, archetypeIntro, firstVisitText, npcIntro, locationCanonAppendix } from "../src/shared/canon";
import { ARCHETYPES } from "../src/shared/rules";
import { NPC_CARDS } from "../src/worker/content";
import { WORLD_BIBLE } from "../src/worker/content";

describe("kanonické texty — integrita obsahu", () => {
  it("všech 10 lokací má neprázdný firstVisit", () => {
    expect(LOCATION_IDS).toHaveLength(10);
    for (const id of LOCATION_IDS) {
      const text = firstVisitText(id);
      expect(text, id).toBeTruthy();
      expect(text!.length, id).toBeGreaterThan(100);
    }
    expect(firstVisitText("atlantida")).toBeNull();
  });

  it("každý archetyp má úvod s ustavenými fakty a rychlé akce", () => {
    for (const a of ARCHETYPES) {
      const { intro, quickActions } = archetypeIntro(a.id);
      expect(intro.length, a.id).toBeGreaterThan(400);
      // společná fakta všech úvodů
      expect(intro, a.id).toContain("Bdi nad domem i nad tím, o čem mlčíme.");
      expect(intro.toLowerCase(), a.id).toContain("avram");
      expect(intro.toLowerCase(), a.id).toContain("na půdě");
      expect(quickActions.length, a.id).toBeGreaterThanOrEqual(2);
      for (const qa of quickActions) expect(qa.split(" ").length).toBeLessThanOrEqual(6);
    }
  });

  it("každé NPC s kartou má kanonické představení", () => {
    for (const id of Object.keys(NPC_CARDS)) {
      const intro = npcIntro(id);
      expect(intro, id).toBeTruthy();
      expect(intro!.length, id).toBeGreaterThan(60);
    }
    expect(npcIntro("neexistuje")).toBeNull();
  });

  it("kronika nové hry nese premisu", () => {
    expect(CHRONICLE_SEED).toContain("Bdi nad domem");
    expect(CHRONICLE_SEED).toContain("Avram");
  });

  it("GM system prompt obsahuje přílohu s kanonickými popisy", () => {
    expect(WORLD_BIBLE).toContain("Příloha: Kanonické popisy lokací");
    for (const id of LOCATION_IDS) {
      expect(WORLD_BIBLE).toContain(`### ${id} — `);
    }
    expect(locationCanonAppendix()).toContain("NIKDY neopakuj");
  });

  it("bible obsahuje eskalační žebřík a konvence flagů", () => {
    expect(WORLD_BIBLE).toContain("Mimoherní vstupy — eskalační žebřík");
    expect(WORLD_BIBLE).toContain("mimo-hru");
    expect(WORLD_BIBLE).toContain("navstiveno:");
    expect(WORLD_BIBLE).toContain("zmena:");
  });
});
