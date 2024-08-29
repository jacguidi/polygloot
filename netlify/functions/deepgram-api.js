const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const multipart = require('parse-multipart-data');
const { Buffer } = require('buffer');
const fetch = require('cross-fetch'); // For fetching the audio stream
require('dotenv').config(); // Load environment variables from .env file

exports.handler = async function (event) {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Validate HTTP method
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Check for Deepgram API key
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    console.error('Deepgram API key is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Deepgram API key is not set' }) };
  }

  // Initialize Deepgram client
  const deepgram = createClient(deepgramApiKey);

  // Check for content-type header
  if (event.headers['content-type'] && event.headers['content-type'].includes('multipart/form-data')) {
    try {
      console.log('Parsing multipart form data');

      // Decode the base64 body and parse multipart form data
      const bodyBuffer = Buffer.from(event.body, 'base64');
      const boundary = multipart.getBoundary(event.headers['content-type']);
      const parts = multipart.parse(bodyBuffer, boundary);

      console.log('Parsed parts:', parts.map(part => ({ name: part.name, dataLength: part.data ? part.data.length : 0 })));

      // Extract audio file, action, and model from parts
      const audioFile = parts.find(part => part.name === 'file')?.data;
      const action = parts.find(part => part.name === 'action')?.data.toString();
      const model = parts.find(part => part.name === 'model')?.data.toString() || 'nova-2';

      console.log('Audio file present:', !!audioFile);
      console.log('Action:', action);
      console.log('Model:', model);

      // Validate presence of required data
      if (!audioFile || !action) {
        console.error('Missing action or audio file');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing action or audio file' })
        };
      }

      console.log('Sending request to Deepgram');

      // Prepare the audio source for Deepgram API
      const source = {
        buffer: audioFile,
        mimetype: 'audio/webm'  // Adjust mimetype based on your actual file type
      };

      if (action === 'transcribe') {
        // Use Deepgram SDK's pre-recorded transcription feature
        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
          source.buffer,
          {
            model: model,
          }
        );

        if (error) {
          console.error('Error from Deepgram:', error);
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Transcription failed', details: error })
          };
        }

        console.log('Received response from Deepgram:', result);

        return {
          statusCode: 200,
          body: JSON.stringify(result)
        };
      } else if (action === 'stream') {
        // For real-time transcription, use Deepgram's streaming capabilities
        const dgConnection = deepgram.listen.live({
          model: model,
          language: 'en-US',
          smart_format: true
        });

        dgConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
          console.log('Live transcript:', data);
        });

        dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
          console.error('Error:', err);
        });

        fetch('http://your-audio-stream-url')
          .then((r) => r.body)
          .then((res) => {
            res.on('readable', () => {
              dgConnection.send(res.read());
            });
          });

        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Streaming transcription started' })
        };
      } else {
        console.error('Unsupported action');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Unsupported action' })
        };
      }
    } catch (error) {
      console.error('Error handling multipart data:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
      };
    }
  }

  console.error('Unsupported Content-Type');
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unsupported Content-Type' })
  };
};
