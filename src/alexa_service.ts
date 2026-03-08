import axios from 'axios';

export async function setAlexaReminder(
    apiAccessToken: string,
    apiEndpoint: string,
    message: string
) {
    // Clean the endpoint (Alexa provides it with trailing slashes sometimes)
    const endpoint = apiEndpoint.replace(/\/$/, '');
    const url = `${endpoint}/v1/alerts/reminders`;

    // Set reminder for 5 seconds from now to be safe
    const scheduledTime = new Date(Date.now() + 5000).toISOString().split('.')[0] + 'Z';

    const reminderRequest = {
        displayInformation: {
            content: [
                {
                    locale: 'en-US',
                    text: message,
                },
            ],
        },
        trigger: {
            type: 'SCHEDULED_ABSOLUTE',
            scheduledTime: scheduledTime,
        },
        alertInfo: {
            spokenInfo: {
                content: [
                    {
                        locale: 'en-US',
                        text: message,
                    },
                ],
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
