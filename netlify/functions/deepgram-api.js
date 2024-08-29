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

      // Extract the file type (mimetype) from the file part, if available
      const fileMimeType = parts.find(part => part.name === 'file')?.type || 'audio/wav'; // Default to wav if not specified

      console.log('Audio file present:', !!audioFile);
      console.log('Action:', action);
      console.log('Model:', model);
      console.log('File type detected:', fileMimeType);
      console.log('Buffer size:', audioFile?.length);

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
        mimetype: fileMimeType // Use dynamically detected mimetype
      };

      if (action === 'transcribe') {
        // Use Deepgram SDK's pre-recorded transcription feature
        const response = await deepgram.transcription.preRecorded(
          {
            buffer: source.buffer,
            mimetype: source.mimetype
          },
          {
            smart_format: true,
            model: model,
            language: 'en-US'
          }
        );

        console.log('Received response from Deepgram:', response);

        return {
          statusCode: 200,
          body: JSON.stringify(response)
        };
      } else if (action === 'stream') {
        // For real-time transcription, use Deepgram's streaming capabilities
        const connection = await deepgram.transcription.live({
          model: model,
          language: 'en-US',
          smart_format: true
        });

        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          console.log('Live transcript:', data.channel.alternatives[0].transcript);
        });

        connection.on(LiveTranscriptionEvents.Error, (err) => {
          console.error('Error:', err);
        });

        fetch('http://your-audio-stream-url')
          .then((r) => r.body)
          .then((res) => {
            res.on('readable', () => {
              connection.send(res.read());
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
