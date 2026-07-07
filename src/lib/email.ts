import { Resend, CreateEmailOptions } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Generate a 6-digit verification code
 */
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send email with verification code
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
  react,
}: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  react?: React.ReactNode;
}): Promise<void> {
  if (!process.env.RESEND_FROM || !process.env.RESEND_API_KEY) {
    console.warn(
      "Resend credentials not configured. Email sending is disabled. Set RESEND_FROM and RESEND_API_KEY environment variables."
    );
    // In development, log the email instead of sending
    console.log("📧 Email would be sent:", { to, subject, text, html });
    return;
  }

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      react,
    } as CreateEmailOptions);

    // Resend returns { data, error } instead of throwing on non-2xx from their
    // API (e.g. unverified `from` domain, invalid recipient). Turn that into a
    // real throw so callers can surface a proper failure instead of silently
    // logging "success" while nothing was delivered.
    if (result && "error" in result && result.error) {
      const message =
        typeof result.error === "object" && result.error && "message" in result.error
          ? (result.error as { message?: string }).message
          : JSON.stringify(result.error);
      throw new Error(`Resend send failed: ${message}`);
    }

    console.log("✅ Email sent successfully:", result?.data ?? result);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
}
