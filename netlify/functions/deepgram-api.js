const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const deepgramApiKey = process.env.deepgram_api_key;

  if (!deepgramApiKey) {
    throw new Error('deepgram_api_key environment variable is not set.');
  }

  const { action, data } = JSON.parse(event.body);

  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid input data');
    }

    const actionHandlers = {
      transcribe: transcribeAudio,
      detectContinuousSpeech: detectContinuousSpeech,
    };

    const handler = actionHandlers[action];
    if (!handler) {
      throw new Error('Invalid action');
    }

    const result = await handler(data, deepgramApiKey);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error processing action:', action, 'with data:', data, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

const COMMON_API_PARAMS = {
  encoding: 'linear16',
  sample_rate: 16000,
  language: 'en-US',
  model: 'general',
};

async function sendDeepgramRequest(payload, deepgramApiKey) {
  const response = await fetch('https://api.deepgram.com/v1/listen', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${deepgramApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function transcribeAudio({ base64Audio }, deepgramApiKey) {
  const data = await sendDeepgramRequest({
    ...COMMON_API_PARAMS,
    audio: base64Audio,
    punctuation: true,
  }, deepgramApiKey);

  return { text: data.results.channels[0].alternatives[0].transcript };
}

async function detectContinuousSpeech({ base64Audio }, deepgramApiKey) {
  const data = await sendDeepgramRequest({
    ...COMMON_API_PARAMS,
    audio: base64Audio,
    detect_language: true,
    diarize: true,
    utterances: true,
  }, deepgramApiKey);

  const utterances = data.results.utterances.map((utterance) => ({
    start: utterance.start,
    end: utterance.end,
    transcript: utterance.transcript,
  }));

  return { utterances };
}
