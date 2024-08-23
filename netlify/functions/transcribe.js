const axios = require('axios');
const FormData = require('form-data');

exports.handler = async function(event) {
    const formData = new FormData();
    
    // Parse the multipart form data
    const parts = event.body.split('\r\n');
    const fileContent = parts[parts.length - 2];
    
    formData.append('file', Buffer.from(fileContent, 'binary'), {
        filename: 'audio.webm',
        contentType: 'audio/webm',
    });
    formData.append('model', 'whisper-1');
    
    // Extract language from the form data
    const languagePart = parts.find(part => part.includes('name="language"'));
    const language = languagePart ? languagePart.split('\r\n')[2] : 'en';
    formData.append('language', language);
    
    try {
        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                ...formData.getHeaders()
            }
        });
        return {
            statusCode: 200,
            body: JSON.stringify({ transcription: response.data.text })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An error occurred while transcribing' })
        };
    }
};
