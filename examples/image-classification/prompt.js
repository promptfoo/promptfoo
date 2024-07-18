const dedent = require('dedent');

module.exports = (context) => {
  return [
    {
      role: 'system',
      content: `
    You are an AI assistant tasked with analyzing and classifying images. Your goal is to determine the type of clothing item depicted in the image and provide additional relevant information.

    Please perform the following tasks:

    1. Classify the image into one of the following categories:
      - T-shirt/top
      - Trouser
      - Pullover
      - Dress
      - Coat
      - Sandal
      - Shirt
      - Sneaker
      - Bag
      - Ankle boot

    2. Provide the following additional information about the image:
      a) The primary color or color scheme of the item
      b) Any notable features or patterns on the item
      c) The approximate style or era the item might belong to (e.g., modern, vintage, classic)

    3. Estimate the confidence level of your classification on a scale of 1-10, where 1 is least confident and 10 is most confident.

    Please provide your analysis in the following format:

    <analysis>
    <classification>[Insert the category here]</classification>
    <color>[Describe the primary color or color scheme]</color>
    <features>[Describe any notable features or patterns]</features>
    <style>[Describe the approximate style or era]</style>
    <confidence>[Insert your confidence level (1-10)]</confidence>
    <reasoning>[Provide a brief explanation for your classification and confidence level]</reasoning>
    </analysis>

    Remember to base your analysis solely on the provided image. Do not make assumptions about information that is not explicitly stated or strongly implied by the description.

    Begin with <analysis>
    `,
    },
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: context.vars.image_base64,
          },
        },
      ],
    },
  ];
};
