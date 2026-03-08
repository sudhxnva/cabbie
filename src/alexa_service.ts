import axios from 'axios';

interface AlexaTokens {
    accessToken: string;
    apiEndpoint: string;
    refreshToken?: string;
}

// helper that exchanges a refresh token for a fresh access token.
export async function refreshAlexaAccessToken(
    refreshToken: string,
): Promise<string> {
    // client id/secret are supplied via env vars that the Alexa skill
    // should have configured during account linking.  in a prod system you
    // would never hard‑code them or ship them with a client binary.
    const CLIENT_ID = process.env.ALEXA_CLIENT_ID;
    const CLIENT_SECRET = process.env.ALEXA_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('missing Alexa client credentials');
    }

    const tokenUrl = 'https://api.amazon.com/auth/o2/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const resp = await axios.post(tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return resp.data.access_token;
}

async function doSetReminder(
    tokens: AlexaTokens,
    message: string,
): Promise<any> {
    const endpoint = tokens.apiEndpoint.replace(/\/$/, '');
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

    console.log(`[ALEXA_SERVICE] Triggering DYNAMIC reminder: "${message}"`);
    const response = await axios.post(url, reminderRequest, {
        headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
        },
    });
    console.log('[ALEXA_SERVICE] Event sent to Alexa successfully.');
    return response.data;
}

/**
 * high–level helper that will refresh the token automatically if the initial
 * call returns 401 and a refresh token is available. callers can invoke this
 * multiple times during a long orchestration; the function always makes sure
 * the credentials passed to Amazon are not stale.
 */
export async function setAlexaReminder(
    tokens: AlexaTokens,
    message: string,
) {
    try {
        return await doSetReminder(tokens, message);
    } catch (error: any) {
        if (error.response?.status === 401 && tokens.refreshToken) {
            console.warn('[ALEXA_SERVICE] access token expired, exchanging refresh token');
            tokens.accessToken = await refreshAlexaAccessToken(tokens.refreshToken);
            // try again once
            return await doSetReminder(tokens, message);
        }
        if (error.response?.status === 401) {
            console.error('[ALEXA_SERVICE] TOKEN EXPIRED! The search took too long (>60s)');
        } else {
            console.error('[ALEXA_SERVICE] Failed to set reminder:',
                error.response?.data || error.message);
        }
        throw error;
    }
}
