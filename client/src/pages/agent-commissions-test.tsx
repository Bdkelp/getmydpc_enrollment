import React from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function AgentCommissions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">Commission Tracking</h1>
      <p className="mt-4">Test 2: Added useLocation + useToast hooks. If you see this, both hooks work.</p>
      <button 
        onClick={() => toast({ title: "Test toast" })}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Test Toast
      </button>
    </div>
  );
}
