import { expect, it } from "vitest";
import { demoProject } from "../demo/logo";
import { addText } from "./text";
import { validateProject } from "./project";
it("creates editable text without changing the original", () => {
  const p = demoProject(),
    r = addText(p, { x: 25, y: 70 });
  expect(p.parts).toHaveLength(6);
  expect(r.project.parts.at(-1)?.textData?.value).toBe("Your text");
  expect(r.project.source).toEqual(p.source);
});
it("rejects unsafe or unsupported text settings", () => {
  const p = addText(demoProject(), { x: 0, y: 0 }).project;
  const t = p.parts.at(-1)!.textData!;
  for (const patch of [
    { value: "" },
    { value: "a\u0001b" },
    { value: "x".repeat(201) },
    { font: "url(https://bad)" },
    { size: 1001 },
    { bold: "yes" },
    { italic: "yes" },
    { letterSpacing: 201 },
  ]) {
    const next = structuredClone(p);
    Object.assign(next.parts.at(-1)!.textData!, patch);
    expect(() => validateProject(next)).toThrow();
  }
  expect(t.value).toBe("Your text");
});
