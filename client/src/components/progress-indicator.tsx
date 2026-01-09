interface ProgressIndicatorProps {
  displayStep: number;
  displayTotal: number;
  stepTitle: string;
}

export function ProgressIndicator({ displayStep, displayTotal, stepTitle }: ProgressIndicatorProps) {
  const clampedTotal = Math.max(displayTotal, 1);
  const clampedStep = Math.min(Math.max(displayStep, 1), clampedTotal);
  const progress = (clampedStep / clampedTotal) * 100;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-medical-blue-600">
          Step {clampedStep} of {clampedTotal}
        </span>
        <span className="text-sm text-gray-500">
          {stepTitle}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-medical-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
