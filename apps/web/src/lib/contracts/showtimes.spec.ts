import { expect, it } from "vitest";
import { decodePublicShowtime } from "./showtimes";

const response = {
  id: "show", startTime: "2026-11-01T12:00:00Z", status: "DRAFT",
  event: { id: "event", name: "Fixture", description: "Fixture", location: "A",
    posterPath: null, mobilePosterPath: null, bannerPath: null, categoryLabel: null },
  categories: [], siblings: [],
};

it.each([true, false])("preserves the server demo flag %s used to gate seat selection", (isDemo) => {
  expect(decodePublicShowtime({ ...response, isDemo })).toHaveProperty("isDemo", isDemo);
});
it("treats an older response without a demo flag as a normal sale", () => {
  expect(decodePublicShowtime(response)).toHaveProperty("isDemo", false);
});
it("rejects a malformed flag rather than interpreting a string as demo mode", () => {
  expect(() => decodePublicShowtime({ ...response, isDemo: "true" })).toThrow();
});
