const turnstileVerifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileResponse {
  success?: boolean;
}

export async function verifyTurnstile(
  token: string,
  secret: string,
  clientIp: string,
): Promise<boolean> {
  if (secret.length === 0) {
    console.warn('TURNSTILE_SECRET is empty; bypassing Turnstile verification for development.');
    return true;
  }
  if (token.length === 0) {
    return false;
  }
  try {
    const response = await fetch(turnstileVerifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: clientIp,
      }),
    });
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as TurnstileResponse;
    return result.success === true;
  } catch {
    return false;
  }
}
