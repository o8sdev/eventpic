import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { defaultSiteContent } from "@/lib/site/defaults";
import { requireAdminSession } from "@/lib/site/server";
import { siteContentSchema } from "@/lib/site/schema";
import { AdminEditor } from "@/components/admin-editor";
export default async function Editor({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const session = await requireAdminSession(locale);
  if (!session) return null;
  const { client } = session;
  const { data, error } = await client
    .from("site_content")
    .select("draft,version")
    .eq("locale", locale)
    .single();
  if (error) return <p role="alert">{messages[locale].admin.setup}</p>;
  const result = siteContentSchema.safeParse(data.draft);
  const { notice } = await searchParams;
  const safeNotice = [
    "saved",
    "published",
    "restored",
    "error",
    "invalid",
    "conflict",
  ].includes(notice || "")
    ? notice
    : undefined;
  return (
    <AdminEditor
      key={`${locale}-${data.version}`}
      locale={locale}
      initial={result.success ? result.data : defaultSiteContent(locale)}
      version={data.version}
      notice={safeNotice}
    />
  );
}
