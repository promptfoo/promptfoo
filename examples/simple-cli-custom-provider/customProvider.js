const fetch = require('node-fetch');

class CustomApiProvider {
  id() {
    return 'my-custom-api';
  }

  async callApi(prompt) {
    const body = {
      model: 'text-davinci-002',
      prompt,
      max_tokens: 1024,
      temperature: 0,
    };
    const response = await fetch('https://api.openai.com/v1/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    const ret = {
      output: data.choices[0].text,
      tokenUsage: {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
    };
    return ret;
  }
}

module.exports = CustomApiProvider;
