# CRM Integration Implementation Example

## How It Would Work with MyPremierPlans

### 1. Database Schema Additions

```sql
-- CRM Integration Configuration
CREATE TABLE crm_integrations (
  id SERIAL PRIMARY KEY,
  organization_id VARCHAR(255),
  crm_type VARCHAR(50), -- 'salesforce', 'hubspot', 'custom'
  api_key VARCHAR(255) ENCRYPTED,
  oauth_token TEXT ENCRYPTED,
  refresh_token TEXT ENCRYPTED,
  webhook_secret VARCHAR(255),
  config JSONB, -- Field mappings, endpoints, etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CRM Sync Log
CREATE TABLE crm_sync_log (
  id SERIAL PRIMARY KEY,
  integration_id INT REFERENCES crm_integrations(id),
  direction VARCHAR(10), -- 'import' or 'export'
  entity_type VARCHAR(50), -- 'lead', 'enrollment'
  entity_id INT,
  external_id VARCHAR(255),
  status VARCHAR(20), -- 'success', 'failed', 'pending'
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Field Mappings
CREATE TABLE crm_field_mappings (
  id SERIAL PRIMARY KEY,
  integration_id INT REFERENCES crm_integrations(id),
  mpp_field VARCHAR(100),
  crm_field VARCHAR(100),
  transform_rule JSONB, -- Optional transformation logic
  is_required BOOLEAN DEFAULT false
);
```

### 2. Integration with Current Lead Flow

#### Current Flow:
```
Contact Form → Create Lead → Assign to Agent → Agent Works Lead → Enrollment
```

#### Enhanced Flow with CRM:
```
Contact Form → Create Lead → Sync to CRM → Assign to Agent
     ↓              ↓                              ↓
CRM Webhook → Update Lead ← Two-way Sync → Agent Updates in Either System
```

### 3. Real-World Use Case Examples

#### Example 1: Salesforce Integration

**Scenario**: An agency already uses Salesforce for their insurance products and wants to add DPC leads.

```javascript
// When a lead is created from the contact form
async function handleContactFormSubmission(formData) {
  // 1. Create lead in MyPremierPlans (existing code)
  const lead = await storage.createLead({
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    phone: formData.phone,
    message: formData.message,
    source: 'contact_form',
    status: 'new'
  });

  // 2. Sync to Salesforce (new code)
  if (await hasActiveCRMIntegration('salesforce')) {
    await syncToSalesforce(lead);
  }

  // 3. Auto-assign to agent (existing code)
  const agentId = await storage.getAvailableAgentForLead();
  if (agentId) {
    await storage.assignLeadToAgent(lead.id, agentId);
  }
}

// Sync function
async function syncToSalesforce(lead) {
  const sfConfig = await getCRMConfig('salesforce');
  
  const sfLead = {
    FirstName: lead.firstName,
    LastName: lead.lastName,
    Email: lead.email,
    Phone: lead.phone,
    Description: lead.message,
    LeadSource: 'MyPremierPlans',
    Status: mapStatus(lead.status, 'salesforce'),
    Custom_MPP_ID__c: lead.id
  };

  try {
    const response = await salesforceAPI.createLead(sfLead);
    
    // Log the sync
    await logCRMSync({
      integration_id: sfConfig.id,
      direction: 'export',
      entity_type: 'lead',
      entity_id: lead.id,
      external_id: response.id,
      status: 'success'
    });
  } catch (error) {
    await logCRMSync({
      integration_id: sfConfig.id,
      direction: 'export',
      entity_type: 'lead',
      entity_id: lead.id,
      status: 'failed',
      error_message: error.message
    });
  }
}
```

#### Example 2: HubSpot Webhook Integration

**Scenario**: When a lead status changes in HubSpot, update it in MyPremierPlans.

```javascript
// Webhook endpoint in server/routes.ts
app.post('/api/webhooks/hubspot', async (req, res) => {
  // Verify webhook signature
  const signature = req.headers['x-hubspot-signature'];
  if (!verifyHubSpotSignature(req.body, signature)) {
    return res.status(401).send('Unauthorized');
  }

  const { eventType, objectId, propertyName, propertyValue } = req.body;

  if (eventType === 'contact.propertyChange' && propertyName === 'lifecyclestage') {
    // Find the lead by HubSpot ID
    const syncRecord = await findSyncRecord('hubspot', objectId);
    if (syncRecord) {
      const newStatus = mapHubSpotStatus(propertyValue);
      
      // Update lead in our system
      await storage.updateLead(syncRecord.entity_id, {
        status: newStatus
      });

      // If lead became qualified, notify agent
      if (newStatus === 'qualified') {
        await notifyAgent(syncRecord.entity_id, 'Lead qualified in HubSpot');
      }
    }
  }

  res.status(200).send('OK');
});
```

### 4. Agent Dashboard Enhancement

```typescript
// Updated agent-dashboard.tsx
interface AgentStats {
  totalEnrollments: number;
  monthlyEnrollments: number;
  totalCommission: number;
  monthlyCommission: number;
  activeLeads: number;
  conversionRate: number;
  leads: any[];
  crmSyncStatus?: {
    lastSync: string;
    pendingUpdates: number;
    syncErrors: number;
  };
}

// New component for CRM status
function CRMSyncStatus({ status }: { status: AgentStats['crmSyncStatus'] }) {
  if (!status) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          CRM Sync Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between text-sm">
          <span>Last sync: {format(new Date(status.lastSync), 'h:mm a')}</span>
          {status.pendingUpdates > 0 && (
            <span className="text-orange-600">{status.pendingUpdates} pending</span>
          )}
          {status.syncErrors > 0 && (
            <span className="text-red-600">{status.syncErrors} errors</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 5. Configuration UI for Agents/Admins

```typescript
// New page: crm-settings.tsx
export default function CRMSettings() {
  const [selectedCRM, setSelectedCRM] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [fieldMappings, setFieldMappings] = useState({});

  const handleConnect = async () => {
    if (selectedCRM === 'salesforce') {
      // OAuth flow
      window.location.href = '/api/crm/oauth/salesforce';
    } else {
      // API key setup
      await apiRequest('POST', '/api/crm/connect', {
        crm_type: selectedCRM,
        api_key: apiKey,
        field_mappings: fieldMappings
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">CRM Integration Settings</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Connect Your CRM</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCRM} onValueChange={setSelectedCRM}>
            <SelectTrigger>
              <SelectValue placeholder="Select your CRM" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="salesforce">Salesforce</SelectItem>
              <SelectItem value="hubspot">HubSpot</SelectItem>
              <SelectItem value="pipedrive">Pipedrive</SelectItem>
              <SelectItem value="custom">Custom API</SelectItem>
            </SelectContent>
          </Select>

          {selectedCRM && selectedCRM !== 'salesforce' && (
            <div className="mt-4">
              <Label>API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your CRM API key"
              />
            </div>
          )}

          <Button onClick={handleConnect} className="mt-4">
            Connect CRM
          </Button>
        </CardContent>
      </Card>

      {/* Field Mapping Configuration */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Field Mappings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>MyPremierPlans Field</Label>
                <Input value="firstName" disabled />
              </div>
              <div>
                <Label>CRM Field</Label>
                <Input 
                  value={fieldMappings.firstName || ''} 
                  onChange={(e) => setFieldMappings({
                    ...fieldMappings,
                    firstName: e.target.value
                  })}
                  placeholder="e.g., FirstName"
                />
              </div>
            </div>
            {/* More field mappings... */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 6. Benefits for Different User Types

#### For Agents:
- See all leads in one place (CRM or MyPremierPlans)
- Update lead status in either system
- Automatic activity logging
- No double data entry

#### For Admins:
- Centralized lead management
- Better reporting across systems
- Automated lead distribution
- Performance tracking

#### For IT/Operations:
- Single source of truth
- Reduced manual data entry
- Better data quality
- Audit trail

### 7. Common Integration Scenarios

#### Scenario A: Insurance Agency Using Salesforce
```
1. Agency sells multiple insurance products through Salesforce
2. Adds DPC as new product line
3. MyPremierPlans leads flow into Salesforce automatically
4. Agents work leads in Salesforce
5. Enrollment status updates back to Salesforce
6. Commissions tracked in both systems
```

#### Scenario B: Healthcare Network Using HubSpot
```
1. Network uses HubSpot for patient acquisition
2. DPC leads from website go to MyPremierPlans
3. Qualified leads sync to HubSpot for nurturing
4. Marketing team sends targeted campaigns
5. Conversion tracked across both platforms
```

#### Scenario C: Multi-Location Practice
```
1. Each location has its own CRM
2. Central MyPremierPlans installation
3. Leads routed based on location
4. Each location sees only their leads
5. Central reporting across all locations
```

### 8. Implementation Timeline

**Week 1-2: Foundation**
- Database schema for integrations
- Basic API endpoints
- Authentication framework

**Week 3-4: First Integration**
- Choose pilot CRM (e.g., HubSpot)
- Implement bidirectional sync
- Test with pilot agent

**Week 5-6: UI Development**
- Settings page for configuration
- Field mapping interface
- Sync status in dashboard

**Week 7-8: Production Rollout**
- Deploy to all agents
- Monitor performance
- Gather feedback

### 9. ROI Calculation

**Time Savings:**
- 5 minutes saved per lead (no double entry)
- 50 leads/agent/month = 250 minutes saved
- 10 agents = 41.7 hours/month saved

**Improved Conversion:**
- Better lead tracking = 5% higher conversion
- 500 leads/month × 5% = 25 extra enrollments
- 25 × $30 avg commission = $750/month additional revenue

**Reduced Errors:**
- Eliminate manual data entry errors
- Faster lead response time
- Better compliance tracking

This integration would transform MyPremierPlans from a standalone enrollment system into a connected platform that seamlessly works with existing agency tools and workflows.