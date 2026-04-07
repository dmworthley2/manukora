import { renderHook, act, waitFor } from "@testing-library/react";
import { useDatasets } from "@/hooks/useDatasets";

// Mock fetch
global.fetch = jest.fn();

describe("useDatasets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns initial loading state", () => {
    const { result } = renderHook(() => useDatasets());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.datasets).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("fetches datasets on mount", async () => {
    const mockData = [
      {
        id: "1",
        filename: "test.csv",
        fileSize: 1024,
        rowCount: 100,
        createdAt: new Date().toISOString(),
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const { result } = renderHook(() => useDatasets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.datasets).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it("handles fetch error", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useDatasets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.datasets).toEqual([]);
  });

  it("refetches datasets on demand", async () => {
    const mockData = [{ id: "1", filename: "test.csv" }];
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const { result } = renderHook(() => useDatasets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear previous calls
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
