// api/openai.js
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const ASSISTANT_ID = process.env.ASSISTANT_ID;
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

let threadId = null;

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message } = req.body;

    try {
        // Create a thread if it doesn't exist
        if (!threadId) {
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
        }

        // Add the user's message to the thread
        await openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: message
        });

        // Run the assistant
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: ASSISTANT_ID
        });

        // Wait for the assistant to complete with timeout
        let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        let attempts = 0;
        const maxAttempts = 30;

        while (runStatus.status !== 'completed' && runStatus.status !== 'failed' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('Assistant response timeout');
        }

        if (runStatus.status === 'failed') {
            throw new Error('Assistant run failed');
        }

        // Get the assistant's response
        const messages = await openai.beta.threads.messages.list(threadId);
        const assistantResponse = messages.data[0].content[0].text.value;

        res.status(200).json({ message: assistantResponse });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message || 'Failed to get assistant response' });
    }
}
