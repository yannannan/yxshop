const providers = ['zhangwei', 'lina', 'wangqiang'] as const;
export const technicalHeroImage = '/technical-services/ai-technical-service-hero-v2.webp';
export const technicalImageAssets = [technicalHeroImage, ...providers.flatMap(name => [
  `/technical-services/provider-${name}-card-v2.webp`,
  `/technical-services/provider-${name}-portrait-v2.webp`,
])];

// Keep existing database URLs and custom avatars intact. Only our three known
// originals have pre-generated display variants; no remote image proxy needed.
export function technicalAvatarImage(src: string, size: 'card' | 'portrait' = 'card') {
  const name = providers.find(name => src === `/technical-services/provider-${name}-v1.png`);
  return name ? `/technical-services/provider-${name}-${size}-v2.webp` : src;
}
