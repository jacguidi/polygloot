const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const deepgramApiKey = process.env.deepgram_api_key;

  if (!deepgramApiKey) {
    throw new Error('deepgram_api_key environment variable is not set.');
  }

  try {
    // Parse and validate input data
    const { action, data } = JSON.parse(event.body);

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

    // Process the action with the appropriate handler
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

const COMMON_API_PARAMS = {
  encoding: 'linear16', // or other relevant encoding
  sample_rate: 16000,
  language: 'en-US',
  model: 'general',
};

async function sendDeepgramRequest(audioBlob, deepgramApiKey) {
  const contentType = audioBlob.type || 'audio/wav'; // Handle content type dynamically

  const response = await fetch('https://api.deepgram.com/v1/listen', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${deepgramApiKey}`,
      'Content-Type': contentType, // Set content type based on Blob type
    },
    body: audioBlob, // Send the Blob directly
  });

  const responseBody = await response.text(); // Read the response body

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}. Response: ${responseBody}`);
  }

  return JSON.parse(responseBody); // Parse the JSON response
}

async function transcribeAudio({ audioBlob }, deepgramApiKey) {
  // Combine common parameters with the specific request
  const data = await sendDeepgramRequest(audioBlob, deepgramApiKey);

  if (!data.results || !data.results.channels || !data.results.channels[0].alternatives[0].transcript) {
    throw new Error('Transcription failed: Invalid response format from Deepgram.');
  }

  return { text: data.results.channels[0].alternatives[0].transcript };
}

async function detectContinuousSpeech({ audioBlob }, deepgramApiKey) {
  // Combine common parameters with the specific request
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
