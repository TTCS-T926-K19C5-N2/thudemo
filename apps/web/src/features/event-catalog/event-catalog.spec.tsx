// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ api: mocks.api }));
vi.mock("next/image", () => ({
  default: () => <div aria-hidden="true" />,
}));

import { EventCatalog } from "./event-catalog";

const event = (id: string, name: string, location: string) => ({
  id,
  eventId: id,
  isDemo: false,
  name,
  description: "Mô tả",
  location,
  startTime: "2026-12-01T12:00:00.000Z",
  minPrice: 100000,
  maxPrice: 200000,
  posterPath: null,
  mobilePosterPath: null,
  categoryLabel: "Kịch Nói",
  categories: [{ name: "STANDARD", price: 100000 }],
});

const firstPage = {
  totalCount: 2,
  nextCursor: "page-2",
  items: [event("hanoi", "Vở diễn Hà Nội", "Nhà hát Kịch Việt Nam, Hà Nội")],
};
const secondPage = {
  totalCount: 2,
  nextCursor: null,
  items: [{
    ...event("hcm", "Vở diễn Sài Gòn", "Nhà hát Thành phố, Thành phố Hồ Chí Minh"),
    minPrice: 50000,
  }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("public event catalog search", () => {
  it("loads every cursor page when a global header search is submitted", async () => {
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path === "/showtimes" ? firstPage : secondPage),
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<EventCatalog initialQuery="Sài Gòn" />);

    expect(await screen.findByRole("heading", { name: "Vở diễn Sài Gòn" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Vở diễn Hà Nội" })).toBeNull();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(/1 kết quả trong 2 suất đã tải/)).toHaveLength(2);
  });

  it("loads remaining pages before applying the location filter", async () => {
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path === "/showtimes" ? firstPage : secondPage),
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<EventCatalog />);
    await screen.findAllByRole("heading", { name: "Vở diễn Hà Nội" });
    fireEvent.change(screen.getByLabelText("Lọc theo địa điểm"), {
      target: { value: "Thành phố Hồ Chí Minh" },
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Vở diễn Sài Gòn" })).toBeTruthy(),
    );
    expect(screen.queryByRole("heading", { name: "Vở diễn Hà Nội" })).toBeNull();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("loads every cursor page when the mobile catalog search is used", async () => {
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path === "/showtimes" ? firstPage : secondPage),
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<EventCatalog />);
    await screen.findAllByRole("heading", { name: "Vở diễn Hà Nội" });
    fireEvent.change(screen.getByPlaceholderText("Tìm theo tên sự kiện, nghệ sĩ..."), {
      target: { value: "Sài Gòn" },
    });

    expect(await screen.findByRole("heading", { name: "Vở diễn Sài Gòn" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Vở diễn Hà Nội" })).toBeNull();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("finishes loading the catalog when location is selected before the first page resolves", async () => {
    let resolveFirst!: (value: typeof firstPage) => void;
    mocks.api.mockImplementation((path: string) =>
      path === "/showtimes"
        ? new Promise((resolve) => { resolveFirst = resolve; })
        : Promise.resolve(secondPage),
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<EventCatalog />);
    fireEvent.change(screen.getByLabelText("Lọc theo địa điểm"), {
      target: { value: "Thành phố Hồ Chí Minh" },
    });
    await act(async () => resolveFirst(firstPage));

    expect(await screen.findByRole("heading", { name: "Vở diễn Sài Gòn" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Vở diễn Hà Nội" })).toBeNull();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("loads every page before applying a global price sort", async () => {
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path === "/showtimes" ? firstPage : secondPage),
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<EventCatalog />);
    await screen.findAllByRole("heading", { name: "Vở diễn Hà Nội" });
    fireEvent.change(screen.getByLabelText("Sắp xếp sự kiện"), {
      target: { value: "price-asc" },
    });

    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 3 })[0]?.textContent).toBe("Vở diễn Sài Gòn"),
    );
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});
