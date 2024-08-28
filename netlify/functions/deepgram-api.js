const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (!process.env.DEEPGRAM_API_KEY) {
    console.error('DEEPGRAM_API_KEY is not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  let action = null;

  try {
    console.log('Received event body:', event.body);
    const requestBody = JSON.parse(event.body);
    action = requestBody.action;
    const data = requestBody.data;

    if (!data || typeof data !== 'object' || !data.audioBlob) {
      throw new Error('Invalid input data: audioBlob is required and must be an object.');
    }

    const actionHandlers = {
      transcribe: transcribeAudio,
      detectContinuousSpeech: detectContinuousSpeech,
    };

    const handler = actionHandlers[action];
    if (!handler) {
      throw new Error('Invalid action: Action not recognized.');
    }

    const result = await handler(data, deepgramApiKey);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error processing action:', action, error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function sendDeepgramRequest(audioBlob, deepgramApiKey) {
  const url = new URL('https://api.deepgram.com/v1/listen');
  url.searchParams.append('model', 'general');
  url.searchParams.append('language', 'en-US');

  try {
    console.log('Sending request to Deepgram API');
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
      },
      body: audioBlob,
    });

    console.log('Response Status:', response.status);
    console.log('Response Headers:', JSON.stringify(response.headers.raw(), null, 2));

    const responseBody = await response.text();
    console.log('Raw Response from Deepgram:', responseBody);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}. Response: ${responseBody}`);
    }

    try {
      return JSON.parse(responseBody);
    } catch (jsonError) {
      throw new Error(`Failed to parse JSON response: ${jsonError.message}. Response: ${responseBody}`);
    }
  } catch (error) {
    console.error('Error in sendDeepgramRequest:', error.message);
    throw error;
  }
}

async function transcribeAudio({ audioBlob }, deepgramApiKey) {
  const data = await sendDeepgramRequest(audioBlob, deepgramApiKey);
  if (!data.results || !data.results.channels || !data.results.channels[0].alternatives[0].transcript) {
    throw new Error('Transcription failed: Invalid response format from Deepgram.');
  }
  return { text: data.results.channels[0].alternatives[0].transcript };
}

async function detectContinuousSpeech({ audioBlob }, deepgramApiKey) {
  const data = await sendDeepgramRequest(audioBlob, deepgramApiKey);
  if (!data.results || !data.results.utterances) {
    throw new Error('Continuous speech detection failed: Invalid response format from Deepgram.');
  }
  const utterances = data.results.utterances.map((utterance) => ({
    start: utterance.start,
    end: utterance.end,
    transcript: utterance.transcript,
  }));
  return { utterances };
}
