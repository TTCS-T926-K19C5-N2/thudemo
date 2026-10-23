// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WaitingRoomNotice } from "./waiting-room-notice";

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: mock.api,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows a loading status while the real admission check is pending", async () => {
  let resolve!: (value: unknown) => void;
  mock.api.mockReturnValue(new Promise((done) => (resolve = done)));
  render(<WaitingRoomNotice id="fixture" />);
  expect(screen.getByRole("status").textContent).toContain(
    "Đang kiểm tra lượt đặt vé",
  );
  resolve({ enabled: true, admitted: false, position: 1, expiresAt: null });
  expect(await screen.findByRole("heading", { name: "Bạn đang ở phòng chờ" })).toBeTruthy();
});

it("renders no queue notice when the waiting room is disabled", async () => {
  mock.api.mockResolvedValue({ enabled: false, admitted: true, position: 0, expiresAt: null });
  render(<WaitingRoomNotice id="fixture" />);
  await screen.findByText("Đang kiểm tra lượt đặt vé…");
  await vi.waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(screen.queryByRole("heading", { name: "Đến lượt đặt vé của bạn" })).toBeNull();
});
