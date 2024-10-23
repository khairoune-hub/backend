// api/chat.js
import OpenAI from 'openai';

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

let threadId = null;

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Ensure request is POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Handle new thread creation
        if (req.body.action === 'new_thread') {
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
            return res.status(200).json({ 
                success: true, 
                threadId: thread.id,
                message: 'New conversation started' 
            });
        }

        // Handle message sending
        if (req.body.message) {
            // Create thread if it doesn't exist
            if (!threadId) {
                const thread = await openai.beta.threads.create();
                threadId = thread.id;
            }

            // Add message to thread
            await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: req.body.message
            });

            // Run assistant
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: process.env.ASSISTANT_ID
            });

            // Check run status
            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            let attempts = 0;
            const maxAttempts = 30;

            while (runStatus.status !== 'completed' && runStatus.status !== 'failed' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                attempts++;
            }

            if (runStatus.status === 'failed') {
                throw new Error('Assistant run failed');
            }

            // Get response
            const messages = await openai.beta.threads.messages.list(threadId);
            const assistantResponse = messages.data[0].content[0].text.value;

            return res.status(200).json({ 
                success: true, 
                message: assistantResponse 
            });
        }

        return res.status(400).json({ error: 'Invalid request' });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || 'An error occurred' 
        });
    }
}
