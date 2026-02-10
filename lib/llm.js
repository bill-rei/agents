async function compile(userMessage, systemPrompt) {
  if (!systemPrompt) {
    throw new Error('systemPrompt is required — each agent must pass its own prompt.');
  }
  const provider = process.env.LLM_PROVIDER || 'anthropic';

  if (provider === 'anthropic') {
    return compileAnthropic(userMessage, systemPrompt);
  } else if (provider === 'openai') {
    return compileOpenAI(userMessage, systemPrompt);
  } else {
    throw new Error(`Unknown LLM_PROVIDER: ${provider}. Use "anthropic" or "openai".`);
  }
}

async function compileAnthropic(userMessage, systemPrompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const anthOptions = {};
  if (process.env.ANTHROPIC_API_KEY) anthOptions.apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.ANTHROPIC_AUTH_TOKEN) anthOptions.authToken = process.env.ANTHROPIC_AUTH_TOKEN;

  if (!anthOptions.apiKey && !anthOptions.authToken) {
    throw new Error('Missing Anthropic credentials. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in the environment.');
  }

  const client = new Anthropic(anthOptions);
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

async function compileOpenAI(userMessage, systemPrompt) {
  const OpenAI = require('openai');
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY in the environment.');
  }

  const client = new OpenAI({ apiKey: openaiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const response = await client.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  return response.choices[0].message.content;
}

module.exports = { compile };
