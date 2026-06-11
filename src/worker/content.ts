// Herní obsah importovaný jako text (wrangler rule Text / vitest raw import nepoužíváme — testy obsah nepotřebují)
import worldBible from "../../content/world-bible.md";
import avram from "../../content/npcs/avram.md";
import maisel from "../../content/npcs/maisel.md";
import jentl from "../../content/npcs/jentl.md";
import pinchas from "../../content/npcs/pinchas.md";
import rivka from "../../content/npcs/rivka.md";
import josef from "../../content/npcs/josef.md";
import marketa from "../../content/npcs/marketa.md";
import krystof from "../../content/npcs/krystof.md";
import scotta from "../../content/npcs/scotta.md";
import lukas from "../../content/npcs/lukas.md";
import vilem from "../../content/npcs/vilem.md";
import lobkowicz from "../../content/npcs/lobkowicz.md";

export const WORLD_BIBLE = worldBible;

export const NPC_CARDS: Record<string, string> = {
  avram,
  maisel,
  jentl,
  pinchas,
  rivka,
  josef,
  marketa,
  krystof,
  scotta,
  lukas,
  vilem,
  lobkowicz,
};

export const NPC_NAMES: Record<string, string> = {
  avram: "šámes Avram",
  maisel: "primas Mordechaj Maisel",
  jentl: "Jentl",
  pinchas: "zastavárník Pinchas",
  rivka: "Rivka",
  josef: "strážný Josef",
  marketa: "krčmářka Markéta",
  krystof: "žoldnéř Krystof",
  scotta: "mistr Scotta",
  lukas: "otec Lukáš",
  vilem: "tajemník Vilém",
  lobkowicz: "hrabě z Lobkowicz",
};
