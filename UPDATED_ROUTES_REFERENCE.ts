// ============================================================
// UPDATED REGISTRATION & ENROLLMENT ROUTES
// ============================================================
// These routes create MEMBERS (not users with auth)
// Members do NOT have Supabase Auth accounts
// Only agents/admins can log in
// ============================================================

/**
 * PUBLIC Member Registration Endpoint
 * Creates a new member WITHOUT Supabase Auth
 * Customer number auto-generates via database function
 */
app.post("/api/registration", async (req: any, res: any) => {
  console.log("[Registration] Member registration attempt");
  
  // CORS headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://getmydpcenrollment-production.up.railway.app',
    'https://enrollment.getmydpc.com',
    'https://shimmering-nourishment.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000'
  ];

  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  try {
    const {
      email,
      firstName,
      lastName,
      middleName,
      phone,
      dateOfBirth,
      gender,
      ssn,
      address,
      address2,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      employerName,
      divisionName,
      dateOfHire,
      memberType,
      planStartDate,
      planId,
      agentNumber,
      familyMembers,
      termsAccepted,
      privacyNoticeAcknowledged,
    } = req.body;

    // Validation
    const missingFields = [];
    if (!email) missingFields.push("email");
    if (!firstName) missingFields.push("firstName");
    if (!lastName) missingFields.push("lastName");
    if (!termsAccepted) missingFields.push("termsAccepted");
    if (!privacyNoticeAcknowledged) missingFields.push("privacyNoticeAcknowledged");

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Missing required fields",
        missing: missingFields
      });
    }

    // Check if member already exists
    const existingMember = await storage.getMemberByEmail(email.trim().toLowerCase());
    if (existingMember) {
      return res.status(400).json({
        error: "A member with this email already exists",
        customerNumber: existingMember.customerNumber
      });
    }

    // Create member (NOT user - no Supabase Auth)
    const newMember = await storage.createMember({
      firstName,
      lastName,
      middleName,
      email: email.trim().toLowerCase(),
      phone,
      dateOfBirth, // Will be formatted to MMDDYYYY by storage
      gender, // Will be formatted to single char by storage
      ssn, // Will be encrypted by storage
      address,
      address2,
      city,
      state, // Will be formatted to 2 chars uppercase by storage
      zipCode, // Will be formatted to 5 digits by storage
      emergencyContactName,
      emergencyContactPhone,
      employerName,
      divisionName,
      memberType: memberType || 'employee',
      dateOfHire,
      planStartDate,
      agentNumber,
      isActive: true,
      status: 'pending', // Pending until subscription created
    });

    console.log("[Registration] Member created:", newMember.customerNumber);

    // Create subscription if planId provided
    if (planId) {
      try {
        const plan = await storage.getPlan(planId);
        if (plan) {
          const subscription = await storage.createSubscription({
            memberId: newMember.id,
            planId: plan.id,
            status: 'pending',
            amount: plan.price,
            startDate: planStartDate ? new Date(planStartDate) : new Date(),
          });

          console.log("[Registration] Subscription created for member:", newMember.customerNumber);

          // Update member status to active
          await storage.updateMember(newMember.id, { status: 'active' });
        }
      } catch (subError) {
        console.error("[Registration] Error creating subscription:", subError);
        // Continue anyway - member is created
      }
    }

    // Add family members if provided
    if (familyMembers && Array.isArray(familyMembers) && familyMembers.length > 0) {
      try {
        for (const familyMember of familyMembers) {
          await storage.addFamilyMember({
            primaryMemberId: newMember.id,
            firstName: familyMember.firstName,
            lastName: familyMember.lastName,
            middleName: familyMember.middleName,
            dateOfBirth: familyMember.dateOfBirth,
            gender: familyMember.gender,
            ssn: familyMember.ssn,
            relationship: familyMember.relationship,
            memberType: familyMember.memberType || 'dependent',
            isActive: true,
          });
        }
        console.log("[Registration] Added", familyMembers.length, "family members");
      } catch (famError) {
        console.error("[Registration] Error adding family members:", famError);
        // Continue anyway - primary member is created
      }
    }

    res.status(201).json({
      success: true,
      message: "Member registration successful",
      member: {
        id: newMember.id,
        customerNumber: newMember.customerNumber,
        email: newMember.email,
        firstName: newMember.firstName,
        lastName: newMember.lastName,
        status: newMember.status,
      },
      note: "Members cannot log into this system. Please contact your agent for assistance."
    });

  } catch (error: any) {
    console.error("[Registration] Error:", error);
    res.status(500).json({
      error: "Registration failed",
      details: process.env.NODE_ENV === "development" ? error.message : "Internal error"
    });
  }
});

/**
 * AGENT Member Enrollment Endpoint
 * Agents can enroll new members
 * Creates member WITHOUT Supabase Auth
 */
app.post("/api/agent/enrollment", authMiddleware, async (req: any, res: any) => {
  try {
    console.log("[Agent Enrollment] Enrollment by agent:", req.user?.email);

    // Validate agent has permission
    if (req.user?.role !== "agent" && req.user?.role !== "admin") {
      return res.status(403).json({
        error: "Agent or admin access required"
      });
    }

    const {
      email,
      firstName,
      lastName,
      middleName,
      phone,
      dateOfBirth,
      gender,
      ssn,
      address,
      address2,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      employerName,
      divisionName,
      dateOfHire,
      memberType,
      planStartDate,
      planId,
      familyMembers,
    } = req.body;

    // Validation
    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        error: "Missing required fields: email, firstName, lastName"
      });
    }

    // Check if member already exists
    const existingMember = await storage.getMemberByEmail(email.trim().toLowerCase());
    if (existingMember) {
      return res.status(400).json({
        error: "A member with this email already exists",
        customerNumber: existingMember.customerNumber
      });
    }

    // Create member enrolled by this agent
    const newMember = await storage.createMember({
      firstName,
      lastName,
      middleName,
      email: email.trim().toLowerCase(),
      phone,
      dateOfBirth,
      gender,
      ssn,
      address,
      address2,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      employerName,
      divisionName,
      memberType: memberType || 'employee',
      dateOfHire,
      planStartDate,
      enrolledByAgentId: req.user.id, // Track which agent enrolled
      agentNumber: req.user.agentNumber, // Store agent number
      isActive: true,
      status: 'pending',
    });

    console.log("[Agent Enrollment] Member created:", newMember.customerNumber);

    // Create subscription if planId provided
    if (planId) {
      try {
        const plan = await storage.getPlan(planId);
        if (plan) {
          const subscription = await storage.createSubscription({
            memberId: newMember.id,
            planId: plan.id,
            status: 'active', // Agent enrollments can be immediately active
            amount: plan.price,
            startDate: planStartDate ? new Date(planStartDate) : new Date(),
          });

          // Create commission for the agent
          await storage.createCommission({
            agentId: req.user.id,
            agentNumber: req.user.agentNumber,
            subscriptionId: subscription.id,
            memberId: newMember.id,
            planName: plan.name,
            planType: memberType || 'employee',
            planTier: plan.name,
            commissionAmount: plan.price * 0.1, // 10% commission example
            totalPlanCost: plan.price,
            status: 'active',
            paymentStatus: 'unpaid',
          });

          // Update member status to active
          await storage.updateMember(newMember.id, { status: 'active' });

          console.log("[Agent Enrollment] Subscription and commission created");
        }
      } catch (subError) {
        console.error("[Agent Enrollment] Error creating subscription/commission:", subError);
      }
    }

    // Add family members if provided
    if (familyMembers && Array.isArray(familyMembers) && familyMembers.length > 0) {
      for (const familyMember of familyMembers) {
        await storage.addFamilyMember({
          primaryMemberId: newMember.id,
          firstName: familyMember.firstName,
          lastName: familyMember.lastName,
          middleName: familyMember.middleName,
          dateOfBirth: familyMember.dateOfBirth,
          gender: familyMember.gender,
          ssn: familyMember.ssn,
          relationship: familyMember.relationship,
          memberType: familyMember.memberType || 'dependent',
          isActive: true,
        });
      }
      console.log("[Agent Enrollment] Added", familyMembers.length, "family members");
    }

    res.status(201).json({
      success: true,
      message: "Member enrolled successfully",
      member: {
        id: newMember.id,
        customerNumber: newMember.customerNumber,
        email: newMember.email,
        firstName: newMember.firstName,
        lastName: newMember.lastName,
        status: newMember.status,
      },
      enrolledBy: {
        agentId: req.user.id,
        agentEmail: req.user.email,
        agentNumber: req.user.agentNumber,
      }
    });

  } catch (error: any) {
    console.error("[Agent Enrollment] Error:", error);
    res.status(500).json({
      error: "Agent enrollment failed",
      details: process.env.NODE_ENV === "development" ? error.message : "Internal error"
    });
  }
});
