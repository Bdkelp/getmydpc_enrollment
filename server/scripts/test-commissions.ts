import { calculateCommission, RX_VALET_COMMISSION } from '../commissionCalculator';

console.log("🧮 Testing Commission Calculations\n");
console.log("=".repeat(80));

// Test cases based on your commission structure
const testCases = [
  // MyPremierPlan Base
  { plan: "MyPremierPlan Base - Member Only", coverage: "Member Only", rxValet: false, expected: 9.00 },
  { plan: "MyPremierPlan Base - Member/Spouse", coverage: "Member/Spouse", rxValet: false, expected: 15.00 },
  { plan: "MyPremierPlan Base - Member/Child", coverage: "Member/Child", rxValet: false, expected: 17.00 },
  { plan: "MyPremierPlan Base - Family", coverage: "Family", rxValet: false, expected: 17.00 },
  
  // MyPremierPlan+ 
  { plan: "MyPremierPlan+ - Member Only", coverage: "Member Only", rxValet: false, expected: 20.00 },
  { plan: "MyPremierPlan+ - Member/Spouse", coverage: "Member/Spouse", rxValet: false, expected: 40.00 },
  { plan: "MyPremierPlan+ - Member/Child", coverage: "Member/Child", rxValet: false, expected: 40.00 },
  { plan: "MyPremierPlan+ - Family", coverage: "Family", rxValet: false, expected: 40.00 },
  
  // MyPremierPlan Elite
  { plan: "MyPremierPlan Elite - Member Only", coverage: "Member Only", rxValet: false, expected: 20.00 },
  { plan: "MyPremierPlan Elite - Member/Spouse", coverage: "Member/Spouse", rxValet: false, expected: 40.00 },
  { plan: "MyPremierPlan Elite - Member/Child", coverage: "Member/Child", rxValet: false, expected: 40.00 },
  { plan: "MyPremierPlan Elite - Family", coverage: "Family", rxValet: false, expected: 40.00 },
  
  // With RxValet add-on
  { plan: "MyPremierPlan Base - Member Only", coverage: "Member Only", rxValet: true, expected: 11.50 }, // $9 + $2.50
  { plan: "MyPremierPlan+ - Family", coverage: "Family", rxValet: true, expected: 42.50 }, // $40 + $2.50
  { plan: "MyPremierPlan Elite - Member/Spouse", coverage: "Member/Spouse", rxValet: true, expected: 42.50 }, // $40 + $2.50
];

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = calculateCommission(test.plan, test.coverage, test.rxValet);
  
  if (!result) {
    console.log(`❌ Test ${index + 1}: FAILED - No commission calculated`);
    console.log(`   Plan: ${test.plan}, Coverage: ${test.coverage}, RxValet: ${test.rxValet}`);
    failed++;
    return;
  }
  
  const matches = result.commission === test.expected;
  const icon = matches ? "✅" : "❌";
  const status = matches ? "PASSED" : "FAILED";
  
  if (matches) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${icon} Test ${index + 1}: ${status}`);
  console.log(`   Plan: ${test.plan}`);
  console.log(`   Coverage: ${test.coverage}, RxValet: ${test.rxValet ? 'Yes' : 'No'}`);
  console.log(`   Expected: $${test.expected.toFixed(2)}, Got: $${result.commission.toFixed(2)}`);
  
  if (!matches) {
    console.log(`   ⚠️  Mismatch detected!`);
  }
  console.log();
});

console.log("=".repeat(80));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log(`💰 RxValet Commission Rate: $${RX_VALET_COMMISSION.toFixed(2)}\n`);

if (failed === 0) {
  console.log("🎉 All commission calculations are correct!\n");
  process.exit(0);
} else {
  console.log("⚠️  Some tests failed. Please review commission logic.\n");
  process.exit(1);
}
