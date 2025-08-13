const path = require('path');
const fs = require('fs').promises;
const { Resvg } = require('@resvg/resvg-js');
const matter = require('gray-matter');
const sharp = require('sharp');

// Constants for image generation
const WIDTH = 1200;
const HEIGHT = 630;

// Helper function to escape HTML/XML entities
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Smart text wrapping that preserves all content
function wrapText(text, maxWidth, fontSize) {
  if (!text) {
    return [];
  }
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  const avgCharWidth = fontSize * 0.5;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const estimatedWidth = testLine.length * avgCharWidth;

    if (estimatedWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Dynamic font sizing - much more aggressive scaling
function calculateOptimalFontSize(text, hasImage = false, isTitle = true) {
  if (!text) {
    return 48;
  }
  const length = text.length;

  if (isTitle) {
    // Title sizing - MUCH larger when space allows
    if (hasImage) {
      // With image - slightly smaller
      if (length <= 30) {
        return 48;
      }
      if (length <= 50) {
        return 42;
      }
      if (length <= 70) {
        return 36;
      }
      if (length <= 100) {
        return 32;
      }
      return 28;
    } else {
      // No image - we have lots of space
      if (length <= 20) {
        return 72;
      }
      if (length <= 30) {
        return 64;
      }
      if (length <= 50) {
        return 56;
      }
      if (length <= 70) {
        return 48;
      }
      if (length <= 100) {
        return 40;
      }
      return 32;
    }
  } else {
    // Description sizing
    return Math.min(22, Math.max(16, 24 - Math.floor(length / 60)));
  }
}

// Helper function to convert SVG logo to base64
async function getLogoAsBase64() {
  try {
    const logoPath = path.join(process.cwd(), 'site/static/img/logo-panda.svg');
    const logoContent = await fs.readFile(logoPath, 'utf8');
    return `data:image/svg+xml;base64,${Buffer.from(logoContent).toString('base64')}`;
  } catch (_error) {
    // Fallback to site/static path
    try {
      const logoPath = path.join(process.cwd(), 'static/img/logo-panda.svg');
      const logoContent = await fs.readFile(logoPath, 'utf8');
      return `data:image/svg+xml;base64,${Buffer.from(logoContent).toString('base64')}`;
    } catch (_e) {
      return '';
    }
  }
}

// Helper function to convert image to base64
async function getImageAsBase64(imagePath, maxWidth = 520, maxHeight = 430) {
  try {
    // Handle relative paths from frontmatter
    // Check if we're already in the site directory
    const cwd = process.cwd();
    const inSiteDir = cwd.endsWith('/site');

    let fullPath;
    if (imagePath.startsWith('/')) {
      // Absolute path from static directory
      if (inSiteDir) {
        fullPath = path.join(cwd, 'static', imagePath);
      } else {
        fullPath = path.join(cwd, 'site/static', imagePath);
      }
    } else {
      // Relative path
      if (inSiteDir) {
        fullPath = path.join(cwd, imagePath);
      } else {
        fullPath = path.join(cwd, 'site', imagePath);
      }
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
    console.warn(`Could not load image ${imagePath}:`, error.message);
    return null;
  }
}

// Get page type label - simplified
function getPageTypeLabel(routePath) {
  if (routePath.includes('/blog/')) {
    return 'Blog';
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
  if (routePath.includes('/api-reference/')) {
    return 'API';
  }
  return null; // Don't show generic "Documentation"
}

// Helper function to convert font to base64
async function getFontAsBase64() {
  try {
    const fontPath = path.join(process.cwd(), 'static/fonts/Inter-SemiBold.ttf');
    const fontBuffer = await fs.readFile(fontPath);
    return fontBuffer.toString('base64');
  } catch (error) {
    console.warn('Could not load Inter font for embedding:', error);
    return null;
  }
}

// COMPLETELY REDESIGNED OG IMAGE TEMPLATE
async function generateSvgTemplate(metadata = {}) {
  const {
    title = 'Promptfoo',
    description = '',
    breadcrumbs = [],
    routePath = '',
    ogTitle = null,
    ogDescription = null,
    date = null,
    author = null,
    image = null,
  } = metadata;

  const logoBase64 = await getLogoAsBase64();
  const fontBase64 = await getFontAsBase64();

  // Use custom OG title if provided
  const displayTitle = ogTitle || title;
  const displayDescription = ogDescription || description;

  // NO TRUNCATION
  const escapedTitle = escapeXml(displayTitle);
  const escapedDescription = escapeXml(displayDescription);

  // Check if we have a valid image
  const hasImage = image && !image.startsWith('http');
  const imageBase64 = hasImage ? await getImageAsBase64(image) : null;
  const hasValidImage = hasImage && imageBase64;

  // Debug image processing
  if (routePath && routePath.includes('/blog/') && image) {
    console.log(`  Template for ${routePath}:`);
    console.log('    Has image:', hasImage);
    console.log('    Image path:', image);
    console.log('    Image loaded:', !!imageBase64);
    console.log('    Has valid image:', hasValidImage);
  }

  // Get page type
  const pageType = getPageTypeLabel(routePath);

  // Format date
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  // Format author - FULL NAME(S)
  const authorDisplay = author || '';
  const metadataLine = [formattedDate, authorDisplay].filter(Boolean).join(' • ');

  // Calculate layout based on content
  let contentLayout = '';

  if (hasValidImage) {
    // WITH IMAGE LAYOUT - Adaptive sizing, no background container
    const maxImageWidth = 520;
    const maxImageHeight = HEIGHT - 200; // More room for header/footer
    const imageX = 60;
    const contentStartX = maxImageWidth + 100;
    const maxTextWidth = WIDTH - contentStartX - 60;

    // Calculate font sizes
    const titleFontSize = calculateOptimalFontSize(escapedTitle, true, true);
    const descFontSize = calculateOptimalFontSize(escapedDescription, true, false);

    // Wrap text
    const titleLines = wrapText(escapedTitle, maxTextWidth, titleFontSize);
    const descriptionLines = escapedDescription
      ? wrapText(escapedDescription, maxTextWidth, descFontSize)
      : [];

    // Calculate vertical positioning for text
    const totalTextHeight =
      titleLines.length * titleFontSize * 1.2 +
      (descriptionLines.length > 0 ? 20 + descriptionLines.length * descFontSize * 1.4 : 0);
    const textStartY = (HEIGHT - totalTextHeight) / 2;

    // Image positioning - aligned with footer content
    const imageY = 100; // Increased top spacing for better balance

    contentLayout = `
      <!-- Container for image and metadata - same alignment -->
      <g>
        <!-- Featured image - NO BACKGROUND, just the image -->
        <clipPath id="imageClip">
          <rect x="${imageX}" y="${imageY}" width="${maxImageWidth}" height="${maxImageHeight}" rx="12"/>
        </clipPath>
        <!-- NO BACKGROUND RECT - just show the image directly -->
        <image href="${imageBase64}" 
               x="${imageX}" y="${imageY}" 
               width="${maxImageWidth}" height="${maxImageHeight}" 
               preserveAspectRatio="xMidYMid meet"
               clip-path="url(#imageClip)"
               opacity="0.95"/>
      </g>
      
      <!-- Text content on right -->
      <g transform="translate(${contentStartX}, ${textStartY})">
        <!-- Title -->
        ${titleLines
          .map(
            (line, index) => `
        <text x="0" y="${index * titleFontSize * 1.2}" 
              font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
              font-size="${titleFontSize}" 
              font-weight="700" 
              fill="white">
          ${line}
        </text>`,
          )
          .join('')}
        
        ${
          descriptionLines.length > 0
            ? `
        <!-- Description -->
        ${descriptionLines
          .map(
            (line, index) => `
        <text x="0" y="${titleLines.length * titleFontSize * 1.2 + 20 + index * descFontSize * 1.4}" 
              font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
              font-size="${descFontSize}" 
              font-weight="400" 
              fill="#94a3b8">
          ${line}
        </text>`,
          )
          .join('')}
        `
            : ''
        }
      </g>
    `;
  } else {
    // NO IMAGE LAYOUT - Center everything, make it BIG
    const maxTextWidth = WIDTH - 240;

    // Much larger fonts when no image
    const titleFontSize = calculateOptimalFontSize(escapedTitle, false, true);
    const descFontSize = calculateOptimalFontSize(escapedDescription, false, false);

    // Wrap text
    const titleLines = wrapText(escapedTitle, maxTextWidth, titleFontSize);
    const descriptionLines = escapedDescription
      ? wrapText(escapedDescription, maxTextWidth, descFontSize)
      : [];
    const breadcrumbLines =
      !escapedDescription && breadcrumbs.length > 0 ? [breadcrumbs.join(' › ')] : [];

    // Calculate total height for centering
    const totalHeight =
      titleLines.length * titleFontSize * 1.2 +
      (descriptionLines.length > 0 ? 30 + descriptionLines.length * descFontSize * 1.4 : 0) +
      (breadcrumbLines.length > 0 ? 30 + breadcrumbLines.length * 24 : 0);

    const startY = (HEIGHT - totalHeight) / 2;

    contentLayout = `
      <!-- Centered content -->
      <g transform="translate(${WIDTH / 2}, ${startY})">
        <!-- Title - CENTERED -->
        ${titleLines
          .map(
            (line, index) => `
        <text x="0" y="${index * titleFontSize * 1.2}" 
              text-anchor="middle"
              font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
              font-size="${titleFontSize}" 
              font-weight="700" 
              fill="white">
          ${line}
        </text>`,
          )
          .join('')}
        
        ${
          descriptionLines.length > 0
            ? `
        <!-- Description - CENTERED -->
        ${descriptionLines
          .map(
            (line, index) => `
        <text x="0" y="${titleLines.length * titleFontSize * 1.2 + 30 + index * descFontSize * 1.4}" 
              text-anchor="middle"
              font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
              font-size="${descFontSize}" 
              font-weight="400" 
              fill="#94a3b8">
          ${line}
        </text>`,
          )
          .join('')}
        `
            : breadcrumbLines.length > 0
              ? `
        <!-- Breadcrumbs - CENTERED -->
        <text x="0" y="${titleLines.length * titleFontSize * 1.2 + 30}" 
              text-anchor="middle"
              font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
              font-size="24" 
              font-weight="400" 
              fill="#64748b">
          ${escapeXml(breadcrumbLines[0])}
        </text>
        `
              : ''
        }
      </g>
    `;
  }

  // SIMPLIFIED, CLEAN DESIGN
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
  </defs>
  
  <!-- Simple dark background - no distracting gradients -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0f172a"/>
  
  <!-- Very subtle gradient overlay for depth -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#subtleGradient)" opacity="0.5"/>
  <defs>
    <linearGradient id="subtleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#0f172a;stop-opacity:0" />
    </linearGradient>
  </defs>
  
  ${contentLayout}
  
  <!-- Header: Clean branding -->
  <g transform="translate(${WIDTH - 180}, 50)">
    ${
      logoBase64
        ? `
    <image href="${logoBase64}" x="0" y="0" width="28" height="28" opacity="0.9"/>
    <text x="36" y="18" 
          font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
          font-size="18" 
          font-weight="600" 
          fill="#ef4444">promptfoo</text>
    `
        : `
    <text x="0" y="18" 
          font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
          font-size="18" 
          font-weight="600" 
          fill="#ef4444">promptfoo</text>
    `
    }
  </g>
  
  <!-- Footer: Metadata aligned with image container -->
  ${
    pageType || metadataLine
      ? `
  <g transform="translate(60, ${HEIGHT - 45})">
    ${
      pageType
        ? `
    <!-- Page type indicator aligned with image x position -->
    <text x="0" y="0" 
          font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
          font-size="14" 
          font-weight="500" 
          fill="#ef4444">
      ${pageType}
    </text>
    `
        : ''
    }
    
    ${
      metadataLine
        ? `
    <!-- Metadata inline with page type -->
    <text x="${pageType ? 60 : 0}" y="0" 
          font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
          font-size="14" 
          font-weight="400" 
          fill="#64748b">
      ${escapeXml(metadataLine)}
    </text>
    `
        : ''
    }
  </g>
  `
      : ''
  }
  
  <!-- URL - much better contrast -->
  <text x="${WIDTH - 60}" y="${HEIGHT - 35}" 
        text-anchor="end"
        font-family="${fontBase64 ? 'InterSemiBold' : 'system-ui, -apple-system, sans-serif'}" 
        font-size="16" 
        font-weight="600" 
        fill="#94a3b8">
    promptfoo.dev
  </text>
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
    console.error(`Failed to generate OG image for "${title}":`, error);
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

      // Process all documentation routes
      for (const routePath of routesPaths) {
        if (routePath.startsWith('/docs/') || routePath.startsWith('/blog/')) {
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

            // Debug for specific blog posts
            if (
              routePath.includes('/blog/') &&
              (routePath.includes('100k') || routePath.includes('excessive'))
            ) {
              console.log(`\nProcessing ${routePath}:`);
              console.log('  Image from file:', fileMetadata.image);
              console.log('  Image from metadata:', metadata.image);
              console.log('  Final image:', fullMetadata.image);
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
                    console.log(`Replaced default thumbnail OG meta tags for ${routePath}`);
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
        }
      }

      // Create a manifest file for the generated images
      const manifestPath = path.join(outDir, 'og-images-manifest.json');
      await fs.writeFile(
        manifestPath,
        JSON.stringify(Object.fromEntries(generatedImages), null, 2),
      );

      console.log(
        `OG image generation complete: ${successCount} succeeded, ${failureCount} failed`,
      );
    },
  };
};
