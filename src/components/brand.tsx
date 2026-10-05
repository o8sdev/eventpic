import Image from "next/image";

export function Brand({ name }: { name: string }) {
  return (
    <span className="brand-art">
      <Image
        src="/brand/snapmatch-logo.png"
        alt={name}
        width={2048}
        height={683}
        priority
      />
    </span>
  );
}
