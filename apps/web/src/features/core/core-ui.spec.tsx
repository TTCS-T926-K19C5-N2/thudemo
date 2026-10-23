// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PasswordRecovery } from "./password-recovery";
import { PublicationControl } from "./publication-control";
import { RescheduleForm } from "./reschedule-form";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: mocks.api,
}));
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  mocks.api.mockResolvedValue({
    message: "Nếu email hợp lệ, bạn sẽ nhận hướng dẫn.",
  });
});
afterEach(cleanup);
it("forgot submits email and shows generic success", async () => {
  render(<PasswordRecovery />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "fixture@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Gửi hướng dẫn" }));
  await waitFor(() =>
    expect(mocks.api).toHaveBeenCalledWith(
      "/auth/forgot-password",
      expect.anything(),
      { method: "POST", body: { email: "fixture@example.invalid" } },
    ),
  );
  await screen.findByText(/Nếu email hợp lệ/);
});
it("reset removes token from URL and rejects mismatched confirmation", async () => {
  window.history.replaceState(
    null,
    "",
    "/reset-password#token=" + "a".repeat(64),
  );
  render(<PasswordRecovery reset />);
  await waitFor(() => expect(window.location.hash).toBe(""));
  fireEvent.change(screen.getByLabelText("Mật khẩu mới"), {
    target: { value: "Password123" },
  });
  fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu"), {
    target: { value: "Different123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));
  await screen.findByText("Hai mật khẩu chưa khớp.");
  expect(mocks.api).not.toHaveBeenCalled();
});
it("reset with missing token offers a new link", async () => {
  render(<PasswordRecovery reset />);
  await screen.findByText(/Liên kết thiếu mã/);
  expect(
    screen
      .getByRole("link", { name: "Yêu cầu liên kết mới" })
      .getAttribute("href"),
  ).toBe("/forgot-password");
});
it("hide is disabled until explicit confirmation", async () => {
  mocks.api.mockResolvedValue({ status: "DRAFT" });
  render(<PublicationControl id="fixture" initialStatus="PUBLISHED" />);
  expect(
    (screen.getByRole("button", { name: "Ẩn sự kiện" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Ẩn sự kiện" }));
  await screen.findByText(/Đã ẩn sự kiện/);
});
it("publication shows backend validation error", async () => {
  mocks.api.mockRejectedValue(new Error("Cần giá đầy đủ."));
  render(<PublicationControl id="fixture" initialStatus="DRAFT" />);
  fireEvent.click(screen.getByRole("button", { name: "Công bố sự kiện" }));
  await screen.findByText("Cần giá đầy đủ.");
});
it("reports publication changes to the event editor badge", async () => {
  const changed = vi.fn();
  mocks.api.mockResolvedValue({ status: "PUBLISHED" });
  render(
    <PublicationControl
      id="fixture"
      initialStatus="DRAFT"
      onStatusChanged={changed}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Công bố sự kiện" }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith("PUBLISHED"));
});
it("reschedule requires confirmation and renders Vietnam time", () => {
  render(
    <RescheduleForm
      id="fixture"
      startTime="2026-11-01T12:30:00Z"
      onChanged={async () => {}}
    />,
  );
  expect(screen.getByText(/19:30/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Xác nhận đổi giờ",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
