import { expect, it } from "vitest";
import { parseSeatMapJson } from "./parse-seat-map";

it("reports the line and column of malformed JSON without returning a partial map", () => {
  expect(() => parseSeatMapJson('{\n  "seats": [}\n}')).toThrow(/dòng 2, cột 13/);
});
it("locates a truncated JSON document at its end", () => {
  expect(() => parseSeatMapJson('{\n"seats": [')).toThrow(/dòng 2, cột 11/);
});
it("returns the complete document only when JSON syntax is valid", () => {
  expect(parseSeatMapJson('{"seats":[]}')).toEqual({ seats: [] });
});
