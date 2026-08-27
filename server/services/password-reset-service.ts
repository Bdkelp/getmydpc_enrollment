import { sendPasswordRecoveryEmail } from "../email";
import { supabaseAdmin } from "../lib/supabaseClient";

export type PasswordResetDeliveryResult =
  | { status: "sent" }
  | { status: "not_found" }
  | { status: "generation_failed"; message: string }
  | { status: "delivery_failed" };

export async function deliverPasswordReset(
  email: string,
  firstName?: string | null,
): Promise<PasswordResetDeliveryResult> {
  const redirectTo = `${process.env.FRONTEND_URL || "https://enrollment.getmydpc.com"}/reset-password`;
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: email.trim().toLowerCase(),
    options: { redirectTo },
  });

  if (error) {
    const isNotFound = /not found|does not exist/i.test(error.message);
    console.error(
      "[Password Reset] Failed to generate recovery link:",
      error.message,
    );
    return isNotFound
      ? { status: "not_found" }
      : { status: "generation_failed", message: error.message };
  }

  if (!data?.properties?.action_link) {
    console.error("[Password Reset] Supabase returned no recovery action link");
    return {
      status: "generation_failed",
      message: "Recovery link was not generated",
    };
  }

  const delivered = await sendPasswordRecoveryEmail({
    email,
    firstName: firstName || "there",
    resetUrl: data.properties.action_link,
  });

  return delivered ? { status: "sent" } : { status: "delivery_failed" };
}
