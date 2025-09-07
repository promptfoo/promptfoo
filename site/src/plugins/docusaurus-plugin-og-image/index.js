const path = require('path');
const fs = require('fs').promises;
const { Resvg } = require('@resvg/resvg-js');
const matter = require('gray-matter');
const sharp = require('sharp');

// Constants for image generation
const WIDTH = 1200;
const HEIGHT = 630;

// Asset cache to avoid repeated file reads (only for logo/font, not large image buffers)
const assetCache = {
  logo: null,
  font: null,
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

// Helper function to escape HTML/XML entities
function escapeXml(text) {
  if (!text) {
    return '';
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper function to truncate text with ellipsis
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

// Calculate font size based on text length for classic design
function calculateFontSize(text, baseSize = 64, minSize = 40) {
  const lengthFactor = Math.max(1, text.length / 40);
  const fontSize = Math.max(minSize, Math.floor(baseSize / Math.sqrt(lengthFactor)));
  return fontSize;
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

// Helper function to convert image to base64 (no caching to avoid memory leaks)
async function getImageAsBase64(imagePath, maxWidth = 520, maxHeight = 430) {
  try {
    // Handle relative paths from frontmatter
    // Check if we're already in the site directory
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
    } else {
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
    }
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

// Helper function to convert font to base64 (cached)
async function getFontAsBase64() {
  if (assetCache.font !== null) {
    return assetCache.font;
  }

  try {
    const fontPath = path.join(process.cwd(), 'static/fonts/Inter-SemiBold.ttf');
    const fontBuffer = await fs.readFile(fontPath);
    assetCache.font = fontBuffer.toString('base64');
    return assetCache.font;
  } catch (_error) {
    // Fallback when running from repo root
    try {
      const fontPath = path.join(process.cwd(), 'site/static/fonts/Inter-SemiBold.ttf');
      const fontBuffer = await fs.readFile(fontPath);
      assetCache.font = fontBuffer.toString('base64');
      return assetCache.font;
    } catch (e) {
      console.warn('Could not load Inter font for embedding:', e);
      assetCache.font = null;
      return null;
    }
  }
}

// Generate SVG template for OG image with rich design
async function generateSvgTemplate(metadata = {}) {
  const {
    title = 'Promptfoo',
    breadcrumbs = [],
    routePath = '',
    ogTitle = null,
    image = null,
  } = metadata;

  const logoBase64 = await getLogoAsBase64();
  const fontBase64 = await getFontAsBase64();

  // Use custom OG title if provided
  const displayTitle = ogTitle || title;

  // Truncate for cleaner display
  const escapedTitle = escapeXml(truncateText(displayTitle || 'Promptfoo Documentation', 70));

  // Check if we have a valid image
  const hasImage = image && !image.startsWith('http');
  const imageBase64 = hasImage ? await getImageAsBase64(image) : null;
  const hasValidImage = Boolean(hasImage && imageBase64);

  // Only log image processing issues, not successes
  if (routePath && routePath.includes('/blog/') && image && !imageBase64) {
    console.log(`  Template for ${routePath}: Image failed to load - ${image}`);
  }

  // Get page type
  const pageType = getPageTypeLabel(routePath);
  const fontSize = calculateFontSize(escapedTitle, 56, 36);

  // Format breadcrumbs - limit to 2 levels for cleaner look
  const breadcrumbText =
    breadcrumbs.length > 0 ? escapeXml(breadcrumbs.slice(0, 2).join(' › ')) : pageType;

  // Split title into multiple lines if needed
  const words = escapedTitle.split(' ');
  const titleLines = [];
  let currentLine = '';
  const maxLineWidth = WIDTH - 240; // More padding for better layout
  const charWidth = fontSize * 0.5;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length * charWidth > maxLineWidth && currentLine) {
      titleLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    titleLines.push(currentLine);
  }

  // Limit to 3 lines max
  if (titleLines.length > 3) {
    titleLines.length = 3;
    titleLines[2] = titleLines[2].substring(0, titleLines[2].length - 3) + '...';
  }

  // For images, keep existing layout
  let imageContent = '';
  if (hasValidImage) {
    const maxImageWidth = 400;
    const maxImageHeight = HEIGHT - 240;
    const imageX = WIDTH - maxImageWidth - 80;
    const imageY = 140;

    // Simple image display on the right
    imageContent = `
      <g>
        <clipPath id="imageClip">
          <rect x="${imageX}" y="${imageY}" width="${maxImageWidth}" height="${maxImageHeight}" rx="12"/>
        </clipPath>
        <rect x="${imageX}" y="${imageY}" width="${maxImageWidth}" height="${maxImageHeight}" 
              rx="12" fill="rgba(255,255,255,0.03)"/>
        <image href="${imageBase64}" 
               x="${imageX}" y="${imageY}" 
               width="${maxImageWidth}" height="${maxImageHeight}" 
               preserveAspectRatio="xMidYMid meet"
               clip-path="url(#imageClip)"
               opacity="0.9"/>
      </g>
    `;
  }

  // RICH DESIGN WITH DECORATIVE ELEMENTS
  const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${
      fontBase64
        ? `
    <style type="text/css">
      @font-face {
        font-family: 'InterSemiBold';
        src: url(data:font/truetype;charset=utf-8;base64,${fontBase64}) format('truetype');
        font-weight: 600;
        font-style: normal;
      }
    </style>
    `
        : ''
    }
    <!-- Brand gradient using Promptfoo colors -->
    <linearGradient id="backgroundGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10191c;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#17252b;stop-opacity:1" />
    </linearGradient>
    
    <!-- Red accent gradient -->
    <linearGradient id="redGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#e53a3a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#cb3434;stop-opacity:1" />
    </linearGradient>
    
    <!-- Subtle pattern -->
    <pattern id="dotPattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.02)"/>
      <circle cx="22" cy="22" r="1" fill="rgba(255,255,255,0.02)"/>
    </pattern>
  </defs>
  
  <!-- Background with gradient -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#backgroundGradient)"/>
  
  <!-- Dot pattern -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#dotPattern)"/>
  
  <!-- Top accent bar -->
  <rect x="0" y="0" width="${WIDTH}" height="4" fill="url(#redGradient)"/>
  
  <!-- Content card background with subtle gradient -->
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" rx="12" fill="rgba(255,255,255,0.02)"/>
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" rx="12" fill="rgba(23,37,43,0.4)"/>
  
  <!-- Left accent stripe -->
  <rect x="40" y="40" width="6" height="${HEIGHT - 80}" rx="3" fill="url(#redGradient)"/>
  
  <!-- Top highlight -->
  <rect x="46" y="40" width="${WIDTH - 86}" height="1" fill="rgba(255,255,255,0.08)"/>
  
  <!-- Header section -->
  <g transform="translate(80, 80)">
    <!-- Logo -->
    ${logoBase64 ? `<image href="${logoBase64}" width="64" height="64" opacity="0.9"/>` : ''}
    
    <!-- Brand name -->
    <text x="80" y="32" font-family="${fontBase64 ? 'InterSemiBold' : 'sans-serif'}" font-size="28" font-weight="600" fill="#ff7a7a">promptfoo</text>
    
    <!-- Page type badge -->
    <rect x="250" y="8" width="${pageType.length * 10 + 20}" height="32" rx="16" fill="rgba(229, 58, 58, 0.15)" stroke="#e53a3a" stroke-width="1"/>
    <text x="${250 + (pageType.length * 10 + 20) / 2}" y="28" text-anchor="middle" font-family="${fontBase64 ? 'InterSemiBold' : 'sans-serif'}" font-size="14" font-weight="600" fill="#ff7a7a">${pageType}</text>
  </g>
  
  <!-- Breadcrumbs with better styling -->
  <g transform="translate(80, 180)">
    <text font-family="${fontBase64 ? 'InterSemiBold' : 'sans-serif'}" font-size="20" fill="rgba(255,255,255,0.5)" letter-spacing="0.5">${breadcrumbText}</text>
  </g>
  
  <!-- Main title with better positioning -->
  <g transform="translate(80, ${240})">
    ${titleLines
      .map(
        (line, index) => `
    <text x="0" y="${index * (fontSize * 1.3)}" font-family="${fontBase64 ? 'InterSemiBold' : 'sans-serif'}" font-size="${fontSize}" font-weight="600" fill="white">${line}</text>`,
      )
      .join('')}
  </g>
  
  ${hasValidImage ? imageContent : ''}
  
  <!-- Bottom section with call-to-action -->
  <g transform="translate(80, ${HEIGHT - 100})">
    <text font-family="${fontBase64 ? 'InterSemiBold' : 'sans-serif'}" font-size="18" fill="rgba(255,255,255,0.6)">Secure and reliable LLM applications</text>
    <text x="0" y="30" font-family="${fontBase64 ? 'InterSemiBold' : 'sans-serif'}" font-size="16" fill="rgba(255,122,122,0.8)">promptfoo.dev</text>
  </g>
  
  <!-- Decorative elements -->
  <circle cx="${WIDTH - 120}" cy="120" r="180" fill="rgba(229, 58, 58, 0.03)"/>
  <circle cx="${WIDTH - 80}" cy="160" r="100" fill="rgba(229, 58, 58, 0.02)"/>
  <circle cx="${WIDTH - 160}" cy="100" r="60" fill="rgba(255, 122, 122, 0.02)"/>
  
  <!-- Grid decoration in bottom right -->
  <g transform="translate(${WIDTH - 200}, ${HEIGHT - 200})" opacity="0.08">
    ${Array.from({ length: 4 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => {
        const size = i === 3 && j === 3 ? 35 : 30;
        const opacity = 1 - (i + j) * 0.1;
        return `<rect x="${i * 40}" y="${j * 40}" width="${size}" height="${size}" fill="#e53a3a" rx="4" opacity="${opacity}"/>`;
      }).join(''),
    ).join('')}
  </g>
  
  <!-- Additional decorative lines -->
  <line x1="${WIDTH - 400}" y1="${HEIGHT - 40}" x2="${WIDTH - 200}" y2="${HEIGHT - 40}" stroke="#e53a3a" stroke-width="1" opacity="0.1"/>
  <line x1="${WIDTH - 40}" y1="${HEIGHT - 400}" x2="${WIDTH - 40}" y2="${HEIGHT - 200}" stroke="#e53a3a" stroke-width="1" opacity="0.1"/>
  
  <!-- Bottom accent -->
  <rect x="40" y="${HEIGHT - 44}" width="${WIDTH - 80}" height="4" rx="2" fill="url(#redGradient)" opacity="0.4"/>
</svg>`;

  return svg;
}

// Generate OG image from SVG
async function generateOgImage(metadata, outputPath) {
  try {
    const svg = await generateSvgTemplate(metadata);

    // Convert SVG to PNG using resvg
    // Since we're embedding the font in the SVG, we don't need to load external fonts
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: WIDTH,
      },
      font: {
        loadSystemFonts: true, // Keep system fonts as fallback
        fontFiles: [], // No external fonts needed
        defaultFontFamily: 'sans-serif',
      },
      dpi: 96,
      background: 'transparent',
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

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
      console.log('Generating OG images for documentation pages...');

      const generatedImages = new Map();
      let successCount = 0;
      let failureCount = 0;

      // Caching disabled; proceed without reading cache manifest

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

      // Process all documentation routes with conservative parallel processing
      const BATCH_SIZE = Number(process.env.OG_BATCH_SIZE) || 2; // Conservative default
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
                      // Only log replacements for debugging if needed
                      // console.log(`Replaced default thumbnail OG meta tags for ${routePath}`);
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
