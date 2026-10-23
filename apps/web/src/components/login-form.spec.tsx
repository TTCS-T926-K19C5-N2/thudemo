// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LoginForm } from "./login-form";
import { ApiError } from "@/lib/api/client";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  user: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: mocks.api,
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  loadCurrentUser: mocks.user,
}));
vi.mock("@/components/layout/product-layout", () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({});
  mocks.user.mockResolvedValue({ roles: ["STAFF"] });
});
afterEach(cleanup);
it.each(["/events/new", undefined])(
  "returns to an allowed event path or preserves the STAFF destination: %s",
  async (returnTo) => {
    render(<LoginForm returnTo={returnTo} />);
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: "fixture@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "fixture-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Đăng nhập$/ }));
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        returnTo ?? "/check-in",
      ),
    );
    expect(mocks.router.refresh).toHaveBeenCalled();
  },
);

it("shows activation guidance and resend link for an unverified account", async () => {
  mocks.api.mockRejectedValue(
    new ApiError(
      "Tài khoản chưa được kích hoạt. Hãy kiểm tra email hoặc gửi lại liên kết kích hoạt.",
      401,
      "EMAIL_NOT_VERIFIED",
    ),
  );
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText(/Email/), {
    target: { value: "fixture@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "fixture-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Đăng nhập$/ }));

  expect(
    await screen.findByText(/Tài khoản chưa được kích hoạt/),
  ).toBeTruthy();
  expect(
    screen
      .getAllByRole("link", { name: "Gửi lại liên kết kích hoạt" })[0]
      .getAttribute("href"),
  ).toBe("/resend-activation");
  expect(mocks.router.replace).not.toHaveBeenCalled();
});
