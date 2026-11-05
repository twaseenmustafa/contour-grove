import { it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import { validateProject } from "./project";
it("accepts old projects and validated reversible finishes", () => {
  const p = demoProject();
  expect(validateProject(p)).toEqual(p);
  p.parts[0].finish = { grain: 0.2, depth: 12, angle: 45, color: "#444444" };
  expect(validateProject(p).parts[0].finish).toEqual(p.parts[0].finish);
});
it.each([
  { grain: 1 },
  { depth: 25 },
  { angle: Infinity },
  { color: "url(https://evil.example)" },
  { unexpected: 1 },
])("rejects unbounded or unsafe finish %j", (patch) => {
  const p = demoProject();
  p.parts[0].finish = {
    grain: 0.2,
    depth: 12,
    angle: 45,
    color: "#444444",
    ...patch,
  };
  expect(() => validateProject(p)).toThrow(/finish/);
});
