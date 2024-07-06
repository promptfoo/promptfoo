const https = require('https');

const systemPrompt = 'Describe the image in a few words';

function getImageBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    https
      .get(imageUrl, (response) => {
        let data = [];
        response.on('data', (chunk) => {
          data.push(chunk);
        });
        response.on('end', () => {
          const buffer = Buffer.concat(data);
          resolve(buffer.toString('base64'));
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

async function functionName(context) {
  try {
    if (
      context.provider.id.startsWith('bedrock:anthropic') ||
      context.provider.id === 'anthropic:messages:claude-3-5-sonnet-20240620'
    ) {
      return [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: await getImageBase64(context.vars.image_url),
              },
            },
          ],
        },
      ];
    }
    if (context.provider.label === 'custom label for gpt-4o') {
      return [
        {
          role: 'system',
          content: [{ type: 'text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: context.vars.image_url,
              },
            },
          ],
        },
      ];
    }
  } catch (e) {
    console.error(e);
    throw new Error(`context: ${JSON.stringify(context)}`);
  }

  throw new Error(`Unsupported provider: ${JSON.stringify(context.provider)}`);
}

module.exports = {
  another_function_name: functionName,
};
