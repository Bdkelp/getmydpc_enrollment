/**
 * Finalize Registration Route - Payment-First Flow
 * 
 * This endpoint creates member records ONLY after payment succeeds.
 * Called by EPX Hosted Checkout callback with payment confirmation.
 * 
 * Flow:
 * 1. Receive registration data + payment token (BRIC) from EPX callback
 * 2. Create member in database
 * 3. Create subscription record
 * 4. Create EPX recurring billing subscription
 * 5. Calculate and create commission
 * 6. Clean up temp storage
 */

import { Router } from "express";
import { storage } from "../storage";
import { supabase } from "../lib/supabaseClient";
import { calculateMembershipStartDate, isMembershipActive, daysUntilMembershipStarts } from "../utils/membership-dates";
import { calculateCommission } from "../commissionCalculator";
import { EPXServerPostService } from "../services/epx-payment-service";

const router = Router();

interface FinalizeRegistrationRequest {
  registrationData: {
    // Member info
    email: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    ssn?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    employerName?: string;
    dateOfHire?: string;
    memberType?: string;
    planStartDate?: string;
    // Plan & Payment
    planId?: number;
    coverageType?: string;
    totalMonthlyPrice?: number;
    addRxValet?: boolean;
    // Agent info
    agentNumber?: string;
    enrolledByAgentId?: string;
  };
  // Payment info from EPX
  paymentToken: string; // BRIC token
  paymentMethodType: string; // CreditCard or BankAccount
  transactionId: string; // EPX transaction ID
  tempRegistrationId?: string; // Optional: for cleanup
}

router.post("/api/finalize-registration", async (req, res) => {
  try {
    console.log("[Finalize Registration] Request received");
    const { registrationData, paymentToken, paymentMethodType, transactionId, tempRegistrationId } = req.body as FinalizeRegistrationRequest;

    // Validate required fields
    if (!registrationData || !paymentToken || !transactionId) {
      console.error("[Finalize Registration] Missing required fields");
      return res.status(400).json({
        error: "Missing required fields",
        required: ["registrationData", "paymentToken", "transactionId"]
      });
    }

    const {
      email, firstName, lastName, middleName, phone, dateOfBirth, gender, ssn,
      address, address2, city, state, zipCode, emergencyContactName, emergencyContactPhone,
      employerName, dateOfHire, memberType, planStartDate,
      planId, coverageType, totalMonthlyPrice, addRxValet,
      agentNumber, enrolledByAgentId
    } = registrationData;

    // Validate core member fields
    const missingFields = [];
    if (!email) missingFields.push("email");
    if (!firstName) missingFields.push("firstName");
    if (!lastName) missingFields.push("lastName");

    if (missingFields.length > 0) {
      console.error("[Finalize Registration] Missing member fields:", missingFields);
      return res.status(400).json({
        error: "Missing required member fields",
        missing: missingFields
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("[Finalize Registration] Invalid email format:", email);
      return res.status(400).json({
        error: "Invalid email format"
      });
    }

    // Check if member already exists
    const normalizedEmail = email.trim().toLowerCase();
    console.log("[Finalize Registration] Checking for existing member with email:", normalizedEmail);
    const existingMember = await storage.getMemberByEmail(normalizedEmail);
    
    if (existingMember) {
      console.error("[Finalize Registration] Member already exists:", existingMember.id, existingMember.customerNumber);
      return res.status(400).json({
        error: "Member already exists with this email"
      });
    }

    // Calculate membership dates
    const enrollmentDate = new Date();
    const firstPaymentDate = enrollmentDate; // Same as enrollment date
    const membershipStartDate = calculateMembershipStartDate(enrollmentDate);

    console.log("[Finalize Registration] Date calculations:", {
      enrollmentDate: enrollmentDate.toISOString(),
      firstPaymentDate: firstPaymentDate.toISOString(),
      membershipStartDate: membershipStartDate.toISOString(),
      enrollDay: enrollmentDate.getDate(),
      membershipDay: membershipStartDate.getDate(),
      daysUntilActive: daysUntilMembershipStarts(enrollmentDate, membershipStartDate)
    });

    // Determine initial status
    const initialStatus = isMembershipActive(membershipStartDate) ? 'active' : 'pending_activation';
    console.log("[Finalize Registration] Initial member status:", initialStatus);

    // === CREATE MEMBER IN DATABASE ===
    console.log("[Finalize Registration] Creating member...");
    const member = await storage.createMember({
      email: normalizedEmail,
      firstName: firstName?.trim() || "",
      lastName: lastName?.trim() || "",
      middleName: middleName?.trim() || null,
      phone: phone || null,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      ssn: ssn || null,
      address: address?.trim() || null,
      address2: address2?.trim() || null,
      city: city?.trim() || null,
      state: state || null,
      zipCode: zipCode || null,
      emergencyContactName: emergencyContactName?.trim() || null,
      emergencyContactPhone: emergencyContactPhone || null,
      employerName: employerName?.trim() || null,
      dateOfHire: dateOfHire || null,
      memberType: memberType || "member-only",
      planStartDate: planStartDate || null,
      agentNumber: agentNumber || null,
      enrolledByAgentId: enrolledByAgentId || null,
      enrollmentDate: enrollmentDate,
      firstPaymentDate: firstPaymentDate,
      membershipStartDate: membershipStartDate,
      paymentToken: paymentToken, // Store BRIC token
      paymentMethodType: paymentMethodType || "CreditCard",
      isActive: initialStatus === 'active',
      status: initialStatus,
      planId: planId ? parseInt(String(planId)) : null,
      coverageType: coverageType || memberType || "member-only",
      totalMonthlyPrice: totalMonthlyPrice ? parseFloat(String(totalMonthlyPrice)) : null,
      addRxValet: addRxValet || false,
    });

    if (!member) {
      console.error("[Finalize Registration] Member creation failed");
      throw new Error("Member creation failed");
    }

    console.log("[Finalize Registration] ✅ Member created:", member.id, member.customerNumber);

    // === CREATE SUBSCRIPTION ===
    let subscriptionId: number | null = null;
    let epxSubscriptionId: string | null = null;

    if (planId && totalMonthlyPrice) {
      try {
        console.log("[Finalize Registration] Creating subscription...");

        const subscriptionData = {
          member_id: member.id,
          plan_id: parseInt(String(planId)),
          status: "active", // Payment already succeeded
          amount: totalMonthlyPrice,
          start_date: new Date().toISOString(),
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };

        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .insert(subscriptionData)
          .select()
          .single();

        if (subscriptionError) {
          console.error("[Finalize Registration] Subscription creation failed:", subscriptionError);
          throw new Error(`Subscription creation failed: ${subscriptionError.message}`);
        }

        subscriptionId = subscription.id;
        console.log("[Finalize Registration] ✅ Subscription created:", subscriptionId);

        // === CREATE EPX RECURRING SUBSCRIPTION ===
        try {
          console.log("[Finalize Registration] Creating EPX recurring subscription...");
          
          const epxService = new EPXServerPostService();
          const epxResult = await epxService.createSubscription({
            MerchantAccountCode: "DPCPRIMARY", // TODO: Get from env or config
            Payment: {
              PaymentMethodType: paymentMethodType as "CreditCard" | "BankAccount" | "PreviousPayment",
              PreviousPayment: {
                GUID: paymentToken, // Use BRIC token from Hosted Checkout
                Amount: totalMonthlyPrice,
              }
            },
            BillingSchedule: {
              Frequency: "Monthly",
              StartDate: firstPaymentDate.toISOString().split('T')[0], // YYYY-MM-DD
              FailureOption: "Skip", // Skip failed payments, don't cancel
              RetryAttempts: 3, // Retry failed payments 3 times
            },
            SubscriptionName: `DPC - ${member.customerNumber}`,
            CustomerEmail: normalizedEmail,
            CustomerName: `${firstName} ${lastName}`,
            CustomerAccountCode: member.customerNumber,
          });

          if (epxResult.success && epxResult.data?.SubscriptionID) {
            epxSubscriptionId = epxResult.data.SubscriptionID;
            console.log("[Finalize Registration] ✅ EPX subscription created:", epxSubscriptionId);

            // Update subscription with EPX ID
            await supabase
              .from('subscriptions')
              .update({ epx_subscription_id: epxSubscriptionId })
              .eq('id', subscriptionId);

            console.log("[Finalize Registration] ✅ Subscription updated with EPX ID");
          } else {
            console.error("[Finalize Registration] ⚠️  EPX subscription creation failed:", epxResult.error);
            
            // FLAG FOR ADMIN REVIEW
            await supabase
              .from('admin_notifications')
              .insert({
                type: 'epx_subscription_failed',
                member_id: member.id,
                subscription_id: subscriptionId,
                error_message: epxResult.error || "Unknown error creating EPX subscription",
                created_at: new Date().toISOString(),
                resolved: false
              });

            console.log("[Finalize Registration] ⚠️  Admin notification created for failed EPX subscription");
          }
        } catch (epxError: any) {
          console.error("[Finalize Registration] ⚠️  EPX subscription creation error:", epxError);
          
          // FLAG FOR ADMIN REVIEW
          await supabase
            .from('admin_notifications')
            .insert({
              type: 'epx_subscription_failed',
              member_id: member.id,
              subscription_id: subscriptionId,
              error_message: epxError.message || "Unknown error creating EPX subscription",
              created_at: new Date().toISOString(),
              resolved: false
            });

          console.log("[Finalize Registration] ⚠️  Admin notification created for EPX error");
        }
      } catch (subError: any) {
        console.error("[Finalize Registration] Error creating subscription:", subError);
        // Don't throw - continue with commission creation
      }
    } else {
      console.warn("[Finalize Registration] ⚠️  Subscription NOT created - missing planId or totalMonthlyPrice");
    }

    // === CREATE COMMISSION ===
    if (agentNumber && enrolledByAgentId && (coverageType || memberType)) {
      try {
        console.log("[Finalize Registration] Creating commission for agent:", agentNumber);

        // Look up agent
        const { data: agentUser, error: agentError } = await supabase
          .from('users')
          .select('*')
          .eq('id', enrolledByAgentId)
          .single();

        if (agentError || !agentUser) {
          console.error("[Finalize Registration] ❌ Agent not found:", enrolledByAgentId, agentError);
        } else {
          console.log("[Finalize Registration] ✅ Agent found:", agentUser.id, agentUser.email);

          let planName = 'MyPremierPlan Base';
          let planTier = 'Base';

          // Get plan details if available
          if (planId) {
            const { data: planData } = await supabase
              .from('plans')
              .select('*')
              .eq('id', planId)
              .single();

            if (planData) {
              planName = planData.name;
              if (planName.toLowerCase().includes('signature')) {
                planTier = 'Signature';
              } else if (planName.toLowerCase().includes('executive')) {
                planTier = 'Executive';
              }
            }
          }

          // Calculate commission using business rules
          const finalCoverageType = coverageType || memberType || "member-only";
          const commissionAmount = calculateCommission(planTier, finalCoverageType, finalCoverageType.toLowerCase().includes('family'));

          console.log("[Finalize Registration] Commission calculation:", {
            planName,
            planTier,
            coverageType: finalCoverageType,
            commissionAmount
          });

          // Create commission record
          const { data: commission, error: commissionError } = await supabase
            .from('agent_commissions')
            .insert({
              agent_id: enrolledByAgentId,
              agent_number: agentNumber,
              member_id: member.id,
              customer_number: member.customerNumber,
              member_name: `${member.firstName} ${member.lastName}`,
              plan_name: planName,
              coverage_type: finalCoverageType,
              monthly_premium: totalMonthlyPrice || 0,
              commission_amount: commissionAmount,
              status: 'pending',
              payment_status: 'pending',
              subscription_id: subscriptionId,
              transaction_id: transactionId,
              enrollment_date: enrollmentDate.toISOString(),
              commission_period: new Date().toISOString().slice(0, 7), // YYYY-MM format
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (commissionError) {
            console.error("[Finalize Registration] Commission creation failed:", commissionError);
          } else {
            console.log("[Finalize Registration] ✅ Commission created:", commission.id);
          }
        }
      } catch (commError: any) {
        console.error("[Finalize Registration] Error creating commission:", commError);
        // Don't throw - member and subscription already created
      }
    }

    // === CLEANUP TEMP STORAGE ===
    if (tempRegistrationId) {
      try {
        await supabase
          .from('temp_registrations')
          .delete()
          .eq('id', tempRegistrationId);
        
        console.log("[Finalize Registration] ✅ Temp registration cleaned up:", tempRegistrationId);
      } catch (cleanupError: any) {
        console.error("[Finalize Registration] ⚠️  Temp registration cleanup failed:", cleanupError);
        // Don't throw - this is just cleanup
      }
    }

    // === SUCCESS RESPONSE ===
    console.log("[Finalize Registration] ✅ Registration finalized successfully");
    return res.status(201).json({
      success: true,
      member: {
        id: member.id,
        customerNumber: member.customerNumber,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        status: member.status,
        enrollmentDate: member.enrollmentDate,
        membershipStartDate: member.membershipStartDate,
      },
      subscription: {
        id: subscriptionId,
        epxSubscriptionId: epxSubscriptionId,
        status: 'active',
      },
      message: epxSubscriptionId 
        ? "Registration completed successfully with recurring billing" 
        : "Registration completed successfully - recurring billing setup pending admin review"
    });

  } catch (error: any) {
    console.error("[Finalize Registration] ❌ Error:", error);
    return res.status(500).json({
      error: "Registration finalization failed",
      message: error.message
    });
  }
});

export default router;
