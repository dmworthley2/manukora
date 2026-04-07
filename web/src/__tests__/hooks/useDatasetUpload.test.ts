import { renderHook, act } from "@testing-library/react";
import { useDatasetUpload } from "@/hooks/useDatasetUpload";

describe("useDatasetUpload", () => {
  it("validates file type - accepts CSV", () => {
    const { result } = renderHook(() => useDatasetUpload());

    const file = new File(["test"], "data.csv", { type: "text/csv" });
    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(true);
    expect(validation.error).toBeNull();
  });

  it("validates file type - rejects non-CSV", () => {
    const { result } = renderHook(() => useDatasetUpload());

    const file = new File(["test"], "data.txt", { type: "text/plain" });
    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("CSV");
  });

  it("validates file size - accepts under limit", () => {
    const { result } = renderHook(() => useDatasetUpload());

    const file = new File(["x".repeat(1000)], "data.csv", { type: "text/csv" });
    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(true);
  });

  it("validates file size - rejects over 50MB", () => {
    const { result } = renderHook(() => useDatasetUpload());

    const largeFile = new File(
      ["x".repeat(51 * 1024 * 1024)],
      "data.csv",
      { type: "text/csv" }
    );
    const validation = result.current.validateFile(largeFile);

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("50MB");
  });

  it("returns initial state", () => {
    const { result } = renderHook(() => useDatasetUpload());

    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBe(false);
  });
});
