"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({
  label,
  pending,
}: {
  label: string;
  pending: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button className="button" disabled={busy} type="submit">
      {busy ? pending : label}
    </button>
  );
}
