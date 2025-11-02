import React from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export default function AgentCommissions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">Commission Tracking</h1>
      <p className="mt-4">Test 3: Added useLocation + useToast + useAuth hooks.</p>
      <p className="mt-2">User email: {user?.email || "Loading..."}</p>
      <button 
        onClick={() => toast({ title: "Test toast" })}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Test Toast
      </button>
    </div>
  );
}
