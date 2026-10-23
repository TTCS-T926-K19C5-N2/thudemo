// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrderReview } from "./order-review";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  loadCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...props}>{children}</a>
  ),
}));
vi.mock("@/lib/api", () => ({ loadCurrentUser: mocks.loadCurrentUser }));
vi.mock("@/components/layout/product-layout", () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/lifecycle/order-cancellation", () => ({ OrderCancellation: () => null }));
vi.mock("@/features/lifecycle/order-audit", () => ({ OrderAudit: () => null }));
vi.mock("@/features/order-review/signed-tickets", () => ({ SignedTickets: () => null }));
vi.mock("@/features/tickets/order-tickets", () => ({ OrderTickets: () => null }));
vi.mock("@/features/orders/order-badge", () => ({ OrderBadge: () => null }));

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "order-fixture-1",
  status: "PENDING",
  rawStatus: "PENDING",
  totalAmount: 10000,
  subtotalAmount: 10000,
  discountAmount: 0,
  couponCode: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  serverTime: "2026-10-23T00:00:00.000Z",
  remainingSeconds: 600,
  isExpired: false,
  createdAt: "2026-10-23T00:00:00.000Z",
  event: { id: "event-1", name: "Fixture event", description: "", location: "Venue" },
  showtime: { id: "showtime-1", startTime: "2099-01-01T00:00:00.000Z" },
  items: [{ id: "item-1", seatId: "seat-1", row: "A", seatNumber: 1, label: "A-1", tierName: "Standard", unitPrice: 10000 }],
  ...overrides,
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  mocks.router.push.mockReset();
  mocks.router.replace.mockReset();
  mocks.router.refresh.mockReset();
  mocks.loadCurrentUser.mockReset().mockResolvedValue({ id: "buyer-fixture", roles: ["BUYER"] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S-56 buyer coupon order review", () => {
  it("applies one code, refreshes the server snapshot and shows the discounted total", async () => {
    let applied = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/orders/order-fixture-1/coupon") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ code: "ONECODE" });
        applied = true;
        return json({ confirmedFree: false });
      }
      if (url.endsWith("/api/orders/order-fixture-1/coupon") && init?.method === "DELETE") {
        applied = false;
        return json({ removed: true });
      }
      if (url.endsWith("/api/orders/order-fixture-1")) {
        return json(applied
          ? order({ totalAmount: 9000, subtotalAmount: 10000, discountAmount: 1000, couponCode: "ONECODE" })
          : order());
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<OrderReview id="order-fixture-1" />);
    const input = await screen.findByRole("textbox", { name: "Mã giảm giá" });
    fireEvent.change(input, { target: { value: "onecode" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng mã" }));

    expect(await screen.findByText("ONECODE")).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toContain("Đã áp dụng mã giảm giá.");
    expect(screen.getByText("1.000 ₫")).toBeTruthy();
    expect(screen.getByText("9.000 ₫")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ mã" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Mã giảm giá" })).toBeTruthy());
    expect((await screen.findByRole("status")).textContent).toContain("Đã bỏ mã giảm giá.");
  });

  it("shows API validation errors and keeps the order usable", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/coupon") && init?.method === "POST")
        return json({ message: "Mã giảm giá không hợp lệ." }, 400);
      return json(order());
    });
    vi.stubGlobal("fetch", fetcher);

    render(<OrderReview id="order-fixture-1" />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Mã giảm giá" }), { target: { value: "BAD" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng mã" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Mã giảm giá không hợp lệ.");
    expect(screen.getAllByText("10.000 ₫").length).toBeGreaterThan(0);
  });

  it("locks coupon changes while a payment attempt is initiated", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(order({
      latestPayment: { id: "payment-1", status: "INITIATED", attemptNo: 1, amount: 10000 },
    }))));
    render(<OrderReview id="order-fixture-1" />);

    expect((await screen.findByRole("textbox", { name: "Mã giảm giá" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Áp dụng mã" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Giao dịch đang chờ đối soát. Vui lòng không thanh toán lại để tránh bị trừ tiền hai lần.")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Đang chờ đối soát" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
  });

  it("blocks another payment after an ambiguous response and refreshes the order from the server", async () => {
    let created = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/orders/order-fixture-1/pay") && init?.method === "POST") {
        created = true;
        return json({ code: "PAYMENT_OUTCOME_UNKNOWN", message: "unknown" }, 502);
      }
      if (url.endsWith("/api/orders/order-fixture-1"))
        return json(order(created ? { latestPayment: { id: "payment-1", status: "INITIATED", attemptNo: 1, amount: 10000 } } : {}));
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<OrderReview id="order-fixture-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Thanh toán ngay" }));

    expect(await screen.findByText("Chưa xác định được kết quả khởi tạo. Đang chờ đối soát; vui lòng không thanh toán lại.")).toBeTruthy();
    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Đang chờ đối soát" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});
