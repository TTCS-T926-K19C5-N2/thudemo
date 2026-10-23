// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { loadCurrentUser } from "@/lib/api";
import { PublicSessionControls } from "./public-session-controls";

vi.mock("@/lib/api", () => ({ loadCurrentUser: vi.fn() }));

const currentUser = vi.mocked(loadCurrentUser);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("shows account actions for an authenticated public-page session", async () => {
  currentUser.mockResolvedValue({ id: "fixture-user", email: "fixture@example.invalid", roles: ["BUYER"] });
  render(<PublicSessionControls />);

  expect(await screen.findByRole("link", { name: "Đơn hàng" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Đăng nhập" })).toBeNull();
});

it("shows login only after the API confirms there is no session", async () => {
  currentUser.mockResolvedValue(null);
  render(<PublicSessionControls />);

  expect(await screen.findByRole("link", { name: "Đăng nhập" })).toBeTruthy();
});

it("refreshes the public header after a login or logout event", async () => {
  currentUser.mockResolvedValueOnce(null).mockResolvedValueOnce({
    id: "fixture-user",
    email: "fixture@example.invalid",
    roles: ["BUYER"],
  });
  render(<PublicSessionControls />);
  expect(await screen.findByRole("link", { name: "Đăng nhập" })).toBeTruthy();

  window.dispatchEvent(new Event("account-session-changed"));
  expect(await screen.findByRole("link", { name: "Đơn hàng" })).toBeTruthy();
  await waitFor(() => expect(currentUser).toHaveBeenCalledTimes(2));
});
