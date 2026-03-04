import { useState } from "react";
import { Calendar } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AdminEnrollmentDateOverrideProps {
  onDateChange: (date: string | null) => void;
  disabled?: boolean;
}

export function AdminEnrollmentDateOverride({ onDateChange, disabled }: AdminEnrollmentDateOverrideProps) {
  const [overrideDate, setOverrideDate] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleDateChange = (value: string) => {
    setOverrideDate(value);
    setError("");

    if (!value) {
      onDateChange(null);
      return;
    }

    // Validate date
    const selectedDate = new Date(value);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today

    if (isNaN(selectedDate.getTime())) {
      setError("Invalid date format");
      onDateChange(null);
      return;
    }

    if (selectedDate > today) {
      setError("Date cannot be in the future");
      onDateChange(null);
      return;
    }

    // Valid date
    onDateChange(value);
  };

  const maxDate = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-lg">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-amber-600" />
        <h3 className="font-semibold text-amber-900">Admin: Override Enrollment Date</h3>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="overrideDate" className="text-sm text-amber-800">
          Backdate Enrollment (Optional)
        </Label>
        <Input
          id="overrideDate"
          type="date"
          value={overrideDate}
          onChange={(e) => handleDateChange(e.target.value)}
          max={maxDate}
          disabled={disabled}
          className="bg-white"
        />
        <p className="text-xs text-amber-700">
          Leave empty to use today's date. Use this to backdate enrollments (e.g., March 4 → March 1).
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {overrideDate && !error && (
        <Alert className="py-2 bg-amber-100 border-amber-300">
          <AlertDescription className="text-sm text-amber-900">
            ✓ Enrollment will be backdated to: {new Date(overrideDate).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
