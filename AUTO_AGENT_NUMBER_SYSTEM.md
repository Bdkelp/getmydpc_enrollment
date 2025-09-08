
# Agent Number System Documentation

## Overview
The MyPremierPlans agent numbering system provides unique, meaningful identifiers for all agents and administrators. These numbers are used for tracking business written, commission attribution, login sessions, and member relationships.

## Format Structure
**Format**: `MPP[ROLE][YY][SSSS]`
- `MPP`: Company identifier (MyPremierPlans)
- `[ROLE]`: Role code (SA = Super Admin, AG = Agent)
- `[YY]`: Year of beginning enrollment (last 2 digits)
- `[SSSS]`: Last 4 digits of Social Security Number

## Examples
- `MPPSA231154`: Super Admin enrolled in 2023, SSN ending in 1154
- `MPPAG241987`: Agent enrolled in 2024, SSN ending in 1987

## Key Features

### 1. Unique Identification
- Each agent number is unique and tied to the individual for life
- Combines role, enrollment year, and personal identifier (SSN last 4)
- Cannot be duplicated due to SSN uniqueness

### 2. Lifecycle Management
- **Active Agent**: Number is active and tracks all business
- **Inactive Agent**: Number becomes inactive but remains reserved
- **Reactivation**: If agent returns, same number is reactivated
- **Permanent Assignment**: Number belongs to agent for life

### 3. Role-Based Prefixes
- **SA (Super Admin)**: Full system access, can modify agent numbers
- **AG (Agent)**: Standard enrollment agents

### 4. Business Tracking
- All written business tied to agent number
- Commission calculations use agent number
- Member relationships tracked via agent number
- Login sessions logged with agent number

## Implementation

### Database Storage
```sql
-- Agent number stored in users table
agentNumber: varchar("agent_number") -- Format: MPPSA231154
```

### Validation Rules
- Must be exactly 12 characters
- Must follow pattern: `MPP[SA|AG][0-9]{2}[0-9]{4}`
- Must be unique across all users
- Only admins can assign/modify agent numbers

### Generation Process
1. Determine role code (SA for admin, AG for agent)
2. Get current year (last 2 digits)
3. Collect last 4 digits of SSN
4. Combine: MPP + Role + Year + SSN4

### Security
- Only administrators can assign or modify agent numbers
- Database triggers prevent unauthorized changes
- Agent numbers protected for commission integrity
- SSN last 4 provides personal verification

## Usage Throughout System

### 1. User Profile
- Displayed in user settings (read-only for agents)
- Editable only by administrators
- Required for all agents and admins

### 2. Commission Tracking
- All commissions tied to agent number
- Commission reports filtered by agent number
- Payment tracking uses agent number

### 3. Member Management
- Members assigned to agents via agent number
- Enrollment tracking by agent number
- Family member relationships maintained

### 4. Login Sessions
- All login sessions tracked with agent number
- Activity monitoring by agent identifier
- Security auditing capabilities

### 5. Reporting
- Performance reports by agent number
- Business analytics by agent identifier
- Historical tracking maintained

## Benefits

1. **Accountability**: Clear tracking of who wrote each piece of business
2. **Commission Integrity**: Accurate attribution of earnings
3. **Lifetime Identification**: Agents keep numbers permanently
4. **Audit Trail**: Complete history of agent activity
5. **Scalability**: System supports unlimited agents
6. **Security**: Protected assignment process
7. **Meaningful Format**: Human-readable and informative

## Administrative Controls

### Assignment Process
1. Admin creates/identifies user account
2. Admin verifies role (agent or admin)
3. Admin collects last 4 SSN digits
4. System generates agent number
5. Admin assigns number to user

### Modification Rules
- Only system administrators can modify agent numbers
- Changes require admin authentication
- All modifications logged for audit
- Previous numbers retained in history

### Deactivation Process
- Agent numbers deactivated when user becomes inactive
- Numbers remain reserved for potential reactivation
- Historical data preserved
- Commission tracking continues

This system ensures reliable, secure, and meaningful agent identification throughout the MyPremierPlans platform.
