// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { EventEditor } from "./event-editor";
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  load: vi.fn(),
  router: { replace: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/api", () => ({
  loadCurrentUser: mocks.load,
  readApiError: async (r: Response) => r.json(),
}));
vi.mock("@/components/layout/product-layout", () => ({
  OrganizerLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
beforeEach(() => {
  sessionStorage.clear();
  mocks.router.replace.mockReset();
  mocks.load
    .mockReset()
    .mockResolvedValue({ id: "owner-a", roles: ["ORGANIZER"] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const draft = {
  name: "Draft name",
  description: "Description",
  location: "Venue",
};
async function ready() {
  await screen.findByLabelText("Tên sự kiện *");
}
function fill() {
  fireEvent.change(screen.getByLabelText("Tên sự kiện *"), {
    target: { value: draft.name },
  });
  fireEvent.change(screen.getByLabelText("Mô tả chi tiết *"), {
    target: { value: draft.description },
  });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), {
    target: { value: draft.location },
  });
}
describe("Expired session draft recovery", () => {
  it("preserves input under the original owner and returns to login after server 401", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    render(<EventEditor />);
    await ready();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Tạo sự kiện" }));
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/login?returnTo=%2Fevents%2Fnew",
      ),
    );
    expect(JSON.parse(sessionStorage.getItem("event-draft:new")!)).toEqual({
      ownerId: "owner-a",
      draft,
      startTime: "",
    });
  });
  it.each(["owner-a", "owner-b"])(
    "restores once only for matching account: %s",
    async (ownerId) => {
      sessionStorage.setItem(
        "event-draft:new",
        JSON.stringify({ ownerId, draft, startTime: "2099-01-01T00:30" }),
      );
      render(<EventEditor />);
      await ready();
      expect(
        (screen.getByLabelText("Tên sự kiện *") as HTMLInputElement).value,
      ).toBe(ownerId === "owner-a" ? draft.name : "");
      expect(sessionStorage.getItem("event-draft:new")).toBeNull();
    },
  );
  it("ignores malformed recovery storage and preserves server validation input", async () => {
    sessionStorage.setItem("event-draft:new", "{bad");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Invalid name",
            errors: { name: "Name invalid" },
          }),
          { status: 400 },
        ),
      ),
    );
    render(<EventEditor />);
    await ready();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Tạo sự kiện" }));
    await screen.findByText("Name invalid");
    expect(
      (screen.getByLabelText("Tên sự kiện *") as HTMLInputElement).value,
    ).toBe(draft.name);
    expect(
      screen.getByLabelText("Tên sự kiện *").getAttribute("aria-invalid"),
    ).toBe("true");
  });
  it("recovers the unsaved showtime with the correct owner after an expired session", async () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/manage"))
        return Promise.resolve(
          new Response(
            JSON.stringify({ id, ...draft, status: "DRAFT", showtimes: [] }),
          ),
        );
      if (url.endsWith("/coupons"))
        return Promise.resolve(new Response(JSON.stringify({ coupons: [] })));
      if (url.endsWith("/showtimes"))
        return Promise.resolve(new Response("{}", { status: 401 }));
      return Promise.resolve(new Response("{}", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<EventEditor eventId={id} />);
    await ready();
    fireEvent.change(screen.getByLabelText(/Thời gian bắt đầu/), {
      target: { value: "2099-01-01T00:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Thêm suất diễn" }));
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        `/login?returnTo=${encodeURIComponent(`/events/${id}`)}`,
      ),
    );
    expect(JSON.parse(sessionStorage.getItem(`event-draft:${id}`)!)).toEqual({
      ownerId: "owner-a",
      draft,
      startTime: "2099-01-01T00:30",
    });
  });
  it("restores an existing event only after ownership is authorized and rejects a malformed stored shape", async () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    sessionStorage.setItem(
      `event-draft:${id}`,
      JSON.stringify({
        ownerId: "owner-a",
        draft: { name: 123 },
        startTime: "2099-01-01T00:30",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ id, ...draft, status: "DRAFT", showtimes: [] }),
          ),
        ),
    );
    render(<EventEditor eventId={id} />);
    await ready();
    expect(
      (screen.getByLabelText("Tên sự kiện *") as HTMLInputElement).value,
    ).toBe(draft.name);
    expect(
      (screen.getByLabelText(/Thời gian bắt đầu/) as HTMLInputElement).value,
    ).toBe("2099-01-01T00:30");
    expect(sessionStorage.getItem(`event-draft:${id}`)).toBeNull();
  });
});

describe("Showtime quick preset validation recovery", () => {
  it("clears the past-time validation after selecting a valid preset", async () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/manage"))
        return Promise.resolve(
          new Response(
            JSON.stringify({ id, ...draft, status: "DRAFT", showtimes: [] }),
          ),
        );
      if (url.endsWith("/coupons"))
        return Promise.resolve(new Response(JSON.stringify({ coupons: [] })));
      if (url.endsWith("/showtimes"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "22345678-1234-1234-1234-123456789abc",
              startTime: "2099-01-01T00:30:00.000Z",
              warning: null,
            }),
          ),
        );
      return Promise.resolve(new Response("{}", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<EventEditor eventId={id} />);
    await ready();

    const validation = "Vui lòng chọn thời gian bắt đầu trong tương lai.";
    fireEvent.click(screen.getByRole("button", { name: "Thêm suất diễn" }));
    expect(screen.getByText(validation)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+24 giờ" }));
    expect(screen.queryByText(validation)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thêm suất diễn" }));
    await screen.findByText("Đã thêm suất diễn mới thành công.");
    expect(fetcher).toHaveBeenCalledWith(
      `/api/events/${id}/showtimes`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("Existing imported event descriptions", () => {
  it("keeps an existing long catalog description editable without truncation", async () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    const description = "Mô tả sự kiện nguồn ".repeat(250);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith("/manage")
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  id,
                  name: "Bệnh sĩ",
                  description,
                  location: "Nhà hát Kịch Việt Nam",
                  status: "PUBLISHED",
                  showtimes: [],
                }),
              ),
            )
          : Promise.resolve(new Response(JSON.stringify({ coupons: [] }))),
      ),
    );

    render(<EventEditor eventId={id} />);
    await screen.findByLabelText("Tên sự kiện *");

    const textarea = screen.getByLabelText(
      "Mô tả chi tiết *",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe(description);
    expect(textarea.maxLength).toBe(description.length);
    expect(screen.getByText(`${description.length}/${description.length}`)).toBeTruthy();
  });
});
