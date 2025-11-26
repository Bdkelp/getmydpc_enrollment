import axios from 'axios';

const RECAPTCHA_VERIFICATION_URL = 'https://www.google.com/recaptcha/api/siteverify';
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '';
const RECAPTCHA_SCORE_THRESHOLD = parseFloat(process.env.RECAPTCHA_SCORE_THRESHOLD || '0.5');

export interface RecaptchaResult {
  success: boolean;
  score: number;
  action: string;
  threshold: number;
  error?: string;
}

export async function verifyRecaptcha(token: string, action: string = 'hosted_checkout'): Promise<RecaptchaResult> {
  if (!RECAPTCHA_SECRET_KEY) {
    console.warn('[reCAPTCHA] Secret key missing - skipping verification (fail open).');
    return { success: true, score: 1.0, action, threshold: RECAPTCHA_SCORE_THRESHOLD };
  }
  if (!token) {
    return { success: false, score: 0, action, threshold: RECAPTCHA_SCORE_THRESHOLD, error: 'missing-token' };
  }
  try {
    const response = await axios.post(RECAPTCHA_VERIFICATION_URL, null, {
      params: { secret: RECAPTCHA_SECRET_KEY, response: token },
      timeout: 5000
    });
    const { success, score, action: returnedAction } = response.data;
    return {
      success: success === true && score >= RECAPTCHA_SCORE_THRESHOLD,
      score: score || 0,
      action: returnedAction || action,
      threshold: RECAPTCHA_SCORE_THRESHOLD
    };
  } catch (error: any) {
    console.error('[reCAPTCHA] Verification error:', error?.message || error);
    // Fail open (treat as medium score) but mark success false so caller can decide
    return { success: false, score: 0.0, action, threshold: RECAPTCHA_SCORE_THRESHOLD, error: 'verification-error' };
  }
}

export function isRecaptchaEnabled(): boolean {
  return !!RECAPTCHA_SECRET_KEY;
}
