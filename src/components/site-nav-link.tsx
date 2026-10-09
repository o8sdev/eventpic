import NextLink from "next/link";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<"a">, "href"> & { href: string };

export function SiteNavLink({ href, ...props }: Props) {
  // Let the browser own section anchors, including links from another page.
  // The client router can duplicate the fragment during an in-flight transition.
  return href.includes("#") ? (
    <a href={href} {...props} />
  ) : (
    <NextLink href={href} {...props} />
  );
}
