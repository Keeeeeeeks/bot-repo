// apps/web/tests/component/ObscuredUsername.test.tsx
import { render, screen } from "@testing-library/react";
import { ObscuredUsername } from "@/components/ObscuredUsername";

describe("ObscuredUsername", () => {
  it("blurs by default", () => {
    render(<ObscuredUsername username="badactor" />);
    const el = screen.getByLabelText(/obscured username/i);
    expect(el).toHaveClass("blur-sm");
    expect(el).not.toHaveTextContent("badactor");
  });

  it("reveals when allowed", () => {
    render(<ObscuredUsername username="badactor" reveal />);
    expect(screen.getByText("badactor")).toBeVisible();
  });
});
