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

// Site constants loaded directly from JSON (shared with site/src/constants.ts)
const SITE_STATS = require('../../site-stats.json');

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
    vertical: 'Healthcare',
    headline: 'AI Security for Healthcare',
    subtitle: 'Red team AI assistants for patient safety, clinical accuracy, and HIPAA compliance',
    badges: ['HIPAA', 'FDA 21 CFR Part 11', 'SOC2', 'HITRUST'],
  });
}

// Finance solutions page template
async function generateFinanceTemplate() {
  return generateSolutionTemplate({
    vertical: 'Finance',
    headline: 'AI Security for Finance',
    subtitle: 'Red team AI agents for fraud prevention, risk management, and regulatory compliance',
    badges: ['SOC2', 'SOX', 'PCI DSS', 'GLBA'],
  });
}

// Insurance solutions page template
async function generateInsuranceTemplate() {
  return generateSolutionTemplate({
    vertical: 'Insurance',
    headline: 'AI Security for Insurance',
    subtitle: 'Red team AI agents for underwriting accuracy and regulatory compliance',
    badges: ['SOC2', 'NAIC', 'State DOI', 'CCPA'],
  });
}

// Telecom solutions page template
async function generateTelecomTemplate() {
  return generateSolutionTemplate({
    vertical: 'Telecom',
    headline: 'AI Security for Telecom',
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
      // Skip OG image generation if disabled via environment variable
      if (process.env.SKIP_OG_GENERATION === 'true') {
        console.log('⏭️  Skipping OG image generation (SKIP_OG_GENERATION=true)');
        return;
      }

      console.log('Generating OG images for documentation pages...');

      const generatedImages = new Map();
      let successCount = 0;
      let failureCount = 0;

      // Create a map of routes to their metadata
      const routeMetadata = new Map();

      // Process routes to extract metadata
      if (routes) {
        for (const route of routes) {
          if (route.path && route.modules && Array.isArray(route.modules)) {
            // Look for metadata in route modules
            const metadataModule = route.modules.find(
              (m) => m && (m.metadata || m.__metadata || (typeof m === 'object' && m.title)),
            );

            if (metadataModule) {
              const metadata =
                metadataModule.metadata || metadataModule.__metadata || metadataModule;
              routeMetadata.set(route.path, {
                title: metadata.title || metadata.frontMatter?.title,
                description: metadata.description || metadata.frontMatter?.description,
                breadcrumbs: metadata.breadcrumbs || [],
              });
            }
          }
        }
      }

      // Also try to get metadata from docs plugin
      const docsPlugin = plugins.find(
        (plugin) => plugin.name === '@docusaurus/plugin-content-docs',
      );
      if (docsPlugin && docsPlugin.content) {
        const { loadedVersions } = docsPlugin.content;
        if (loadedVersions && loadedVersions.length > 0) {
          const version = loadedVersions[0];
          version.docs.forEach((doc) => {
            routeMetadata.set(doc.permalink, {
              title: doc.title || doc.frontMatter?.title || doc.label,
              description: doc.description || doc.frontMatter?.description,
              breadcrumbs: doc.sidebar?.breadcrumbs || [],
            });
          });
        }
      }

      // Get blog plugin metadata
      const blogPlugin = plugins.find(
        (plugin) => plugin.name === '@docusaurus/plugin-content-blog',
      );
      if (blogPlugin && blogPlugin.content) {
        const { blogPosts } = blogPlugin.content;
        if (blogPosts) {
          blogPosts.forEach((post) => {
            // Extract author information
            const authors = post.metadata.authors || [];
            const authorNames = authors
              .map((a) => (typeof a === 'object' ? a.name || a.key : a))
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
      }

      // Process all documentation routes with improved parallel processing
      // Satori is faster and has no system font bottleneck, so we can increase batch size
      const BATCH_SIZE = Number(process.env.OG_BATCH_SIZE) || 8; // Increased from 2 to 8
      const routesToProcess = routesPaths.filter(
        (routePath) => routePath.startsWith('/docs/') || routePath.startsWith('/blog/'),
      );

      const totalRoutes = routesToProcess.length;
      console.log(`📊 Processing ${totalRoutes} routes in batches of ${BATCH_SIZE}...`);

      for (let i = 0; i < routesToProcess.length; i += BATCH_SIZE) {
        const batch = routesToProcess.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(totalRoutes / BATCH_SIZE);

        console.log(`⏳ Processing batch ${batchNum}/${totalBatches} (${batch.length} images)...`);

        await Promise.all(
          batch.map(async (routePath) => {
            try {
              // Get metadata for this route
              const metadata = routeMetadata.get(routePath) || {};

              // Try to get metadata from multiple sources
              let fileMetadata = { title: metadata.title };

              // For blog posts, always try to read the markdown file to get the image
              // Blog plugin doesn't expose custom frontmatter fields like image
              if (routePath.startsWith('/blog/')) {
                fileMetadata = await extractMetadataFromMarkdown(routePath, outDir);
              } else if (!fileMetadata.title) {
                // For docs, only read if we don't have a title
                fileMetadata = await extractMetadataFromMarkdown(routePath, outDir);
              }

              // Merge route metadata with file metadata
              const fullMetadata = {
                ...fileMetadata,
                ...metadata,
                title: metadata.title || fileMetadata.title,
                description: metadata.description || fileMetadata.description,
                author: fileMetadata.author || metadata.author,
                date: fileMetadata.date || metadata.date,
                image: fileMetadata.image || metadata.image,
              };

              // Only log if there are image processing issues
              if (
                routePath.includes('/blog/') &&
                fullMetadata.image &&
                !fullMetadata.image.startsWith('http')
              ) {
                const imagePath = resolveImageFullPath(fullMetadata.image);
                try {
                  await fs.access(imagePath);
                } catch {
                  console.log(`⚠️  Missing image for ${routePath}: ${fullMetadata.image}`);
                }
              }

              // Final fallback for title to path parsing
              if (!fullMetadata.title) {
                const pathParts = routePath.split('/').filter(Boolean);
                const lastPart = pathParts[pathParts.length - 1];
                fullMetadata.title = lastPart
                  .split('-')
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
              }

              // Extract breadcrumbs from metadata or path
              const breadcrumbs =
                metadata.breadcrumbs && metadata.breadcrumbs.length > 0
                  ? metadata.breadcrumbs.map((b) => b.label || b)
                  : extractBreadcrumbs(routePath, []);

              // Add route path to metadata
              fullMetadata.routePath = routePath;
              fullMetadata.breadcrumbs = breadcrumbs;

              // Generate unique filename for this route
              const imageFileName =
                routePath
                  .replace(/^\//, '')
                  .replace(/\//g, '-')
                  .replace(/[^a-zA-Z0-9-]/g, '') + '-og.png';

              const imagePath = path.join(outDir, 'img', 'og', imageFileName);
              const imageUrl = `/img/og/${imageFileName}`;

              // Generate the OG image with full metadata
              const success = await generateOgImage(fullMetadata, imagePath);

              if (success) {
                generatedImages.set(routePath, imageUrl);
                successCount++;

                // Inject meta tags into the HTML for this route
                const htmlPath = path.join(outDir, routePath.slice(1), 'index.html');
                try {
                  if (
                    await fs
                      .stat(htmlPath)
                      .then((stat) => stat.isFile())
                      .catch(() => false)
                  ) {
                    let html = await fs.readFile(htmlPath, 'utf8');

                    const newOgImageUrl = `${siteConfig.url}${imageUrl}`;
                    const defaultThumbnailUrl = 'https://www.promptfoo.dev/img/thumbnail.png';

                    // If HTML contains the default thumbnail URL, replace all instances
                    if (html.includes(defaultThumbnailUrl)) {
                      html = html.replaceAll(defaultThumbnailUrl, newOgImageUrl);
                      await fs.writeFile(htmlPath, html);
                    }
                  }
                } catch (error) {
                  console.warn(`Could not inject meta tags for ${routePath}:`, error.message);
                }
              } else {
                failureCount++;
              }
            } catch (error) {
              console.error(`Error processing route ${routePath}:`, error);
              failureCount++;
            }
          }),
        );
      }

      // Generate careers page OG image
      console.log('🎨 Generating Careers page OG image...');
      const careersImagePath = path.join(outDir, 'img', 'og', 'careers-og.png');
      const careersSuccess = await generateCareersOgImage(careersImagePath);
      if (careersSuccess) {
        generatedImages.set('/careers/', '/img/og/careers-og.png');
        successCount++;
        console.log('  ✅ Careers OG image generated');
      } else {
        failureCount++;
      }

      // Generate pricing page OG image
      console.log('🎨 Generating Pricing page OG image...');
      const pricingImagePath = path.join(outDir, 'img', 'og', 'pricing-og.png');
      const pricingSuccess = await generatePricingOgImage(pricingImagePath);
      if (pricingSuccess) {
        generatedImages.set('/pricing/', '/img/og/pricing-og.png');
        successCount++;
        console.log('  ✅ Pricing OG image generated');
      } else {
        failureCount++;
      }

      // Generate about page OG image
      console.log('🎨 Generating About page OG image...');
      const aboutImagePath = path.join(outDir, 'img', 'og', 'about-og.png');
      const aboutSuccess = await generateAboutOgImage(aboutImagePath);
      if (aboutSuccess) {
        generatedImages.set('/about/', '/img/og/about-og.png');
        successCount++;
        console.log('  ✅ About OG image generated');
      } else {
        failureCount++;
      }

      // Generate contact page OG image
      console.log('🎨 Generating Contact page OG image...');
      const contactImagePath = path.join(outDir, 'img', 'og', 'contact-og.png');
      const contactSuccess = await generateContactOgImage(contactImagePath);
      if (contactSuccess) {
        generatedImages.set('/contact/', '/img/og/contact-og.png');
        successCount++;
        console.log('  ✅ Contact OG image generated');
      } else {
        failureCount++;
      }

      // Generate press page OG image
      console.log('🎨 Generating Press page OG image...');
      const pressImagePath = path.join(outDir, 'img', 'og', 'press-og.png');
      const pressSuccess = await generatePressOgImage(pressImagePath);
      if (pressSuccess) {
        generatedImages.set('/press/', '/img/og/press-og.png');
        successCount++;
        console.log('  ✅ Press OG image generated');
      } else {
        failureCount++;
      }

      // Generate store page OG image
      console.log('🎨 Generating Store page OG image...');
      const storeImagePath = path.join(outDir, 'img', 'og', 'store-og.png');
      const storeSuccess = await generateStoreOgImage(storeImagePath);
      if (storeSuccess) {
        generatedImages.set('/store/', '/img/og/store-og.png');
        successCount++;
        console.log('  ✅ Store OG image generated');
      } else {
        failureCount++;
      }

      // Generate events page OG image
      console.log('🎨 Generating Events page OG image...');
      const eventsImagePath = path.join(outDir, 'img', 'og', 'events-og.png');
      const eventsSuccess = await generateEventsOgImage(eventsImagePath);
      if (eventsSuccess) {
        generatedImages.set('/events/', '/img/og/events-og.png');
        successCount++;
        console.log('  ✅ Events OG image generated');
      } else {
        failureCount++;
      }

      // Generate solutions page OG images
      console.log('🎨 Generating Solutions page OG images...');

      // Healthcare solutions page
      const healthcareImagePath = path.join(outDir, 'img', 'og', 'solutions-healthcare-og.png');
      const healthcareSuccess = await generateHealthcareOgImage(healthcareImagePath);
      if (healthcareSuccess) {
        generatedImages.set('/solutions/healthcare/', '/img/og/solutions-healthcare-og.png');
        successCount++;
        console.log('  ✅ Healthcare solutions OG image generated');
      } else {
        failureCount++;
      }

      // Finance solutions page
      const financeImagePath = path.join(outDir, 'img', 'og', 'solutions-finance-og.png');
      const financeSuccess = await generateFinanceOgImage(financeImagePath);
      if (financeSuccess) {
        generatedImages.set('/solutions/finance/', '/img/og/solutions-finance-og.png');
        successCount++;
        console.log('  ✅ Finance solutions OG image generated');
      } else {
        failureCount++;
      }

      // Insurance solutions page
      const insuranceImagePath = path.join(outDir, 'img', 'og', 'solutions-insurance-og.png');
      const insuranceSuccess = await generateInsuranceOgImage(insuranceImagePath);
      if (insuranceSuccess) {
        generatedImages.set('/solutions/insurance/', '/img/og/solutions-insurance-og.png');
        successCount++;
        console.log('  ✅ Insurance solutions OG image generated');
      } else {
        failureCount++;
      }

      // Telecom solutions page
      const telecomImagePath = path.join(outDir, 'img', 'og', 'solutions-telecom-og.png');
      const telecomSuccess = await generateTelecomOgImage(telecomImagePath);
      if (telecomSuccess) {
        generatedImages.set('/solutions/telecom/', '/img/og/solutions-telecom-og.png');
        successCount++;
        console.log('  ✅ Telecom solutions OG image generated');
      } else {
        failureCount++;
      }

      // Inject meta tags for special pages (careers, pricing, about, contact, press, store, events, solutions)
      console.log('🔄 Injecting OG image meta tags for special pages...');
      const specialPages = [
        '/careers/',
        '/pricing/',
        '/about/',
        '/contact/',
        '/press/',
        '/store/',
        '/events/',
        '/solutions/healthcare/',
        '/solutions/finance/',
        '/solutions/insurance/',
        '/solutions/telecom/',
      ];

      const defaultThumbnailUrl = 'https://www.promptfoo.dev/img/thumbnail.png';
      for (const routePath of specialPages) {
        const imageUrl = generatedImages.get(routePath);
        if (imageUrl) {
          const htmlPath = path.join(outDir, routePath.slice(1), 'index.html');
          try {
            if (
              await fs
                .stat(htmlPath)
                .then((stat) => stat.isFile())
                .catch(() => false)
            ) {
              let html = await fs.readFile(htmlPath, 'utf8');
              const newOgImageUrl = `${siteConfig.url}${imageUrl}`;

              // Replace default thumbnail with custom OG image
              if (html.includes(defaultThumbnailUrl)) {
                html = html.replaceAll(defaultThumbnailUrl, newOgImageUrl);
                await fs.writeFile(htmlPath, html);
              }
            }
          } catch (error) {
            console.warn(`Could not inject meta tags for ${routePath}:`, error.message);
          }
        }
      }

      // Create a manifest file for the generated images
      const manifestPath = path.join(outDir, 'og-images-manifest.json');
      await fs.writeFile(
        manifestPath,
        JSON.stringify(Object.fromEntries(generatedImages), null, 2),
      );

      console.log(
        `✅ Generated ${successCount} OG images${failureCount > 0 ? ` (${failureCount} failed)` : ''}`,
      );
    },
  };
};
