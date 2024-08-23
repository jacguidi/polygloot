const axios = require('axios');

exports.handler = async function(event) {
    const { text, targetLanguage } = JSON.parse(event.body);
    
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                {"role": "system", "content": `You are a translator. Translate the following text to ${targetLanguage}.`},
                {"role": "user", "content": text}
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        return {
            statusCode: 200,
            body: JSON.stringify({ translation: response.data.choices[0].message.content })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An error occurred while translating' })
        };
    }
};
