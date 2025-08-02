const path = require('path');
const fs = require('fs').promises;
const { Resvg } = require('@resvg/resvg-js');
const matter = require('gray-matter');

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

// Helper function to truncate text with ellipsis
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Helper function to calculate font size based on text length
function calculateFontSize(text, baseSize = 64, minSize = 40) {
  const lengthFactor = Math.max(1, text.length / 40);
  const fontSize = Math.max(minSize, Math.floor(baseSize / Math.sqrt(lengthFactor)));
  return fontSize;
}

// Helper function to convert SVG logo to base64
async function getLogoAsBase64() {
  try {
    const logoPath = path.join(process.cwd(), 'static/img/logo-panda.svg');
    const logoContent = await fs.readFile(logoPath, 'utf8');
    return `data:image/svg+xml;base64,${Buffer.from(logoContent).toString('base64')}`;
  } catch (error) {
    console.warn('Could not load logo:', error);
    return '';
  }
}

// Get page type label
function getPageTypeLabel(routePath) {
  if (routePath.includes('/blog/')) return 'Posts';
  if (routePath.includes('/guides/')) return 'Guide';
  if (routePath.includes('/red-team')) return 'Security';
  if (routePath.includes('/providers/')) return 'Provider';
  if (routePath.includes('/integrations/')) return 'Integration';
  if (routePath.includes('/enterprise/')) return 'Enterprise';
  if (routePath.includes('/api-reference/')) return 'API Reference';
  return 'Documentation';
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

// Generate SVG template for OG image
async function generateSvgTemplate(title, breadcrumbs = [], routePath = '') {
  const logoBase64 = await getLogoAsBase64();
  const fontBase64 = await getFontAsBase64();
  const escapedTitle = escapeXml(truncateText(title || 'Promptfoo Documentation', 70));
  const fontSize = calculateFontSize(escapedTitle, 56, 36);
  const pageType = getPageTypeLabel(routePath);

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

  const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${
      fontBase64
        ? `
    <style type="text/css">
      @font-face {
        font-family: 'InterSemiBold, sans-serif';
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
    <text x="80" y="32" font-family="${fontBase64 ? 'InterSemiBold, sans-serif' : 'sans-serif'}" font-size="28" font-weight="600" fill="#ff7a7a">promptfoo</text>
    
    <!-- Page type badge -->
    <rect x="250" y="8" width="${pageType.length * 10 + 20}" height="32" rx="16" fill="rgba(229, 58, 58, 0.15)" stroke="#e53a3a" stroke-width="1"/>
    <text x="${250 + (pageType.length * 10 + 20) / 2}" y="28" text-anchor="middle" font-family="${fontBase64 ? 'InterSemiBold, sans-serif' : 'sans-serif'}" font-size="14" font-weight="600" fill="#ff7a7a">${pageType}</text>
  </g>
  
  <!-- Breadcrumbs with better styling -->
  <g transform="translate(80, 180)">
    <text font-family="${fontBase64 ? 'InterSemiBold, sans-serif' : 'sans-serif'}" font-size="20" fill="rgba(255,255,255,0.5)" letter-spacing="0.5">${breadcrumbText}</text>
  </g>
  
  <!-- Main title with better positioning -->
  <g transform="translate(80, ${240})">
    ${titleLines
      .map(
        (line, index) => `
    <text x="0" y="${index * (fontSize * 1.3)}" font-family="${fontBase64 ? 'InterSemiBold, sans-serif' : 'sans-serif'}" font-size="${fontSize}" font-weight="600" fill="white">${line}</text>`,
      )
      .join('')}
  </g>
  
  <!-- Bottom section with call-to-action -->
  <g transform="translate(80, ${HEIGHT - 100})">
    <text font-family="${fontBase64 ? 'InterSemiBold, sans-serif' : 'sans-serif'}" font-size="18" fill="rgba(255,255,255,0.6)">Secure and reliable LLM applications</text>
    <text x="0" y="30" font-family="${fontBase64 ? 'InterSemiBold, sans-serif' : 'sans-serif'}" font-size="16" fill="rgba(255,122,122,0.8)">promptfoo.dev</text>
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
async function generateOgImage(title, breadcrumbs, outputPath, routePath = '') {
  try {
    const svg = await generateSvgTemplate(title, breadcrumbs, routePath);

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

// Try to read the actual markdown file and extract title
async function extractTitleFromMarkdown(routePath, outDir) {
  try {
    // Try different possible paths for the markdown file
    const possiblePaths = [
      path.join(process.cwd(), 'docs', routePath.replace('/docs/', '').replace(/\/$/, '') + '.md'),
      path.join(process.cwd(), 'docs', routePath.replace('/docs/', '').replace(/\/$/, '') + '.mdx'),
      path.join(
        process.cwd(),
        'docs',
        routePath.replace('/docs/', '').replace(/\/$/, ''),
        'index.md',
      ),
      path.join(
        process.cwd(),
        'docs',
        routePath.replace('/docs/', '').replace(/\/$/, ''),
        'index.mdx',
      ),
      path.join(process.cwd(), 'blog', routePath.replace('/blog/', '').replace(/\/$/, '') + '.md'),
      path.join(process.cwd(), 'blog', routePath.replace('/blog/', '').replace(/\/$/, '') + '.mdx'),
    ];

    for (const filePath of possiblePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const { data, content: markdownContent } = matter(content);

        // Try to get title from frontmatter
        if (data.title) {
          return data.title;
        }

        // If no frontmatter title, try to extract H1 from markdown
        const h1Match = markdownContent.match(/^#\s+(.+)$/m);
        if (h1Match) {
          return h1Match[1].trim();
        }
      } catch (e) {
        // File doesn't exist, try next
      }
    }
  } catch (error) {
    // Couldn't read file
  }

  return null;
}

module.exports = function (context, options) {
  const { siteConfig } = context;

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
            routeMetadata.set(post.metadata.permalink, {
              title: post.metadata.title,
              description: post.metadata.description,
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

            // Try to get title from multiple sources
            let title = metadata.title;

            // If no title from route metadata, try reading the markdown file
            if (!title) {
              title = await extractTitleFromMarkdown(routePath, outDir);
            }

            // Final fallback to path parsing
            if (!title) {
              const pathParts = routePath.split('/').filter(Boolean);
              const lastPart = pathParts[pathParts.length - 1];
              title = lastPart
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            }

            // Extract breadcrumbs from metadata or path
            const breadcrumbs =
              metadata.breadcrumbs && metadata.breadcrumbs.length > 0
                ? metadata.breadcrumbs.map((b) => b.label || b)
                : extractBreadcrumbs(routePath, []);

            // Generate unique filename for this route
            const imageFileName =
              routePath
                .replace(/^\//, '')
                .replace(/\//g, '-')
                .replace(/[^a-zA-Z0-9-]/g, '') + '-og.png';

            const imagePath = path.join(outDir, 'img', 'og', imageFileName);
            const imageUrl = `/img/og/${imageFileName}`;

            // Generate the OG image
            const success = await generateOgImage(title, breadcrumbs, imagePath, routePath);

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
