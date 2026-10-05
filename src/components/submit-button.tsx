"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({
  label,
  pending,
  disabled = false,
}: {
  label: string;
  pending: string;
  disabled?: boolean;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button className="button" disabled={busy || disabled} type="submit">
      {busy ? pending : label}
    </button>
  );
}
