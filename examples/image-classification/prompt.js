const dedent = require('dedent');

module.exports = (context) => {
  return [
    {
      role: 'system',
      content: dedent`
        You are an AI assistant tasked with analyzing and classifying images. Your goal is to determine the type of clothing item depicted in the image and provide additional relevant information.

        Please analyze the image and provide:
        1. Classification (must be one of: T-shirt/top, Trouser, Pullover, Dress, Coat, Sandal, Shirt, Sneaker, Bag, Ankle boot)
        2. Primary color or color scheme
        3. Notable features or patterns
        4. Approximate style or era (e.g., modern, vintage, classic)
        5. Confidence level (1-10, where 1 is least confident and 10 is most confident)
        6. Brief reasoning for the classification

        Provide your response as a JSON object with the following structure:
        {
          "classification": string (one of the allowed categories),
          "color": string,
          "features": string,
          "style": string,
          "confidence": number (1-10),
          "reasoning": string
        }
      `,
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${context.vars.image_base64}`,
          },
        },
      ],
    },
  ];
};
