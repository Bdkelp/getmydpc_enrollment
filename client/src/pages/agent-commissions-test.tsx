import React, { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

export default function AgentCommissions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: ""
  });
  
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">Commission Tracking</h1>
      <p className="mt-4">Test 4: Added useLocation + useToast + useAuth + useQueryClient + useState.</p>
      <p className="mt-2">User email: {user?.email || "Loading..."}</p>
      <p className="mt-2">Date range state: {JSON.stringify(dateRange)}</p>
      <button 
        onClick={() => setDateRange({ startDate: "2025-01-01", endDate: "2025-12-31" })}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Test State
      </button>
    </div>
  );
}
