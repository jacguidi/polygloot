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
    
    try {
        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                ...formData.getHeaders()
            }
        });
        return {
            statusCode: 200,
            body: JSON.stringify({ language: response.data.language })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An error occurred while detecting language' })
        };
    }
};
