import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { RemovalForm } from "@/components/RemovalForm";

describe("RemovalForm", () => {
  it("submits username + email + reason", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RemovalForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/github username/i), "octocat");
    await userEvent.type(screen.getByLabelText(/contact email/i), "me@example.com");
    await userEvent.type(screen.getByLabelText(/reason/i), "please remove");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        gh_username: "octocat",
        contact_email: "me@example.com",
        reason: "please remove",
      }),
      expect.anything(),
    );
  });

  it("rejects empty username", async () => {
    const onSubmit = vi.fn();
    render(<RemovalForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/username is required/i)).toBeVisible();
  });
});
