import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectorCard } from "@/components/data-sources/ConnectorCard";

describe("ConnectorCard", () => {
  it("renders connector name and description", () => {
    render(
      <ConnectorCard
        name="Shopify"
        description="Direct inventory sync"
        icon={<span>📦</span>}
        status="coming-soon"
      />
    );

    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByText("Direct inventory sync")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = jest.fn();
    const { container } = render(
      <ConnectorCard
        name="Shopify"
        description="Direct inventory sync"
        icon={<span>📦</span>}
        status="coming-soon"
        onClick={onClick}
      />
    );

    const card = container.querySelector("[role='button']");
    fireEvent.click(card!);

    expect(onClick).toHaveBeenCalled();
  });

  it("shows coming-soon indicator for inactive status", () => {
    const { container } = render(
      <ConnectorCard
        name="Shopify"
        description="Direct inventory sync"
        icon={<span>📦</span>}
        status="coming-soon"
      />
    );

    expect(container.textContent).toContain("Coming soon");
  });
});
