interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const getStepTitle = (step: number) => {
    // Map internal step numbers to display steps
    const stepMapping: { [key: number]: string } = {
      1: "Personal Info",
      2: "Employment Info", 
      3: "Address Info",
      4: "Family Info",
      5: "Family Info",
      6: "Plan Selection",
      7: "Review & Terms"
    };
    return stepMapping[step] || "";
  };
  
  // Calculate display step number (consolidate family steps)
  const getDisplayStep = (step: number) => {
    if (step <= 3) return step;
    if (step === 4 || step === 5) return 4; // Family info
    if (step === 6) return 5; // Plan selection
    if (step === 7) return 6; // Review
    return step;
  };
  
  const displayStep = getDisplayStep(currentStep);
  const displayTotal = 6; // Total visible steps

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-medical-blue-600">
          Step {displayStep} of {displayTotal}
        </span>
        <span className="text-sm text-gray-500">
          {getStepTitle(currentStep)}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-medical-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
    </div>
  );
}
