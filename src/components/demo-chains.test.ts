import { describe, expect, it } from "vitest";
import { RUG_APPROVED, RUG_UPDATE, rugPull } from "./demo-chains";

describe("hero rug-pull demo", () => {
  it("allows the approved definition and blocks the silent update", async () => {
    const same = await rugPull(RUG_APPROVED);
    expect(same.current).toBe(same.locked);
    expect(same.verdict).toBe("allow");

    const changed = await rugPull(RUG_UPDATE);
    expect(changed.current).not.toBe(changed.locked);
    expect(changed.verdict).toBe("deny");
    expect(changed.why).toMatch(/^VFY-TOOL-004/);
    expect(changed.findings.some((f) => f.startsWith("VFY-SCAN-014"))).toBe(true);
    expect(changed.receipt).not.toBe(same.receipt);
  });

  it("notices a one-character change", async () => {
    const r = await rugPull(`${RUG_APPROVED} `);
    expect(r.verdict).toBe("deny");
  });
});
