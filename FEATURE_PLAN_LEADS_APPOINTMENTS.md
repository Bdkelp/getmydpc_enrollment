# Lead Management & Appointment Scheduling Feature Plan

## 1. Lead Management System (Phase 1 - Immediate)

### Overview
Transform the contact form submissions into a trackable lead management system for agents.

### Database Schema Updates
```sql
-- New leads table
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  firstName VARCHAR(255) NOT NULL,
  lastName VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  message TEXT,
  source VARCHAR(50) DEFAULT 'contact_form', -- contact_form, website, referral, etc.
  status VARCHAR(50) DEFAULT 'new', -- new, contacted, qualified, enrolled, closed
  assignedAgentId VARCHAR(255),
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Lead activity tracking
CREATE TABLE lead_activities (
  id SERIAL PRIMARY KEY,
  leadId INTEGER REFERENCES leads(id),
  agentId VARCHAR(255),
  activityType VARCHAR(50), -- call, email, meeting, note
  notes TEXT,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

### Lead Management Features

#### For Agents:
1. **Lead Dashboard**
   - New leads assigned to them
   - Follow-up reminders
   - Lead status tracking
   - Activity history
   
2. **Lead Actions**
   - Update lead status
   - Add notes/activities
   - Convert lead to enrollment
   - Set follow-up reminders

3. **Lead Metrics**
   - Conversion rate tracking
   - Response time metrics
   - Lead source analytics

#### For Admins:
1. **Lead Distribution**
   - Auto-assign leads to agents (round-robin)
   - Manual lead assignment
   - Territory-based assignment (future)
   
2. **Lead Analytics**
   - Overall conversion rates
   - Agent performance metrics
   - Lead source effectiveness

### Implementation Steps:
1. Create database tables for leads
2. Update contact form to save to leads table
3. Add lead management UI to agent dashboard
4. Implement lead assignment logic
5. Add notification system for new leads

## 2. Appointment Scheduling System (Phase 2)

### Overview
Enable patients to schedule appointments with their care team and agents to schedule enrollment consultations.

### Database Schema
```sql
-- Appointments table
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255), -- patient
  providerId VARCHAR(255), -- doctor/agent
  appointmentType VARCHAR(50), -- consultation, enrollment, primary_care, follow_up
  scheduledDate TIMESTAMP NOT NULL,
  duration INTEGER DEFAULT 30, -- minutes
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled
  notes TEXT,
  meetingLink VARCHAR(255), -- for virtual appointments
  reminderSent BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Provider availability
CREATE TABLE provider_availability (
  id SERIAL PRIMARY KEY,
  providerId VARCHAR(255),
  dayOfWeek INTEGER, -- 0-6 (Sunday-Saturday)
  startTime TIME,
  endTime TIME,
  isActive BOOLEAN DEFAULT TRUE
);

-- Appointment reminders
CREATE TABLE appointment_reminders (
  id SERIAL PRIMARY KEY,
  appointmentId INTEGER REFERENCES appointments(id),
  reminderType VARCHAR(50), -- email, sms, push
  scheduledFor TIMESTAMP,
  sentAt TIMESTAMP,
  status VARCHAR(50) -- pending, sent, failed
);
```

### Appointment Features

#### For Patients (Future):
1. **View Available Slots**
   - See provider availability
   - Filter by appointment type
   - Choose preferred provider
   
2. **Book Appointments**
   - Select date/time
   - Add reason for visit
   - Receive confirmation
   
3. **Manage Appointments**
   - View upcoming appointments
   - Cancel/reschedule
   - View appointment history

#### For Agents (Immediate):
1. **Enrollment Consultations**
   - Schedule calls with leads
   - Set availability hours
   - Automatic calendar blocking
   
2. **Appointment Management**
   - View daily schedule
   - Add manual appointments
   - Track no-shows

#### For Providers (Future):
1. **Schedule Management**
   - Set recurring availability
   - Block time off
   - View patient appointments
   
2. **Appointment Tools**
   - Add appointment notes
   - View patient history
   - Generate follow-up tasks

### Reminder System

#### Email Reminders:
- 24 hours before appointment
- 2 hours before appointment
- Custom reminder schedules

#### SMS Reminders (with Twilio):
- Opt-in based
- Same schedule as email
- Include appointment details

#### Implementation Priority:
1. **Phase 2A**: Agent appointment scheduling for enrollment consultations
2. **Phase 2B**: Email reminder system
3. **Phase 2C**: Patient self-scheduling portal
4. **Phase 2D**: SMS reminders with Twilio

## 3. Integration with Current System

### UI Components Needed:
1. **Lead Management Tab** in agent dashboard
2. **Calendar Widget** for appointment scheduling
3. **Notification Center** for new leads/appointments
4. **Activity Feed** for lead interactions

### API Endpoints:
```javascript
// Lead Management
POST   /api/leads                 // Create new lead from contact form
GET    /api/agent/leads          // Get agent's assigned leads
PUT    /api/leads/:id            // Update lead status/info
POST   /api/leads/:id/activities // Add activity to lead
GET    /api/agent/lead-stats     // Get conversion metrics

// Appointments
GET    /api/appointments/availability   // Get available slots
POST   /api/appointments               // Book appointment
GET    /api/agent/appointments         // Get agent's appointments
PUT    /api/appointments/:id           // Update appointment
POST   /api/appointments/:id/remind    // Send manual reminder
```

## 4. Technical Considerations

### Performance:
- Index on lead status and assignedAgentId
- Pagination for lead lists
- Caching for availability queries

### Security:
- HIPAA compliance for appointment data
- Encrypted storage of patient notes
- Audit trail for all actions

### Scalability:
- Queue system for reminders
- Background jobs for lead assignment
- Separate service for SMS/email

## 5. Rollout Strategy

### Immediate (Week 1):
1. Implement lead capture from contact form
2. Basic lead view in agent dashboard
3. Lead status updates

### Short-term (Week 2-3):
1. Lead assignment system
2. Activity tracking
3. Basic metrics

### Medium-term (Month 2):
1. Agent appointment scheduling
2. Email reminders
3. Calendar integration

### Long-term (Month 3+):
1. Patient self-scheduling
2. SMS reminders
3. Provider availability management
4. Advanced analytics

This phased approach allows you to start capturing and managing leads immediately while building toward a comprehensive appointment system that serves both enrollment and healthcare delivery needs.