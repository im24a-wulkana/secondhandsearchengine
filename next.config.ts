import type { NextConfig } from "next";

/**
 * Listing images come straight from each marketplace's CDN, so every host we
 * render must be allowlisted or next/image responds 400 and the grid goes blank.
 */
const IMAGE_HOSTS = [
  // eBay
  "i.ebayimg.com",
  "thumbs.ebaystatic.com",
  // Grailed (Algolia results serve photos from media-assets)
  "media-assets.grailed.com",
  "process.fs.grailed.com",
  "cdn.fs.grailed.com",
  // Vinted
  "images1.vinted.net",
  "**.vinted.net",
  // Depop
  "media-photos.depop.com",
  "**.depop.com",
  // Poshmark
  "di2ponv0v5otw.cloudfront.net",
  "**.cloudfront.net",
  // Vestiaire Collective
  "images.vestiairecollective.com",
  "**.vestiairecollective.com",
  // Facebook Marketplace
  "**.fbcdn.net",
  // Mercari JP (mercdn for marketplace items, mercari-shops for shop items)
  "static.mercdn.net",
  "**.mercdn.net",
  "assets.mercari-shops-static.com",
  "**.mercari-shops-static.com",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
    // Marketplace thumbnails are small; these two widths cover the card grid.
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 14400,
  },
};

export default nextConfig;
