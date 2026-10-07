import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/content";

// Everyone may read the site, AI crawlers included: it exists to be found and quoted.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
