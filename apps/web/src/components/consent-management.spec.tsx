// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ConsentManagement } from "./consent-management";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: mocks.api,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockImplementation(async (path: string) => {
    if (path.includes("status")) {
      return {
        consents: [
          {
            type: "TERMS_OF_SERVICE",
            title: "Điều khoản dịch vụ",
            version: "TERMS-v1.0",
            activeVersion: "TERMS-v1.0",
            status: "GRANTED",
            mandatory: true,
            consentedAt: "2026-10-01T00:00:00Z",
            revokedAt: null,
            needsReconsent: false,
          },
          {
            type: "PRIVACY_POLICY",
            title: "Chính sách quyền riêng tư",
            version: "PRIVACY-NOTICE-R0-v1.0",
            activeVersion: "PRIVACY-NOTICE-R0-v1.0",
            status: "GRANTED",
            mandatory: true,
            consentedAt: "2026-10-01T00:00:00Z",
            revokedAt: null,
            needsReconsent: false,
          },
          {
            type: "MARKETING_EMAIL",
            title: "Nhận thông tin tiếp thị qua email",
            version: "MARKETING-v1.0",
            activeVersion: "MARKETING-v1.0",
            status: "GRANTED",
            mandatory: false,
            consentedAt: "2026-10-01T00:00:00Z",
            revokedAt: null,
            needsReconsent: false,
          },
        ],
        pendingPolicies: [],
        needsReconsent: false,
      };
    }
    if (path.includes("history")) {
      return [
        {
          id: "hist-1",
          type: "MARKETING_EMAIL",
          version: "MARKETING-v1.0",
          action: "GRANTED",
          ipAddress: "127.0.0.1",
          createdAt: "2026-10-01T00:00:00Z",
        },
      ];
    }
    return { ok: true };
  });
});

afterEach(cleanup);

it("renders consent list and current statuses", async () => {
  render(<ConsentManagement />);
  await waitFor(() => {
    expect(screen.getByText("Quyền riêng tư & Điều khoản")).toBeTruthy();
  });
  expect(screen.getByText("Điều khoản dịch vụ")).toBeTruthy();
  expect(screen.getByText("Chính sách quyền riêng tư")).toBeTruthy();
  expect(screen.getByText("Nhận thông tin tiếp thị qua email")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Thu hồi quyền" })).toBeTruthy();
});

it("calls revoke consent when clicking Thu hồi quyền for marketing", async () => {
  render(<ConsentManagement />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Thu hồi quyền" })).toBeTruthy();
  });

  fireEvent.click(screen.getByRole("button", { name: "Thu hồi quyền" }));

  await waitFor(() => {
    expect(mocks.api).toHaveBeenCalledWith(
      "/users/consents/revoke",
      expect.any(Function),
      expect.objectContaining({
        method: "POST",
        body: { type: "MARKETING_EMAIL" },
      }),
    );
  });
});

it("displays re-consent warning when needsReconsent is true and allows agreeing", async () => {
  mocks.api.mockImplementationOnce(async () => ({
    consents: [
      {
        type: "TERMS_OF_SERVICE",
        title: "Điều khoản dịch vụ",
        version: "TERMS-OLD-v0.9",
        activeVersion: "TERMS-v1.0",
        status: "GRANTED",
        mandatory: true,
        consentedAt: "2026-01-01T00:00:00Z",
        revokedAt: null,
        needsReconsent: true,
      },
    ],
    pendingPolicies: [
      {
        type: "TERMS_OF_SERVICE",
        title: "Điều khoản dịch vụ",
        requiredVersion: "TERMS-v1.0",
        currentVersion: "TERMS-OLD-v0.9",
        mandatory: true,
      },
    ],
    needsReconsent: true,
  }));

  render(<ConsentManagement />);
  await waitFor(() => {
    expect(screen.getByText(/Thông báo cập nhật/)).toBeTruthy();
  });

  const agreeBtn = screen.getByRole("button", { name: "Đồng ý các phiên bản mới" });
  expect(agreeBtn).toBeTruthy();
  fireEvent.click(agreeBtn);

  await waitFor(() => {
    expect(mocks.api).toHaveBeenCalledWith(
      "/users/consents/agree",
      expect.any(Function),
      expect.objectContaining({
        method: "POST",
        body: {
          policies: [{ type: "TERMS_OF_SERVICE", version: "TERMS-v1.0" }],
        },
      }),
    );
  });
});

it("toggles audit log history display", async () => {
  render(<ConsentManagement />);
  await waitFor(() => {
    expect(screen.getByText("Quyền riêng tư & Điều khoản")).toBeTruthy();
  });

  const historyBtn = screen.getByRole("button", {
    name: "Xem lịch sử thay đổi đồng ý (Audit Log)",
  });
  fireEvent.click(historyBtn);

  await waitFor(() => {
    expect(screen.getByText("Lịch sử thay đổi đồng ý")).toBeTruthy();
    expect(screen.queryByText("hist-1")).toBeNull();
    expect(screen.getByText("127.0.0.1")).toBeTruthy();
  });
});
