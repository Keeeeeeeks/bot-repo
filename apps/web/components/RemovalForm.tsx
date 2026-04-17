"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const Schema = z.object({
  gh_username: z.string().min(1, "username is required").max(64),
  contact_email: z.string().email().optional().or(z.literal("")),
  reason: z.string().max(1000).optional().or(z.literal("")),
});

export type RemovalInput = z.infer<typeof Schema>;

export function RemovalForm({
  onSubmit,
}: {
  onSubmit: (input: RemovalInput) => void | Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<RemovalInput>({ resolver: zodResolver(Schema) });

  if (isSubmitSuccessful) {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950/40">
        Request received. We will process it within a few business days.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="gh_username" className="block text-sm font-medium">GitHub username</label>
        <input id="gh_username" {...register("gh_username")} className="mt-1 w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        {errors.gh_username && <p className="mt-1 text-sm text-red-600">{errors.gh_username.message}</p>}
      </div>
      <div>
        <label htmlFor="contact_email" className="block text-sm font-medium">Contact email (optional)</label>
        <input id="contact_email" type="email" {...register("contact_email")} className="mt-1 w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        {errors.contact_email && <p className="mt-1 text-sm text-red-600">{errors.contact_email.message}</p>}
      </div>
      <div>
        <label htmlFor="reason" className="block text-sm font-medium">Reason (optional)</label>
        <textarea id="reason" rows={3} {...register("reason")} className="mt-1 w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isSubmitting ? "Submitting..." : "Submit request"}
      </button>
    </form>
  );
}
