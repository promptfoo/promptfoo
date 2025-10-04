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

    // Convert SVG to PNG using Sharp with compression
    const pngBuffer = await sharp(Buffer.from(svg))
      .png({
        compressionLevel: 9, // Maximum compression
        palette: true, // Use palette-based PNG if possible
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
