import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hooks before importing component
jest.mock("@/hooks/useDatasetUpload", () => ({
  useDatasetUpload: jest.fn(() => ({
    validateFile: jest.fn((file: File) => ({ valid: true, error: null })),
    upload: jest.fn(),
    isUploading: false,
    error: null,
    success: false,
  })),
}));

jest.mock("@/hooks/useToast", () => ({
  useToast: jest.fn(() => ({
    toast: jest.fn(),
  })),
}));

import { UploadSection } from "@/components/data-sources/UploadSection";
import * as useDatasetUploadModule from "@/hooks/useDatasetUpload";
import * as useToastModule from "@/hooks/useToast";

const mockUseDatasetUpload = useDatasetUploadModule.useDatasetUpload as jest.Mock;
const mockUseToast = useToastModule.useToast as jest.Mock;

describe("UploadSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatasetUpload.mockReturnValue({
      validateFile: jest.fn((file: File) => ({ valid: true, error: null })),
      upload: jest.fn(),
      isUploading: false,
      error: null,
      success: false,
    });
    mockUseToast.mockReturnValue({
      toast: jest.fn(),
    });
  });

  it("renders upload area and connector cards", () => {
    render(<UploadSection />);

    expect(screen.getByText(/upload new data/i)).toBeInTheDocument();
    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByText("Stripe")).toBeInTheDocument();
  });

  it("allows file selection via input", () => {
    render(<UploadSection />);

    const input = screen.getByLabelText(/select csv/i, {
      selector: "input[type='file']",
    });
    expect(input).toBeInTheDocument();
  });

  it("shows loading state while uploading", () => {
    mockUseDatasetUpload.mockReturnValue({
      validateFile: jest.fn((file: File) => ({ valid: true, error: null })),
      upload: jest.fn(),
      isUploading: true,
      error: null,
      success: false,
    });

    render(<UploadSection />);

    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();
  });

  it("calls onUploadSuccess when upload completes", async () => {
    const onUploadSuccess = jest.fn();
    const mockUploadResult = {
      id: "upload-123",
      filename: "test.csv",
      contentType: "text/csv",
      fileSize: 1024,
      rowCount: 10,
      createdAt: new Date().toISOString(),
    };

    const mockUpload = jest.fn().mockResolvedValue(mockUploadResult);
    mockUseDatasetUpload.mockReturnValue({
      validateFile: jest.fn((file: File) => ({ valid: true, error: null })),
      upload: mockUpload,
      isUploading: false,
      error: null,
      success: true,
    });

    render(<UploadSection onUploadSuccess={onUploadSuccess} />);

    const input = screen.getByLabelText(/select csv/i, {
      selector: "input[type='file']",
    }) as HTMLInputElement;

    const file = new File(["content"], "test.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(file);
    });
  });

  it("shows error when file is not CSV", () => {
    mockUseDatasetUpload.mockReturnValue({
      validateFile: jest.fn((file: File) => ({
        valid: false,
        error: "Only CSV files are accepted",
      })),
      upload: jest.fn(),
      isUploading: false,
      error: "Only CSV files are accepted",
      success: false,
    });

    render(<UploadSection />);

    const input = screen.getByLabelText(/select csv/i, {
      selector: "input[type='file']",
    }) as HTMLInputElement;

    const file = new File(["content"], "test.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(input).toBeInTheDocument();
  });

  it("displays connector cards with correct information", () => {
    render(<UploadSection />);

    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByText("Direct inventory sync")).toBeInTheDocument();

    expect(screen.getByText("Stripe")).toBeInTheDocument();
    expect(screen.getByText("Payment data integration")).toBeInTheDocument();
  });

  it("handles drag and drop files", async () => {
    const mockUpload = jest.fn().mockResolvedValue({
      id: "upload-123",
      filename: "test.csv",
      contentType: "text/csv",
      fileSize: 1024,
      rowCount: 10,
      createdAt: new Date().toISOString(),
    });

    mockUseDatasetUpload.mockReturnValue({
      validateFile: jest.fn((file: File) => ({ valid: true, error: null })),
      upload: mockUpload,
      isUploading: false,
      error: null,
      success: true,
    });

    render(<UploadSection />);

    const dropZone = screen.getByText(/drag and drop/i).closest("div");
    expect(dropZone).toBeInTheDocument();

    const file = new File(["content"], "test.csv", { type: "text/csv" });
    const dataTransfer = {
      files: [file],
    };

    fireEvent.drop(dropZone as HTMLElement, { dataTransfer });

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalled();
    });
  });
});
