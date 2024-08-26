const fetch = require('node-fetch');
const FormData = require('form-data');

const apiKey = process.env.OPENAI_API_KEY;
const apiBaseUrl = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';

exports.handler = async function(event, context) {
  const { action, data } = JSON.parse(event.body);

  try {
    let result;
    switch (action) {
      case 'detectLanguage':
        result = await detectLanguage(data);
        break;
      case 'translate':
        result = await translateText(data.text, data.sourceLanguage, data.targetLanguage);
        break;
      case 'validateTranslation':
        result = await validateTranslation(data.originalText, data.translatedText, data.sourceLanguage, data.targetLanguage);
        break;
      case 'generateSpeech':
        result = await generateSpeech(data.text, data.language, data.voice);
        break;
      default:
        throw new Error('Invalid action');
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Error in ${action}: ${error.message}` }),
    };
  }
};

async function makeOpenAIRequest(endpoint, body) {
  const response = await fetch(`${apiBaseUrl}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function detectLanguage(text) {
  const data = await makeOpenAIRequest('chat/completions', {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a language detection tool. Respond only with the ISO 639-1 code of the language of the given text.' },
      { role: 'user', content: text },
    ],
  });

  return { detectedLanguage: data.choices[0].message.content.trim().toLowerCase() };
}

async function translateText(text, sourceLanguage, targetLanguage) {
  const data = await makeOpenAIRequest('chat/completions', {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}.` },
      { role: 'user', content: text },
    ],
  });

  return { translatedText: data.choices[0].message.content };
}

async function validateTranslation(originalText, translatedText, sourceLanguage, targetLanguage) {
  const data = await makeOpenAIRequest('chat/completions', {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: `You are a translation validator. Compare the original text and its translation. Correct the translation if necessary.` },
      { role: 'user', content: `Original (${sourceLanguage}): ${originalText}\nTranslation (${targetLanguage}): ${translatedText}` },
    ],
  });

  return { validatedTranslation: data.choices[0].message.content };
}

async function generateSpeech(text, language, voice) {
  const response = await fetch(`${apiBaseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice,
      language: language,
    }),
  });

  if (!response.ok) {
    throw new Error(`Speech generation failed: ${response.status} ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  return { audio: Buffer.from(audioBuffer).toString('base64') };
}
