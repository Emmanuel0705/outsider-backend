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
    const data = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      react,
    } as CreateEmailOptions);

    console.log("✅ Email sent successfully:", data);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
}
