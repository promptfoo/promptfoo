const path = require('path');
const fs = require('fs').promises;
const { default: satori } = require('satori');
const matter = require('gray-matter');
const sharp = require('sharp');

// Constants for image generation
const WIDTH = 1200;
const HEIGHT = 630;

// Asset cache to avoid repeated file reads (logo, fonts)
const assetCache = {
  logo: null,
  satoriFont: null, // Satori font buffer (not base64)
};

function resolveImageFullPath(imagePath) {
  const cwd = process.cwd();
  const inSiteDir = path.basename(cwd) === 'site';
  const siteRoot = inSiteDir ? cwd : path.join(cwd, 'site');

  if (imagePath.startsWith('/')) {
    // Treat as site-root-relative, not filesystem-root
    const rel = imagePath.replace(/^\/+/, '');
    const full = path.resolve(siteRoot, 'static', rel);
    const staticRoot = path.resolve(siteRoot, 'static');
    if (!full.startsWith(staticRoot + path.sep)) {
      throw new Error(`Invalid image path (outside static): ${imagePath}`);
    }
    return full;
  }

  // Relative path: resolve under site root
  const full = path.resolve(siteRoot, imagePath);
  if (!full.startsWith(siteRoot + path.sep)) {
    throw new Error(`Invalid relative image path: ${imagePath}`);
  }
  return full;
}

// Helper function to truncate text with ellipsis
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

// Helper function to convert SVG logo to base64 (cached)
async function getLogoAsBase64() {
  if (assetCache.logo !== null) {
    return assetCache.logo;
  }

  try {
    const logoPath = path.join(process.cwd(), 'site/static/img/logo-panda.svg');
    const logoContent = await fs.readFile(logoPath, 'utf8');
    assetCache.logo = `data:image/svg+xml;base64,${Buffer.from(logoContent).toString('base64')}`;
    return assetCache.logo;
  } catch (_error) {
    // Fallback to site/static path
    try {
      const logoPath = path.join(process.cwd(), 'static/img/logo-panda.svg');
      const logoContent = await fs.readFile(logoPath, 'utf8');
      assetCache.logo = `data:image/svg+xml;base64,${Buffer.from(logoContent).toString('base64')}`;
      return assetCache.logo;
    } catch (_e) {
      assetCache.logo = '';
      return '';
    }
  }
}

// Load Satori fonts (cached globally for performance)
async function getSatoriFonts() {
  if (assetCache.satoriFont !== null) {
    return assetCache.satoriFont;
  }

  try {
    // Try site/static path first (when running from repo root)
    const fontPath = path.join(process.cwd(), 'site/static/fonts/Inter-SemiBold.ttf');
    const fontBuffer = await fs.readFile(fontPath);
    assetCache.satoriFont = [{ name: 'Inter', data: fontBuffer, weight: 600, style: 'normal' }];
    return assetCache.satoriFont;
  } catch (_error) {
    // Fallback to static path (when running from site dir)
    try {
      const fontPath = path.join(process.cwd(), 'static/fonts/Inter-SemiBold.ttf');
      const fontBuffer = await fs.readFile(fontPath);
      assetCache.satoriFont = [{ name: 'Inter', data: fontBuffer, weight: 600, style: 'normal' }];
      return assetCache.satoriFont;
    } catch (e) {
      console.warn('Could not load Inter font for Satori:', e);
      assetCache.satoriFont = [];
      return [];
    }
  }
}

// Helper function to convert image to base64 (no caching to avoid memory leaks)
async function getImageAsBase64(imagePath, maxWidth = 400, maxHeight = 390) {
  try {
    const fullPath = resolveImageFullPath(imagePath);

    // Check if file exists first
    try {
      await fs.access(fullPath);
    } catch {
      console.warn(`❌ Image file not found: ${imagePath} (resolved to: ${fullPath})`);
      return null;
    }

    const ext = path.extname(fullPath).toLowerCase().replace('.', '');

    // For SVG files, don't use sharp
    if (ext === 'svg') {
      const imageBuffer = await fs.readFile(fullPath);
      return `data:image/svg+xml;base64,${imageBuffer.toString('base64')}`;
    }

    // Use sharp to resize and resample images with high quality
    const resizedBuffer = await sharp(fullPath)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3, // High-quality resampling
      })
      .png({
        quality: 95,
        compressionLevel: 6,
      })
      .toBuffer();

    return `data:image/png;base64,${resizedBuffer.toString('base64')}`;
  } catch (error) {
    console.warn(`❌ Failed to process image ${imagePath}: ${error.message}`);
    return null;
  }
}

// Get page type label
function getPageTypeLabel(routePath) {
  if (routePath.includes('/blog/')) {
    return 'Posts';
  }
  if (routePath.includes('/guides/')) {
    return 'Guide';
  }
  if (routePath.includes('/red-team')) {
    return 'Security';
  }
  if (routePath.includes('/providers/')) {
    return 'Provider';
  }
  if (routePath.includes('/integrations/')) {
    return 'Integration';
  }
  if (routePath.includes('/enterprise/')) {
    return 'Enterprise';
  }
  if (routePath.includes('/api-reference/')) {
    return 'API Reference';
  }
  return 'Documentation';
}

// Site constants loaded from JSON, with generated stats merged over fallbacks.
// Mirrors the merge logic in site/src/constants.ts.
const siteStats = require('../../site-stats.json');
let generatedStats = {};
try {
  generatedStats = require('../../.generated-stats.json');
} catch {
  // File may not exist if fetch-stats was skipped; fallback values are fine.
}
const SITE_STATS = { ...siteStats, ...generatedStats };

// Generate Satori JSX template for Careers page OG image
async function generateCareersTemplate() {
  const logoBase64 = await getLogoAsBase64();

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #10191c 0%, #17252b 100%)',
        fontFamily: 'Inter',
      },
      children: [
        // Top accent bar
        {
          type: 'div',
          props: {
            style: {
              width: '100%',
              height: 4,
              background: 'linear-gradient(90deg, #e53a3a 0%, #cb3434 100%)',
            },
          },
        },
        // Main content card
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              margin: 40,
              padding: 40,
              borderRadius: 12,
              backgroundColor: 'rgba(23, 37, 43, 0.4)',
              borderLeft: '6px solid #e53a3a',
              flex: 1,
            },
            children: [
              // Header section (logo + brand + badge)
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 30,
                  },
                  children: [
                    // Logo
                    logoBase64
                      ? {
                          type: 'img',
                          props: {
                            src: logoBase64,
                            width: 56,
                            height: 56,
                            style: { marginRight: 16 },
                          },
                        }
                      : null,
                    // Brand name
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 24,
                          fontWeight: 600,
                          color: '#ff7a7a',
                          marginRight: 'auto',
                        },
                        children: 'promptfoo',
                      },
                    },
                    // Careers badge
                    {
                      type: 'div',
                      props: {
                        style: {
                          padding: '8px 20px',
                          borderRadius: 16,
                          backgroundColor: 'rgba(229, 58, 58, 0.15)',
                          border: '1px solid #e53a3a',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#ff7a7a',
                        },
                        children: 'Careers',
                      },
                    },
                  ].filter(Boolean),
                },
              },
              // Main headline
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 48,
                    fontWeight: 600,
                    color: 'white',
                    lineHeight: 1.2,
                    marginBottom: 16,
                  },
                  children: 'Build the Future',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 48,
                    fontWeight: 600,
                    color: 'white',
                    lineHeight: 1.2,
                    marginBottom: 24,
                  },
                  children: 'of AI Security',
                },
              },
              // Subtitle
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: 30,
                  },
                  children: "Join the team protecting AI at the world's leading companies",
                },
              },
              // Divider
              {
                type: 'div',
                props: {
                  style: {
                    width: 60,
                    height: 4,
                    backgroundColor: '#e53a3a',
                    marginBottom: 30,
                  },
                },
              },
              // Stats row
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: 60,
                    marginBottom: 30,
                  },
                  children: [
                    // Fortune 500
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 36,
                                fontWeight: 600,
                                color: 'white',
                              },
                              children: String(SITE_STATS.FORTUNE_500_COUNT),
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 14,
                                color: 'rgba(255, 255, 255, 0.6)',
                              },
                              children: 'of the Fortune 500',
                            },
                          },
                        ],
                      },
                    },
                    // GitHub Stars
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 36,
                                fontWeight: 600,
                                color: 'white',
                              },
                              children: `${SITE_STATS.GITHUB_STARS_DISPLAY}+`,
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 14,
                                color: 'rgba(255, 255, 255, 0.6)',
                              },
                              children: 'GitHub Stars',
                            },
                          },
                        ],
                      },
                    },
                    // OSS Users
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 36,
                                fontWeight: 600,
                                color: 'white',
                              },
                              children: `${SITE_STATS.USER_COUNT_SHORT}+`,
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 14,
                                color: 'rgba(255, 255, 255, 0.6)',
                              },
                              children: 'OSS Users',
                            },
                          },
                        ],
                      },
                    },
                    // Trust badges section
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          gap: 12,
                          marginLeft: 'auto',
                          alignItems: 'center',
                        },
                        children: ['SOC2', 'ISO 27001', 'HIPAA'].map((badge) => ({
                          type: 'div',
                          props: {
                            style: {
                              padding: '6px 12px',
                              borderRadius: 6,
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'rgba(255, 255, 255, 0.8)',
                            },
                            children: badge,
                          },
                        })),
                      },
                    },
                  ],
                },
              },
              // Footer section
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    marginTop: 'auto',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 16,
                          color: 'rgba(255, 255, 255, 0.6)',
                        },
                        children: 'Secure and reliable LLM applications',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 14,
                          color: 'rgba(255, 122, 122, 0.8)',
                        },
                        children: 'promptfoo.dev/careers',
                      },
                    },
                  ],
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

// Generate Satori JSX template for Pricing page OG image
async function generatePricingTemplate() {
  const logoBase64 = await getLogoAsBase64();

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #10191c 0%, #17252b 100%)',
        fontFamily: 'Inter',
        padding: 60,
      },
      children: [
        // Header row (logo + brand)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              marginBottom: 50,
            },
            children: [
              logoBase64
                ? {
                    type: 'img',
                    props: {
                      src: logoBase64,
                      width: 56,
                      height: 56,
                      style: { marginRight: 16 },
                    },
                  }
                : null,
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 28,
                    fontWeight: 600,
                    color: '#ff7a7a',
                  },
                  children: 'promptfoo',
                },
              },
            ].filter(Boolean),
          },
        },
        // Main headline - big and bold
        {
          type: 'div',
          props: {
            style: {
              fontSize: 56,
              fontWeight: 600,
              color: 'white',
              lineHeight: 1.15,
              marginBottom: 40,
            },
            children: 'LLM Security for Every Team',
          },
        },
        // Simple plan line
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: 50,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    color: '#4ade80',
                    fontWeight: 600,
                  },
                  children: 'Free Open Source',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    color: 'rgba(255, 255, 255, 0.4)',
                  },
                  children: '•',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    color: 'rgba(255, 255, 255, 0.8)',
                  },
                  children: 'Cloud & On-Prem Plans',
                },
              },
            ],
          },
        },
        // Trust signal - pushed to bottom
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: 'Trusted by',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'white',
                  },
                  children: `${SITE_STATS.FORTUNE_500_COUNT} Fortune 500 companies`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: `and ${SITE_STATS.USER_COUNT_SHORT}+ developers`,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// Generate Satori JSX template for About page OG image
async function generateAboutTemplate() {
  const logoBase64 = await getLogoAsBase64();

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #10191c 0%, #17252b 100%)',
        fontFamily: 'Inter',
        padding: 60,
      },
      children: [
        // Header row (logo + brand)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              marginBottom: 50,
            },
            children: [
              logoBase64
                ? {
                    type: 'img',
                    props: {
                      src: logoBase64,
                      width: 56,
                      height: 56,
                      style: { marginRight: 16 },
                    },
                  }
                : null,
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 28,
                    fontWeight: 600,
                    color: '#ff7a7a',
                  },
                  children: 'promptfoo',
                },
              },
            ].filter(Boolean),
          },
        },
        // Main headline
        {
          type: 'div',
          props: {
            style: {
              fontSize: 56,
              fontWeight: 600,
              color: 'white',
              lineHeight: 1.15,
              marginBottom: 30,
            },
            children: 'Securing the Future of AI',
          },
        },
        // Subtitle
        {
          type: 'div',
          props: {
            style: {
              fontSize: 24,
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: 50,
            },
            children: 'Helping developers and enterprises build secure AI applications',
          },
        },
        // Trust signal - consistent with other pages
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: 'Trusted by',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'white',
                  },
                  children: `${SITE_STATS.FORTUNE_500_COUNT} Fortune 500 companies`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: `and ${SITE_STATS.USER_COUNT_SHORT}+ developers`,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// Generate Satori JSX template for Contact page OG image
async function generateContactTemplate() {
  const logoBase64 = await getLogoAsBase64();

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #10191c 0%, #17252b 100%)',
        fontFamily: 'Inter',
        padding: 60,
      },
      children: [
        // Header row (logo + brand)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              marginBottom: 50,
            },
            children: [
              logoBase64
                ? {
                    type: 'img',
                    props: {
                      src: logoBase64,
                      width: 56,
                      height: 56,
                      style: { marginRight: 16 },
                    },
                  }
                : null,
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 28,
                    fontWeight: 600,
                    color: '#ff7a7a',
                  },
                  children: 'promptfoo',
                },
              },
            ].filter(Boolean),
          },
        },
        // Main headline
        {
          type: 'div',
          props: {
            style: {
              fontSize: 56,
              fontWeight: 600,
              color: 'white',
              lineHeight: 1.15,
              marginBottom: 30,
            },
            children: 'Book a Demo',
          },
        },
        // Subtitle
        {
          type: 'div',
          props: {
            style: {
              fontSize: 24,
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: 50,
            },
            children: 'See how Promptfoo can secure your AI infrastructure',
          },
        },
        // Trust signal
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: 'Trusted by',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'white',
                  },
                  children: `${SITE_STATS.FORTUNE_500_COUNT} Fortune 500 companies`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: `and ${SITE_STATS.USER_COUNT_SHORT}+ developers`,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// Generate Satori JSX template for Press page OG image
async function generatePressTemplate() {
  const logoBase64 = await getLogoAsBase64();

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #10191c 0%, #17252b 100%)',
        fontFamily: 'Inter',
        padding: 60,
      },
      children: [
        // Header row (logo + brand)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              marginBottom: 50,
            },
            children: [
              logoBase64
                ? {
                    type: 'img',
                    props: {
                      src: logoBase64,
                      width: 56,
                      height: 56,
                      style: { marginRight: 16 },
                    },
                  }
                : null,
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 28,
                    fontWeight: 600,
                    color: '#ff7a7a',
                  },
                  children: 'promptfoo',
                },
              },
            ].filter(Boolean),
          },
        },
        // Main headline
        {
          type: 'div',
          props: {
            style: {
              fontSize: 56,
              fontWeight: 600,
              color: 'white',
              lineHeight: 1.15,
              marginBottom: 30,
            },
            children: 'Press Center',
          },
        },
        // Subtitle
        {
          type: 'div',
          props: {
            style: {
              fontSize: 24,
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: 50,
            },
            children: 'News, resources, and media information',
          },
        },
        // Trust signal - consistent with other pages
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: 'Trusted by',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'white',
                  },
                  children: `${SITE_STATS.FORTUNE_500_COUNT} Fortune 500 companies`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  children: `and ${SITE_STATS.USER_COUNT_SHORT}+ developers`,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// Generate Satori JSX template for Store page OG image
async function generateStoreTemplate() {
  const logoBase64 = await getLogoAsBase64();
  const tshirtImage = await getImageAsBase64('/img/store-tshirt.webp', 320, 400);

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        fontFamily: 'Inter',
      },
      children: [
        // Top accent bar with gradient
        {
          type: 'div',
          props: {
            style: {
              width: '100%',
              height: 4,
              background: 'linear-gradient(90deg, #e53a3a 0%, #ff6b6b 50%, #e53a3a 100%)',
            },
          },
        },
        // Main content
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flex: 1,
              padding: 60,
            },
            children: [
              // Left side - text content
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                  },
                  children: [
                    // Header (logo + brand)
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          marginBottom: 40,
                        },
                        children: [
                          logoBase64
                            ? {
                                type: 'img',
                                props: {
                                  src: logoBase64,
                                  width: 56,
                                  height: 56,
                                  style: { marginRight: 16 },
                                },
                              }
                            : null,
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 28,
                                fontWeight: 600,
                                color: '#ff7a7a',
                              },
                              children: 'promptfoo',
                            },
                          },
                        ].filter(Boolean),
                      },
                    },
                    // Main headline
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 64,
                          fontWeight: 600,
                          color: 'white',
                          lineHeight: 1.1,
                          marginBottom: 16,
                        },
                        children: 'The Prompt',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 64,
                          fontWeight: 600,
                          color: '#ff7a7a',
                          lineHeight: 1.1,
                          marginBottom: 30,
                        },
                        children: 'Shop',
                      },
                    },
                    // Subtitle
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 24,
                          color: 'rgba(255, 255, 255, 0.7)',
                          marginBottom: 40,
                        },
                        children: 'Official Promptfoo Merchandise',
                      },
                    },
                    // Tags row
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          gap: 12,
                          marginTop: 'auto',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                padding: '10px 20px',
                                borderRadius: 20,
                                backgroundColor: 'rgba(255, 122, 122, 0.15)',
                                border: '1px solid rgba(255, 122, 122, 0.3)',
                                fontSize: 16,
                                fontWeight: 600,
                                color: '#ff7a7a',
                              },
                              children: 'Apparel',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                padding: '10px 20px',
                                borderRadius: 20,
                                backgroundColor: 'rgba(255, 122, 122, 0.15)',
                                border: '1px solid rgba(255, 122, 122, 0.3)',
                                fontSize: 16,
                                fontWeight: 600,
                                color: '#ff7a7a',
                              },
                              children: 'Accessories',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                padding: '10px 20px',
                                borderRadius: 20,
                                backgroundColor: 'rgba(255, 122, 122, 0.15)',
                                border: '1px solid rgba(255, 122, 122, 0.3)',
                                fontSize: 16,
                                fontWeight: 600,
                                color: '#ff7a7a',
                              },
                              children: 'Swag',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              // Right side - t-shirt product image
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 350,
                  },
                  children: [
                    tshirtImage
                      ? {
                          type: 'img',
                          props: {
                            src: tshirtImage,
                            width: 320,
                            height: 400,
                            style: {
                              objectFit: 'contain',
                            },
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// Generate Satori JSX template for Events page OG image
async function generateEventsTemplate() {
  const logoBase64 = await getLogoAsBase64();

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        fontFamily: 'Inter',
        padding: 60,
      },
      children: [
        // Header row (logo + brand)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              marginBottom: 50,
            },
            children: [
              logoBase64
                ? {
                    type: 'img',
                    props: {
                      src: logoBase64,
                      width: 56,
                      height: 56,
                      style: { marginRight: 16 },
                    },
                  }
                : null,
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 28,
                    fontWeight: 600,
                    color: '#ff7a7a',
                  },
                  children: 'promptfoo',
                },
              },
            ].filter(Boolean),
          },
        },
        // Main headline
        {
          type: 'div',
          props: {
            style: {
              fontSize: 56,
              fontWeight: 600,
              color: 'white',
              lineHeight: 1.15,
              marginBottom: 30,
            },
            children: 'Events & Conferences',
          },
        },
        // Subtitle
        {
          type: 'div',
          props: {
            style: {
              fontSize: 24,
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: 40,
            },
            children: 'Meet our team and see live AI security demos',
          },
        },
        // Event type badges
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              gap: 16,
              marginTop: 'auto',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    padding: '12px 24px',
                    borderRadius: 24,
                    backgroundColor: 'rgba(255, 122, 122, 0.15)',
                    border: '1px solid rgba(255, 122, 122, 0.3)',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#ff7a7a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  },
                  children: '🎪 Conferences',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    padding: '12px 24px',
                    borderRadius: 24,
                    backgroundColor: 'rgba(255, 122, 122, 0.15)',
                    border: '1px solid rgba(255, 122, 122, 0.3)',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#ff7a7a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  },
                  children: '🛠️ Workshops',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    padding: '12px 24px',
                    borderRadius: 24,
                    backgroundColor: 'rgba(255, 122, 122, 0.15)',
                    border: '1px solid rgba(255, 122, 122, 0.3)',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#ff7a7a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  },
                  children: '🤝 Networking',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// Generate Satori JSX template for Solutions pages OG image
async function generateSolutionTemplate(options) {
  const { vertical, headline, subtitle, badges = [] } = options;

  const logoBase64 = await getLogoAsBase64();

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #10191c 0%, #17252b 100%)',
        fontFamily: 'Inter',
      },
      children: [
        // Top accent bar
        {
          type: 'div',
          props: {
            style: {
              width: '100%',
              height: 4,
              background: 'linear-gradient(90deg, #e53a3a 0%, #cb3434 100%)',
            },
          },
        },
        // Main content card
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              margin: 40,
              padding: 40,
              borderRadius: 12,
              backgroundColor: 'rgba(23, 37, 43, 0.4)',
              borderLeft: '6px solid #e53a3a',
              flex: 1,
            },
            children: [
              // Header section (logo + brand + vertical badge)
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 30,
                  },
                  children: [
                    // Logo
                    logoBase64
                      ? {
                          type: 'img',
                          props: {
                            src: logoBase64,
                            width: 56,
                            height: 56,
                            style: { marginRight: 16 },
                          },
                        }
                      : null,
                    // Brand name
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 24,
                          fontWeight: 600,
                          color: '#ff7a7a',
                          marginRight: 'auto',
                        },
                        children: 'promptfoo',
                      },
                    },
                    // Vertical badge
                    {
                      type: 'div',
                      props: {
                        style: {
                          padding: '8px 20px',
                          borderRadius: 16,
                          backgroundColor: 'rgba(229, 58, 58, 0.15)',
                          border: '1px solid #e53a3a',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#ff7a7a',
                        },
                        children: vertical,
                      },
                    },
                  ].filter(Boolean),
                },
              },
              // Main headline
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 48,
                    fontWeight: 600,
                    color: 'white',
                    lineHeight: 1.2,
                    marginBottom: 20,
                  },
                  children: headline,
                },
              },
              // Subtitle
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 22,
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: 30,
                    lineHeight: 1.4,
                  },
                  children: subtitle,
                },
              },
              // Bottom section (badges + trust signal)
              {
                type: 'div',
                props: {
                  style: {
                    marginTop: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 20,
                  },
                  children: [
                    // Compliance badges row
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          gap: 12,
                        },
                        children: badges.map((badge) => ({
                          type: 'div',
                          props: {
                            style: {
                              padding: '10px 18px',
                              borderRadius: 8,
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'rgba(255, 255, 255, 0.9)',
                            },
                            children: badge,
                          },
                        })),
                      },
                    },
                    // Trust signal
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 8,
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 18,
                                color: 'rgba(255, 255, 255, 0.6)',
                              },
                              children: 'Trusted by',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 22,
                                fontWeight: 600,
                                color: 'white',
                              },
                              children: `${SITE_STATS.FORTUNE_500_COUNT} Fortune 500`,
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 18,
                                color: 'rgba(255, 255, 255, 0.6)',
                              },
                              children: `and ${SITE_STATS.USER_COUNT_SHORT}+ developers`,
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

// Healthcare solutions page template
async function generateHealthcareTemplate() {
  return generateSolutionTemplate({
    vertical: 'Healthcare & Life Sciences',
    headline: 'AI Security for Healthcare',
    subtitle: 'Red team clinical AI for patient safety, medical accuracy, and PHI protection',
    badges: ['HIPAA', 'HITRUST', 'FDA SaMD', 'SOC 2'],
  });
}

// Finance solutions page template
async function generateFinanceTemplate() {
  return generateSolutionTemplate({
    vertical: 'Financial Services',
    headline: 'AI Security for Financial Services',
    subtitle: 'Red team AI for MNPI disclosure, market manipulation, and model risk compliance',
    badges: ['FINRA', 'SEC', 'SR 11-7', 'GLBA'],
  });
}

// Insurance solutions page template
async function generateInsuranceTemplate() {
  return generateSolutionTemplate({
    vertical: 'Insurance',
    headline: 'AI Security for Insurance',
    subtitle: 'Red team AI for HIPAA compliance, PHI protection, and coverage discrimination',
    badges: ['HIPAA', 'MHPAEA', 'CMS', 'State DOI'],
  });
}

// Telecom solutions page template
async function generateTelecomTemplate() {
  return generateSolutionTemplate({
    vertical: 'Telecommunications',
    headline: 'AI Security for Telecommunications',
    subtitle: 'Red team voice and text AI agents at carrier scale with audio-to-audio testing',
    badges: ['FCC/CPNI', 'TCPA', 'CALEA', 'E911'],
  });
}

// Generate Satori JSX template for OG image
async function generateSatoriTemplate(metadata = {}) {
  const {
    title = 'Promptfoo',
    breadcrumbs = [],
    routePath = '',
    ogTitle = null,
    image = null,
  } = metadata;

  const logoBase64 = await getLogoAsBase64();
  const pageType = getPageTypeLabel(routePath);

  // Use custom OG title if provided
  const displayTitle = ogTitle || title;
  const truncatedTitle = truncateText(displayTitle || 'Promptfoo Documentation', 70);

  // Format breadcrumbs - limit to 2 levels for cleaner look
  const breadcrumbText = breadcrumbs.length > 0 ? breadcrumbs.slice(0, 2).join(' › ') : pageType;

  // Check if we have a valid hero image
  const hasImage = image && !image.startsWith('http');
  const imageBase64 = hasImage ? await getImageAsBase64(image) : null;
  const hasValidImage = Boolean(hasImage && imageBase64);

  // Only log image processing issues
  if (routePath && routePath.includes('/blog/') && image && !imageBase64) {
    console.log(`  Template for ${routePath}: Image failed to load - ${image}`);
  }

  // Adjust font size based on title length
  const fontSize = truncatedTitle.length > 40 ? 40 : 56;

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #10191c 0%, #17252b 100%)',
        fontFamily: 'Inter',
      },
      children: [
        // Top accent bar
        {
          type: 'div',
          props: {
            style: {
              width: '100%',
              height: 4,
              background: 'linear-gradient(90deg, #e53a3a 0%, #cb3434 100%)',
            },
          },
        },
        // Main content card
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              margin: 40,
              padding: 40,
              borderRadius: 12,
              backgroundColor: 'rgba(23, 37, 43, 0.4)',
              borderLeft: '6px solid #e53a3a',
              flex: 1,
            },
            children: [
              // Header section (logo + brand + badge)
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 40,
                  },
                  children: [
                    // Logo
                    logoBase64
                      ? {
                          type: 'img',
                          props: {
                            src: logoBase64,
                            width: 64,
                            height: 64,
                            style: { marginRight: 20 },
                          },
                        }
                      : null,
                    // Brand name
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 28,
                          fontWeight: 600,
                          color: '#ff7a7a',
                          marginRight: 'auto',
                        },
                        children: 'promptfoo',
                      },
                    },
                    // Page type badge
                    {
                      type: 'div',
                      props: {
                        style: {
                          padding: '8px 20px',
                          borderRadius: 16,
                          backgroundColor: 'rgba(229, 58, 58, 0.15)',
                          border: '1px solid #e53a3a',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#ff7a7a',
                        },
                        children: pageType,
                      },
                    },
                  ].filter(Boolean),
                },
              },
              // Breadcrumbs
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 20,
                    color: 'rgba(255, 255, 255, 0.5)',
                    marginBottom: 30,
                  },
                  children: breadcrumbText,
                },
              },
              // Title
              {
                type: 'div',
                props: {
                  style: {
                    fontSize,
                    fontWeight: 600,
                    color: 'white',
                    lineHeight: 1.2,
                    marginBottom: 'auto',
                    maxWidth: hasValidImage ? 600 : '100%',
                  },
                  children: truncatedTitle,
                },
              },
              // Hero image (if available)
              hasValidImage
                ? {
                    type: 'img',
                    props: {
                      src: imageBase64,
                      style: {
                        position: 'absolute',
                        right: 80,
                        top: 140,
                        width: 400,
                        height: 390,
                        borderRadius: 12,
                        opacity: 0.9,
                        objectFit: 'cover',
                        objectPosition: 'center',
                      },
                    },
                  }
                : null,
              // Footer section
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginTop: 40,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 18,
                          color: 'rgba(255, 255, 255, 0.6)',
                        },
                        children: 'Secure and reliable LLM applications',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 16,
                          color: 'rgba(255, 122, 122, 0.8)',
                        },
                        children: 'promptfoo.dev',
                      },
                    },
                  ],
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

// Generate OG image using Satori
async function generateOgImage(metadata, outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateSatoriTemplate(metadata);

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error(
      `❌ Failed to generate OG image for "${metadata.title || 'untitled'}" (${metadata.routePath}):`,
      error.message,
    );
    return false;
  }
}

// Generate Careers OG image using custom template
async function generateCareersOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateCareersTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Careers OG image:', error.message);
    return false;
  }
}

// Generate Pricing OG image using custom template
async function generatePricingOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generatePricingTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Pricing OG image:', error.message);
    return false;
  }
}

// Generate About OG image using custom template
async function generateAboutOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateAboutTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate About OG image:', error.message);
    return false;
  }
}

// Generate Contact OG image using custom template
async function generateContactOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateContactTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Contact OG image:', error.message);
    return false;
  }
}

// Generate Press OG image using custom template
async function generatePressOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generatePressTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Press OG image:', error.message);
    return false;
  }
}

// Generate Store OG image using custom template
async function generateStoreOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateStoreTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Store OG image:', error.message);
    return false;
  }
}

// Generate Events OG image using custom template
async function generateEventsOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateEventsTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Events OG image:', error.message);
    return false;
  }
}

// Generate Healthcare solutions OG image using custom template
async function generateHealthcareOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateHealthcareTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Healthcare OG image:', error.message);
    return false;
  }
}

// Generate Finance solutions OG image using custom template
async function generateFinanceOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateFinanceTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Finance OG image:', error.message);
    return false;
  }
}

// Generate Insurance solutions OG image using custom template
async function generateInsuranceOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateInsuranceTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Insurance OG image:', error.message);
    return false;
  }
}

// Generate Telecom solutions OG image using custom template
async function generateTelecomOgImage(outputPath) {
  try {
    const fonts = await getSatoriFonts();
    const template = await generateTelecomTemplate();

    // Generate SVG using Satori
    const svg = await satori(template, { width: WIDTH, height: HEIGHT, fonts });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .png({
        quality: 100,
        compressionLevel: 6,
        palette: false,
      })
      .toBuffer();

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PNG file
    await fs.writeFile(outputPath, pngBuffer);

    return true;
  } catch (error) {
    console.error('❌ Failed to generate Telecom OG image:', error.message);
    return false;
  }
}

// Extract breadcrumbs from the doc path and sidebar structure
function extractBreadcrumbs(docPath, sidebarItems) {
  const breadcrumbs = [];
  const pathParts = docPath.split('/').filter((part) => part && part !== 'docs');

  // Try to build breadcrumbs from the path
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    // Convert kebab-case to Title Case
    const breadcrumb = part
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    breadcrumbs.push(breadcrumb);
  }

  return breadcrumbs;
}

// Try to read the actual markdown file and extract metadata
async function extractMetadataFromMarkdown(routePath, outDir) {
  try {
    // Try different possible paths for the markdown file
    const possiblePaths = [
      path.join(
        process.cwd(),
        'site/docs',
        routePath.replace('/docs/', '').replace(/\/$/, '') + '.md',
      ),
      path.join(
        process.cwd(),
        'site/docs',
        routePath.replace('/docs/', '').replace(/\/$/, '') + '.mdx',
      ),
      path.join(
        process.cwd(),
        'site/docs',
        routePath.replace('/docs/', '').replace(/\/$/, ''),
        'index.md',
      ),
      path.join(
        process.cwd(),
        'site/docs',
        routePath.replace('/docs/', '').replace(/\/$/, ''),
        'index.mdx',
      ),
      path.join(
        process.cwd(),
        'site/blog',
        routePath.replace('/blog/', '').replace(/\/$/, '') + '.md',
      ),
      path.join(
        process.cwd(),
        'site/blog',
        routePath.replace('/blog/', '').replace(/\/$/, '') + '.mdx',
      ),
      // Additional blog path pattern for routes ending with /
      path.join(
        process.cwd(),
        'site/blog',
        routePath.replace('/blog/', '').replace(/\/$/, '').replace(/-$/, '') + '.md',
      ),
      path.join(
        process.cwd(),
        'site/blog',
        routePath.replace('/blog/', '').replace(/\/$/, '').replace(/-$/, '') + '.mdx',
      ),
      // Fallback without 'site' prefix
      path.join(process.cwd(), 'docs', routePath.replace('/docs/', '').replace(/\/$/, '') + '.md'),
      path.join(process.cwd(), 'docs', routePath.replace('/docs/', '').replace(/\/$/, '') + '.mdx'),
      path.join(process.cwd(), 'blog', routePath.replace('/blog/', '').replace(/\/$/, '') + '.md'),
      path.join(process.cwd(), 'blog', routePath.replace('/blog/', '').replace(/\/$/, '') + '.mdx'),
    ];

    for (const filePath of possiblePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const { data, content: markdownContent } = matter(content);

        // Extract all metadata
        const metadata = {
          title: data.title || null,
          description: data.description || null,
          author:
            data.author ||
            (data.authors && Array.isArray(data.authors)
              ? data.authors.map((a) => (typeof a === 'object' ? a.name : a)).join(' & ')
              : data.authors) ||
            null,
          date: data.date || null,
          image: data.image || null,
          tags: data.tags || [],
          keywords: data.keywords || [],
          ogTitle: data.og_title || data.ogTitle || null,
          ogDescription: data.og_description || data.ogDescription || null,
        };

        // If no frontmatter title, try to extract H1 from markdown
        if (!metadata.title) {
          const h1Match = markdownContent.match(/^#\s+(.+)$/m);
          if (h1Match) {
            metadata.title = h1Match[1].trim();
          }
        }

        return metadata;
      } catch (_e) {
        // File doesn't exist, try next
      }
    }
  } catch (_error) {
    // Couldn't read file
  }

  return { title: null };
}

function shouldSkipOgGeneration() {
  if (process.env.SKIP_OG_GENERATION !== 'true') {
    return false;
  }

  console.log('⏭️  Skipping OG image generation (SKIP_OG_GENERATION=true)');
  return true;
}

function addRouteMetadataFromRoutes(routeMetadata, routes) {
  if (!routes) {
    return;
  }

  for (const route of routes) {
    if (!route.path || !route.modules || !Array.isArray(route.modules)) {
      continue;
    }

    const metadataModule = route.modules.find(
      (module) =>
        module &&
        (module.metadata || module.__metadata || (typeof module === 'object' && module.title)),
    );

    if (!metadataModule) {
      continue;
    }

    const metadata = metadataModule.metadata || metadataModule.__metadata || metadataModule;
    routeMetadata.set(route.path, {
      title: metadata.title || metadata.frontMatter?.title,
      description: metadata.description || metadata.frontMatter?.description,
      breadcrumbs: metadata.breadcrumbs || [],
    });
  }
}

function addDocsPluginMetadata(routeMetadata, plugins) {
  const docsPlugin = plugins.find((plugin) => plugin.name === '@docusaurus/plugin-content-docs');
  if (!docsPlugin?.content) {
    return;
  }

  const { loadedVersions } = docsPlugin.content;
  if (!loadedVersions || loadedVersions.length === 0) {
    return;
  }

  loadedVersions[0].docs.forEach((doc) => {
    routeMetadata.set(doc.permalink, {
      title: doc.title || doc.frontMatter?.title || doc.label,
      description: doc.description || doc.frontMatter?.description,
      breadcrumbs: doc.sidebar?.breadcrumbs || [],
    });
  });
}

function addBlogPluginMetadata(routeMetadata, plugins) {
  const blogPlugin = plugins.find((plugin) => plugin.name === '@docusaurus/plugin-content-blog');
  if (!blogPlugin?.content?.blogPosts) {
    return;
  }

  blogPlugin.content.blogPosts.forEach((post) => {
    const authors = post.metadata.authors || [];
    const authorNames = authors
      .map((author) => (typeof author === 'object' ? author.name || author.key : author))
      .filter(Boolean)
      .join(' & ');

    routeMetadata.set(post.metadata.permalink, {
      title: post.metadata.title,
      description: post.metadata.description,
      author: authorNames || null,
      date: post.metadata.date || post.metadata.formattedDate || null,
      image: post.metadata.frontMatter?.image || post.metadata.image || null,
      breadcrumbs: ['Blog'],
    });
  });
}

function createRouteMetadataMap(routes, plugins) {
  const routeMetadata = new Map();
  addRouteMetadataFromRoutes(routeMetadata, routes);
  addDocsPluginMetadata(routeMetadata, plugins);
  addBlogPluginMetadata(routeMetadata, plugins);
  return routeMetadata;
}

function getRoutesToProcess(routesPaths) {
  return routesPaths.filter(
    (routePath) => routePath.startsWith('/docs/') || routePath.startsWith('/blog/'),
  );
}

function getFallbackTitle(routePath) {
  const pathParts = routePath.split('/').filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];

  return lastPart
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getBreadcrumbLabels(routePath, metadata) {
  if (metadata.breadcrumbs && metadata.breadcrumbs.length > 0) {
    return metadata.breadcrumbs.map((breadcrumb) => breadcrumb.label || breadcrumb);
  }

  return extractBreadcrumbs(routePath, []);
}

async function getFileMetadata(routePath, metadata, outDir) {
  if (
    routePath.startsWith('/blog/') ||
    routePath.startsWith('/docs/') ||
    routePath.startsWith('/releases/') ||
    !metadata.title
  ) {
    return extractMetadataFromMarkdown(routePath, outDir);
  }

  return { title: metadata.title };
}

function getBatchSize() {
  const parsedBatchSize = Number(process.env.OG_BATCH_SIZE);
  if (Number.isInteger(parsedBatchSize) && parsedBatchSize > 0) {
    return parsedBatchSize;
  }

  if (process.env.OG_BATCH_SIZE) {
    console.warn(`Invalid OG_BATCH_SIZE="${process.env.OG_BATCH_SIZE}", falling back to 8`);
  }

  return 8;
}

function buildRouteMetadata(routePath, metadata, fileMetadata) {
  const fullMetadata = {
    ...fileMetadata,
    ...metadata,
    title: metadata.title || fileMetadata.title,
    description: metadata.description || fileMetadata.description,
    author: fileMetadata.author || metadata.author,
    date: fileMetadata.date || metadata.date,
    image: fileMetadata.image || metadata.image,
  };

  if (!fullMetadata.title) {
    fullMetadata.title = getFallbackTitle(routePath);
  }

  fullMetadata.routePath = routePath;
  fullMetadata.breadcrumbs = getBreadcrumbLabels(routePath, metadata);
  return fullMetadata;
}

async function warnAboutMissingLocalImage(routePath, metadata) {
  if (!routePath.includes('/blog/') || !metadata.image || metadata.image.startsWith('http')) {
    return;
  }

  const imagePath = resolveImageFullPath(metadata.image);
  try {
    await fs.access(imagePath);
  } catch {
    console.log(`⚠️  Missing image for ${routePath}: ${metadata.image}`);
  }
}

function getGeneratedImageInfo(routePath, outDir) {
  const imageFileName =
    routePath
      .replace(/^\//, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '') + '-og.png';

  return {
    imagePath: path.join(outDir, 'img', 'og', imageFileName),
    imageUrl: `/img/og/${imageFileName}`,
  };
}

async function fileExists(filePath) {
  return fs
    .stat(filePath)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

async function injectOgImageUrl({ htmlPath, imageUrl, routePath, siteUrl }) {
  try {
    if (!(await fileExists(htmlPath))) {
      return;
    }

    const defaultThumbnailUrl = 'https://www.promptfoo.dev/img/thumbnail.png';
    const newOgImageUrl = `${siteUrl}${imageUrl}`;
    let html = await fs.readFile(htmlPath, 'utf8');

    if (!html.includes(defaultThumbnailUrl)) {
      return;
    }

    html = html.replaceAll(defaultThumbnailUrl, newOgImageUrl);
    await fs.writeFile(htmlPath, html);
  } catch (error) {
    console.warn(`Could not inject meta tags for ${routePath}:`, error.message);
  }
}

async function processRoute(routePath, { generatedImages, outDir, routeMetadata, siteConfig }) {
  try {
    const metadata = routeMetadata.get(routePath) || {};
    const fileMetadata = await getFileMetadata(routePath, metadata, outDir);
    const fullMetadata = buildRouteMetadata(routePath, metadata, fileMetadata);

    await warnAboutMissingLocalImage(routePath, fullMetadata);

    const { imagePath, imageUrl } = getGeneratedImageInfo(routePath, outDir);
    const success = await generateOgImage(fullMetadata, imagePath);
    if (!success) {
      return false;
    }

    generatedImages.set(routePath, imageUrl);

    await injectOgImageUrl({
      htmlPath: path.join(outDir, routePath.slice(1), 'index.html'),
      imageUrl,
      routePath,
      siteUrl: siteConfig.url,
    });

    return true;
  } catch (error) {
    console.error(`Error processing route ${routePath}:`, error);
    return false;
  }
}

async function processRouteBatch(batch, context) {
  const results = await Promise.all(batch.map((routePath) => processRoute(routePath, context)));
  const successCount = results.filter(Boolean).length;

  return {
    successCount,
    failureCount: results.length - successCount,
  };
}

const SPECIAL_PAGE_GENERATORS = [
  {
    generator: generateCareersOgImage,
    imageUrl: '/img/og/careers-og.png',
    outputFile: 'careers-og.png',
    routePath: '/careers/',
    title: 'Careers page',
  },
  {
    generator: generatePricingOgImage,
    imageUrl: '/img/og/pricing-og.png',
    outputFile: 'pricing-og.png',
    routePath: '/pricing/',
    title: 'Pricing page',
  },
  {
    generator: generateAboutOgImage,
    imageUrl: '/img/og/about-og.png',
    outputFile: 'about-og.png',
    routePath: '/about/',
    title: 'About page',
  },
  {
    generator: generateContactOgImage,
    imageUrl: '/img/og/contact-og.png',
    outputFile: 'contact-og.png',
    routePath: '/contact/',
    title: 'Contact page',
  },
  {
    generator: generatePressOgImage,
    imageUrl: '/img/og/press-og.png',
    outputFile: 'press-og.png',
    routePath: '/press/',
    title: 'Press page',
  },
  {
    generator: generateStoreOgImage,
    imageUrl: '/img/og/store-og.png',
    outputFile: 'store-og.png',
    routePath: '/store/',
    title: 'Store page',
  },
  {
    generator: generateEventsOgImage,
    imageUrl: '/img/og/events-og.png',
    outputFile: 'events-og.png',
    routePath: '/events/',
    title: 'Events page',
  },
  {
    generator: generateHealthcareOgImage,
    imageUrl: '/img/og/solutions-healthcare-og.png',
    outputFile: 'solutions-healthcare-og.png',
    routePath: '/solutions/healthcare/',
    title: 'Healthcare solutions page',
  },
  {
    generator: generateFinanceOgImage,
    imageUrl: '/img/og/solutions-finance-og.png',
    outputFile: 'solutions-finance-og.png',
    routePath: '/solutions/finance/',
    title: 'Finance solutions page',
  },
  {
    generator: generateInsuranceOgImage,
    imageUrl: '/img/og/solutions-insurance-og.png',
    outputFile: 'solutions-insurance-og.png',
    routePath: '/solutions/insurance/',
    title: 'Insurance solutions page',
  },
  {
    generator: generateTelecomOgImage,
    imageUrl: '/img/og/solutions-telecom-og.png',
    outputFile: 'solutions-telecom-og.png',
    routePath: '/solutions/telecom/',
    title: 'Telecom solutions page',
  },
];

async function generateSpecialPageImages(outDir, generatedImages) {
  let successCount = 0;
  let failureCount = 0;

  for (const page of SPECIAL_PAGE_GENERATORS) {
    console.log(`🎨 Generating ${page.title} OG image...`);

    const imagePath = path.join(outDir, 'img', 'og', page.outputFile);
    const success = await page.generator(imagePath);

    if (success) {
      generatedImages.set(page.routePath, page.imageUrl);
      successCount++;
      console.log(`  ✅ ${page.title} OG image generated`);
      continue;
    }

    failureCount++;
  }

  return { successCount, failureCount };
}

async function injectSpecialPageImages(outDir, siteConfig, generatedImages) {
  console.log('🔄 Injecting OG image meta tags for special pages...');

  for (const page of SPECIAL_PAGE_GENERATORS) {
    const imageUrl = generatedImages.get(page.routePath);
    if (!imageUrl) {
      continue;
    }

    await injectOgImageUrl({
      htmlPath: path.join(outDir, page.routePath.slice(1), 'index.html'),
      imageUrl,
      routePath: page.routePath,
      siteUrl: siteConfig.url,
    });
  }
}

async function writeGeneratedImageManifest(outDir, generatedImages) {
  const manifestPath = path.join(outDir, 'og-images-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(Object.fromEntries(generatedImages), null, 2));
}

// Standalone test runner - call this directly to test image generation
async function runStandaloneTest() {
  const testCases = [
    {
      title: 'Test OG Image Generation',
      breadcrumbs: ['Documentation', 'Testing'],
      routePath: '/docs/test/',
    },
    {
      title: 'Getting Started with Promptfoo',
      breadcrumbs: ['Guide'],
      routePath: '/guides/getting-started/',
    },
    {
      title: 'Red Team Testing for LLMs',
      breadcrumbs: ['Blog'],
      routePath: '/blog/red-team-testing/',
      image: '/img/blog/ai-red-teaming-hero.jpg',
    },
  ];

  const outputDir = path.join(process.cwd(), 'test-og-output');
  await fs.mkdir(outputDir, { recursive: true });

  console.log('🎨 Generating test OG images with Satori...\n');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const outputPath = path.join(outputDir, `test-${i + 1}.png`);

    console.log(`Generating: ${testCase.title}`);
    const success = await generateOgImage(testCase, outputPath);

    if (success) {
      console.log(`  ✅ Saved to: ${outputPath}\n`);
    } else {
      console.log(`  ❌ Failed\n`);
    }
  }

  console.log(`\n✨ Done! Check the output in: ${outputDir}`);
}

// Run standalone test if called directly
if (require.main === module) {
  runStandaloneTest().catch(console.error);
}

module.exports = function (context, options) {
  return {
    name: 'docusaurus-plugin-og-image',

    async contentLoaded({ content, actions }) {
      const { setGlobalData } = actions;

      // Store plugin data globally so it can be accessed by theme components
      setGlobalData({
        ogImagePlugin: true,
      });
    },

    async postBuild({ siteConfig, routesPaths, outDir, plugins, content, routes }) {
      if (shouldSkipOgGeneration()) {
        return;
      }

      console.log('Generating OG images for documentation pages...');

      const generatedImages = new Map();
      let successCount = 0;
      let failureCount = 0;
      const routeMetadata = createRouteMetadataMap(routes, plugins);
      const batchSize = getBatchSize();
      const routesToProcess = getRoutesToProcess(routesPaths);

      const totalRoutes = routesToProcess.length;
      console.log(`📊 Processing ${totalRoutes} routes in batches of ${batchSize}...`);

      for (let i = 0; i < routesToProcess.length; i += batchSize) {
        const batch = routesToProcess.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(totalRoutes / batchSize);

        console.log(`⏳ Processing batch ${batchNum}/${totalBatches} (${batch.length} images)...`);
        const batchResults = await processRouteBatch(batch, {
          generatedImages,
          outDir,
          routeMetadata,
          siteConfig,
        });
        successCount += batchResults.successCount;
        failureCount += batchResults.failureCount;
      }

      const specialPageResults = await generateSpecialPageImages(outDir, generatedImages);
      successCount += specialPageResults.successCount;
      failureCount += specialPageResults.failureCount;

      await injectSpecialPageImages(outDir, siteConfig, generatedImages);
      await writeGeneratedImageManifest(outDir, generatedImages);

      console.log(
        `✅ Generated ${successCount} OG images${failureCount > 0 ? ` (${failureCount} failed)` : ''}`,
      );
    },
  };
};
