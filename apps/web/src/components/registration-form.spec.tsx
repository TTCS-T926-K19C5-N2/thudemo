// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { RegistrationForm } from "./registration-form";
import { REGISTRATION_NOTICE } from "shared/registration-notice";
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockImplementation(async (path: string) =>
    path.includes("notice")
      ? REGISTRATION_NOTICE
      : { message: "Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn." },
  );
});
afterEach(cleanup);
async function fill() {
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.change(screen.getByLabelText("Họ tên giả"), {
    target: { value: "Tên giả" },
  });
  fireEvent.change(screen.getByLabelText("Email thử nghiệm"), {
    target: { value: "fixture@demo.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu thử nghiệm"), {
    target: { value: "Fixture-only-123" },
  });
}
it("requires explicit unchecked consent before making any registration call", async () => {
  render(<RegistrationForm />);
  await fill();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
  expect(
    mocks.api.mock.calls.filter((call) => call[0] === "/users/register"),
  ).toHaveLength(0);
  expect(
    screen.getByText("Hãy đọc và chủ động đồng ý thông báo trước khi đăng ký."),
  ).toBeTruthy();
});
it("fails closed for a changed notice and allows a deliberate retry with the exact approved version", async () => {
  mocks.api.mockResolvedValueOnce({
    ...REGISTRATION_NOTICE,
    version: "changed",
  });
  render(<RegistrationForm />);
  await screen.findByText(/Thông báo đã thay đổi/);
  expect(
    (
      screen.getByRole("button", {
        name: "Đăng ký",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Tải lại thông báo" }));
  await fill();
  expect(screen.queryByText(/Thông báo đã thay đổi/)).toBeNull();
});
it("retains inputs and server field errors, then recovers on another submission", async () => {
  render(<RegistrationForm />);
  await fill();
  fireEvent.click(screen.getByRole("checkbox"));
  mocks.api.mockRejectedValueOnce(
    new ApiError("Kiểm tra lại thông tin.", 400, "HTTP_400", {
      errors: { email: "Kiểm tra email thử." },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
  await screen.findByText("Kiểm tra email thử.");
  expect(
    (screen.getByLabelText("Mật khẩu thử nghiệm") as HTMLInputElement).value,
  ).toBe("Fixture-only-123");
  expect(
    (screen.getByLabelText("Email thử nghiệm") as HTMLInputElement).value,
  ).toBe("fixture@demo.invalid");
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
  await screen.findByRole("status");
  expect(
    (screen.getByLabelText("Mật khẩu thử nghiệm") as HTMLInputElement).value,
  ).toBe("");
});
it("keeps a synchronous submission lock while the registration request is pending", async () => {
  render(<RegistrationForm />);
  await fill();
  fireEvent.click(screen.getByRole("checkbox"));
  let finish!: (value: object) => void;
  mocks.api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const form = screen.getByRole("button", { name: "Đăng ký" }).closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(
    mocks.api.mock.calls.filter((call) => call[0] === "/users/register"),
  ).toHaveLength(1);
  finish({ message: "Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn." });
  await screen.findByRole("status");
});
it("shows resend remaining time without requiring signup consent fields", async () => {
  mocks.api.mockRejectedValueOnce(
    new ApiError("Limited", 429, "HTTP_429", { retryAfterSeconds: 120 }),
  );
  render(<RegistrationForm resend />);
  fireEvent.change(screen.getByLabelText("Email thử nghiệm"), {
    target: { value: "fixture@demo.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Gửi lại liên kết" }));
  await screen.findByText("Đã đạt giới hạn gửi lại. Thử lại sau 2 phút.");
  expect(screen.queryByRole("checkbox")).toBeNull();
});
