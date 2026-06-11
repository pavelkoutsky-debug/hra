import { describe, expect, it } from "vitest";
import { codeMatches, issueToken, verifyToken } from "../src/worker/auth";

describe("auth", () => {
  it("vydaný token projde ověřením", async () => {
    const t = await issueToken("tajny-kod");
    expect(await verifyToken("tajny-kod", t)).toBe(true);
  });

  it("token s jiným kódem neprojde", async () => {
    const t = await issueToken("tajny-kod");
    expect(await verifyToken("jiny-kod", t)).toBe(false);
  });

  it("prošlý token neprojde", async () => {
    const t = await issueToken("tajny-kod", Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(await verifyToken("tajny-kod", t)).toBe(false);
  });

  it("poškozený token neshodí server", async () => {
    expect(await verifyToken("tajny-kod", "nesmysl")).toBe(false);
    expect(await verifyToken("tajny-kod", "a.b")).toBe(false);
    expect(await verifyToken("tajny-kod", "")).toBe(false);
  });

  it("codeMatches porovnává přesně", () => {
    expect(codeMatches("golem1592", "golem1592")).toBe(true);
    expect(codeMatches("golem1592", "golem1593")).toBe(false);
    expect(codeMatches("golem1592", "golem159")).toBe(false);
  });
});
