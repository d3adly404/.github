import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GhanaBed — hospital bed availability",
    short_name: "GhanaBed",
    description:
      "Live hospital bed availability across Ghana with SMS, WhatsApp, e-mail and browser alerts for patients.",
    start_url: "/",
    display: "standalone",
    background_color: "#050912",
    theme_color: "#050912",
    orientation: "portrait-primary",
    categories: ["health", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
