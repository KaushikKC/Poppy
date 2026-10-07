import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
