const { createClient } = require('@deepgram/sdk');
const multipart = require('parse-multipart-data');
const { Buffer } = require('buffer');

exports.handler = async function (event) {
  console.log('Received event:', JSON.stringify(event, null, 2));

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    console.error('Deepgram API key is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Deepgram API key is not set' }) };
  }

  const deepgram = createClient(deepgramApiKey);

  if (event.headers['content-type']?.includes('multipart/form-data')) {
    try {
      const bodyBuffer = Buffer.from(event.body, 'base64');
      const boundary = multipart.getBoundary(event.headers['content-type']);
      const parts = multipart.parse(bodyBuffer, boundary);

      const audioFile = parts.find(part => part.name === 'file')?.data;
      const action = parts.find(part => part.name === 'action')?.data.toString();
      const model = parts.find(part => part.name === 'model')?.data.toString() || 'nova-2';
      const fileMimeType = parts.find(part => part.name === 'file')?.type || 'audio/webm';

      if (!audioFile || !action) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing action or audio file' }) };
      }

      const source = {
        buffer: audioFile,
        mimetype: fileMimeType
      };

      if (action === 'transcribe') {
        // For chunk-based transcription
        const response = await deepgram.listen.prerecorded.transcribeFile(source, {
          smart_format: true,
          model: model,
          language: 'en-US',
          utterances: true  // This enables speaker segmentation
        });

        return { statusCode: 200, body: JSON.stringify(response) };
      } else if (action === 'stream') {
        // For real-time streaming (if needed in the future)
        // Note: This part would need to be handled differently, possibly with WebSockets
        return { statusCode: 200, body: JSON.stringify({ message: 'Streaming not implemented in this endpoint' }) };
      } else {
        return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported action' }) };
      }
    } catch (error) {
      console.error('Error handling multipart data:', error.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error', details: error.message }) };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported Content-Type' }) };
};
