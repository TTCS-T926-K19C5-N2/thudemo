// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ActivationForm } from "./activation-form";
import { ApiError } from "@/lib/api/client";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: mocks.api,
}));
vi.mock("@/components/layout/product-layout", () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
const token = "a".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/activate#token=" + token);
  mocks.api.mockResolvedValue({
    message: "Tài khoản đã được kích hoạt. Bạn có thể đăng nhập.",
  });
});
afterEach(cleanup);
async function submit() {
  await screen.findByLabelText("Mật khẩu tài khoản");
  fireEvent.change(screen.getByLabelText("Mật khẩu tài khoản"), {
    target: { value: "Mailbox-owner-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tất kích hoạt" }));
}
it("removes fragment without activation until mailbox holder chooses final credentials", async () => {
  render(<ActivationForm />);
  await screen.findByLabelText("Mật khẩu tài khoản");
  expect(window.location.hash).toBe("");
  expect(mocks.api).not.toHaveBeenCalled();
  await submit();
  await screen.findByText("Tài khoản đã được kích hoạt. Bạn có thể đăng nhập.");
  expect(mocks.api).toHaveBeenCalledWith(
    "/users/activate",
    expect.any(Function),
    { method: "POST", body: { token, password: "Mailbox-owner-password" } },
  );
  expect(screen.queryByLabelText("Mật khẩu tài khoản")).toBeNull();
});
it("rejects a short activation password without contacting the API", async () => {
  render(<ActivationForm />);
  await screen.findByLabelText("Mật khẩu tài khoản");
  fireEvent.change(screen.getByLabelText("Mật khẩu tài khoản"), {
    target: { value: "short" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Hoàn tất kích hoạt" }).closest("form")!,
  );
  await screen.findByText("Đặt mật khẩu từ 8 đến 1024 ký tự.");
  expect(mocks.api).not.toHaveBeenCalled();
});
it("handles missing or invalid links without issuing activation", async () => {
  window.history.replaceState(null, "", "/activate#token=invalid");
  render(<ActivationForm />);
  await screen.findByText("Liên kết không hợp lệ. Hãy yêu cầu gửi lại.");
  await submit();
  expect(mocks.api).not.toHaveBeenCalled();
});
it.each(["ACTIVATION_USED", "ACTIVATION_EXPIRED"])(
  "shows server token error and resend recovery: %s",
  async (code) => {
    mocks.api.mockRejectedValue(
      new ApiError("Liên kết đã hết hạn hoặc đã dùng.", 400, code),
    );
    render(<ActivationForm />);
    await submit();
    await screen.findByText("Liên kết đã hết hạn hoặc đã dùng.");
    expect(
      screen
        .getByRole("link", { name: "Gửi lại liên kết kích hoạt" })
        .getAttribute("href"),
    ).toBe("/resend-activation");
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  },
);
it("retains token and chosen password only in memory for a recoverable network failure", async () => {
  mocks.api.mockRejectedValueOnce(
    new ApiError("Không thể kết nối.", 0, "NETWORK_ERROR"),
  );
  render(<ActivationForm />);
  await submit();
  await screen.findByText("Không thể kết nối.");
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  await screen.findByText("Tài khoản đã được kích hoạt. Bạn có thể đăng nhập.");
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
  expect(mocks.api.mock.calls[0][2]).toEqual(mocks.api.mock.calls[1][2]);
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
});
