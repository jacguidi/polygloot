import { createClient } from '@deepgram/sdk';
import multipart from 'parse-multipart-data';
import { Buffer } from 'buffer';

exports.handler = async function (event) {
  console.log('Received event:', JSON.stringify(event, null, 2));

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Use Netlify environment variable for the Deepgram API key
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    console.error('Deepgram API key is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
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
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing audio file or action' }) };
      }

      console.log('Audio file size:', audioFile.length);
      console.log('Audio file type:', fileMimeType);

      const source = {
        buffer: audioFile,
        mimetype: fileMimeType
      };

      if (action === 'transcribe') {
        try {
          const response = await deepgram.transcription.preRecorded(source, {
            smart_format: true,
            model: model,
            language: 'en-US'
          });

          console.log('Deepgram response:', JSON.stringify(response, null, 2));

          if (response && response.results && response.results.channels && response.results.channels[0].alternatives) {
            const transcript = response.results.channels[0].alternatives[0].transcript;
            return { 
              statusCode: 200, 
              body: JSON.stringify({ transcript: transcript }) 
            };
          } else {
            throw new Error('Unexpected response structure from Deepgram API');
          }
        } catch (deepgramError) {
          console.error('Deepgram API error:', deepgramError);
          return { 
            statusCode: 500, 
            body: JSON.stringify({ 
              error: 'Deepgram API error', 
              details: deepgramError.message
            }) 
          };
        }
      } else {
        return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported action' }) };
      }
    } catch (error) {
      console.error('Error processing request:', error);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error', details: error.message }) };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported Content-Type' }) };
};
