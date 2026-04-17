// apps/web/tests/component/SearchForm.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchForm } from "@/components/SearchForm";

describe("SearchForm", () => {
  it("submits parsed repo on enter", async () => {
    const onSubmit = vi.fn();
    render(<SearchForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "https://github.com/vercel/next.js");
    await userEvent.click(screen.getByRole("button", { name: /scan/i }));
    expect(onSubmit).toHaveBeenCalledWith({ owner: "vercel", name: "next.js" });
  });

  it("shows error on invalid input", async () => {
    const onSubmit = vi.fn();
    render(<SearchForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "garbage");
    await userEvent.click(screen.getByRole("button", { name: /scan/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/expected owner/i);
  });
});
