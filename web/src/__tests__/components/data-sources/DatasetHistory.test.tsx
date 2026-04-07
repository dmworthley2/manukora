import { render, screen, fireEvent } from "@testing-library/react";
import { DatasetHistory } from "@/components/data-sources/DatasetHistory";
import type { UploadRow } from "@/types/upload";

describe("DatasetHistory", () => {
  const mockUploads: UploadRow[] = [
    {
      id: "1",
      original_filename: "sales.csv",
      byte_size: 4200000,
      storage_path: "uploads/1",
      bucket: "uploads",
      content_type: "text/csv",
      content_sha256: null,
      created_at: "2025-10-24T12:00:00Z",
    },
  ];

  it("renders table with uploads", () => {
    render(<DatasetHistory uploads={mockUploads} />);

    expect(screen.getByText("sales.csv")).toBeInTheDocument();
  });

  it("shows empty state when no uploads", () => {
    render(<DatasetHistory uploads={[]} />);

    expect(
      screen.getByText(/no datasets yet/i)
    ).toBeInTheDocument();
  });

  it("calls onAnalyze when button clicked", () => {
    const onAnalyze = jest.fn();
    render(<DatasetHistory uploads={mockUploads} onAnalyze={onAnalyze} />);

    const analyzeButton = screen.getByRole("button", {
      name: /analyze/i,
    });
    fireEvent.click(analyzeButton);

    expect(onAnalyze).toHaveBeenCalledWith("1");
  });

  it("displays loading skeleton while fetching", () => {
    render(<DatasetHistory uploads={[]} isLoading={true} />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });
});
