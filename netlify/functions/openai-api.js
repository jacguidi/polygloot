const axios = require('axios');

exports.handler = async function(event) {
    const { text, targetLanguage } = JSON.parse(event.body);

    const response = await axios.post('https://api.openai.com/v1/translations', {
        text: text,
        target_language: targetLanguage
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    return {
        statusCode: 200,
        body: JSON.stringify({ translation: response.data.translation })
    };
};
