import axios from 'axios';
import { URLSearchParams } from 'url';
import 'dotenv/config';

const CLIENT_ID = process.env.ALEXA_CLIENT_ID;
const CLIENT_SECRET = process.env.ALEXA_CLIENT_SECRET;

async function getFreshAccessToken() {
    console.log('[ALEXA_SERVICE] Fetching fresh out-of-session access token...');

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('ALEXA_CLIENT_ID or ALEXA_CLIENT_SECRET not defined in .env');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('scope', 'alexa::alerts:reminders');

    try {
        const response = await axios.post('https://api.amazon.com/auth/o2/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('[ALEXA_SERVICE] Fresh token obtained.');
        return response.data.access_token;
    } catch (error: any) {
        console.error('[ALEXA_SERVICE] Failed to fetch access token:', error.response?.data || error.message);
        throw error;
    }
}

export async function setAlexaReminder(
    _apiAccessToken: string, // Ignored, we'll fetch a fresh one
    apiEndpoint: string,
    message: string
) {
    // Always get a fresh token because the one from the request expires in 60s
    const apiAccessToken = await getFreshAccessToken();

    const endpoint = apiEndpoint.replace(/\/$/, '');
    const url = `${endpoint}/v1/alerts/reminders`;

    // Set reminder for 5 seconds from now
    const scheduledTime = new Date(Date.now() + 5000).toISOString().split('.')[0] + 'Z';

    const reminderRequest = {
        displayInformation: {
            content: [{ locale: 'en-US', text: message }],
        },
        trigger: {
            type: 'SCHEDULED_ABSOLUTE',
            scheduledTime: scheduledTime,
        },
        alertInfo: {
            spokenInfo: {
                content: [{ locale: 'en-US', text: message }],
            },
        },
        pushNotification: {
            status: 'ENABLED',
        },
    };

    try {
        console.log(`[ALEXA_SERVICE] Setting reminder: "${message}"`);
        const response = await axios.post(url, reminderRequest, {
            headers: {
                Authorization: `Bearer ${apiAccessToken}`,
                'Content-Type': 'application/json',
            },
        });
        console.log('[ALEXA_SERVICE] Reminder set successfully:', response.data.alertToken);
        return response.data;
    } catch (error: any) {
        console.error('[ALEXA_SERVICE] Failed to set reminder:', error.response?.data || error.message);
        throw error;
    }
}
