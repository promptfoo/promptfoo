const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const matter = require('gray-matter');
const glob = require('glob');
const sidebars = require('../sidebars');

function getBreadcrumbs(file, sidebars) {
  const parts = file.split('/');
  const breadcrumbs = [];
  let current = sidebars.promptfoo;

  for (const part of parts) {
    const found = current.find(item =>
      item.id === part.replace('.md', '') ||
      (item.items && item.items.find(subItem =>
        subItem.id === part.replace('.md', '')
      ))
    );
    if (found) {
      breadcrumbs.push(found.label || found.id);
      current = found.items || [];
    }
  }
  return breadcrumbs;
}

async function generateMetaImages() {
  const docsDir = path.join(__dirname, '..', 'docs');
  const outputDir = path.join(__dirname, '..', 'static/img/meta/docs');
  const templatePath = path.join(__dirname, '..', 'static/img/meta/docs-template.html');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });

  try {
    // Find all markdown files recursively
    const files = glob.sync('**/*.md', { cwd: docsDir });
    console.log(`Found ${files.length} markdown files`);

    for (const file of files) {
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const { data: frontMatter, content: markdown } = matter(content);

      // Skip if image is already defined and exists
      const existingImage = frontMatter.image?.replace(/^\//, '');
      if (existingImage && fs.existsSync(path.join(__dirname, '..', existingImage))) {
        console.log(`Skipping ${file} - already has image: ${existingImage}`);
        continue;
      }

      // Extract title from frontmatter or first heading
      const title = frontMatter.title || markdown.match(/^#\s+(.+)/m)?.[1] || path.basename(file, '.md');

      // Generate breadcrumbs
      const breadcrumbs = getBreadcrumbs(file, sidebars).join(' › ');

      // Extract and format preview text
      const preview = markdown
        .replace(/^#.*$/m, '') // Remove first heading
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert markdown links to just text
        .replace(/`[^`]+`/g, '') // Remove code blocks
        .replace(/https?:\/\/\S+/g, '') // Remove URLs
        .replace(/[#\[\]*]/g, '') // Remove remaining markdown syntax
        .trim()
        .split('\n')[0] // Get first paragraph
        .replace(/\s+/g, ' ') // Normalize whitespace
        .slice(0, 120) + '...'; // Limit length

      // Generate safe filename
      const safeFilename = file.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.png';
      const outputPath = path.join(outputDir, safeFilename);
      const relativePath = path.join('img/meta/docs', safeFilename);

      // Generate image
      const html = template
        .replace('{{title}}', title)
        .replace('{{breadcrumbs}}', breadcrumbs)
        .replace('{{preview}}', preview);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.screenshot({
        path: outputPath,
        type: 'png'
      });
      console.log(`Generated image for ${file} at ${outputPath}`);

      // Update frontmatter with image path
      const newFrontMatter = {
        ...frontMatter,
        image: '/' + relativePath.replace(/\\/g, '/'),
      };

      // Write updated content back to file
      const updatedContent = matter.stringify(markdown, newFrontMatter);
      fs.writeFileSync(filePath, updatedContent);
    }
  } finally {
    await browser.close();
  }
}

generateMetaImages().catch(console.error);
