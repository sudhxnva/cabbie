import axios from 'axios';

export async function setAlexaReminder(
    apiAccessToken: string,
    apiEndpoint: string,
    message: string
) {
    const endpoint = apiEndpoint.replace(/\/$/, '');
    const url = `${endpoint}/v1/alerts/reminders`;

    // Trigger IMMEDIATELY (scheduled for 5s from now)
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
        console.log(`[ALEXA_SERVICE] Triggering DYNAMIC reminder: "${message}"`);
        const response = await axios.post(url, reminderRequest, {
            headers: {
                Authorization: `Bearer ${apiAccessToken}`,
                'Content-Type': 'application/json',
            },
        });
        console.log('[ALEXA_SERVICE] Event sent to Alexa successfully.');
        return response.data;
    } catch (error: any) {
        if (error.response?.status === 401) {
            console.error('[ALEXA_SERVICE] TOKEN EXPIRED! The search took too long (>60s).');
        } else {
            console.error('[ALEXA_SERVICE] Failed to set reminder:', error.response?.data || error.message);
        }
        throw error;
    }
}
