const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');

module.exports = function(context, options) {
  return {
    name: 'docusaurus-meta-image-plugin',
    async loadContent() {
      const docsDir = path.join(context.siteDir, 'docs');
      const outputDir = path.join(context.siteDir, 'static/img/meta/docs');

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 630 });

      const template = fs.readFileSync(
        path.join(context.siteDir, 'static/img/meta/docs-template.html'),
        'utf8'
      );

      return {
        browser,
        page,
        template,
        outputDir,
      };
    },

    async contentLoaded({ content, actions }) {
      const { browser, page, template, outputDir } = content;
      const { setGlobalData } = actions;

      try {
        const docs = await actions.createData(
          'docs.json',
          JSON.stringify(await actions.getDocuments())
        );

        for (const doc of docs) {
          if (!doc.frontMatter.image) {
            const html = template.replace('{{title}}', doc.title);
            const outputPath = path.join(outputDir, `${doc.id}.png`);

            await page.setContent(html);
            await page.screenshot({
              path: outputPath,
              type: 'png',
              quality: 100,
            });

            doc.frontMatter.image = `/img/meta/docs/${doc.id}.png`;
          }
        }
      } finally {
        await browser.close();
      }
    },
  };
};
